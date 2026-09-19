import { operatorEndpoint } from "@/agents/operator-profile";

export const runtime = "nodejs";
export function GET() {
  if (process.env.BEACON_HOSTED_PROVIDERS !== "true") return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const endpoint = operatorEndpoint(process.env.BEACON_PROVIDER_ORIGIN ?? "");
    return Response.json({ name: "Beacon Demo Providers", version: "1.0.0", simulated: true, description: "Simulated transportation services under one operator; no real ride bookings.", ...endpoint }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Provider origin not configured" }, { status: 503 });
  }
}
