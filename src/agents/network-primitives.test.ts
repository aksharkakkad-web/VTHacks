import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import type { ProviderDescriptor, QuoteRequest } from "./contract";
import { networkProfile, normalizeNetworkQuote, parseProviderManifest, parseProviderOffer, type ProviderManifest, type ProviderOffer } from "./provider-manifest";
import { bookingPayloadHash, issueBookingGrant, verifyBookingGrant, type BookingGrantClaims } from "../lib/authorization/booking-grant";
import { paymentLiability, simulatedAuthorization, simulatedCancellation, type SimulatedPayment } from "../lib/payments/simulated";
import { prepareDecision } from "../lib/decision-client/decision";

const now = Date.now();
const provider: ProviderDescriptor = {
  id: "operator-123:night-shuttle", ansId: "operator-123", name: "Night Shuttle", mode: "campus_ride",
  baseUrl: "https://provider.example/services/night-shuttle", agentHost: "provider.example", source: "ans",
  functions: ["quote_trip", "request_trip", "trip_status", "cancel_trip", "reconcile_trip"],
};
const request: QuoteRequest = { originZone: "Downtown Blacksburg", destinationZone: "Campus residence", maxBudget: 10, minimizeWalking: true, minimizeTransfers: true };
const manifest: ProviderManifest = {
  profileVersion: networkProfile, providerId: provider.id, serviceId: "night-shuttle", operatorName: "Shuttle developer", operatorAnsId: provider.ansId!,
  endpoint: provider.baseUrl, mode: provider.mode, capabilities: [...provider.functions],
  serviceArea: { originZones: [request.originZone], destinationZones: [request.destinationZone] },
  executionMode: "simulated", authorization: "beacon-hmac-v1", payment: "simulated-usd-v1",
};
const offer: ProviderOffer = {
  profileVersion: networkProfile, quoteId: "quote-123", providerId: provider.id, serviceId: manifest.serviceId,
  issuedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 60_000).toISOString(), available: true,
  price: { currency: "USD", totalMinor: 725, kind: "fixed", feesIncluded: true }, cancellation: { feeMinor: 125 },
  pickup: { instructions: "Use the marked pickup point.", accessVerified: false }, waitMinutes: 3, travelMinutes: 12, walkingMinutes: 1, simulated: true,
};
function rejectsManifest(value: unknown, descriptor = provider) { assert.throws(() => parseProviderManifest(value, descriptor), /Invalid/); }
function rejectsOffer(value: unknown) { assert.throws(() => parseProviderOffer(value, manifest, now), /Invalid/); }

test("network manifests retain independent service IDs and bind registered identity", () => {
  assert.deepEqual(parseProviderManifest(manifest, provider), manifest);
  const other = { ...provider, id: "operator-123:accessible-shuttle", baseUrl: "https://provider.example/services/accessible-shuttle" };
  const parsed = parseProviderManifest({ ...manifest, serviceId: "accessible-shuttle", providerId: other.id, endpoint: other.baseUrl }, other);
  assert.equal(parsed.mode, manifest.mode);
  assert.notEqual(parsed.serviceId, manifest.serviceId);
});

test("network manifests reject missing, wrong and cross-service identities", () => {
  for (const change of [
    { providerId: undefined }, { operatorAnsId: undefined }, { providerId: "other" }, { operatorAnsId: "other-operator" },
    { serviceId: "another-shuttle" }, { endpoint: "https://elsewhere.example" }, { endpoint: `${provider.baseUrl}/other` },
  ]) rejectsManifest({ ...manifest, ...change });
  rejectsManifest(manifest, { ...provider, agentHost: "other.example" });
});

test("network manifests reject unsupported profiles, modes, capabilities and execution contracts", () => {
  for (const change of [
    { profileVersion: "beacon-mobility-v1" }, { mode: "walk" }, { mode: "independent_ride" }, { executionMode: "live" },
    { authorization: "oauth" }, { payment: "stripe" }, { capabilities: ["quote_trip", "charge_card"] },
    { capabilities: ["quote_trip", "quote_trip"] }, { capabilities: [] }, { extraAuthorization: "none" },
  ]) rejectsManifest({ ...manifest, ...change });
  rejectsManifest(manifest, { ...provider, functions: ["quote_trip"] });
});

