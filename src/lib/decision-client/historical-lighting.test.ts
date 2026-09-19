import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarizeHistoricalLighting } from './historical-lighting';

const source = () => JSON.parse(readFileSync('data/campus/research/lighting-measured-2026.json', 'utf8'));
test('measured lighting remains historical and exposes missing coordinates without making a route score', () => {
  const result = summarizeHistoricalLighting(source());
  assert.equal(result.intersections, 36);
  assert.equal(result.measurements, 72);
  assert.equal(result.locatedIntersections, 28);
  assert.equal(result.unlocatedIntersections, 8);
  assert.equal(result.operationalLightingVerified, false);
  assert.equal(result.routeCoverageFraction, null);
  assert.equal(result.collectionWindows[0].localDates, '2026-01-20/2026-01-21');
  assert.equal(result.collectionWindows[1].localDates, '2026-02-28/2026-03-01');
});
test('corrupt or misleading measured lighting cannot enter the evidence handoff', () => {
  for (const change of [
    (d: ReturnType<typeof source>) => { d.operational_lighting_verified_now = true; },
    (d: ReturnType<typeof source>) => { d.records[0].round_1_min_vertical_lux = -1; },
    (d: ReturnType<typeof source>) => { d.records[0].intersection_id = 2; },
    (d: ReturnType<typeof source>) => { d.intersection_count = 35; },
    (d: ReturnType<typeof source>) => { d.source_url = 'https://example.com/fake'; },
    (d: ReturnType<typeof source>) => { d.collection_windows[0].local_dates = '2026-08-14'; },
  ]) {
    const data = source(); change(data);
    assert.throws(() => summarizeHistoricalLighting(data));
  }
});
