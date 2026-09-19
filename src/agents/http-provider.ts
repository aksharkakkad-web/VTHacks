import { isIP } from "node:net";
import { publicJson } from "../integrations/ans/transport";
import { coarseQuote, normalizeQuote, parseProviderTrip, type ProviderAgent, type ProviderDescriptor, type QuoteRequest, type TripRequest } from "./contract";

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
    if (this.descriptor.source !== "demo") {
      if (path !== "/agent/quote" && !this.options.pin) throw new Error("Sensitive provider calls require an ANS certificate pin");
      return (await publicJson(`${this.base.href.replace(/\/$/, "")}${path}`, { method, body, pin: this.options.pin, timeoutMs: this.options.timeoutMs, headers: this.options.token ? { Authorization: `Bearer ${this.options.token}` } : {} })).value;
    }
    const response = await fetch(`${this.base.href.replace(/\/$/, "")}${path}`, {
      method, redirect: "error", signal: AbortSignal.timeout(this.options.timeoutMs ?? 4000),
      headers: { "Content-Type": "application/json", ...(this.options.token ? { Authorization: `Bearer ${this.options.token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`Provider request failed (${response.status})`);
    const bodyText = await response.text();
    if (bodyText.length > 65_536) throw new Error("Provider response too large");
    return JSON.parse(bodyText);
  }
  async quote(request: QuoteRequest) { return normalizeQuote(await this.call("/agent/quote", "POST", coarseQuote({ ...request })), this.descriptor); }
  async requestTrip(request: TripRequest) { return parseProviderTrip(await this.call("/agent/request-trip", "POST", { trip_id: request.tripId, pickup: request.pickup, destination: request.destination })); }
  async getStatus(id: string) { return parseProviderTrip(await this.call(`/agent/trip-status/${encodeURIComponent(id)}`)); }
  async cancelTrip(id: string) { await this.call("/agent/cancel-trip", "POST", { trip_id: id }); }
}
