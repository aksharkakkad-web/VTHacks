import { demoDescriptors } from "@/agents/demo-provider";
import { providerServiceId } from "@/agents/contract";
import { hostedProvider, RedisBookingStore } from "@/agents/hosted-provider";
import { redisConfiguration } from "@/lib/trip-state/redis-config";

export const runtime = "nodejs";
type Context = { params: Promise<{ providerId: string; operation: string[] }> };
async function handle(request: Request, context: Context) {
  if (process.env.BEACON_HOSTED_PROVIDERS !== "true") return Response.json({ error: "Not found" }, { status: 404 });
  const { providerId, operation } = await context.params;
  const seed = demoDescriptors.find((p) => p.id === providerId);
  if (!seed) return Response.json({ error: "Provider not found" }, { status: 404 });
  const publicOrigin = process.env.BEACON_PROVIDER_ORIGIN;
  if (!publicOrigin || !publicOrigin.startsWith("https://")) return Response.json({ error: "Provider origin not configured" }, { status: 503 });
  const descriptor = { ...seed, id: process.env.BEACON_ANS_AGENT_ID ? providerServiceId(process.env.BEACON_ANS_AGENT_ID, seed.mode) : seed.id, baseUrl: `${publicOrigin}/api/demo/providers/${seed.id}`, agentHost: new URL(publicOrigin).hostname };
  const redis = redisConfiguration();
  const store = redis ? new RedisBookingStore(redis.url, redis.token) : undefined;
  return hostedProvider({ descriptor, token: process.env.BEACON_HOSTED_PROVIDER_TOKEN, store })(request, `/${operation.join("/")}`);
}
export const GET = handle;
export const POST = handle;
