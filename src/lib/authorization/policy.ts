import type { ProviderDescriptor } from "../../agents/contract";
import type { VerifiedIdentity } from "../../integrations/ans/directory";

export function authorize(provider: ProviderDescriptor, identity: VerifiedIdentity | undefined, confirmed: boolean, demoEnabled: boolean, now = Date.now()) {
  const bound = identity && identity.providerId === provider.id && identity.host === provider.agentHost && identity.baseUrl === provider.baseUrl && identity.validUntil > now;
  const trusted = bound && (identity.source === "ans" || (demoEnabled && provider.source === "demo" && identity.source === "local-demo"));
  const ride = ["campus_ride", "independent_ride"].includes(provider.mode);
  const capable = ["request_trip", "trip_status", "cancel_trip"].every((f) => provider.functions.includes(f));
  return { preciseLocation: Boolean(confirmed && trusted && ride && capable), trustedContact: false, identity: false };
}