test("network manifests enforce bounded service IDs, names and exact coarse service areas", () => {
  for (const serviceId of ["NightShuttle", "night/shuttle", "1shuttle", "a".repeat(65), ""]) rejectsManifest({ ...manifest, serviceId });
  for (const change of [
    { operatorName: " " }, { operatorName: "x".repeat(201) }, { serviceArea: { originZones: [], destinationZones: [request.destinationZone] } },
    { serviceArea: { originZones: Array.from({ length: 65 }, (_, i) => `Zone ${i}`), destinationZones: [request.destinationZone] } },
  ]) rejectsManifest({ ...manifest, ...change });
});

test("only explicitly demo descriptors permit a loopback manifest endpoint", () => {
  const demo = { ...provider, id: "night-shuttle", source: "demo" as const, ansId: undefined, baseUrl: "http://127.0.0.1:4312", agentHost: "localhost" };
  const local = { ...manifest, providerId: demo.id, operatorAnsId: null, endpoint: demo.baseUrl };
  assert.deepEqual(parseProviderManifest(local, demo), local);
  rejectsManifest({ ...local, serviceId: "other-service" }, demo);
  rejectsManifest({ ...manifest, endpoint: demo.baseUrl }, { ...provider, baseUrl: demo.baseUrl, agentHost: "127.0.0.1" });
  for (const baseUrl of ["ftp://localhost:4312", "https://user:password@provider.example", "https://127.0.0.1", "https://provider.example:444", "https://provider.example?token=secret"]) {
    rejectsManifest({ ...manifest, endpoint: baseUrl }, { ...provider, baseUrl });
  }
});

test("ANS manifests cannot declare reserved localhost names as public endpoints", () => {
  for (const agentHost of ["localhost.", "api.localhost"]) {
    const baseUrl = `https://${agentHost}`;
    rejectsManifest({ ...manifest, endpoint: baseUrl }, { ...provider, baseUrl, agentHost });
  }
});

test("network offers bind the exact manifest identity and require complete fixed USD prices", () => {
  assert.deepEqual(parseProviderOffer(offer, manifest, now), offer);
  for (const change of [
    { profileVersion: "beacon-mobility-v1" }, { providerId: "other" }, { serviceId: "other-service" }, { simulated: false },
    { quoteId: undefined }, { quoteId: "" }, { available: undefined }, { cancellation: undefined }, { pickup: undefined },
  ]) rejectsOffer({ ...offer, ...change });
  for (const price of [
    { ...offer.price, currency: "EUR" }, { ...offer.price, kind: "estimate" }, { ...offer.price, feesIncluded: false },
    { ...offer.price, feesIncluded: undefined }, { ...offer.price, totalMinor: 1.5 }, { ...offer.price, totalMinor: -1 },
    { ...offer.price, totalMinor: Infinity }, { ...offer.price, totalMinor: 1_000_001 }, { currency: "USD", totalMinor: 500 },
  ]) rejectsOffer({ ...offer, price });
  rejectsOffer({ ...offer, cancellation: { feeMinor: 726 } });
  rejectsOffer({ ...offer, cancellation: { feeMinor: 0.5 } });
  rejectsOffer({ ...offer, pickup: { instructions: "Pickup here" } });
});

test("network offers reject expired, future, overlong and invalid UTC timestamps", () => {
  for (const change of [
    { issuedAt: undefined }, { expiresAt: new Date(now).toISOString() }, { issuedAt: new Date(now + 5001).toISOString() },
    { expiresAt: new Date(now + 120_001).toISOString() }, { issuedAt: new Date(now + 2000).toISOString(), expiresAt: new Date(now + 1000).toISOString() },
    { issuedAt: "2026-02-30T00:00:00.000Z" }, { expiresAt: "invalid" }, { expiresAt: new Date(now + 60_000).toISOString().replace("Z", "+00:00") },
  ]) rejectsOffer({ ...offer, ...change });
  assert.equal(parseProviderOffer({ ...offer, issuedAt: new Date(now + 5000).toISOString() }, manifest, now).quoteId, offer.quoteId);
});

