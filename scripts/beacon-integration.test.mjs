import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Client-integration contract tests. These transpile only the small local
 * adapter modules so they neither start Next nor make a provider/Routes call.
 */
const require = createRequire(import.meta.url);
const ts = require("typescript");
const build = mkdtempSync(join(tmpdir(), "beacon-integration-"));
const beaconBuild = join(build, "lib/client/beacon");
const screensBuild = join(build, "components/safecircle");
mkdirSync(beaconBuild, { recursive: true });
mkdirSync(screensBuild, { recursive: true });

function transpile(sourcePath, outputPath) {
  const source = readFileSync(new URL(`../${sourcePath}`, import.meta.url), "utf8");
  writeFileSync(outputPath, ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}
for (const file of ["read-models", "route-geometry", "google-map-renderer", "response-adapter", "sample-responses"]) {
  transpile(`src/lib/client/beacon/${file}.ts`, join(beaconBuild, `${file}.js`));
}
transpile("src/components/safecircle/mock-data.ts", join(screensBuild, "mock-data.js"));
transpile("src/components/safecircle/demo-controller.ts", join(screensBuild, "demo-controller.js"));
const beaconComponentsBuild = join(build, "components/beacon");
mkdirSync(beaconComponentsBuild, { recursive: true });
transpile("src/components/beacon/trip-storage.ts", join(beaconComponentsBuild, "trip-storage.js"));
after(() => rmSync(build, { recursive: true, force: true }));

const { decodePolyline, routePoints } = require(join(beaconBuild, "route-geometry.js"));
const { renderGoogleWalkingRoute } = require(join(beaconBuild, "google-map-renderer.js"));
const { providerSourceLabel } = require(join(beaconBuild, "read-models.js"));
const { parseTripResponse, applyTripResponse, visibleMobility } = require(join(beaconBuild, "response-adapter.js"));
const { mobilitySample, fallbackMobility } = require(join(beaconBuild, "sample-responses.js"));
const { validateSnapshot } = require(join(beaconComponentsBuild, "trip-storage.js"));
const { defaultProfile } = require(join(screensBuild, "mock-data.js"));
const { transitionDemo } = require(join(screensBuild, "demo-controller.js"));
mkdirSync(join(build, "lib/demo"), { recursive: true });
transpile("src/lib/demo/transport-server.ts", join(build, "lib/demo/transport-server.js"));
const { DemoTransportServer } = require(join(build, "lib/demo/transport-server.js"));

test("demo transport preserves consent, idempotency, restoration and pending cancellation", () => {
  const server = new DemoTransportServer();
  let now = Date.now();
  const tripId = "test-demo-trip-001";
  let r = server.request({ kind: "discover", tripId, revision: 0, constraints: defaultProfile }, now);
  const refresh = () => r = server.request({ kind: "refresh", tripId, revision: r.revision, attemptId: r.attemptId }, now += 2000);
  while (r.stage !== "recommendation") refresh();
  assert.equal(r.providerAuthorized, false);
  const confirm = { kind: "confirm", tripId, revision: r.revision, planId: r.selectedPlanId, attemptId: "demo-attempt-1" };
  r = server.request(confirm, now);
  assert.deepEqual(server.request(confirm, now), r);
  for (let i = 0; i < 8 && r.stage !== "waiting-initial"; i++) refresh();
  assert.equal(r.stage, "waiting-initial");
  assert.equal(r.mobility.leg.kind, "wait");
  assert.equal(r.mobility.ride.providerSource, "simulated-rideshare");
  assert.ok(r.mobility.ride.pickupLocation);
  assert.ok(r.mobility.ride.updatedAt);
  assert.equal(r.mobility.walkingRoute, undefined);
  const cancel = { kind: "cancel", tripId, revision: r.revision, attemptId: r.attemptId };
  r = server.request(cancel, now);
  assert.equal(r.stage, "cancelling");
  assert.deepEqual(server.request(cancel, now), r);
  refresh();
  assert.equal(r.stage, "cancelled");
  assert.equal(r.attemptId, "demo-attempt-1");
  assert.equal(r.sensitiveDataReleased, false);
});

function encodeCoordinate(value) {
  let encoded = value < 0 ? ~(value << 1) : value << 1;
  let result = "";
  while (encoded >= 0x20) {
    result += String.fromCharCode((0x20 | (encoded & 0x1f)) + 63);
    encoded >>= 5;
  }
  return result + String.fromCharCode(encoded + 63);
}
function encodePoint(latDelta, lngDelta) {
  return encodeCoordinate(latDelta) + encodeCoordinate(lngDelta);
}

test("decodePolyline preserves Google's documented latitude/longitude vector", () => {
  const result = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  assert.deepEqual(result, [
    { lat: 38.5, lng: -120.2 },
    { lat: 40.7, lng: -120.95 },
    { lat: 43.252, lng: -126.453 },
  ]);
});

test("routePoints preserves backend coordinate ordering without rerouting", () => {
  const supplied = [{ lat: 37.2296, lng: -80.4139 }, { lat: 37.23, lng: -80.4145 }];
  const decoded = routePoints({
    routeId: "sample-route",
    status: "available",
    source: "fixture",
    geometry: { format: "coordinates", points: supplied },
  });
  assert.deepEqual(decoded, supplied);
  assert.notEqual(decoded, supplied);
  assert.notEqual(decoded[0], supplied[0]);
});

test("route geometry rejects truncated and out-of-bounds untrusted payloads", () => {
  for (const malformed of ["", "~", "a", "~~~~~~"]) {
    assert.throws(() => decodePolyline(malformed), /route geometry|truncated/i);
  }
  // 91° latitude then a second identical point: syntactically complete but invalid.
  const latitudePastPole = encodePoint(9_100_000, 0) + encodePoint(0, 0);
  assert.throws(() => decodePolyline(latitudePastPole), /coordinate/i);
  assert.throws(() => routePoints({
    routeId: "bad-coordinates",
    status: "available",
    source: "fixture",
    geometry: { format: "coordinates", points: [{ lat: 91, lng: 0 }, { lat: 0, lng: 0 }] },
  }), /coordinates/i);
});

test("Google renderer uses only supplied vertices and fails safely without the SDK", () => {
  const originalWindow = globalThis.window;
  const container = { replaceChildrenCalled: false, replaceChildren() { this.replaceChildrenCalled = true; } };
  try {
    delete globalThis.window;
    assert.equal(renderGoogleWalkingRoute(container, [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }]).status, "sdk-missing");

    const seen = { polyline: undefined, bounds: [], cleanup: false };
    class MockMap { fitBounds(bounds, padding) { seen.bounds.push({ bounds, padding }); } setCenter() {} setZoom() {} }
    class MockBounds { constructor() { this.points = []; } extend(point) { this.points.push(point); } }
    class MockPolyline { constructor(options) { seen.polyline = options; } setMap() {} }
    class MockCircle { constructor() {} setMap() {} }
    globalThis.window = { google: { maps: {
      Map: MockMap,
      LatLngBounds: MockBounds,
      Polyline: MockPolyline,
      Circle: MockCircle,
      event: { clearInstanceListeners() { seen.cleanup = true; } },
    } } };
    const supplied = [{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 }];
    const rendered = renderGoogleWalkingRoute(container, supplied);
    assert.equal(rendered.status, "rendered");
    assert.deepEqual(seen.polyline.path, supplied);
    assert.deepEqual(seen.bounds[0].bounds.points, supplied);
    rendered.cleanup();
    assert.equal(container.replaceChildrenCalled, true);
    assert.equal(seen.cleanup, true);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("provider source labels remain neutral and explicitly label local demo data", () => {
  assert.equal(providerSourceLabel({ providerSource: "simulated-rideshare", stage: "waiting" }), "Simulated rideshare · Demo data");
  assert.equal(providerSourceLabel({ providerSource: "connected-provider", stage: "waiting" }), "Ride provider");
  assert.equal(providerSourceLabel({ providerSource: "unknown", stage: "unknown" }), "Provider source not confirmed");
  assert.equal(providerSourceLabel(), "Provider source not confirmed");
});

function state(overrides = {}) {
  return {
    stage: "authorizing-initial",
    paymentStatus: "not-started",
    bookingStatus: "not-started",
    attemptId: "attempt-1",
    attemptNumber: 1,
    cancellationFee: 0,
    profile: null,
    tripContext: {},
    candidates: [],
    selectedPlanId: "campus-ride-042",
    failedPlanIds: [],
    providerVerified: true,
    providerAuthorized: false,
    sensitiveDataReleased: false,
    recoveryCount: 0,
    statusRevision: 3,
    paused: false,
    userApproved: true,
    integration: { tripId: "trip-demo-2409", responseRevision: 4, responseSource: "backend" },
    ...overrides,
  };
}
function response(overrides = {}) {
  return {
    source: "backend",
    tripId: "trip-demo-2409",
    revision: 5,
    attemptId: "attempt-1",
    stage: "coordinating-initial",
    providerVerified: true,
    providerAuthorized: true,
    sensitiveDataReleased: true,
    paymentStatus: "pending",
    bookingStatus: "pending",
    selectedPlanId: "campus-ride-042",
    updatedAt: "2026-09-19T21:41:18.000Z",
    ...overrides,
  };
}

test("parseTripResponse rejects unknown, non-string, malformed, and invented-plan input", () => {
  for (const invalid of [
    null,
    {},
    response({ stage: "not-a-stage" }),
    response({ stage: null }),
    response({ source: ["backend"] }),
    response({ stage: ["coordinating-initial"] }),
    response({ paymentStatus: ["pending"] }),
    response({ paymentStatus: 17 }),
    response({ bookingStatus: "booked" }),
    response({ selectedPlanId: "invented-provider-plan" }),
    response({ revision: 0 }),
    response({ updatedAt: "not-a-date" }),
    response({ mobility: { leg: { id: "walk-1", kind: "walk", purpose: "home", status: "active" }, walkingRoute: { routeId: "bad", status: "available", source: "fixture" } } }),
  ]) assert.equal(parseTripResponse(invalid), null);
});

test("applyTripResponse fails closed for stale, foreign, sample, and consent-breaking responses", () => {
  const previous = state();
  const rejected = [
    response({ revision: 4 }),
    response({ tripId: "foreign-trip" }),
    response({ attemptId: "other-attempt" }),
    response({ source: "sample" }),
    response({ stage: "unknown-stage" }),
    response({ selectedPlanId: "independent-ride-023" }),
  ];
  for (const incoming of rejected) assert.equal(applyTripResponse(previous, incoming), previous);

  const unapproved = state({ userApproved: false });
  assert.equal(applyTripResponse(unapproved, response()), unapproved);
  assert.equal(applyTripResponse(previous, response({ providerAuthorized: true, providerVerified: false })), previous);
  assert.equal(applyTripResponse(previous, response({ sensitiveDataReleased: true, providerAuthorized: false })), previous);
});

test("late transport responses cannot revive a home or setup session", () => {
  for (const stage of ["home", "bootstrap", "setup-home", "setup-preferences", "arrival", "cancelled"]) {
    const inactive = state({ stage });
    assert.equal(applyTripResponse(inactive, response()), inactive, stage);
  }
});

test("applyTripResponse accepts only a newer matching authoritative update", () => {
  const previous = state();
  const next = applyTripResponse(previous, response());
  assert.notEqual(next, previous);
  assert.equal(next.stage, "coordinating-initial");
  assert.equal(next.providerAuthorized, true);
  assert.equal(next.sensitiveDataReleased, true);
  assert.equal(next.integration.tripId, "trip-demo-2409");
  assert.equal(next.integration.responseRevision, 5);
  assert.equal(next.integration.responseSource, "backend");
  assert.equal(applyTripResponse(previous, response({ source: "sample" }), true).integration.responseSource, "sample");
});

test("terminal arrival revokes sensitive access while retaining accepted booking history", () => {
  const previous = state({ stage: "in-trip-initial", providerAuthorized: true, sensitiveDataReleased: true, paymentStatus: "approved", bookingStatus: "accepted" });
  const arrived = applyTripResponse(previous, response({
    stage: "arrival",
    providerVerified: true,
    providerAuthorized: false,
    sensitiveDataReleased: false,
    paymentStatus: "approved",
    bookingStatus: "accepted",
  }));
  assert.equal(arrived.stage, "arrival");
  assert.equal(arrived.bookingStatus, "accepted");
  assert.equal(arrived.providerAuthorized, false);
  assert.equal(arrived.sensitiveDataReleased, false);

  const illegallyRetainedAccess = response({ stage: "arrival", bookingStatus: "accepted", providerAuthorized: true, sensitiveDataReleased: true });
  assert.equal(applyTripResponse(previous, illegallyRetainedAccess), previous);
  const unverified = state();
  assert.equal(applyTripResponse(unverified, response({ bookingStatus: "accepted", providerAuthorized: false, sensitiveDataReleased: false })), unverified);
});

test("stored integration mobility is revalidated before a refresh can use it", () => {
  const saved = state({
    profile: defaultProfile,
    integration: {
      tripId: "trip-demo-2409",
      responseRevision: 5,
      responseSource: "backend",
      mobility: { leg: { id: "provider-leg", kind: "wait", purpose: "pickup", status: "active" }, ride: { providerSource: "unknown", stage: "unknown" } },
    },
  });
  assert(validateSnapshot({ version: 2, mode: "local-simulation", state: saved }, defaultProfile));
  const badSource = structuredClone(saved);
  badSource.integration.mobility.ride.providerSource = "lyft";
  assert.equal(validateSnapshot({ version: 2, mode: "local-simulation", state: badSource }, defaultProfile), null);
  const badLeg = structuredClone(saved);
  badLeg.integration.mobility.leg.status = "moving";
  assert.equal(validateSnapshot({ version: 2, mode: "local-simulation", state: badLeg }, defaultProfile), null);
});

test("authoritative completed or missing walking data never becomes a new active walk", () => {
  const completed = state({
    stage: "in-trip-initial",
    selectedPlanId: "walk-008",
    integration: {
      tripId: "trip-demo-2409",
      responseRevision: 5,
      responseSource: "backend",
      mobility: { leg: { id: "walk-home", kind: "walk", purpose: "home", status: "complete" } },
    },
  });
  assert.equal(visibleMobility(completed), completed.integration.mobility);
  assert.equal(visibleMobility(completed)?.leg.status, "complete");

  const missing = state({
    stage: "in-trip-initial",
    selectedPlanId: "walk-008",
    integration: { tripId: "trip-demo-2409", responseRevision: 5, responseSource: "backend" },
  });
  assert.notEqual(fallbackMobility(missing)?.leg.kind, "walk");
});

test("walking and transit cancellations return locally without a nonexistent provider request", () => {
  for (const [planId, stage] of [["walk-008", "in-trip-initial"], ["transit-017", "waiting-initial"]]) {
    const active = state({
      profile: defaultProfile,
      selectedPlanId: planId,
      stage,
      userApproved: true,
      bookingStatus: "not-required",
      paymentStatus: "not-required",
      attemptId: undefined,
    });
    const next = transitionDemo(active, { type: "REQUEST_CANCEL" });
    assert.equal(next.stage, "home");
    assert.equal(next.bookingStatus, "not-started");
    assert.equal(next.cancellationRequested, undefined);
  }
});

test("judge mobility samples stay explicit, candidate-bound, and free of invented driver identity", () => {
  const previous = state();
  for (const name of ["walking-pickup", "walking-stop", "walking-home", "route-loading", "route-unavailable", "route-stale", "ride-waiting", "ride-riding", "source-unknown"]) {
    const sample = mobilitySample(previous, name);
    assert.equal(sample.source, "sample");
    assert.equal(sample.selectedPlanId, "campus-ride-042");
    assert(parseTripResponse(sample), `${name} should remain a valid adapter payload`);
    assert.equal(sample.mobility?.ride?.driver, undefined);
    assert.equal(sample.mobility?.ride?.vehicle, undefined);
  }
  const routeSample = mobilitySample(previous, "walking-pickup");
  assert.match(routeSample.mobility?.walkingRoute?.warning ?? "", /not a campus route/i);
});
