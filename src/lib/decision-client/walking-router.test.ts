import assert from 'node:assert/strict';
import test from 'node:test';
import { createWalkingRouter, validateWalkingRoute } from './walking-router';
const at = '2026-09-19T20:00:00Z', from = { lng: -80.42, lat: 37.23 }, to = { lng: -80.419, lat: 37.23 };
const geometry = { type: 'LineString', coordinates: [[from.lng,from.lat], [to.lng,to.lat]] };
const fixture = () => ({ routes: [{ distanceMeters: 89, duration: '70s', polyline: { geoJsonLinestring: geometry }, legs: [{ steps: [{ distanceMeters: 89, staticDuration: '70s', navigationInstruction: { instructions: 'Walk east.' }, polyline: { geoJsonLinestring: geometry } }] }] }] });
const env = { BEACON_WALKING_ROUTER: 'google_routes', GOOGLE_ROUTES_API_KEY: 'explicit-offline-test-key' };
const fetchFixture = (data: unknown): typeof fetch => async () => new Response(JSON.stringify(data));
test('explicit offline provider fixture preserves exact geometry and instructions', async () => {
  let calls = 0;
  const result = await createWalkingRouter(env, async (url, init) => {
    calls++; assert.equal(url, 'https://routes.googleapis.com/directions/v2:computeRoutes');
    const body = JSON.parse(String(init?.body)); assert.equal(body.travelMode, 'WALK'); assert.equal(body.polylineEncoding, 'GEO_JSON_LINESTRING'); assert.equal(init?.redirect, 'error');
    return new Response(JSON.stringify(fixture()));
  })(from,to,at);
  assert.equal(calls,1); assert.deepEqual(result.geometry,geometry); assert.equal(result.instructions[0].text,'Walk east.'); assert.equal(result.durationSeconds,70);
  assert.equal(result.validUntil,'2026-09-19T20:05:00.000Z');
});
test('configuration and unsupported area fail before network', async () => {
  let calls = 0; const f: typeof fetch = async () => { calls++; throw new Error(); };
  await assert.rejects(createWalkingRouter({},f)(from,to,at), { code: 'configuration_missing' });
  await assert.rejects(createWalkingRouter(env,f)({lat:0,lng:0},to,at), { code: 'unsupported_area' });
  assert.equal(calls,0);
});
test('no route, HTTP failure and secret-containing exceptions return safe explicit errors', async () => {
  await assert.rejects(createWalkingRouter(env,fetchFixture({routes:[]}))(from,to,at), {code:'no_route'});
  await assert.rejects(createWalkingRouter(env,async () => new Response('secret',{status:403}))(from,to,at), {code:'provider_unavailable'});
  await assert.rejects(createWalkingRouter(env,async () => {throw new Error('secret');})(from,to,at), error => error instanceof Error && !error.message.includes('secret'));
});
test('wrong endpoints, disconnected step geometry and mismatched metrics cannot become directions', async () => {
  const badEndpoint = fixture(); badEndpoint.routes[0].polyline.geoJsonLinestring = {type:'LineString',coordinates:[[-80.43,37.23],[-80.429,37.23]]};
  const badStep = fixture(); badStep.routes[0].legs[0].steps[0].polyline.geoJsonLinestring = {type:'LineString',coordinates:[[-80.43,37.23],[-80.429,37.23]]};
  const badMetric = fixture(); badMetric.routes[0].distanceMeters = 900;
  const badTiming = fixture(); badTiming.routes[0].duration = '700s';
  for (const payload of [badEndpoint,badStep,badMetric,badTiming]) await assert.rejects(createWalkingRouter(env,fetchFixture(payload))(from,to,at),{code:'invalid_route'});
});
test('expiry is enforced on injected routes', async () => {
  const route = await createWalkingRouter(env,fetchFixture(fixture()))(from,to,at);
  assert.throws(() => validateWalkingRoute(route,from,to,route.validUntil),{code:'invalid_route'});
});
