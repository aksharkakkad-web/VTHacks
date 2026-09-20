import { createHash, timingSafeEqual } from "node:crypto";
import { text, object, type ProviderDescriptor } from "./contract";
import { DemoProvider, type DemoBooking } from "./demo-provider";
import { TripError } from "../lib/trip-state/model";
import { advanceDemoRide, cancelDemoBooking, parseDemoRideEvent, type DemoRideEvent } from './demo-ride-simulation';
export type StoredBooking = DemoBooking;
export interface BookingStore {
  create(key: string, booking: StoredBooking): Promise<void>;
  read(key: string): Promise<StoredBooking | undefined>;
  revoke(key: string): Promise<void>;
  /** Atomic read/validate/update, serialized with cancellation. */
  advance?(key: string, event: DemoRideEvent, now: number): Promise<StoredBooking>;
}
async function input(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new TripError("JSON_REQUIRED", "Use application/json", 415);
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  if (reader) {
    try { for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > 16_384) { await reader.cancel(); throw new TripError("BODY_TOO_LARGE", "Request too large", 413); } chunks.push(value); } }
    finally { reader.releaseLock(); }
  }
  return object(JSON.parse(Buffer.concat(chunks).toString() || "{}"));
}
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "no-store" } }); }
export function hostedProvider(options: { descriptor: ProviderDescriptor; token?: string; store?: BookingStore; cancellationFeeMinor?: number; decline?: boolean; demoRideProgress?: boolean; now?: () => number }) {
  const { descriptor, token, store } = options;
  const publicProvider = new DemoProvider(descriptor, { token, cancellationFeeMinor: options.cancellationFeeMinor, decline: options.decline, demoRideProgress: options.demoRideProgress ?? process.env.BEACON_DEMO_RIDE_PROGRESS === 'true', now: options.now });
  const key = (id: string) => `${descriptor.id}:${id}`;
  const requestBookingId = (id: string) => createHash("sha256").update(JSON.stringify([descriptor.id, id])).digest("hex");
  return async (request: Request, path: string): Promise<Response> => {
    try {
      if (request.method === "GET" && path === "/.well-known/agent-card.json") return json(publicProvider.handle("GET", path, {}));
      if (request.method === "POST" && path === "/agent/quote") return json(publicProvider.handle("POST", path, await input(request)));
      if (!token || !store) throw new TripError("SERVICE_NOT_CONFIGURED", "Provider booking is not configured", 503);
      const actual = Buffer.from(request.headers.get("authorization") ?? ""); const expected = Buffer.from(`Bearer ${token}`);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new TripError("UNAUTHORIZED", "Unauthorized", 401);
      if (request.method === 'POST' && path === '/agent/demo-advance') {
        if (!publicProvider.demoRideProgressEnabled) throw new TripError('DEMO_PROGRESS_DISABLED', 'Demo progression is not enabled', 404);
        if (!store.advance) throw new TripError('DEMO_STORE_UNAVAILABLE', 'Demo progression requires an atomic booking store', 503);
        const event = parseDemoRideEvent(await input(request));
        return json(publicProvider.tripResult(await store.advance(key(event.tripId), event, (options.now ?? Date.now)())));
      }
      if (request.method === "POST" && path === "/agent/request-trip") {
        if (!descriptor.functions.includes("request_trip")) throw new TripError("UNSUPPORTED", "This provider does not accept bookings", 400);
        const data = await input(request);
        const prepared = publicProvider.prepareBooking(data);
        // Deterministic per-provider id plus SET NX makes retries across serverless
        // instances one booking. Cancellation retains a tombstone until the TTL.
        const id = requestBookingId(prepared.sensitive!.tripId);
        await store.create(key(id), publicProvider.newBooking(id, prepared));
        const booking = await store.read(key(id)); if (!booking) throw new Error("Booking store unavailable");
        if (booking.fingerprint && booking.fingerprint !== prepared.fingerprint) throw new TripError("IDEMPOTENCY_CONFLICT", "Request ID already has different booking terms", 409);
        return json(publicProvider.tripResult(booking));
      }
      if (request.method === "GET" && path.startsWith("/agent/trip-status/")) {
        const id = text(decodeURIComponent(path.slice(19)), "booking id");
        const booking = await store.read(key(id)); if (!booking) throw new TripError("NOT_FOUND", "Booking not found", 404);
        return json(publicProvider.tripResult(booking));
      }
      if (request.method === "GET" && path.startsWith("/agent/request-status/")) {
        const requestId = text(decodeURIComponent(path.slice("/agent/request-status/".length)), "request id");
        const booking = await store.read(key(requestBookingId(requestId))); return json({ trip: booking ? publicProvider.tripResult(booking) : null });
      }
      if (request.method === "POST" && path === "/agent/cancel-request") {
        const requestId = text((await input(request)).request_id, "request id");
        const id = requestBookingId(requestId);
        // Install a cancellation tombstone even if the original request has not
        // arrived yet, then atomically erase any already-created private record.
        await store.create(key(id), publicProvider.cancellationTombstone(id));
        await store.revoke(key(id));
        const booking = await store.read(key(id)); if (!booking) throw new Error("Booking store unavailable");
        return json(publicProvider.tripResult(booking));
      }
      if (request.method === "POST" && path === "/agent/cancel-trip") {
        const id = text((await input(request)).trip_id, "booking id");
        if (!await store.read(key(id))) throw new TripError("NOT_FOUND", "Booking not found", 404);
        await store.revoke(key(id));
        const booking = await store.read(key(id)); if (!booking) throw new Error("Booking store unavailable");
        return json(publicProvider.tripResult(booking));
      }
      throw new TripError("NOT_FOUND", "Provider operation not found", 404);
    } catch (error) {
      if (error instanceof TripError) return json({ error: { code: error.code, message: error.message } }, error.status);
      if (error instanceof SyntaxError || error instanceof URIError || error instanceof Error && /^(Invalid|Expected)/.test(error.message)) return json({ error: { code: "INVALID_INPUT", message: "Invalid provider request" } }, 400);
      return json({ error: { code: "PROVIDER_UNAVAILABLE", message: "Provider unavailable" } }, 503);
    }
  };
}

