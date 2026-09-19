import { join } from "node:path";
import { tmpdir } from "node:os";
import { StudentAgent } from "../../agents/student/service";
import { decisionRecommendation } from "../../agents/student/databricks";
import { evaluateTrip, evaluateTripIntelligence, getPublicTripOptions } from "../decision-client/server";
import { HttpProvider } from "../../agents/http-provider";
import { scopedProviderToken } from "../../agents/provider-credentials";
import { demoDescriptors } from "../../agents/demo-provider";
import { GoDaddyDirectory, LocalDemoDirectory } from "../../integrations/ans/directory";
import { telegramSender } from "../../integrations/notifications/telegram";
import { FileTripStore } from "./store";
import { RedisTripStore } from "./redis-store";
import { redisConfiguration } from "./redis-config";
import { ingestProviderOutcome } from "../../integrations/databricks/provider-outcomes";
import { campusWeather } from "../campus-evidence/catalog";

type Runtime = { agent: StudentAgent; timer?: ReturnType<typeof setInterval>; };
const globalRuntime = globalThis as typeof globalThis & { beaconRuntime?: Runtime };
export function getRuntime(): Runtime {
  if (globalRuntime.beaconRuntime) return globalRuntime.beaconRuntime;
  const demo = process.env.DEMO_MODE === "true";
  const notificationMode = process.env.BEACON_NOTIFICATION_MODE || (demo ? "simulated" : "telegram");
  if (!["simulated", "telegram"].includes(notificationMode)) throw new Error("Invalid notification mode");
  const redis = redisConfiguration();
  if (process.env.VERCEL && !redis) throw new Error("A shared Redis trip store is required on Vercel");
  const store = redis ? new RedisTripStore(redis.url, redis.token) : new FileTripStore(process.env.BEACON_STATE_DIR ?? join(tmpdir(), "beacon-trips-local"));
  const directory = demo && process.env.BEACON_ANS_MODE !== "live" ? new LocalDemoDirectory(demoDescriptors, true) : new GoDaddyDirectory({ apiBase: process.env.ANS_BASE_URL, apiKey: process.env.ANS_API_KEY, query: process.env.BEACON_ANS_QUERY });
  const sendNotification = telegramSender({ simulated: notificationMode === "simulated", botToken: process.env.TELEGRAM_BOT_TOKEN, allowedChatIds: process.env.TELEGRAM_ALLOWED_CHAT_IDS });
  const agent = new StudentAgent({ store, directory, demo,
    // The shared demo token belongs only to our configured loopback providers.
    // ANS discovery must never cause that credential to be sent to a third party.
    provider: (descriptor, identity) => new HttpProvider(descriptor, { allowLocalDemo: demo, pin: identity?.serverFingerprint, token: demo && descriptor.source === "demo" ? process.env.BEACON_PROVIDER_TOKEN : scopedProviderToken(descriptor, identity, process.env.BEACON_PROVIDER_CREDENTIALS) }),
    recommend: decisionRecommendation(evaluateTrip, evaluateTripIntelligence),
    publicTripOptions: getPublicTripOptions,
    campusWeather,
    ...(process.env.DATABRICKS_PROVIDER_OUTCOMES_TABLE && process.env.DATABRICKS_HOST && process.env.DATABRICKS_TOKEN && process.env.DATABRICKS_WAREHOUSE_ID ? {
      recordOutcome: (outcome: Parameters<typeof ingestProviderOutcome>[2]) => ingestProviderOutcome({ host: process.env.DATABRICKS_HOST!, token: process.env.DATABRICKS_TOKEN!, warehouseId: process.env.DATABRICKS_WAREHOUSE_ID! }, process.env.DATABRICKS_PROVIDER_OUTCOMES_TABLE!, outcome),
    } : {}),
    notify: (contact, message, key) => sendNotification(contact, demo ? `[Beacon demo test] ${message}` : message, key),
    graceMinutes: Number(process.env.BEACON_GRACE_MINUTES ?? 5),
  });
  const runtime: Runtime = { agent };
  // Local/server Node execution only. Vercel needs an external scheduler invoking
  // the authenticated monitor endpoint; a browser timer is never the monitor.
  if (!process.env.VERCEL) { runtime.timer = setInterval(() => void agent.monitor(), 10_000); runtime.timer.unref(); }
  globalRuntime.beaconRuntime = runtime; return runtime;
}
