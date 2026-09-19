import assert from "node:assert/strict";
const base = process.env.BEACON_SMOKE_URL ?? "http://localhost:3100";
const liveAns = process.env.BEACON_SMOKE_LIVE_ANS === "true";
const decisionEngine = process.env.BEACON_SMOKE_DECISION_ENGINE ?? "local_fallback";
assert.ok(["local_fallback", "databricks"].includes(decisionEngine));
let cookie = "";
async function call(path, body = {}, status = 200, method = "POST", useCookie = true) {
  const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(useCookie ? { Cookie: cookie } : {}) }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
  const set = response.headers.get("set-cookie"); if (set) cookie = set.split(";")[0];
  const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
}
async function create() {
  return call("/api/trips", { preferences: { trustedContact: { name: "Maya", phone: "+15555550100", consent: true, shareLocation: true } } }, 201);
}
async function start(trip) {
  let result;
  for (const action of ["discover", "evaluate", "confirm", "verify", "request"]) result = await call(`/api/trips/${trip.id}/${action}`);
  assert.equal(result.state, "WAITING_FOR_PICKUP"); return result;
}
const trip = await create();
await call(`/api/trips/${trip.id}/request`, {}, 409);
await call(`/api/trips/${trip.id}`, {}, 401, "GET", false);
const initial = await start(trip);
for (const code of [decisionEngine === "databricks" ? "DATABRICKS_EVALUATION" : "LOCAL_POLICY_FALLBACK", "SIMULATED_TRANSPORT"]) assert.ok(initial.recommendation.reasonCodes.includes(code));
assert.equal(initial.selectedPlan.mode, "campus_ride");
assert.equal(initial.providerVerified, liveAns);
assert.equal(initial.sensitiveDataReleased, true);
const replacement = await call(`/api/demo/trips/${trip.id}/cancel-provider`);
assert.ok(replacement.recommendation.reasonCodes.includes("REPLANNED_AFTER_PROVIDER_FAILURE"));
assert.equal(replacement.selectedPlan.mode, "independent_ride");
assert.equal(replacement.state, "WAITING_FOR_PICKUP");
assert.equal(replacement.providerVerified, liveAns);
if (liveAns) {
  const timeline = await call(`/api/trips/${trip.id}/events`, {}, 200, "GET");
  assert.equal(timeline.filter((event) => event.code === "ANS_VERIFIED").length, 2);
  assert.ok(!timeline.some((event) => event.code === "LOCAL_DEMO_TRUST"));
}
const arrived = await call(`/api/trips/${trip.id}/location`, { lat: 37.221, lng: -80.420, recordedAt: new Date().toISOString() });
assert.equal(arrived.state, "ARRIVED"); assert.equal(arrived.alertSent, false); assert.equal(arrived.sensitiveDataReleased, false);
const second = await create(); await start(second);
const overdue = await call(`/api/demo/trips/${second.id}/expire-deadline`);
assert.equal(overdue.state, "OVERDUE"); assert.equal(overdue.alertSent, false);
await call(`/api/demo/trips/${second.id}/expire-deadline`);
const events = await call(`/api/trips/${second.id}/events`, {}, 200, "GET");
assert.equal(events.filter((e) => e.code === "DEMO_ALERT").length, 1);
await call(`/api/trips/${second.id}/events`, { event: "provider.cancelled" }, 503);
await call("/api/demo/reset");
console.log("PASS: real provider HTTP → recommendation → confirmation → trust gate → booking → autonomous replacement → arrival; overdue demo alert once; session and callback protection.");
console.log(`Evidence: ${liveAns ? "live ANS resolution and DNS/badge/TLS verification" : "local demo identity trust"}; ${decisionEngine === "databricks" ? "Databricks evaluation" : "explicit local decision-policy fallback"}. Transportation and SMS remain simulated.`);
