import { object, type ProviderDescriptor } from "./contract";
import type { VerifiedIdentity } from "../integrations/ans/directory";
export function scopedProviderToken(provider: ProviderDescriptor, identity: VerifiedIdentity | undefined, configuration: string | undefined): string | undefined {
  if (!configuration || provider.source !== "ans" || identity?.source !== "ans" || !identity.serverFingerprint || identity.providerId !== provider.id || identity.host !== provider.agentHost || identity.baseUrl !== provider.baseUrl) return undefined;
  try {
    const entry = object(object(JSON.parse(configuration))[provider.id]);
    return entry.baseUrl === provider.baseUrl && typeof entry.token === "string" && entry.token.length > 0 && !/\s/.test(entry.token) ? entry.token : undefined;
  } catch { return undefined; }
}
