import { join } from "node:path";
import { tmpdir } from "node:os";
import { StudentAgent } from "../../agents/student/service";
import { decisionRecommendation } from "../../agents/student/databricks";
import { evaluateTrip, evaluateTripIntelligence, getPublicTripOptions, getCompleteJourney } from "../decision-client/server";
import { HttpProvider } from "../../agents/http-provider";
import { scopedProviderToken } from "../../agents/provider-credentials";
import { runtimeProviderConfiguration } from "./provider-configuration";
import { syntheticJourneyBinding } from "./synthetic-journey-binding";
import { uberSandboxConfiguration } from "./uber-configuration";
import { UberGuestProvider, emptyUberGuestProviderState } from "../../agents/uber-guest-provider";
import { FileJsonStore, RedisJsonStore } from "../planner/store";
import { GoDaddyDirectory, LocalDemoDirectory } from "../../integrations/ans/directory";
import { telegramSender } from "../../integrations/notifications/telegram";
import { FileTripStore } from "./store";
import { RedisTripStore } from "./redis-store";
import { redisConfiguration } from "./redis-config";
import { ingestProviderOutcome } from "../../integrations/databricks/provider-outcomes";
import { campusWeather } from "../campus-evidence/catalog";
import { queryRouteContext } from "../../agents/context/runtime";
import { getActivityRuntime } from "../agent-activity/runtime";

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
  const providers = runtimeProviderConfiguration(process.env);
  const uberConfig = uberSandboxConfiguration(process.env);
  const uber = uberConfig ? new UberGuestProvider(uberConfig, { store: redis
    ? new RedisJsonStore(redis.url, redis.token, 'beacon:uber-guest-sandbox:v1', emptyUberGuestProviderState)
    : new FileJsonStore(join(process.env.BEACON_STATE_DIR ?? join(tmpdir(), 'beacon-trips-local'), 'uber-guest-sandbox.json'), emptyUberGuestProviderState()) }) : undefined;
  if (uber) providers.descriptors.push(uber.descriptor);
  const syntheticBinding = syntheticJourneyBinding(process.env, providers.descriptors.filter(p => p.id !== uber?.descriptor.id));
  const directory = demo && process.env.BEACON_ANS_MODE !== "live" ? new LocalDemoDirectory(providers.descriptors, true) : new GoDaddyDirectory({ apiBase: process.env.ANS_BASE_URL, apiKey: process.env.ANS_API_KEY, query: process.env.BEACON_ANS_QUERY });
  const sendNotification = telegramSender({ simulated: notificationMode === "simulated", botToken: process.env.TELEGRAM_BOT_TOKEN, allowedChatIds: process.env.TELEGRAM_ALLOWED_CHAT_IDS });
  const agent = new StudentAgent({ store, directory, demo,
    activity: getActivityRuntime(),
    contextReader: queryRouteContext,
    // The shared demo token belongs only to our configured loopback providers.
    // ANS discovery must never cause that credential to be sent to a third party.
    provider: (descriptor, identity) => uber && descriptor.source === 'demo' && descriptor.id === uber.descriptor.id && descriptor.baseUrl === uber.descriptor.baseUrl
      ? uber : new HttpProvider(descriptor, { allowLocalDemo: demo, pin: identity?.serverFingerprint, token: providers.tokenFor(descriptor) ?? scopedProviderToken(descriptor, identity, process.env.BEACON_PROVIDER_CREDENTIALS) }),
    recommend: decisionRecommendation(evaluateTrip, (plans, context, signals, options) => evaluateTripIntelligence(plans, context, signals, { ...options, enableAi: process.env.BEACON_PLANNER_MODE !== 'codex_laptop' })),
    getCompleteJourney,
    journeyRideBinding: network => uber && network.offer.providerId === uber.descriptor.id ? uber.journeyRideBinding(network) : syntheticBinding(network),
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
