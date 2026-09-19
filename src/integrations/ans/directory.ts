import { resolveTxt } from "node:dns/promises";
import { object, providerServiceId, text, type ProviderDescriptor } from "../../agents/contract";
import { providerUrl } from "../../agents/http-provider";
import { publicJson } from "./transport";

export type VerifiedIdentity = {
  providerId: string; host: string; baseUrl: string; source: "ans" | "local-demo";
  validUntil: number; serverFingerprint?: string; ansId?: string; badgeUrl?: string;
};
export interface AgentDirectory {
  discover(): Promise<ProviderDescriptor[]>;
  verify(provider: ProviderDescriptor): Promise<VerifiedIdentity>;
}
type AgentIdentity = Pick<ProviderDescriptor, "id" | "agentHost" | "baseUrl" | "source" | "ansId">;
export function validateResolution(value: unknown, provider: AgentIdentity, api: string): string {
  const result = object(value); const name = text(result.ansName, "ANS name", 512);
  if (!name.startsWith("ans://v") || !name.endsWith(`.${provider.agentHost}`) || !provider.ansId || !Array.isArray(result.links) || !result.links.some((link) => {
    const item = object(link); return item.rel === "agent-details" && item.href === `${api}/v1/agents/${encodeURIComponent(provider.ansId!)}`;
  })) throw new Error("ANS resolution does not match the discovered provider");
  return name;
}
export function parseDiscovered(value: unknown): ProviderDescriptor[] {
  const result = object(value); if (!Array.isArray(result.items)) throw new Error("Invalid ANS search response");
  const providers: ProviderDescriptor[] = [];
  for (const unknownItem of result.items) {
    try {
      const item = object(unknownItem);
      if (object(item.lifecycle).status !== "ACTIVE" || !Array.isArray(item.endpoints)) continue;
      if (item.expiresAt !== undefined && !(Date.parse(String(item.expiresAt)) > Date.now())) continue;
      for (const rawEndpoint of item.endpoints) {
        const endpoint = object(rawEndpoint);
        if (endpoint.protocol !== "HTTP-API" || !Array.isArray(endpoint.functions)) continue;
        const functions = endpoint.functions.map((f) => text(object(f).id, "function"));
        const tags = endpoint.functions.flatMap((f) => { const t = object(f).tags; return Array.isArray(t) ? t : []; });
        const mode = (["campus_ride", "independent_ride", "transit"] as const).find((m) => tags.includes(m));
        if (!mode || !functions.includes("quote_trip")) continue;
        const baseUrl = text(endpoint.agentUrl, "agent URL", 2000);
        const agentHost = text(item.agentHost, "agent host", 253).toLowerCase();
        if (providerUrl(baseUrl).hostname !== agentHost) continue;
        const ansId = text(item.agentId, "agent id"); const id = providerServiceId(ansId, mode);
        // ANS identifies the operator/host. Each advertised mobility endpoint is
        // a separately callable service, not a claim of a separately verified owner.
        if (!providers.some((p) => p.id === id)) providers.push({ id, ansId, name: `${text(item.agentDisplayName, "provider name")} / ${mode.replaceAll("_", " ")}`, mode, baseUrl, agentHost, functions, source: "ans" });
      }
    } catch { /* Malformed or unsupported search entries are not callable providers. */ }
  }
  return providers;
}

