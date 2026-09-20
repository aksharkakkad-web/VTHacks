import { bookingPayloadHash, issueBookingGrant } from "../lib/authorization/booking-grant";
import { networkToken } from "./demo-provider";
import { networkProfile, normalizeNetworkQuote, parseProviderOffer } from "./provider-manifest";
import { isIP } from "node:net";
import { publicJson } from "../integrations/ans/transport";
import { coarseQuote, normalizeQuote, object, parseProviderTrip, type ProviderAgent, type ProviderDescriptor, type QuoteRequest, type TripRequest } from "./contract";

export function privateAddress(ip: string) {
  return /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|224\.|255\.)/.test(ip) || ip === "::" || ip === "::1" || /^(fc|fd|fe80|::ffff:)/i.test(ip);
}
export function providerUrl(value: string, demo = false): URL {
  const url = new URL(value);
  const localDemo = demo && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (!localDemo && (url.protocol !== "https:" || url.port || url.hostname === "localhost" || isIP(url.hostname.replace(/[\[\]]/g, ""))))) throw new Error("Provider requires a public HTTPS endpoint");
  if (!localDemo && !url.hostname.includes(".")) throw new Error("Invalid provider host");
  return url;
}
export class HttpProvider implements ProviderAgent {
  readonly descriptor: ProviderDescriptor;
  private readonly base: URL;
  constructor(descriptor: ProviderDescriptor, private readonly options: { allowLocalDemo?: boolean; timeoutMs?: number; token?: string; pin?: string } = {}) {
    this.descriptor = descriptor;
    this.base = providerUrl(descriptor.baseUrl, descriptor.source === "demo" && options.allowLocalDemo);
  }
  private async call(path: string, method = "GET", body?: unknown): Promise<unknown> {
    // Quote discovery is public and precedes identity verification. It must never
    // carry a credential, even when this client also supports authenticated booking.
    const authorization: Record<string, string> = path !== "/agent/quote" && this.options.token ? { Authorization: `Bearer ${this.options.token}` } : {};
    if (this.descriptor.source !== "demo") {
      if (path !== "/agent/quote" && !this.options.pin) throw new Error("Sensitive provider calls require an ANS certificate pin");
      return (await publicJson(`${this.base.href.replace(/\/$/, "")}${path}`, { method, body, pin: this.options.pin, timeoutMs: this.options.timeoutMs, headers: authorization })).value;
    }
    const response = await fetch(`${this.base.href.replace(/\/$/, "")}${path}`, {
      method, redirect: "error", signal: AbortSignal.timeout(this.options.timeoutMs ?? 4000),
      headers: { "Content-Type": "application/json", ...authorization },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`Provider request failed (${response.status})`);
    const bodyText = await response.text();
    if (bodyText.length > 65_536) throw new Error("Provider response too large");
    return JSON.parse(bodyText);
  }
  async quote(request: QuoteRequest) {
    const raw = object(await this.call("/agent/quote", "POST", coarseQuote({ ...request })));
    if (this.descriptor.profileVersion === networkProfile || "manifest" in raw || "offer" in raw) {
      const result = normalizeNetworkQuote(raw, this.descriptor, request);
      if (this.descriptor.mode !== "transit" && (!networkToken(this.options.token) || !this.descriptor.functions.includes("reconcile_trip"))) throw new Error("Invalid configured network provider authorization");
      return { ...result.candidate, network: result.network, quoteExpiresAt: result.quoteExpiresAt, quoteSource: result.quoteSource };
    }
    if (raw.profileVersion !== undefined && raw.profileVersion !== "beacon-mobility-v1") throw new Error("Invalid provider profile");
    return normalizeQuote(raw, this.descriptor);
  }
  async requestTrip(request: TripRequest) {
    const body = { trip_id: request.tripId, pickup: request.pickup, destination: request.destination };
    if (!request.network) {
      if (this.descriptor.profileVersion === networkProfile) throw new Error("Invalid network booking intent");
      return parseProviderTrip(await this.call("/agent/request-trip", "POST", body));
    }
    if (!networkToken(this.options.token) || !this.descriptor.functions.includes("reconcile_trip")) throw new Error("Invalid network provider authorization");
    const offer = request.network.offer;
    if (offer.providerId !== this.descriptor.id || offer.profileVersion !== networkProfile || !offer.available) throw new Error("Invalid network booking offer");
    // Re-parse against the bound identity. The provider independently validates its
    // signed offer; no consent reference or profile is put on the wire.
    const checked = parseProviderOffer(offer, { profileVersion: networkProfile, providerId: this.descriptor.id, serviceId: this.descriptor.serviceId ?? (this.descriptor.ansId ? this.descriptor.id.slice(this.descriptor.ansId.length + 1) : this.descriptor.id) });
    const now = Date.now();
    const grant = issueBookingGrant({ version: 1, issuer: "beacon", audience: this.descriptor.id, scope: "book_trip", requestId: request.tripId, quoteId: checked.quoteId, payloadHash: bookingPayloadHash({ requestId: request.tripId, quoteId: checked.quoteId, pickup: request.pickup, destination: request.destination }), amountMinor: checked.price.totalMinor, currency: "USD", issuedAt: now, expiresAt: Math.min(now + 60_000, Date.parse(checked.expiresAt)), simulated: true }, this.options.token);
    return parseProviderTrip(await this.call("/agent/request-trip", "POST", { ...body, offer: checked, grant }));
  }
  async getStatus(id: string) { return parseProviderTrip(await this.call(`/agent/trip-status/${encodeURIComponent(id)}`)); }
  async cancelTrip(id: string) { return parseProviderTrip(await this.call("/agent/cancel-trip", "POST", { trip_id: id })); }
  async getRequestStatus(id: string) {
    if (!this.descriptor.functions.includes("reconcile_trip")) throw new Error("Provider cannot reconcile requests");
    const result = object(await this.call(`/agent/request-status/${encodeURIComponent(id)}`));
    return result.trip === null ? undefined : parseProviderTrip(result.trip);
  }
  async cancelRequest(id: string) {
    if (!this.descriptor.functions.includes("reconcile_trip")) throw new Error("Provider cannot reconcile requests");
    const result = parseProviderTrip(await this.call("/agent/cancel-request", "POST", { request_id: id }));
    if (!["cancelled", "completed", "declined"].includes(result.status)) throw new Error("Provider did not confirm cancellation");
    return result;
  }
}
