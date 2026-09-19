import { isIP } from "node:net";
import { createHash } from "node:crypto";
import type { CandidatePlan } from "../types/provider";
import type { ProviderDescriptor, QuoteRequest } from "./contract";

export const networkProfile = "beacon-mobility-v2";
export type ProviderManifest = {
  profileVersion: typeof networkProfile; providerId: string; serviceId: string; operatorName: string;
  operatorAnsId: string | null; endpoint: string; mode: ProviderDescriptor["mode"]; capabilities: string[];
  serviceArea: { originZones: string[]; destinationZones: string[] };
  executionMode: "simulated"; authorization: "beacon-hmac-v1"; payment: "simulated-usd-v1";
};
export type ProviderOffer = {
  profileVersion: typeof networkProfile; quoteId: string; providerId: string; serviceId: string;
  issuedAt: string; expiresAt: string; available: boolean;
  price: { currency: "USD"; totalMinor: number; kind: "fixed"; feesIncluded: true };
  cancellation: { feeMinor: number }; pickup: { instructions: string; accessVerified: boolean };
  waitMinutes: number; travelMinutes: number; walkingMinutes: number; transfers?: number; simulated: true;
};
export type NetworkOffer = { manifest: ProviderManifest; offer: ProviderOffer };

const supportedCapabilities = ["quote_trip", "request_trip", "trip_status", "cancel_trip", "reconcile_trip"];
const bookingCapabilities = ["request_trip", "trip_status", "cancel_trip", "reconcile_trip"];
const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];
const maxQuoteLifetimeMs = 120_000;
// Public quotes tolerate five seconds of provider clock skew. Booking grants do not.
const quoteClockSkewMs = 5000;

function invalid(label: string): never { throw new Error(`Invalid ${label}`); }
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(label);
  return value as Record<string, unknown>;
}
function onlyKeys(value: Record<string, unknown>, allowed: string[], label: string) {
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid(label);
}
function text(value: unknown, label: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) invalid(label);
  return value;
}
function strings(value: unknown, label: string, maxCount: number): string[] {
  if (!Array.isArray(value) || !value.length || value.length > maxCount) invalid(label);
  const result = value.map(item => text(item, label));
  if (new Set(result).size !== result.length) invalid(label);
  return result;
}
function nonnegative(value: unknown, label: string, max: number, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isSafeInteger(value))) invalid(label);
  return value;
}
function utcTimestamp(value: unknown, label: string): { text: string; milliseconds: number } {
  const date = text(value, label, 24);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(date)) invalid(label);
  const milliseconds = Date.parse(date);
  const canonical = date.includes(".") ? date.replace(/\.(\d{1,3})Z$/, (_, fraction: string) => `.${fraction.padEnd(3, "0")}Z`) : date.replace("Z", ".000Z");
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== canonical) invalid(label);
  return { text: date, milliseconds };
}

/** Bind a service to the discovery result; never follow a manifest-supplied URL. */
export function parseProviderManifest(value: unknown, provider: ProviderDescriptor): ProviderManifest {
  const manifest = record(value, "provider manifest");
  onlyKeys(manifest, ["profileVersion", "providerId", "serviceId", "operatorName", "operatorAnsId", "endpoint", "mode", "capabilities", "serviceArea", "executionMode", "authorization", "payment"], "manifest fields");
  if (manifest.profileVersion !== networkProfile || manifest.executionMode !== "simulated" || manifest.authorization !== "beacon-hmac-v1" || manifest.payment !== "simulated-usd-v1") invalid("network profile");
  if (!["campus_ride", "independent_ride", "transit"].includes(String(manifest.mode)) || manifest.mode !== provider.mode) invalid("provider mode");
  const providerId = text(manifest.providerId, "provider ID", 128);
  const serviceId = text(manifest.serviceId, "service ID", 64);
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(providerId) || !/^[a-z][a-z0-9_-]{0,63}$/.test(serviceId) || providerId !== provider.id) invalid("service identity");
  if (provider.source !== "ans" && provider.source !== "demo") invalid("provider source");
  const operatorAnsId = manifest.operatorAnsId === null ? null : text(manifest.operatorAnsId, "operator ANS ID");
  if (operatorAnsId !== (provider.ansId ?? null)) invalid("operator ANS identity");
  if (provider.source === "ans" ? (!operatorAnsId || providerId !== `${operatorAnsId}:${serviceId}`) : serviceId !== providerId) invalid("service identity");
  const endpoint = text(manifest.endpoint, "provider endpoint", 2000);
  if (endpoint !== provider.baseUrl) invalid("provider endpoint binding");
  let url: URL;
  try { url = new URL(endpoint); } catch { invalid("provider endpoint"); }
  const localDemo = provider.source === "demo" && loopbackHosts.includes(url.hostname);
  const host = text(provider.agentHost, "agent host", 253).toLowerCase();
  const normalizedHost = host.replace(/\.$/, "");
  if (url.username || url.password || url.search || url.hash || !["http:", "https:"].includes(url.protocol)) invalid("provider endpoint");
  if (!localDemo && (normalizedHost === "localhost" || normalizedHost.endsWith(".localhost"))) invalid("public provider host");
  if (localDemo ? !loopbackHosts.includes(host) : (url.protocol !== "https:" || url.port || url.hostname !== host || !host.includes(".") || isIP(host.replace(/[\[\]]/g, "")))) invalid("provider endpoint");
  const capabilities = strings(manifest.capabilities, "provider capabilities", supportedCapabilities.length);
  if (!capabilities.includes("quote_trip") || capabilities.some(capability => !supportedCapabilities.includes(capability) || !provider.functions.includes(capability))) invalid("provider capabilities");
  if (manifest.mode === "transit" && capabilities.some(capability => ["request_trip", "cancel_trip", "reconcile_trip"].includes(capability))) invalid("transit booking capabilities");
  const area = record(manifest.serviceArea, "service area");
  onlyKeys(area, ["originZones", "destinationZones"], "service area fields");
  return {
    profileVersion: networkProfile, providerId, serviceId, operatorName: text(manifest.operatorName, "operator name"), operatorAnsId,
    endpoint, mode: provider.mode, capabilities,
    serviceArea: { originZones: strings(area.originZones, "origin zones", 64), destinationZones: strings(area.destinationZones, "destination zones", 64) },
    executionMode: "simulated", authorization: "beacon-hmac-v1", payment: "simulated-usd-v1",
  };
}

