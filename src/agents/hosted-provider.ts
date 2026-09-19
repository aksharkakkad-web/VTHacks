import { createHash, timingSafeEqual } from "node:crypto";
import { text, object, type ProviderDescriptor } from "./contract";
import { DemoProvider, type DemoBooking } from "./demo-provider";
import { TripError } from "../lib/trip-state/model";
export type StoredBooking = DemoBooking;
export interface BookingStore {
  create(key: string, booking: StoredBooking): Promise<void>;
  read(key: string): Promise<StoredBooking | undefined>;
  revoke(key: string): Promise<void>;
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
export function hostedProvider(options: { descriptor: ProviderDescriptor; token?: string; store?: BookingStore; cancellationFeeMinor?: number; decline?: boolean }) {
  const { descriptor, token, store } = options;
  const publicProvider = new DemoProvider(descriptor, { token, cancellationFeeMinor: options.cancellationFeeMinor, decline: options.decline });
  const key = (id: string) => `${descriptor.id}:${id}`;
  const requestBookingId = (id: string) => createHash("sha256").update(JSON.stringify([descriptor.id, id])).digest("hex");
  return async (request: Request, path: string): Promise<Response> => {
    try {
      if (request.method === "GET" && path === "/.well-known/agent-card.json") return json(publicProvider.handle("GET", path, {}));
      if (request.method === "POST" && path === "/agent/quote") return json(publicProvider.handle("POST", path, await input(request)));
      if (!token || !store) throw new TripError("SERVICE_NOT_CONFIGURED", "Provider booking is not configured", 503);
      const actual = Buffer.from(request.headers.get("authorization") ?? ""); const expected = Buffer.from(`Bearer ${token}`);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new TripError("UNAUTHORIZED", "Unauthorized", 401);
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
        return json(booking.result);
      }
      if (request.method === "GET" && path.startsWith("/agent/trip-status/")) {
        const id = text(decodeURIComponent(path.slice(19)), "booking id");
        const booking = await store.read(key(id)); if (!booking) throw new TripError("NOT_FOUND", "Booking not found", 404);
        return json(booking.result);
      }
      if (request.method === "GET" && path.startsWith("/agent/request-status/")) {
        const requestId = text(decodeURIComponent(path.slice("/agent/request-status/".length)), "request id");
        const booking = await store.read(key(requestBookingId(requestId))); return json({ trip: booking?.result ?? null });
      }
      if (request.method === "POST" && path === "/agent/cancel-request") {
        const requestId = text((await input(request)).request_id, "request id");
        const id = requestBookingId(requestId);
        // Install a cancellation tombstone even if the original request has not
        // arrived yet, then atomically erase any already-created private record.
        await store.create(key(id), publicProvider.cancellationTombstone(id));
        await store.revoke(key(id));
        const booking = await store.read(key(id)); if (!booking) throw new Error("Booking store unavailable");
        return json(booking.result);
      }
      if (request.method === "POST" && path === "/agent/cancel-trip") {
        const id = text((await input(request)).trip_id, "booking id");
        if (!await store.read(key(id))) throw new TripError("NOT_FOUND", "Booking not found", 404);
        await store.revoke(key(id));
        const booking = await store.read(key(id)); if (!booking) throw new Error("Booking store unavailable");
        return json(booking.result);
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
  async revoke(key: string) {
    // Settlement and erasure share one atomic operation, including when another
    // handler is concurrently reconciling or retrying the same request.
    const lua = `local raw=redis.call('GET',KEYS[1]);if not raw then return 0 end;
local b=cjson.decode(raw);b.sensitive=nil;local s=b.result.status;
if s~='completed' and s~='declined' and s~='cancelled' then
 b.result.status='cancelled';local p=b.result.payment;local fee=b.cancellationFeeMinor or 0;
 if p then
  if p.state=='authorized' then
   if fee==0 then p.state='voided';p.retainedMinor=0
   else p.state='captured';p.amountMinor=fee;p.retainedMinor=fee end
  elseif p.state=='captured' then
   p.retainedMinor=fee;if fee==0 then p.state='refunded' end
  end
 end
end;
redis.call('SET',KEYS[1],cjson.encode(b),'KEEPTTL');return 1`;
    await this.command("EVAL", lua, 1, `beacon:provider:${key}`);
  }
}
