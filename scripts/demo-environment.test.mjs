import test from 'node:test';
import assert from 'node:assert/strict';
import {demoEnvironment} from './demo-environment.mjs';

test('demo startup isolates commercial credentials, contact delivery and cloud writes', () => {
  const env=demoEnvironment({UBER_CLIENT_SECRET:'private',TELEGRAM_BOT_TOKEN:'private',ANS_API_KEY:'private',UPSTASH_REDIS_REST_TOKEN:'private',GOOGLE_ROUTES_API_KEY:'private',DATABRICKS_TOKEN:'existing',BEACON_JOURNEY_AUDIT_WRITES:'true',DATABRICKS_PROVIDER_OUTCOMES_TABLE:'old',VERCEL:'1'},'/tmp/test');
  for(const key of ['UBER_CLIENT_SECRET','TELEGRAM_BOT_TOKEN','ANS_API_KEY','UPSTASH_REDIS_REST_TOKEN','GOOGLE_ROUTES_API_KEY','DATABRICKS_PROVIDER_OUTCOMES_TABLE']) assert.equal(env[key],'');
  assert.equal(env.DATABRICKS_TOKEN,'existing'); assert.equal(env.BEACON_JOURNEY_AUDIT_WRITES,'false');
  assert.equal(env.VERCEL,undefined);assert.equal(env.BEACON_PLANNER_WORKER_TOKEN.length,64);
});
test('offline is independent of inherited workspace configuration and Google is explicit', () => {
  const env=demoEnvironment({DATABRICKS_HOST:'host',DATABRICKS_TOKEN:'private',DATABRICKS_WAREHOUSE_ID:'id'},'/tmp/test',{offline:true});
  assert.equal(env.DATABRICKS_TOKEN,'');assert.equal(env.DATABRICKS_HOST,'');
  assert.throws(()=>demoEnvironment({},'/tmp/test',{google:true}),/existing approved/);
  assert.equal(demoEnvironment({GOOGLE_ROUTES_API_KEY:'approved'},'/tmp/test',{google:true}).BEACON_GOOGLE_ROUTES_ENABLED,'true');
});
