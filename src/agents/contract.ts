import type { CandidatePlan } from "../types/provider";

export type ProviderDescriptor = {
  id: string; name: string; mode: Exclude<CandidatePlan["mode"], "walk">;
  baseUrl: string; agentHost: string; functions: string[]; source: "ans" | "demo";
  ansId?: string;
};
export type QuoteRequest = {
  originZone: string; destinationZone: string; maxBudget: number;
  minimizeWalking: boolean; minimizeTransfers: boolean;
};
export type Point = { lat: number; lng: number };
export type TripRequest = { tripId: string; pickup: Point; destination: Point };
export type ProviderTripStatus = "accepted" | "waiting" | "cancelled" | "in_trip" | "completed";
export type ProviderTrip = { id: string; status: ProviderTripStatus };
/** Adapter metadata is stripped before publishing the frozen CandidatePlan shape. */
export type ProviderQuote = CandidatePlan & { quoteExpiresAt?: number };
export interface ProviderAgent {
  descriptor: ProviderDescriptor;
  quote(request: QuoteRequest): Promise<ProviderQuote>;
  requestTrip(request: TripRequest): Promise<ProviderTrip>;
  getStatus(id: string): Promise<ProviderTrip>;
  cancelTrip(id: string): Promise<void>;
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`Invalid ${label}`);
  return value.trim();
}
export function number(value: unknown, label: string, max = 10_000): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) throw new Error(`Invalid ${label}`);
  return value;
}
export function point(value: unknown): Point {
  const p = object(value);
  if (typeof p.lat !== "number" || !Number.isFinite(p.lat) || Math.abs(p.lat) > 90 || typeof p.lng !== "number" || !Number.isFinite(p.lng) || Math.abs(p.lng) > 180) throw new Error("Invalid coordinates");
  return { lat: p.lat, lng: p.lng };
}
/** Deliberately construct fields: never spread a profile into a provider request. */
export function coarseQuote(request: QuoteRequest & Record<string, unknown>) {
  return { origin_zone: text(request.originZone, "origin zone"), destination_zone: text(request.destinationZone, "destination zone"), constraints: { max_budget: number(request.maxBudget, "budget"), minimize_walking: request.minimizeWalking === true, minimize_transfers: request.minimizeTransfers === true } };
}
export function normalizeQuote(value: unknown, provider: ProviderDescriptor, now = Date.now()): ProviderQuote {
  const q = object(value);
  if (q.provider_id !== provider.id || typeof q.available !== "boolean") throw new Error("Invalid provider identity or availability");
  if (q.expires_at !== undefined && (typeof q.expires_at !== "string" || !Number.isFinite(Date.parse(q.expires_at)) || Date.parse(q.expires_at) <= now)) throw new Error("Expired provider quote");
  const cost = number(q.cost, "cost");
  const waitMinutes = number(q.pickup_eta_minutes, "wait", 1440);
  const travelMinutes = number(q.travel_time_minutes, "travel", 1440);
  const walkingMinutes = number(q.walking_minutes, "walking", 1440);
  return {
    quoteExpiresAt: Math.min(now + 120_000, q.expires_at === undefined ? Infinity : Date.parse(q.expires_at as string)),
    planId: `${provider.id}-${now}`, providerId: provider.id, providerName: provider.name,
    mode: provider.mode, available: q.available, cost, waitMinutes, travelMinutes, walkingMinutes,
    totalMinutes: waitMinutes + travelMinutes + walkingMinutes,
    transfers: q.transfers === undefined ? 0 : number(q.transfers, "transfers", 10),
    ...(q.reliability === undefined ? {} : { reliability: number(q.reliability, "reliability", 1) }),
    requiresProviderVerification: true,
  };
}
export function parseProviderTrip(value: unknown): ProviderTrip {
  const t = object(value);
  const statuses: unknown[] = ["accepted", "waiting", "cancelled", "in_trip", "completed"];
  if (!statuses.includes(t.status)) throw new Error("Invalid provider status");
  return { id: text(t.id, "provider trip id"), status: t.status as ProviderTripStatus };
}