/** Shared serverless storage. All writes have a 24-hour retention limit. */
export class RedisBookingStore implements BookingStore {
  constructor(private readonly url: string, private readonly token: string) { if (new URL(url).protocol !== "https:") throw new Error("Redis requires HTTPS"); }
  private async command(...args: (string | number)[]) {
    const response = await fetch(this.url, { method: "POST", headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }, body: JSON.stringify(args), signal: AbortSignal.timeout(5000), redirect: "error", cache: "no-store" });
    if (!response.ok) throw new Error("Provider store unavailable");
    const body = await response.json() as { result?: unknown; error?: string }; if (body.error) throw new Error("Provider store command failed"); return body.result;
  }
  async create(key: string, booking: StoredBooking) { await this.command("SET", `beacon:provider:${key}`, JSON.stringify(booking), "NX", "EX", 86400); }
  async read(key: string): Promise<StoredBooking | undefined> { const value = await this.command("GET", `beacon:provider:${key}`); return typeof value === "string" ? JSON.parse(value) : undefined; }
  private async update(key: string, mutate: (booking: StoredBooking) => void): Promise<StoredBooking> {
    const redisKey = `beacon:provider:${key}`;
    for (let attempt = 0; attempt < 8; attempt++) {
      const raw = await this.command('GET', redisKey);
      if (typeof raw !== 'string') throw new TripError('NOT_FOUND', 'Booking not found', 404);
      const booking = JSON.parse(raw) as StoredBooking; mutate(booking);
      // Validate and settle through the same helper as standalone providers;
      // compare-and-set prevents a concurrent cancellation being overwritten.
      const saved = await this.command('EVAL', "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end;redis.call('SET',KEYS[1],ARGV[2],'KEEPTTL');return 1", 1, redisKey, raw, JSON.stringify(booking));
      if (saved === 1) return booking;
    }
    throw new TripError('BOOKING_STORE_BUSY', 'Retry the demo operation', 503);
  }
  async revoke(key: string) { await this.update(key, booking => cancelDemoBooking(booking)); }
  async advance(key: string, event: DemoRideEvent, now: number) { return this.update(key, booking => advanceDemoRide(booking, event, now)); }
}
