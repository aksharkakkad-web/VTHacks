import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { bookingPayloadHash, verifyBookingGrant } from "../lib/authorization/booking-grant";
import { simulatedAuthorization, simulatedCancellation } from "../lib/payments/simulated";
import { networkProfile, parseProviderOffer, type ProviderManifest, type ProviderOffer } from "./provider-manifest";
import { TripError } from "../lib/trip-state/model";
import type { IncomingMessage, ServerResponse } from "node:http";
import { object, number, point, text, type ProviderDescriptor, type ProviderTrip, type TripRequest } from "./contract";

export const demoDescriptors: ProviderDescriptor[] = [
  { id: "transit", name: "Transit", mode: "transit", baseUrl: "http://127.0.0.1:4311", agentHost: "localhost", source: "demo", functions: ["quote_trip", "trip_status"] },
  { id: "campus_ride", name: "Campus Ride", mode: "campus_ride", baseUrl: "http://127.0.0.1:4312", agentHost: "localhost", source: "demo", functions: ["quote_trip", "request_trip", "trip_status", "cancel_trip", "reconcile_trip"] },
  { id: "independent_ride", name: "Independent Ride", mode: "independent_ride", baseUrl: "http://127.0.0.1:4313", agentHost: "localhost", source: "demo", functions: ["quote_trip", "request_trip", "trip_status", "cancel_trip", "reconcile_trip"] },
];
const fixtures = { transit: [0, 15, 14, 5], campus_ride: [0, 8, 11, 1], independent_ride: [7, 5, 10, 1] };

export type DemoBooking = { result: ProviderTrip; sensitive?: TripRequest; fingerprint?: string; cancellationFeeMinor?: number };
export function networkToken(value?: string): value is string { return typeof value === "string" && value.length >= 16 && value.length <= 4096 && !/\s/.test(value); }
/** Erase precise data while retaining the real terminal settlement. */
export function cancelDemoBooking(booking: DemoBooking): void {
  delete booking.sensitive;
  if (["cancelled", "completed", "declined"].includes(booking.result.status)) return;
  booking.result.status = "cancelled";
  if (booking.result.payment) booking.result.payment = simulatedCancellation(booking.result.payment, booking.cancellationFeeMinor ?? 0);
}

