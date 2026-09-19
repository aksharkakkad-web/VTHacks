import { randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { object, number, point, text, type ProviderDescriptor, type ProviderTrip, type TripRequest } from "./contract";

export const demoDescriptors: ProviderDescriptor[] = [
  { id: "transit", name: "Transit", mode: "transit", baseUrl: "http://127.0.0.1:4311", agentHost: "localhost", source: "demo", functions: ["quote_trip", "trip_status"] },
  { id: "campus_ride", name: "Campus Ride", mode: "campus_ride", baseUrl: "http://127.0.0.1:4312", agentHost: "localhost", source: "demo", functions: ["quote_trip", "request_trip", "trip_status", "cancel_trip", "reconcile_trip"] },
  { id: "independent_ride", name: "Independent Ride", mode: "independent_ride", baseUrl: "http://127.0.0.1:4313", agentHost: "localhost", source: "demo", functions: ["quote_trip", "request_trip", "trip_status", "cancel_trip", "reconcile_trip"] },
];
const fixtures = { transit: [0, 15, 14, 5], campus_ride: [0, 8, 11, 1], independent_ride: [7, 5, 10, 1] };

/** Seeded world state, real HTTP contract. These are not actual transportation bookings. */
export class DemoProvider {
  private trips = new Map<string, { result: ProviderTrip; sensitive?: TripRequest }>();
  private requests = new Map<string, string>();
  constructor(readonly descriptor: ProviderDescriptor) {}
  hasSensitiveData(id: string) { return Boolean(this.trips.get(id)?.sensitive); }
  handle(method: string, path: string, data: unknown): unknown {
    if (method === "GET" && path === "/.well-known/agent-card.json") return { name: this.descriptor.name, url: this.descriptor.baseUrl, version: "1.0.0", protocol: "HTTP-API", simulated: true, functions: this.descriptor.functions };
    if (method === "POST" && path === "/agent/quote") {
      const q = object(data); const c = object(q.constraints);
      text(q.origin_zone, "origin zone"); text(q.destination_zone, "destination zone"); number(c.max_budget, "budget");
      const [cost, wait, travel, walking] = fixtures[this.descriptor.mode];
      return { provider_id: this.descriptor.id, provider_name: this.descriptor.name, available: true, cost, pickup_eta_minutes: wait, travel_time_minutes: travel, walking_minutes: walking, transfers: 0, expires_at: new Date(Date.now() + 120_000).toISOString(), reliability: this.descriptor.mode === "campus_ride" ? 0.98 : 0.94, simulated: true };
    }
    if (method === "POST" && path === "/agent/request-trip") {
      if (!this.descriptor.functions.includes("request_trip")) throw new Error("Provider does not accept bookings");
      const r = object(data); const key = text(r.trip_id, "trip id");
      const known = this.requests.get(key);
      if (known) return this.trips.get(known)!.result;
      const sensitive = { tripId: key, pickup: point(r.pickup), destination: point(r.destination) };
      const result: ProviderTrip = { id: randomUUID(), status: "waiting" };
      this.requests.set(key, result.id); this.trips.set(result.id, { result, sensitive });
      return result;
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
      const result: ProviderTrip = { id, status: "cancelled" };
      this.trips.set(id, { result }); return result;
    }
    if (method === "POST" && path === "/agent/cancel-trip") {
      const trip = this.get(text(object(data).trip_id, "trip id"));
      trip.result.status = "cancelled"; delete trip.sensitive; return trip.result;
    }
    throw new Error("Unknown provider operation");
  }
  private get(id: string) { const trip = this.trips.get(id); if (!trip) throw new Error("Provider trip not found"); return trip; }
}
export function providerHandler(provider: DemoProvider, token?: string) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store");
    try {
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      if (path !== "/agent/quote" && path !== "/.well-known/agent-card.json" && token) {
        const actual = Buffer.from(req.headers.authorization ?? ""); const expected = Buffer.from(`Bearer ${token}`);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { res.writeHead(401); res.end(JSON.stringify({ error: "Unauthorized" })); return; }
      }
      let bytes = 0; const chunks: Buffer[] = [];
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 16_384) throw new Error("Request too large"); chunks.push(Buffer.from(chunk)); }
      const raw = Buffer.concat(chunks).toString();
      res.end(JSON.stringify(provider.handle(req.method ?? "GET", path, raw ? JSON.parse(raw) : {})));
    } catch { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid provider request" })); }
  };
}