/** The SDK's DNS + HTTPS badge + TLS fingerprint path; not an offline SCITT verifier. */
export function validateBadge(value: unknown, provider: AgentIdentity, observedFingerprint: string, now = Date.now()): VerifiedIdentity {
  const badge = object(value);
  if (!["ACTIVE", "WARNING"].includes(String(badge.status))) throw new Error("ANS identity is not active");
  const event = object(object(object(badge.payload).producer).event);
  if (event.ansId !== provider.ansId || object(event.agent).host !== provider.agentHost) throw new Error("ANS identity mismatch");
  if (typeof event.ansName !== "string" || !event.ansName.endsWith(`.${provider.agentHost}`)) throw new Error("ANS name mismatch");
  const expiry = Date.parse(String(event.expiresAt));
  if (!Number.isFinite(expiry) || expiry <= now) throw new Error("Expired ANS identity");
  const attestations = object(event.attestations);
  const primary = object(attestations.serverCert).fingerprint;
  if (!/^SHA256:[a-f0-9]{64}$/.test(observedFingerprint)) throw new Error("Invalid TLS fingerprint");
  const certs = attestations.validServerCerts;
  const match = Array.isArray(certs) ? certs.some((c) => { const cert = object(c); return cert.fingerprint === observedFingerprint && Date.parse(String(cert.notAfter)) > now; }) : primary === observedFingerprint;
  if (!match) throw new Error("ANS certificate does not match endpoint");
  return { providerId: provider.id, host: provider.agentHost, baseUrl: provider.baseUrl, source: "ans", validUntil: Math.min(expiry, now + 60_000), serverFingerprint: observedFingerprint, ansId: provider.ansId };
}

export class GoDaddyDirectory implements AgentDirectory {
  private readonly api: string;
  private readonly transparency: string;
  constructor(private readonly options: { apiBase?: string; apiKey?: string; query?: string } = {}) {
    this.api = options.apiBase || "https://api.godaddy.com";
    if (!["https://api.godaddy.com", "https://api.ote-godaddy.com"].includes(this.api)) throw new Error("Unsupported ANS authority");
    this.transparency = this.api.includes("ote-") ? "https://transparency.ans.ote-godaddy.com" : "https://transparency.ans.godaddy.com";
  }
  async discover() {
    const query = new URLSearchParams({ query: this.options.query ?? "transportation Blacksburg", protocol: "HTTP-API" });
    return parseDiscovered((await publicJson(`${this.api}/v1/ans/registered-agents?${query}`, { headers: this.headers() })).value);
  }
  async verify(provider: AgentIdentity) {
    if (provider.source !== "ans" || !provider.ansId || providerUrl(provider.baseUrl).hostname !== provider.agentHost) throw new Error("Invalid ANS provider");
    const resolvedName = validateResolution((await publicJson(`${this.api}/v1/agents/resolution`, { method: "POST", body: { agentHost: provider.agentHost, version: "*" }, headers: this.headers() })).value, provider, this.api);
    // DNS discovery must name the same registry ID as capability discovery.
    const badgeUrl = `${this.transparency}/v1/agents/${encodeURIComponent(provider.ansId)}`;
    const records = await resolveTxt(`_ans-badge.${provider.agentHost}`);
    const found = records.some((chunks) => {
      const fields = Object.fromEntries(chunks.join("").split(";").map((p) => { const i = p.indexOf("="); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }));
      return fields.v === "ans-badge1" && fields.url === badgeUrl;
    });
    if (!found) throw new Error("ANS DNS binding is missing or mismatched");
    const badge = (await publicJson(badgeUrl)).value;
    if (object(object(object(object(badge).payload).producer).event).ansName !== resolvedName) throw new Error("Registry resolution and transparency evidence disagree");
    // Request only public metadata during the TLS proof, never private trip data.
    const probe = await publicJson(`${provider.baseUrl.replace(/\/$/, "")}/.well-known/agent-card.json`);
    return { ...validateBadge(badge, provider, probe.fingerprint), badgeUrl };
  }
  private headers(): Record<string, string> { return this.options.apiKey ? { Authorization: `sso-key ${this.options.apiKey}` } : {}; }
}

export class LocalDemoDirectory implements AgentDirectory {
  constructor(private readonly providers: ProviderDescriptor[], private readonly enabled: boolean) {}
  async discover() { if (!this.enabled) throw new Error("Demo mode disabled"); return this.providers; }
  async verify(provider: ProviderDescriptor): Promise<VerifiedIdentity> {
    const allowed = this.providers.find((p) => p.id === provider.id && p.baseUrl === provider.baseUrl);
    if (!this.enabled || !allowed || provider.source !== "demo") throw new Error("Provider is not pretrusted for this demo");
    providerUrl(provider.baseUrl, true);
    return { providerId: provider.id, host: provider.agentHost, baseUrl: provider.baseUrl, source: "local-demo", validUntil: Date.now() + 60_000 };
  }
}