test("offer profile binding checks the manifest version and accepts valid fractional UTC forms", () => {
  assert.throws(() => parseProviderOffer(offer, { ...manifest, profileVersion: "other" } as unknown as ProviderManifest, now), /Invalid/);
  const expiresAt = new Date(Math.floor((now + 60_000) / 1000) * 1000).toISOString().replace(".000Z", ".0Z");
  assert.equal(parseProviderOffer({ ...offer, expiresAt }, manifest, now).expiresAt, expiresAt);
});

test("network offers enforce duration bounds and discard unsolicited personal data", () => {
  for (const change of [{ waitMinutes: -1 }, { waitMinutes: NaN }, { travelMinutes: 1441 }, { walkingMinutes: undefined }, { transfers: 1.5 }, { transfers: 11 }]) rejectsOffer({ ...offer, ...change });
  const parsed = parseProviderOffer({ ...offer, driverPhone: "private", pickup: { ...offer.pickup, riderName: "private" }, reliability: 0.99 }, manifest, now);
  assert.deepEqual(parsed, offer);
  assert.equal(Object.hasOwn(parsed, "transfers"), false);
});

test("normalization binds plan ID to provider and quote without inventing unknown metrics", () => {
  const result = normalizeNetworkQuote({ manifest, offer }, provider, request, now);
  assert.deepEqual(result.network, { manifest, offer });
  assert.equal(result.quoteSource, "simulated");
  assert.equal(result.quoteExpiresAt, Date.parse(offer.expiresAt));
  assert.equal(result.candidate.cost, 7.25);
  assert.equal(result.candidate.totalMinutes, 16);
  assert.equal(result.candidate.requiresProviderVerification, true);
  assert.equal(Object.hasOwn(result.candidate, "transfers"), false);
  assert.equal(Object.hasOwn(result.candidate, "reliability"), false);
  assert.equal(Object.hasOwn(result.candidate, "quoteSource"), false);
  assert.notEqual(normalizeNetworkQuote({ manifest, offer: { ...offer, quoteId: "quote-124" } }, provider, request, now).candidate.planId, result.candidate.planId);
  assert.equal(normalizeNetworkQuote({ manifest, offer: { ...offer, transfers: 0 } }, provider, request, now).candidate.transfers, 0);
});

test("normalization rejects service area mismatches and unbookable ride capabilities", () => {
  for (const change of [{ originZone: "Another origin" }, { destinationZone: "Another destination" }]) {
    assert.throws(() => normalizeNetworkQuote({ manifest, offer }, provider, { ...request, ...change }, now), /Invalid/);
  }
  assert.throws(() => normalizeNetworkQuote({ manifest: { ...manifest, capabilities: ["quote_trip"] }, offer }, provider, request, now), /Invalid/);
});

test("normalized ANS candidates satisfy the existing Databricks decision boundary", () => {
  const { candidate } = normalizeNetworkQuote({ manifest, offer }, provider, request, now);
  const decision = prepareDecision([candidate], { maxBudget: 10, evaluatedAt: new Date(now).toISOString() });
  assert.deepEqual(decision.rejected, Object.create(null));
  assert.equal(decision.plans.length, 1);
  assert.equal(decision.plans[0].transfers, null);
  assert.equal(decision.plans[0].reliabilityKnown, false);
  for (const change of [{ name: "x".repeat(121) }, { id: "operator-123:a".repeat(20) }]) {
    assert.throws(() => normalizeNetworkQuote({ manifest, offer }, { ...provider, ...change }, request, now), /Invalid/);
  }
  assert.throws(() => normalizeNetworkQuote({ manifest, offer: { ...offer, waitMinutes: 1000, travelMinutes: 1000 } }, provider, request, now), /Invalid/);
});

test("transit can supply a quote without pretending to accept delegated bookings", () => {
  const transit = { ...provider, id: "operator-123:late-bus", mode: "transit" as const, functions: ["quote_trip", "trip_status"] };
  const transitManifest = { ...manifest, providerId: transit.id, serviceId: "late-bus", mode: transit.mode, capabilities: transit.functions };
  const transitOffer = { ...offer, providerId: transit.id, serviceId: transitManifest.serviceId };
  assert.equal(normalizeNetworkQuote({ manifest: transitManifest, offer: transitOffer }, transit, request, now).candidate.mode, "transit");
  rejectsManifest({ ...transitManifest, capabilities: [...transit.functions, "request_trip"] }, { ...transit, functions: [...transit.functions, "request_trip"] });
});

