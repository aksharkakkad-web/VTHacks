import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoProvider, demoDescriptors } from './demo-provider';
import type { NetworkOffer } from './provider-manifest';
import { syntheticJourneyBinding } from '../lib/trip-state/synthetic-journey-binding';

test('synthetic pickup permission requires explicit demo activation and an exact owned provider endpoint', async () => {
  const p = new DemoProvider(demoDescriptors[1], { token: 'fixture-token-at-least-16' });
  const network = p.handle('POST', '/agent/quote', { origin_zone: 'Downtown Blacksburg', destination_zone: 'VT residential campus', constraints: { max_budget: 10 } }) as NetworkOffer;
  const enabled = { DEMO_MODE: 'true', BEACON_SYNTHETIC_JOURNEY_BINDINGS: 'true' };
  assert.equal(await syntheticJourneyBinding({}, demoDescriptors)(network), null);
  assert.equal(await syntheticJourneyBinding({ ...enabled, DEMO_MODE: 'false' }, demoDescriptors)(network), null);
  assert.equal(await syntheticJourneyBinding(enabled, demoDescriptors)({ ...network, manifest: { ...network.manifest, endpoint: 'https://unrelated.example' } }), null);
  const binding = await syntheticJourneyBinding(enabled, demoDescriptors)(network);
  assert.ok(binding);
  assert.equal(binding.pickupPermitted, true);
  assert.match(binding.pickup.name, /simulated/i);
  assert.deepEqual(binding.pickup.point, { lat: 37.229, lng: -80.414 });
  assert.equal(Date.parse(binding.pickupAt), Date.parse(network.offer.issuedAt) + 8 * 60_000);
  assert.equal(Date.parse(binding.arrivalAt) - Date.parse(binding.pickupAt), 11 * 60_000);
  assert.equal(network.offer.pickup.accessVerified, false, 'synthetic binding never upgrades public access evidence');
});
