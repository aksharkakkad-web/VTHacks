import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseDiscovered, validateBadge, validateResolution } from "../integrations/ans/directory";
import { authorize } from "../lib/authorization/policy";
import { demoDescriptors } from "./demo-provider";

const provider = { ...demoDescriptors[1], source: "ans" as const, baseUrl: "https://campusride.geta36.app", agentHost: "campusride.geta36.app", ansId: "registration-id" };
const fp = "SHA256:" + "ab".repeat(32);
function badge() { return { status: "ACTIVE", payload: { producer: { event: { ansId: provider.ansId, ansName: "ans://v1.0.0.campusride.geta36.app", agent: { host: provider.agentHost }, expiresAt: new Date(100_000).toISOString(), attestations: { serverCert: { fingerprint: fp }, validServerCerts: [{ fingerprint: fp, notAfter: new Date(100_000).toISOString() }] } } } } }; }
test("ANS evidence binds registration, hostname, certificate, lifecycle, and expiry", () => {
  const proof = validateBadge(badge(), provider, fp, 1000);
  assert.equal(proof.source, "ans");
  assert.equal(proof.providerId, provider.id);
  assert.ok(proof.validUntil <= 100_000);
  assert.throws(() => validateBadge({ ...badge(), status: "REVOKED" }, provider, fp, 1000));
  assert.throws(() => validateBadge(badge(), { ...provider, agentHost: "attacker.example" }, fp, 1000));
  assert.throws(() => validateBadge(badge(), provider, "SHA256:" + "cd".repeat(32), 1000));
  assert.throws(() => validateBadge(badge(), provider, fp, 100_001));
  assert.throws(() => validateBadge(badge(), { ...provider, ansId: "other" }, fp, 1000));
});
test("authorization requires confirmation, current bound identity, and ride capabilities", () => {
  const proof = validateBadge(badge(), provider, fp, 1000);
  assert.equal(authorize(provider, proof, true, false, 1000).preciseLocation, true);
  assert.equal(authorize(provider, proof, false, false, 1000).preciseLocation, false);
  assert.equal(authorize(provider, proof, true, false, 100_001).preciseLocation, false);
  assert.equal(authorize({ ...provider, baseUrl: "https://attacker.example" }, proof, true, false, 1000).preciseLocation, false);
  assert.equal(authorize({ ...provider, mode: "transit" }, proof, true, false, 1000).preciseLocation, false);
  assert.equal(authorize(provider, { ...proof, source: "local-demo" }, true, false, 1000).preciseLocation, false);
});
test("discovery validates capabilities, protocol, lifecycle and host instead of trusting search hits", () => {
  const item = { agentId: "id", agentHost: provider.agentHost, agentDisplayName: "Campus Ride", status: "ACTIVE", endpoints: [{ agentUrl: provider.baseUrl, protocol: "HTTP-API", functions: [{ id: "quote_trip", tags: ["campus_ride"] }, { id: "request_trip" }, { id: "trip_status" }, { id: "cancel_trip" }] }] };
  assert.equal(parseDiscovered({ agents: [item] }).length, 1);
  for (const status of ["REVOKED", "PENDING_DNS", undefined]) assert.equal(parseDiscovered({ agents: [{ ...item, status }] }).length, 0);
  assert.equal(parseDiscovered({ agents: [{ ...item, endpoints: [{ ...item.endpoints[0], protocol: "A2A" }] }] }).length, 0);
  assert.equal(parseDiscovered({ agents: [{ ...item, agentHost: "other.example" }] }).length, 0);
  assert.throws(() => parseDiscovered({ items: [item] }), /Invalid ANS search response/);
});

test("one registered HTTP endpoint exposes distinct services with scoped capabilities", () => {
  const endpoints = [{ agentUrl: "https://operator.example/api/demo/providers", protocol: "HTTP-API", functions: [
    { id: "campus_ride.quote_trip", tags: ["beacon-mobility-v1", "campus_ride"] },
    { id: "campus_ride.request_trip", tags: ["beacon-mobility-v1", "campus_ride"] },
    { id: "independent_ride.quote_trip", tags: ["beacon-mobility-v1", "independent_ride"] },
  ] }];
  const services = parseDiscovered({ agents: [{ agentId: "registered-operator", agentHost: "operator.example", agentDisplayName: "Beacon Providers", status: "ACTIVE", endpoints }] });
  assert.equal(services.length, 2);
  assert.notEqual(services[0].id, services[1].id);
  assert.equal(services[0].ansId, services[1].ansId, "service identity is distinct from the registered operator identity");
  assert.equal(services[0].baseUrl, "https://operator.example/api/demo/providers/campus_ride");
  assert.equal(services[1].baseUrl, "https://operator.example/api/demo/providers/independent_ride");
  assert.ok(services[0].functions.includes("request_trip"));
  assert.ok(!services[1].functions.includes("request_trip"), "another service's capability cannot authorize this service");
});

