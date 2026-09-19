import { networkToken } from "@/agents/demo-provider";
import { networkProfile } from "@/agents/provider-manifest";
import { operatorEndpoint, mobilityProfile } from "@/agents/operator-profile";
import { developerDemoDescriptors } from "@/agents/developer-demo";

export const runtime = "nodejs";
export function GET() {
  if (process.env.BEACON_HOSTED_PROVIDERS !== "true") return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const profile = networkToken(process.env.BEACON_HOSTED_PROVIDER_TOKEN) ? networkProfile : mobilityProfile;
    const endpoint = operatorEndpoint(process.env.BEACON_PROVIDER_ORIGIN ?? "", profile, profile === networkProfile ? developerDemoDescriptors : undefined);
    return Response.json({ name: "Beacon Demo Providers", version: networkToken(process.env.BEACON_HOSTED_PROVIDER_TOKEN) ? "2.0.0" : "1.0.0", simulated: true, description: "Simulated transportation services under one operator; no real ride bookings.", ...endpoint }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Provider origin not configured" }, { status: 503 });
  }
}