/** Keep only known offer fields; unsolicited personal or reliability data is dropped. */
export function parseProviderOffer(value: unknown, manifest: ProviderManifest, now = Date.now()): ProviderOffer {
  const offer = record(value, "provider offer");
  if (manifest.profileVersion !== networkProfile || offer.profileVersion !== networkProfile || offer.providerId !== manifest.providerId || offer.serviceId !== manifest.serviceId || offer.simulated !== true) invalid("offer identity or profile");
  if (typeof offer.available !== "boolean") invalid("offer availability");
  const issuedAt = utcTimestamp(offer.issuedAt, "quote issue time");
  const expiresAt = utcTimestamp(offer.expiresAt, "quote expiry");
  nonnegative(now, "current time", Number.MAX_SAFE_INTEGER, true);
  if (issuedAt.milliseconds > now + quoteClockSkewMs || expiresAt.milliseconds <= now || expiresAt.milliseconds <= issuedAt.milliseconds || expiresAt.milliseconds - issuedAt.milliseconds > maxQuoteLifetimeMs) invalid("quote lifetime");
  const price = record(offer.price, "quote price");
  onlyKeys(price, ["currency", "totalMinor", "kind", "feesIncluded"], "price fields");
  if (price.currency !== "USD" || price.kind !== "fixed" || price.feesIncluded !== true) invalid("fixed complete USD price");
  const totalMinor = nonnegative(price.totalMinor, "price amount", 1_000_000, true);
  const cancellation = record(offer.cancellation, "cancellation terms");
  onlyKeys(cancellation, ["feeMinor"], "cancellation fields");
  const feeMinor = nonnegative(cancellation.feeMinor, "cancellation fee", totalMinor, true);
  const pickup = record(offer.pickup, "pickup instructions");
  if (typeof pickup.accessVerified !== "boolean") invalid("pickup access verification");
  return {
    profileVersion: networkProfile, quoteId: text(offer.quoteId, "quote ID", 200), providerId: manifest.providerId, serviceId: manifest.serviceId,
    issuedAt: issuedAt.text, expiresAt: expiresAt.text, available: offer.available,
    price: { currency: "USD", totalMinor, kind: "fixed", feesIncluded: true }, cancellation: { feeMinor },
    pickup: { instructions: text(pickup.instructions, "pickup instructions", 1000), accessVerified: pickup.accessVerified },
    waitMinutes: nonnegative(offer.waitMinutes, "wait time", 1440), travelMinutes: nonnegative(offer.travelMinutes, "travel time", 1440), walkingMinutes: nonnegative(offer.walkingMinutes, "walking time", 1440),
    ...(offer.transfers === undefined ? {} : { transfers: nonnegative(offer.transfers, "transfers", 10, true) }), simulated: true,
  };
}

export function normalizeNetworkQuote(value: unknown, provider: ProviderDescriptor, request: QuoteRequest, now = Date.now()): { candidate: CandidatePlan; network: NetworkOffer; quoteExpiresAt: number; quoteSource: "simulated" } {
  const envelope = record(value, "network quote");
  const manifest = parseProviderManifest(envelope.manifest, provider);
  const offer = parseProviderOffer(envelope.offer, manifest, now);
  if (!manifest.serviceArea.originZones.includes(text(request.originZone, "origin zone")) || !manifest.serviceArea.destinationZones.includes(text(request.destinationZone, "destination zone"))) invalid("quote service area");
  if (manifest.mode !== "transit" && bookingCapabilities.some(capability => !manifest.capabilities.includes(capability))) invalid("bookable ride capabilities");
  // Hash explicit identity components to fit the existing decision contract's
  // 128-character ID alphabet without ambiguous concatenation or URL escaping.
  const planId = `network:${createHash("sha256").update(JSON.stringify([provider.id, offer.quoteId])).digest("hex")}`;
  const totalMinutes = nonnegative(offer.waitMinutes + offer.travelMinutes + offer.walkingMinutes, "total trip time", 1440);
  const candidate: CandidatePlan = {
    planId, providerId: provider.id, providerName: text(provider.name, "provider name", 120),
    mode: manifest.mode, available: offer.available, cost: offer.price.totalMinor / 100,
    waitMinutes: offer.waitMinutes, travelMinutes: offer.travelMinutes, walkingMinutes: offer.walkingMinutes,
    totalMinutes,
    ...(offer.transfers === undefined ? {} : { transfers: offer.transfers }), requiresProviderVerification: true,
  };
  return { candidate, network: { manifest, offer }, quoteExpiresAt: Date.parse(offer.expiresAt), quoteSource: "simulated" };
}
