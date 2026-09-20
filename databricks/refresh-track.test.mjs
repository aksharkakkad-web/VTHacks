import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refreshStatus, normalizeLighting, validateWaiting, runRefresh } from './refresh-track.mjs';

const NOW = Date.parse('2026-09-19T20:00:00Z');
const capture = '2026-09-19T19:45:00Z';
const write = async (root, path, value) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), JSON.stringify(value)); };
const fixture = async t => { const root = await mkdtemp(join(tmpdir(), 'beacon-refresh-test-')); t.after(() => rm(root, { recursive: true, force: true })); return root; };
const waiting = () => ({ schema_version: 1, captured_at: capture, service_date: '2026-09-19', timezone: 'America/New_York', capture_method: 'Reviewed official rendered date-specific schedule', limitations: ['Access unknown'], records: [{ site_id: 'library', hours_source_url: 'https://lib.vt.edu/about-us/hours.html', reference_point: [-80.42, 37.22], indoor: true, building_object_id: 12, hours_kind: 'published_schedule', opens_at: '2026-09-19T09:00:00-04:00', closes_at: '2026-09-19T22:00:00-04:00', nighttime_access_confirmed: null, provider_pickup_permitted: null, exception_status: 'Unannounced changes unknown' }] });

test('status is read-only and preserves source expiry rather than renewing old captures', async t => {
  const root = await fixture(t);
  const source = { captured_at: '2026-09-19T18:00:00Z' };
  await write(root, 'research/closures.json', { captured_at: capture, sources: [source], records: [] });
  const before = await readFile(join(root, 'research/closures.json'), 'utf8');
  const result = await refreshStatus(root, NOW);
  assert.equal(result.datasets.closures.state, 'stale');
  assert.equal(result.datasets.closures.validUntil, '2026-09-19T19:00:00.000Z');
  assert.equal(await readFile(join(root, 'research/closures.json'), 'utf8'), before);
  assert.equal(result.lastAttempt, null);
  assert.equal(result.activation.cloudWrites, false);
});

test('weather requires current interval and recent source issue time', async t => {
  const root = await fixture(t);
  const value = { captured_at: capture, sources: [{ captured_at: capture }], records: [{ valid_from: '2026-09-19T19:00:00Z', valid_until: '2026-09-19T21:00:00Z', updated_at: '2026-09-19T19:00:00Z' }] };
  await write(root, 'research/weather.json', value);
  assert.equal((await refreshStatus(root, NOW)).datasets.weather.validUntil, '2026-09-19T21:00:00.000Z');
  value.records[0].updated_at = '2026-09-18T19:00:00Z';
  await write(root, 'research/weather.json', value);
  assert.equal((await refreshStatus(root, NOW)).datasets.weather.state, 'stale');
});

test('transit capture freshness and service horizon are independent requirements', async t => {
  const root = await fixture(t);
  const value = { captured_at: capture, service_start: '2026-09-20', service_end: '2026-10-03', counts: { service_trips: 10 } };
  await write(root, 'transit-full/manifest.json', value);
  assert.equal((await refreshStatus(root, NOW)).datasets.transit.state, 'outside_service_horizon');
  value.service_start = '2026-09-18'; value.captured_at = '2026-09-18T19:00:00Z';
  await write(root, 'transit-full/manifest.json', value);
  assert.equal((await refreshStatus(root, NOW)).datasets.transit.state, 'stale');
});

test('historical measurements never acquire current observation dates or operational status', async t => {
  const root = await fixture(t);
  const value = { captured_at: capture, classification: 'historical_field_measurement', operational_lighting_verified_now: false, collection_windows: [{ local_dates: '2026-01-20/2026-01-21' }] };
  await write(root, 'research/lighting-measured-2026.json', value);
  const result = (await refreshStatus(root, NOW + 30 * 86400000)).datasets.measuredLighting;
  assert.equal(result.state, 'historical'); assert.equal(result.validUntil, null);
  assert.deepEqual(result.collectionWindows, value.collection_windows);
  assert.equal(result.capturedAt, capture); assert.equal(result.operatingStatus, 'unknown');
});

test('waiting refresh accepts reviewed hours but rejects access claims, altered location, and old dates', () => {
  const prior = waiting();
  assert.deepEqual(validateWaiting(waiting(), prior, NOW), prior);
  for (const change of [value => value.records[0].provider_pickup_permitted = true, value => value.records[0].reference_point = [0, 0], value => value.service_date = '2026-09-18', value => value.records[0].closes_at = value.records[0].opens_at]) {
    const value = waiting(); change(value); assert.throws(() => validateWaiting(value, prior, NOW));
  }
});

test('waiting status expires at published closing and does not reuse a different service date', async t => {
  const root = await fixture(t); await write(root, 'waiting-locations.json', waiting());
  assert.equal((await refreshStatus(root, NOW)).datasets.waiting.validUntil, '2026-09-20T02:00:00.000Z');
  assert.equal((await refreshStatus(root, Date.parse('2026-09-20T02:00:00Z'))).datasets.waiting.state, 'stale');
});

