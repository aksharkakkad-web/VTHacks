import { demoDescriptors } from "./demo-provider";
import { providerUrl } from "./http-provider";

/** Beacon's wire profile, not an ANS protocol: service paths are fixed below one HTTP-API endpoint. */
export const mobilityProfile = "beacon-mobility-v1";
export const mobilityModes = ["campus_ride", "independent_ride", "transit"] as const;
export const mobilityFunctions = ["quote_trip", "request_trip", "trip_status", "cancel_trip", "reconcile_trip"] as const;

export function operatorEndpoint(origin: string) {
  const url = providerUrl(origin);
  if (url.pathname !== "/") throw new Error("Provider origin must not contain a path");
  const agentUrl = `${url.origin}/api/demo/providers`;
  return {
    agentUrl, metaDataUrl: agentUrl, protocol: "HTTP-API", transports: ["REST"],
    functions: demoDescriptors.flatMap((provider) => provider.functions
      .filter((capability) => provider.mode !== "transit" || capability === "quote_trip")
      .map((capability) => ({ id: `${provider.mode}.${capability}`, name: `${provider.name}: ${capability.replaceAll("_", " ")}`, tags: [mobilityProfile, "transportation", "Blacksburg", provider.mode] }))),
  };
}