/** Seeded world state, real HTTP contract. These are not actual transportation bookings. */
export class DemoProvider {
  private trips = new Map<string, DemoBooking>();
  private requests = new Map<string, string>();
  constructor(readonly descriptor: ProviderDescriptor, private readonly options: { token?: string; cancellationFeeMinor?: number; decline?: boolean } = {}) {}
  get signingToken() { return networkToken(this.options.token) ? this.options.token : undefined; }
  get networkEnabled() { return Boolean(this.signingToken); }
  manifest(): ProviderManifest {
    if (!this.networkEnabled) throw new Error("Invalid network provider configuration");
    return { profileVersion: networkProfile, providerId: this.descriptor.id, serviceId: this.descriptor.serviceId ?? (this.descriptor.ansId ? this.descriptor.id.slice(this.descriptor.ansId.length + 1) : this.descriptor.id), operatorName: "Beacon demo operator", operatorAnsId: this.descriptor.ansId ?? null, endpoint: this.descriptor.baseUrl, mode: this.descriptor.mode, capabilities: this.descriptor.mode === "transit" ? ["quote_trip"] : [...this.descriptor.functions], serviceArea: { originZones: ["Downtown Blacksburg", "VT academic campus"], destinationZones: ["VT residential campus"] }, executionMode: "simulated", authorization: "beacon-hmac-v1", payment: "simulated-usd-v1" };
  }
  private fixtureOffer(issuedAt: string, quoteId: string): ProviderOffer {
    const [cost, waitMinutes, travelMinutes, walkingMinutes] = fixtures[this.descriptor.mode];
    const feeMinor = this.options.cancellationFeeMinor ?? 0;
    if (!Number.isSafeInteger(feeMinor) || feeMinor < 0 || feeMinor > cost * 100) throw new Error("Invalid cancellation fixture");
    return { profileVersion: networkProfile, quoteId, providerId: this.descriptor.id, serviceId: this.manifest().serviceId, issuedAt, expiresAt: new Date(Date.parse(issuedAt) + 120_000).toISOString(), available: true, price: { currency: "USD", totalMinor: cost * 100, kind: "fixed", feesIncluded: true }, cancellation: { feeMinor }, pickup: { instructions: "Simulated pickup only. No vehicle will arrive.", accessVerified: false }, waitMinutes, travelMinutes, walkingMinutes, transfers: 0, simulated: true };
  }
  private offerSignature(offer: ProviderOffer) { return createHmac("sha256", this.signingToken!).update(`beacon-offer-v2:${JSON.stringify(offer)}`).digest("base64url"); }
  prepareBooking(data: unknown): Omit<DemoBooking, "result"> & { declined?: boolean; amountMinor?: number } {
    const r = object(data);
    const sensitive = { tripId: text(r.trip_id, "trip id"), pickup: point(r.pickup), destination: point(r.destination) };
    if (!this.networkEnabled) {
      if (this.descriptor.profileVersion === networkProfile || r.offer !== undefined || r.grant !== undefined) throw new Error("Invalid network provider configuration");
      return { sensitive, fingerprint: createHash("sha256").update(JSON.stringify(sensitive)).digest("hex") };
    }
    const offer = parseProviderOffer(r.offer, this.manifest());
    const parts = offer.quoteId.split(".");
    if (parts.length !== 2 || !/^[a-f0-9-]{36}$/.test(parts[0])) throw new Error("Invalid provider quote proof");
    const expected = this.fixtureOffer(offer.issuedAt, parts[0]);
    const proof = this.offerSignature(expected); const actual = Buffer.from(parts[1]); const wanted = Buffer.from(proof);
    if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted) || JSON.stringify({ ...offer, quoteId: parts[0] }) !== JSON.stringify(expected)) throw new Error("Invalid provider quote terms");
    const payloadHash = bookingPayloadHash({ requestId: sensitive.tripId, quoteId: offer.quoteId, pickup: sensitive.pickup, destination: sensitive.destination });
    verifyBookingGrant(text(r.grant, "booking grant", 8192), this.signingToken!, { audience: this.descriptor.id, requestId: sensitive.tripId, quoteId: offer.quoteId, payloadHash, amountMinor: offer.price.totalMinor });
    return { sensitive, fingerprint: payloadHash, cancellationFeeMinor: offer.cancellation.feeMinor, amountMinor: offer.price.totalMinor, declined: this.options.decline === true };
  }
  newBooking(id: string, prepared: ReturnType<DemoProvider["prepareBooking"]>): DemoBooking {
    const payment = prepared.amountMinor === undefined ? undefined : simulatedAuthorization(prepared.amountMinor);
    return { result: { id, status: prepared.declined ? "declined" : "waiting", ...(payment ? { payment: prepared.declined ? simulatedCancellation(payment, 0) : payment } : {}) }, ...(prepared.declined ? {} : { sensitive: prepared.sensitive }), fingerprint: prepared.fingerprint, ...(prepared.cancellationFeeMinor === undefined ? {} : { cancellationFeeMinor: prepared.cancellationFeeMinor }) };
  }
  cancellationTombstone(id: string): DemoBooking { return { result: { id, status: "cancelled", ...(this.networkEnabled ? { payment: simulatedCancellation(simulatedAuthorization(0), 0) } : {}) } }; }
  hasSensitiveData(id: string) { return Boolean(this.trips.get(id)?.sensitive); }
  handle(method: string, path: string, data: unknown): unknown {
    if (method === "GET" && path === "/.well-known/agent-card.json" && this.networkEnabled) return this.manifest();
    if (method === "GET" && path === "/.well-known/agent-card.json") return { name: this.descriptor.name, url: this.descriptor.baseUrl, version: "1.0.0", protocol: "HTTP-API", simulated: true, functions: this.descriptor.functions };
    if (method === "POST" && path === "/agent/quote") {
      const q = object(data); const c = object(q.constraints);
      text(q.origin_zone, "origin zone"); text(q.destination_zone, "destination zone"); number(c.max_budget, "budget");
      if (this.descriptor.profileVersion === networkProfile && !this.networkEnabled) throw new Error("Invalid network provider configuration");
      if (this.networkEnabled) {
        const manifest = this.manifest();
        if (!manifest.serviceArea.originZones.includes(String(q.origin_zone)) || !manifest.serviceArea.destinationZones.includes(String(q.destination_zone))) throw new Error("Invalid provider service area");
        const offer = this.fixtureOffer(new Date().toISOString(), randomUUID());
        offer.quoteId += `.${this.offerSignature(offer)}`;
        return { manifest, offer };
      }
      const [cost, wait, travel, walking] = fixtures[this.descriptor.mode];
      return { provider_id: this.descriptor.id, provider_name: this.descriptor.name, available: true, cost, pickup_eta_minutes: wait, travel_time_minutes: travel, walking_minutes: walking, transfers: 0, expires_at: new Date(Date.now() + 120_000).toISOString(), reliability: this.descriptor.mode === "campus_ride" ? 0.98 : 0.94, simulated: true };
    }
    if (method === "POST" && path === "/agent/request-trip") {
      if (!this.descriptor.functions.includes("request_trip")) throw new Error("Provider does not accept bookings");
      const prepared = this.prepareBooking(data); const key = prepared.sensitive!.tripId;
      const known = this.requests.get(key);
      if (known) {
        const booking = this.trips.get(known)!;
        if (booking.fingerprint && booking.fingerprint !== prepared.fingerprint) throw new TripError("IDEMPOTENCY_CONFLICT", "Request ID already has different booking terms", 409);
        return booking.result;
      }
      const booking = this.newBooking(randomUUID(), prepared);
      this.requests.set(key, booking.result.id); this.trips.set(booking.result.id, booking);
      return booking.result;
    }
    if (method === "GET" && path.startsWith("/agent/trip-status/")) return this.get(decodeURIComponent(path.slice(19))).result;
    if (method === "GET" && path.startsWith("/agent/request-status/")) {
      const id = this.requests.get(decodeURIComponent(path.slice("/agent/request-status/".length)));
      return { trip: id ? this.get(id).result : null };
    }
    if (method === "POST" && path === "/agent/cancel-request") {
      const requestId = text(object(data).request_id, "request id");
      const id = this.requests.get(requestId) ?? randomUUID();
      this.requests.set(requestId, id);
      const booking = this.trips.get(id) ?? this.cancellationTombstone(id);
      cancelDemoBooking(booking); this.trips.set(id, booking); return booking.result;
    }
    if (method === "POST" && path === "/agent/cancel-trip") {
      const trip = this.get(text(object(data).trip_id, "trip id"));
      cancelDemoBooking(trip); return trip.result;
    }
    throw new Error("Unknown provider operation");
  }
  private get(id: string) { const trip = this.trips.get(id); if (!trip) throw new Error("Provider trip not found"); return trip; }
}
export function providerHandler(provider: DemoProvider, token?: string) {
  const credential = provider.signingToken ?? token;
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store");
    try {
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      if (path !== "/agent/quote" && path !== "/.well-known/agent-card.json" && credential) {
        const actual = Buffer.from(req.headers.authorization ?? ""); const expected = Buffer.from(`Bearer ${credential}`);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { res.writeHead(401); res.end(JSON.stringify({ error: "Unauthorized" })); return; }
      }
      let bytes = 0; const chunks: Buffer[] = [];
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 16_384) throw new Error("Request too large"); chunks.push(Buffer.from(chunk)); }
      const raw = Buffer.concat(chunks).toString();
      res.end(JSON.stringify(provider.handle(req.method ?? "GET", path, raw ? JSON.parse(raw) : {})));
    } catch (error) { res.writeHead(error instanceof TripError ? error.status : 400); res.end(JSON.stringify({ error: error instanceof TripError ? error.code : "Invalid provider request" })); }
  };
}