test("operator discovery requires the explicit profile, matching mode, and registered host", () => {
  const endpoint = { agentUrl: "https://operator.example/api/demo/providers", protocol: "HTTP-API", functions: [{ id: "campus_ride.quote_trip", tags: ["beacon-mobility-v1", "campus_ride"] }] };
  const item = { agentId: "id", agentHost: "operator.example", agentDisplayName: "Beacon", status: "ACTIVE", endpoints: [endpoint] };
  assert.equal(parseDiscovered({ agents: [item] }).length, 1);
  assert.equal(parseDiscovered({ agents: [{ ...item, agentHost: "different.example" }] }).length, 0);
  for (const tags of [["campus_ride"], ["beacon-mobility-v1", "independent_ride"]]) {
    assert.equal(parseDiscovered({ agents: [{ ...item, endpoints: [{ ...endpoint, functions: [{ id: "campus_ride.quote_trip", tags }] }] }] }).length, 0);
  }
});

test("resolution binds the selected host to the same registry record", () => {
  const api = "https://api.godaddy.com";
  const resolution = { ansName: "ans://v1.0.0.campusride.geta36.app", links: [{ rel: "agent-details", href: `${api}/v1/agents/${provider.ansId}` }] };
  assert.equal(validateResolution(resolution, provider, api), resolution.ansName);
  assert.throws(() => validateResolution({ ...resolution, links: [{ rel: "agent-details", href: `${api}/v1/agents/other-id` }] }, provider, api));
  assert.throws(() => validateResolution({ ...resolution, ansName: "ans://v1.0.0.attacker.example" }, provider, api));
});

test("v2 discovery separates same-mode developer services and rejects unsupported profiles", () => {
  const capabilities = ["quote_trip", "request_trip", "trip_status", "cancel_trip", "reconcile_trip"];
  const functions = ["late_shuttle", "accessible_shuttle"].flatMap(service => capabilities.map(capability => ({
    id: `${service}.${capability}`, tags: ["beacon-mobility-v2", "campus_ride", `service:${service}`],
  })));
  const item = { agentId: "operator-one", agentHost: "operator.example", agentDisplayName: "Example Operator", status: "ACTIVE", endpoints: [{ agentUrl: "https://operator.example/services", protocol: "HTTP-API", functions }] };
  const providers = parseDiscovered({ agents: [item] });
  assert.deepEqual(providers.map(p => p.id), ["operator-one:late_shuttle", "operator-one:accessible_shuttle"]);
  assert.ok(providers.every(p => p.mode === "campus_ride"));
  assert.equal(providers[1].baseUrl, "https://operator.example/services/accessible_shuttle");
  assert.equal(parseDiscovered({ agents: [{ ...item, endpoints: [{ ...item.endpoints[0], functions: [{ id: "quote_trip", tags: ["beacon-mobility-v99", "campus_ride"] }] }] }] }).length, 0);
});

test("v2 discovery never borrows another service's mode or lifecycle capabilities", () => {
  const item = { agentId: "operator", agentHost: "operator.example", agentDisplayName: "Example", status: "ACTIVE", endpoints: [{ agentUrl: "https://operator.example/services", protocol: "HTTP-API", functions: [
    { id: "one.quote_trip", tags: ["beacon-mobility-v2", "campus_ride", "service:one"] },
    { id: "two.request_trip", tags: ["beacon-mobility-v2", "campus_ride", "service:two"] },
    { id: "evil.quote_trip", tags: ["beacon-mobility-v2", "campus_ride", "service:../evil"] },
  ] }] };
  const providers = parseDiscovered({ agents: [item] });
  assert.equal(providers.length, 1);
  assert.deepEqual(providers[0].functions, ["quote_trip"]);
});