const key = "test-only-signing-key-32-characters";
const payload = { requestId: "attempt-1", quoteId: offer.quoteId, pickup: { lat: 37.23, lng: -80.41 }, destination: { lat: 37.22, lng: -80.42 } };
const hash = "ab".repeat(32);
const claims: BookingGrantClaims = { version: 1, issuer: "beacon", audience: provider.id, scope: "book_trip", requestId: payload.requestId, quoteId: offer.quoteId, payloadHash: hash, amountMinor: 725, currency: "USD", issuedAt: now - 1000, expiresAt: now + 60_000, simulated: true };
const expected = { audience: provider.id, requestId: payload.requestId, quoteId: offer.quoteId, payloadHash: hash, amountMinor: 725 };
// Independently construct authenticated malformed claims: verification must validate
// signed content, not assume that every signer used issueBookingGrant.
function signed(value: unknown) {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `beacon-hmac-v1.${body}.${createHmac("sha256", key).update(`beacon-hmac-v1.${body}`).digest("base64url")}`;
}

test("booking payload hashes bind coordinates and the exact attempt without exposing location", () => {
  const digest = bookingPayloadHash(payload);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(bookingPayloadHash({ destination: { lng: -80.42, lat: 37.22 }, pickup: { lng: -80.41, lat: 37.23 }, quoteId: payload.quoteId, requestId: payload.requestId }), digest);
  for (const change of [{ requestId: "attempt-2" }, { quoteId: "quote-2" }, { pickup: { ...payload.pickup, lat: 37.24 } }, { destination: { ...payload.destination, lng: -80.43 } }]) {
    assert.notEqual(bookingPayloadHash({ ...payload, ...change }), digest);
  }
  assert.throws(() => bookingPayloadHash({ ...payload, pickup: { lat: NaN, lng: -80 } }), /Invalid/);
  assert.throws(() => bookingPayloadHash({ ...payload, destination: { lat: 91, lng: -80 } }), /Invalid/);
});

test("booking grants allow the same bounded retry and encode only explicit claims", () => {
  const token = issueBookingGrant({ ...claims, pickup: payload.pickup } as BookingGrantClaims, key);
  assert.deepEqual(verifyBookingGrant(token, key, expected, now), claims);
  assert.deepEqual(verifyBookingGrant(token, key, expected, now + 1), claims);
  const decoded = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  assert.equal(Object.hasOwn(decoded, "pickup"), false);
  assert.equal(Object.hasOwn(decoded, "destination"), false);
});

test("booking verification rejects authenticated coordinates and every unexpected claim", () => {
  for (const extra of [{ pickup: payload.pickup }, { destination: payload.destination }, { riderEmail: "private@example.test" }, { unrelated: true }]) {
    assert.throws(() => verifyBookingGrant(signed({ ...claims, ...extra }), key, expected, now), /Invalid booking claim fields/);
  }
});

test("booking grants reject signature changes, wrong keys and cross-attempt reuse", () => {
  const token = issueBookingGrant(claims, key);
  assert.throws(() => verifyBookingGrant(token, `${key}-other`, expected, now), /Invalid/);
  const parts = token.split(".");
  parts[1] = Buffer.from(JSON.stringify({ ...claims, amountMinor: 1 })).toString("base64url");
  assert.throws(() => verifyBookingGrant(parts.join("."), key, expected, now), /Invalid/);
  for (const change of [{ audience: "other" }, { requestId: "attempt-2" }, { quoteId: "quote-2" }, { payloadHash: "cd".repeat(32) }, { amountMinor: 724 }]) {
    assert.throws(() => verifyBookingGrant(token, key, { ...expected, ...change }, now), /Invalid/);
  }
});

