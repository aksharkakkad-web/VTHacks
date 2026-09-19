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
  const item = { agentId: "id", agentHost: provider.agentHost, agentDisplayName: "Campus Ride", lifecycle: { status: "ACTIVE" }, endpoints: [{ agentUrl: provider.baseUrl, protocol: "HTTP-API", functions: [{ id: "quote_trip", tags: ["campus_ride"] }, { id: "request_trip" }, { id: "trip_status" }, { id: "cancel_trip" }] }] };
  assert.equal(parseDiscovered({ items: [item] }).length, 1);
  assert.equal(parseDiscovered({ items: [{ ...item, lifecycle: { status: "REVOKED" } }] }).length, 0);
  assert.equal(parseDiscovered({ items: [{ ...item, endpoints: [{ ...item.endpoints[0], protocol: "A2A" }] }] }).length, 0);
  assert.equal(parseDiscovered({ items: [{ ...item, agentHost: "other.example" }] }).length, 0);
});

test("one registered operator can advertise separately callable provider services", () => {
  const endpoints = ["campus_ride", "independent_ride"].map((mode) => ({ agentUrl: `https://operator.example/api/demo/providers/${mode}`, protocol: "HTTP-API", functions: [{ id: "quote_trip", tags: [mode] }, { id: "request_trip" }, { id: "trip_status" }, { id: "cancel_trip" }] }));
  const services = parseDiscovered({ items: [{ agentId: "registered-operator", agentHost: "operator.example", agentDisplayName: "Beacon Providers", lifecycle: { status: "ACTIVE" }, endpoints }] });
  assert.equal(services.length, 2);
  assert.notEqual(services[0].id, services[1].id);
  assert.equal(services[0].ansId, services[1].ansId, "service identity is distinct from the registered operator identity");
});

test("resolution binds the selected host to the same registry record", () => {
  const api = "https://api.godaddy.com";
  const resolution = { ansName: "ans://v1.0.0.campusride.geta36.app", links: [{ rel: "agent-details", href: `${api}/v1/agents/${provider.ansId}` }] };
  assert.equal(validateResolution(resolution, provider, api), resolution.ansName);
  assert.throws(() => validateResolution({ ...resolution, links: [{ rel: "agent-details", href: `${api}/v1/agents/other-id` }] }, provider, api));
  assert.throws(() => validateResolution({ ...resolution, ansName: "ans://v1.0.0.attacker.example" }, provider, api));
});
