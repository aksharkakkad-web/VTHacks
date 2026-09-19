import { join } from "node:path";
import { tmpdir } from "node:os";
import { StudentAgent } from "../../agents/student/service";
import { demoRecommendation } from "../../agents/student/decision";
import { HttpProvider } from "../../agents/http-provider";
import { demoDescriptors } from "../../agents/demo-provider";
import { GoDaddyDirectory, LocalDemoDirectory } from "../../integrations/ans/directory";
import { notificationSender } from "../../integrations/notifications/sms";
import { FileTripStore } from "./store";
import { RedisTripStore } from "./redis-store";

type Runtime = { agent: StudentAgent; timer?: ReturnType<typeof setInterval>; };
const globalRuntime = globalThis as typeof globalThis & { beaconRuntime?: Runtime };
export function getRuntime(): Runtime {
  if (globalRuntime.beaconRuntime) return globalRuntime.beaconRuntime;
  const demo = process.env.DEMO_MODE === "true";
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL; const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (process.env.VERCEL && (!redisUrl || !redisToken)) throw new Error("A shared Redis trip store is required on Vercel");
  const store = redisUrl && redisToken ? new RedisTripStore(redisUrl, redisToken) : new FileTripStore(process.env.BEACON_STATE_DIR ?? join(tmpdir(), "beacon-trips-local"));
  const directory = demo && process.env.BEACON_ANS_MODE !== "live" ? new LocalDemoDirectory(demoDescriptors, true) : new GoDaddyDirectory({ apiBase: process.env.ANS_BASE_URL, apiKey: process.env.ANS_API_KEY, query: process.env.BEACON_ANS_QUERY });
  const agent = new StudentAgent({ store, directory, demo,
    provider: (descriptor, identity) => new HttpProvider(descriptor, { allowLocalDemo: demo, pin: identity?.serverFingerprint, token: process.env.BEACON_PROVIDER_TOKEN }),
    recommend: async (plans, context) => { if (!demo) throw new Error("Databricks decision adapter is not connected yet"); return demoRecommendation(plans, context); },
    notify: notificationSender({ demo, accountSid: process.env.TWILIO_ACCOUNT_SID, authToken: process.env.TWILIO_AUTH_TOKEN, from: process.env.TWILIO_FROM_NUMBER }),
    graceMinutes: Number(process.env.BEACON_GRACE_MINUTES ?? 5),
  });
  const runtime: Runtime = { agent };
  // Local/server Node execution only. Vercel needs an external scheduler invoking
  // the authenticated monitor endpoint; a browser timer is never the monitor.
  if (!process.env.VERCEL) { runtime.timer = setInterval(() => void agent.monitor(), 10_000); runtime.timer.unref(); }
  globalRuntime.beaconRuntime = runtime; return runtime;
}