test("booking grants validate signed constants, lifetime and bounded integer money", () => {
  for (const change of [
    { version: 2 }, { issuer: "other" }, { scope: "cancel_any_trip" }, { currency: "EUR" }, { simulated: false },
    { issuedAt: now + 1 }, { expiresAt: now }, { expiresAt: now + 120_001 }, { expiresAt: claims.issuedAt },
    { amountMinor: 1.5 }, { amountMinor: -1 }, { amountMinor: 1_000_001 }, { issuedAt: 1.5 },
    { payloadHash: "not-a-digest" }, { requestId: "" }, { audience: "x".repeat(513) }, { quoteId: undefined },
  ]) assert.throws(() => verifyBookingGrant(signed({ ...claims, ...change }), key, expected, now), /Invalid/);
  assert.throws(() => issueBookingGrant({ ...claims, scope: "anything" } as unknown as BookingGrantClaims, key), /Invalid/);
});

test("booking grants reject weak keys and malformed or oversized token formats", () => {
  for (const weak of ["", " ".repeat(32), "too-short-key"]) {
    assert.throws(() => issueBookingGrant(claims, weak), /Invalid/);
    assert.throws(() => verifyBookingGrant(signed(claims), weak, expected, now), /Invalid/);
  }
  for (const token of ["", "a.b.c", signed(claims).replace("beacon-hmac-v1.", "none."), `${signed(claims)}.extra`, "a".repeat(8193)]) {
    assert.throws(() => verifyBookingGrant(token, key, expected, now), /Invalid/);
  }
});

test("simulated authorization reserves full bounded amount without any charge", () => {
  const payment = simulatedAuthorization(725);
  assert.deepEqual(payment, { mode: "simulated", currency: "USD", amountMinor: 725, retainedMinor: 0, state: "authorized" });
  assert.equal(paymentLiability(payment), 725);
  for (const amount of [-1, 0.5, NaN, Infinity, 1_000_001]) assert.throws(() => simulatedAuthorization(amount), /Invalid/);
});

test("simulated cancellation releases authorization or captures only the cancellation fee", () => {
  const payment = simulatedAuthorization(725);
  assert.deepEqual(simulatedCancellation(payment, 0), { ...payment, state: "voided" });
  const fee = simulatedCancellation(payment, 125);
  assert.deepEqual(fee, { ...payment, amountMinor: 125, retainedMinor: 125, state: "captured" });
  assert.equal(paymentLiability(fee), 125);
  assert.equal(payment.state, "authorized");
  assert.notEqual(simulatedCancellation(payment, 0), payment);
  for (const invalid of [-1, 0.5, 726]) assert.throws(() => simulatedCancellation(payment, invalid), /Invalid/);
});

test("simulated cancellation refunds an existing capture while unknown exposure remains reserved", () => {
  const captured: SimulatedPayment = { mode: "simulated", currency: "USD", amountMinor: 725, retainedMinor: 725, state: "captured" };
  const partial = simulatedCancellation(captured, 125);
  assert.equal(partial.retainedMinor, 125);
  assert.equal(paymentLiability(partial), 125);
  assert.equal(paymentLiability(simulatedCancellation(captured, 0)), 0);
  const unknown: SimulatedPayment = { ...captured, retainedMinor: 0, state: "unknown" };
  assert.deepEqual(simulatedCancellation(unknown, 0), unknown);
  assert.notEqual(simulatedCancellation(unknown, 0), unknown);
  assert.equal(paymentLiability(simulatedCancellation(unknown, 125)), 725);
});

test("payment liability rejects malformed states and never restores released funds as a charge", () => {
  for (const state of ["voided", "refunded"] as const) {
    const payment: SimulatedPayment = { mode: "simulated", currency: "USD", amountMinor: 725, retainedMinor: 0, state };
    assert.equal(paymentLiability(payment), 0);
    assert.deepEqual(simulatedCancellation(payment, 0), payment);
    assert.throws(() => simulatedCancellation(payment, 125), /Invalid/);
  }
  for (const payment of [undefined, {}, { state: "pending" }, { ...simulatedAuthorization(725), state: undefined }, { ...simulatedAuthorization(725), retainedMinor: 726 }, { ...simulatedAuthorization(725), currency: "EUR" }]) {
    assert.throws(() => paymentLiability(payment as SimulatedPayment), /Invalid/);
  }
});
