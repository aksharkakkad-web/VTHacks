import assert from "node:assert/strict";
import test from "node:test";

import {
  activityEdges,
  mergeActivityEvents,
  panelSafeData,
  planningStatus,
  pollDelay,
  safeErrorMessage,
} from "./beacon-client.ts";

const request = {
  version: "beacon-agent-activity-v1",
  eventId: "evt-1",
  sequence: 1,
  runId: "run-1",
  requestId: "req-1",
  causationId: null,
  occurredAt: "2026-09-19T12:00:00.000Z",
  sender: "student_agent",
  recipient: "provider_agent",
  operation: "collect_quote",
  phase: "request",
  execution: "live",
  identity: "ans_verified",
  summaryCode: "QUOTE_REQUESTED",
  safeData: { providerName: "Demo operator" },
  evidenceIds: [],
};

test("mergeActivityEvents de-duplicates and orders authoritative activity", () => {
  const newer = { ...request, eventId: "evt-2", sequence: 2, phase: "response" };
  assert.deepEqual(
    mergeActivityEvents([newer], [request, newer]).map((event) => event.eventId),
    ["evt-1", "evt-2"],
  );
});

test("activityEdges pairs a request with its response and keeps provenance", () => {
  const response = { ...request, eventId: "evt-2", sequence: 2, phase: "response", sender: "provider_agent", recipient: "student_agent" };
  assert.deepEqual(activityEdges([request, response]), [{
    id: "req-1",
    sender: "student_agent",
    recipient: "provider_agent",
    request,
    response,
  }]);
});

test("activityEdges preserves local-demo provenance without calling it verified", () => {
  const edge = activityEdges([{ ...request, identity: "local_demo", execution: "simulated" }])[0];
  assert.equal(edge.request.identity, "local_demo");
  assert.equal(edge.request.execution, "simulated");
});

test("worker errors stop progress and remain explicit", () => {
  assert.deepEqual(planningStatus({ phase: "gathering", worker: "offline" }), {
    kind: "blocked",
    label: "Planner worker offline",
  });
  assert.deepEqual(planningStatus({ phase: "ready", worker: "online" }), {
    kind: "ready",
    label: "Plan ready",
  });
});

test("pollDelay slows hidden tabs without stopping polling", () => {
  assert.equal(pollDelay(false), 2_000);
  assert.equal(pollDelay(true), 10_000);
});

test("API errors expose safe codes instead of raw server messages", () => {
  assert.equal(safeErrorMessage({ error: { code: "PAIR_CODE_INVALID", message: "secret raw details" } }), "Pairing code was not accepted.");
  assert.equal(safeErrorMessage({ error: { code: "SOMETHING_NEW", message: "stack trace" } }), "The request could not be completed. Try again.");
});

test("panelSafeData removes URLs, coordinates, credentials, raw errors, and hidden reasoning", () => {
  assert.deepEqual(panelSafeData({
    providerName: "Demo operator",
    totalMinor: 700,
    endpointUrl: "https://provider.invalid/private",
    latitude: 37.2,
    token: "secret",
    rawError: "stack",
    reasoning: "private chain",
    note: "visit https://provider.invalid",
  }), { providerName: "Demo operator", totalMinor: 700 });
});
