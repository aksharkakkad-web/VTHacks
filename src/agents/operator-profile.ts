import { demoDescriptors } from "./demo-provider";
import type { ProviderDescriptor } from "./contract";
import { networkProfile } from "./provider-manifest";
import { providerUrl } from "./http-provider";

/** Beacon's wire profile, not an ANS protocol: service paths are fixed below one HTTP-API endpoint. */
export const mobilityProfile = "beacon-mobility-v1";
export const mobilityModes = ["campus_ride", "independent_ride", "transit"] as const;
export const mobilityFunctions = ["quote_trip", "request_trip", "trip_status", "cancel_trip", "reconcile_trip"] as const;

export function operatorEndpoint(origin: string, profile: typeof mobilityProfile | typeof networkProfile = mobilityProfile, services: ProviderDescriptor[] = demoDescriptors) {
  const url = providerUrl(origin);
  if (url.pathname !== "/") throw new Error("Provider origin must not contain a path");
  const agentUrl = `${url.origin}/api/demo/providers`;
  return {
    agentUrl, metaDataUrl: agentUrl, protocol: "HTTP-API", transports: ["REST"],
    functions: services.flatMap((provider) => provider.functions
      .filter((capability) => provider.mode !== "transit" || capability === "quote_trip")
      .map((capability) => ({ id: `${profile === mobilityProfile ? provider.mode : provider.serviceId ?? provider.id}.${capability}`, name: `${provider.name}: ${capability.replaceAll("_", " ")}`, tags: [profile, "transportation", "Blacksburg", provider.mode, ...(profile === networkProfile ? [`service:${provider.serviceId ?? provider.id}`] : [])] }))),
  };
}