const osm = () => ({ osm3s: { timestamp_osm_base: capture }, elements: [{ type: 'node', id: 10, lon: -80.42, lat: 37.22, timestamp: '2020-01-01T00:00:00Z', tags: { highway: 'street_lamp' } }] });
test('lighting preserves old object edit times and unverified status; refuses partial or malformed responses', () => {
  const value = normalizeLighting(osm())[0];
  assert.equal(value.last_edited_at, '2020-01-01T00:00:00Z'); assert.equal(value.verification, 'community_unverified'); assert.equal(value.lit, null);
  for (const update of [value => value.remark = 'runtime error', value => value.elements[0].lat = NaN, value => value.elements.push(value.elements[0]), value => value.elements[0].type = 'relation']) {
    const source = osm(); update(source); assert.throws(() => normalizeLighting(source));
  }
});

test('independent partial failure retains old snapshot and continues successful source', async t => {
  const root = await fixture(t), source = join(root, 'source'), output = join(root, 'review');
  await write(source, 'research/weather.json', { captured_at: '2026-09-01T00:00:00Z' });
  await write(source, 'research/crime-manifest-2026.json', { captured_at: '2026-09-01T00:00:00Z' });
  const calls = [];
  const result = await runRefresh({ sourceRoot: source, output, datasets: ['crime', 'weather', 'waiting'], executeTask: async (name, stage) => {
    calls.push(name);
    if (name === 'crime') { await write(stage, 'data/campus/research/crime-manifest-2026.json', { captured_at: capture }); return { code: 2 }; }
    if (name === 'waiting') return { code: null, state: 'blocked', error: 'MANUAL_HOURS_REVIEW_REQUIRED' };
    await write(stage, 'data/campus/research/weather.json', { captured_at: capture }); return { code: 0 };
  } });
  assert.deepEqual(calls, ['crime', 'weather', 'waiting']);
  assert.equal(result.report.state, 'partial_or_blocked');
  assert.equal(JSON.parse(await readFile(join(output, 'research/crime-manifest-2026.json'), 'utf8')).captured_at, '2026-09-01T00:00:00Z');
  assert.equal(JSON.parse(await readFile(join(output, 'research/weather.json'), 'utf8')).captured_at, capture);
  assert.equal(JSON.parse(await readFile(join(source, 'research/weather.json'), 'utf8')).captured_at, '2026-09-01T00:00:00Z');
  assert.equal(result.report.sources[0].state, 'partial_source_rejected');
  assert.equal(result.report.sources[2].state, 'blocked');
});

test('process exceptions produce safe status and preserve historical file bytes', async t => {
  const root = await fixture(t), source = join(root, 'source');
  await write(source, 'research/lighting-measured-2026.json', { captured_at: capture, observation: '2026-01' });
  const result = await runRefresh({ sourceRoot: source, output: join(root, 'review'), datasets: ['weather'], executeTask: async () => { throw new Error('token=secret-test-value'); } });
  assert.equal(result.report.sources[0].error, 'SOURCE_REFRESH_OR_VALIDATION_FAILED');
  assert.ok(!JSON.stringify(result).includes('secret-test-value'));
  assert.deepEqual(await readFile(join(source, 'research/lighting-measured-2026.json')), await readFile(join(root, 'review/research/lighting-measured-2026.json')));
});

test('runner refuses canonical overwrite and unknown datasets', async t => {
  const root = await fixture(t);
  await assert.rejects(runRefresh({ sourceRoot: root, output: root }), /separate/);
  await assert.rejects(runRefresh({ sourceRoot: root, output: join(root, 'nested') }), /separate/);
  await assert.rejects(runRefresh({ sourceRoot: join(root, 'source'), output: join(root, 'review'), datasets: ['cloud'] }), /Unknown/);
});

test('missing PDF parser is an explicit blocker before any source download', async t => {
  const root = await fixture(t), source = join(root, 'source');
  await write(source, 'placeholder.json', {});
  const calls = [];
  const result = await runRefresh({ sourceRoot: source, output: join(root, 'review'), datasets: ['crime'], runProcess: async (command, args) => { calls.push({ command, args }); return { code: 1 }; } });
  assert.equal(result.report.sources[0].state, 'blocked');
  assert.equal(result.report.sources[0].error, 'PYTHON_PDFPLUMBER_UNAVAILABLE');
  assert.deepEqual(calls[0].args, ['-c', 'import pdfplumber']); assert.equal(calls.length, 1);
});

test('public source HTTP failure is reported without response content or credentials', async t => {
  const root = await fixture(t), source = join(root, 'source');
  await write(source, 'placeholder.json', {});
  const result = await runRefresh({ sourceRoot: source, output: join(root, 'review'), datasets: ['lighting'], fetchImpl: async () => new Response('secret-test-value', { status: 406 }) });
  assert.equal(result.report.sources[0].error, 'SOURCE_HTTP_406');
  assert.ok(!JSON.stringify(result).includes('secret-test-value'));
});
