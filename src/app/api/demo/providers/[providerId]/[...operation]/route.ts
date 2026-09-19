import { demoDescriptors, networkToken } from "@/agents/demo-provider";
import { networkProfile } from "@/agents/provider-manifest";
import { providerUrl } from "@/agents/http-provider";
import { providerServiceId, type ProviderDescriptor } from "@/agents/contract";
import { hostedProvider, RedisBookingStore } from "@/agents/hosted-provider";
import { redisConfiguration } from "@/lib/trip-state/redis-config";

export const runtime = "nodejs";
type Context = { params: Promise<{ providerId: string; operation: string[] }> };
async function handle(request: Request, context: Context) {
  if (process.env.BEACON_HOSTED_PROVIDERS !== "true") return Response.json({ error: "Not found" }, { status: 404 });
  if (process.env.BEACON_HOSTED_PROVIDER_TOKEN && !networkToken(process.env.BEACON_HOSTED_PROVIDER_TOKEN)) return Response.json({ error: "Provider authorization not configured" }, { status: 503 });
  const { providerId, operation } = await context.params;
  const seed = demoDescriptors.find((p) => p.id === providerId);
  if (!seed) return Response.json({ error: "Provider not found" }, { status: 404 });
  const publicOrigin = process.env.BEACON_PROVIDER_ORIGIN;
  if (!publicOrigin || !publicOrigin.startsWith("https://")) return Response.json({ error: "Provider origin not configured" }, { status: 503 });
  let origin: string;
  try { const url = providerUrl(publicOrigin); if (url.pathname !== "/") throw new Error("Invalid origin"); origin = url.origin; }
  catch { return Response.json({ error: "Provider origin not configured" }, { status: 503 }); }
  const ansId = process.env.BEACON_ANS_AGENT_ID;
  const descriptor: ProviderDescriptor = { ...seed, id: ansId ? providerServiceId(ansId, seed.id) : seed.id, ...(ansId ? { ansId, source: "ans" } : {}), serviceId: seed.id, ...(networkToken(process.env.BEACON_HOSTED_PROVIDER_TOKEN) ? { profileVersion: networkProfile } : {}), baseUrl: `${origin}/api/demo/providers/${seed.id}`, agentHost: new URL(origin).hostname };
  const redis = redisConfiguration();
  const store = redis ? new RedisBookingStore(redis.url, redis.token) : undefined;
  return hostedProvider({ descriptor, token: process.env.BEACON_HOSTED_PROVIDER_TOKEN, store })(request, `/${operation.join("/")}`);
}
export const GET = handle;
export const POST = handle;
