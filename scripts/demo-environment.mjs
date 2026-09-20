import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export function demoEnvironment(source, state, {offline = false, google = false, telegram = false} = {}) {
  const env = {...source};
  for (const key of Object.keys(env)) {
    if (/^(UBER_|ANS_|UPSTASH_|KV_REST_|BEACON_PROVIDER_CREDENTIALS$)/.test(key) || (!telegram && /^TELEGRAM_/.test(key))) env[key] = '';
  }
  Object.assign(env, {
    DEMO_MODE:'true', BEACON_NOTIFICATION_MODE:telegram?'telegram':'simulated', BEACON_ANS_MODE:'demo',
    BEACON_PLANNER_MODE:'deterministic', BEACON_PLANNER_WORKER_TOKEN:randomBytes(32).toString('hex'),
    BEACON_PROVIDER_TOKEN:randomBytes(32).toString('hex'), BEACON_MONITOR_TOKEN:randomBytes(32).toString('hex'),
    BEACON_PROVIDER_EVENT_TOKEN:randomBytes(32).toString('hex'), BEACON_CONTEXT_SERVICE_TOKEN:randomBytes(32).toString('hex'),
    BEACON_CONTEXT_AGENT_URL:'http://127.0.0.1:3123/api/demo/context-agent',
    BEACON_BACKEND_URL:'http://127.0.0.1:3123', BEACON_SMOKE_URL:'http://127.0.0.1:3123',
    BEACON_SYNTHETIC_JOURNEY_BINDINGS:'true', BEACON_DEMO_SCENARIO:'true',
    BEACON_DEMO_SCENARIO_VARIANT:'baseline', BEACON_DEMO_RIDE_PROGRESS:'true',
    BEACON_GOOGLE_ROUTES_ENABLED:google?'true':'false', UBER_GUEST_SANDBOX_ENABLED:'false',
    BEACON_LYFT_DEMO:'false', BEACON_HOSTED_PROVIDERS:'false', BEACON_STATE_DIR:state,
    BEACON_JOURNEY_AUDIT_WRITES:'false', DATABRICKS_PROVIDER_OUTCOMES_TABLE:'',
  });
  if (!google) env.GOOGLE_ROUTES_API_KEY = '';
  if (google && !source.GOOGLE_ROUTES_API_KEY) throw new Error('Google routing requires an existing approved GOOGLE_ROUTES_API_KEY');
  if (telegram && (!source.TELEGRAM_BOT_TOKEN || !source.TELEGRAM_ALLOWED_CHAT_IDS)) throw new Error('Live Telegram requires TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_CHAT_IDS in .env.telegram.local');
  if (offline) for (const key of ['DATABRICKS_HOST','DATABRICKS_TOKEN','DATABRICKS_WAREHOUSE_ID']) env[key] = '';
  delete env.VERCEL;
  return env;
}

export function loadExistingDatabricksToken(env) {
  if (!env.DATABRICKS_HOST || !env.DATABRICKS_WAREHOUSE_ID) return false;
  if (env.DATABRICKS_TOKEN) return true;
  if (!env.DATABRICKS_CONFIG_PROFILE) return false;
  const result = spawnSync('databricks', ['auth','token','--profile',env.DATABRICKS_CONFIG_PROFILE,'--host',env.DATABRICKS_HOST,'--output','json'], {encoding:'utf8', timeout:35000});
  if (result.status !== 0) return false;
  try { const token = JSON.parse(result.stdout).access_token; if (typeof token !== 'string' || !token) return false; env.DATABRICKS_TOKEN=token; return true; }
  catch { return false; }
}
