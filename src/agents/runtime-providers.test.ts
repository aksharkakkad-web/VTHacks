import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeProviderConfiguration } from '../lib/trip-state/provider-configuration';
import { uberSandboxConfiguration } from '../lib/trip-state/uber-configuration';

test('Uber sandbox requires explicit demo activation and complete private configuration', () => {
  assert.equal(uberSandboxConfiguration({ UBER_GUEST_ACCESS_TOKEN: 'secret' }), undefined);
  assert.throws(() => uberSandboxConfiguration({ UBER_GUEST_SANDBOX_ENABLED: 'true' }), /DEMO/);
  assert.throws(() => uberSandboxConfiguration({ UBER_GUEST_SANDBOX_ENABLED: 'true', DEMO_MODE: 'true' }), /CONFIGURATION/);
  const env = { UBER_GUEST_SANDBOX_ENABLED: 'true', DEMO_MODE: 'true', UBER_GUEST_ACCESS_TOKEN: 'test-token', UBER_GUEST_RUN_ID: 'run', UBER_GUEST_ID: 'guest' };
  assert.equal(uberSandboxConfiguration(env)?.apiFamily, 'guest-rides');
  assert.equal(uberSandboxConfiguration(env)?.runId, 'run');
  assert.throws(() => uberSandboxConfiguration({ ...env, BEACON_ANS_MODE: 'live' }), /DEMO/);
});

test('runtime discovers enabled demo services and uses only their configured credential', () => {
  const config = runtimeProviderConfiguration({ DEMO_MODE: 'true', BEACON_LYFT_DEMO: 'true', BEACON_PROVIDER_TOKEN: 'local-test-token' });
  const lyft = config.descriptors.find(p => p.serviceId === 'lyft-demo');
  assert.ok(lyft);
  assert.equal(config.tokenFor(lyft), 'local-test-token');
  assert.equal(config.tokenFor({ ...lyft, baseUrl: 'https://unrelated.example' }), undefined);
  assert.equal(config.tokenFor({ ...lyft, source: 'ans' }), undefined);
});

test('hosted self-operated endpoints use the hosted token rather than the loopback token', () => {
  const config = runtimeProviderConfiguration({ DEMO_MODE: 'true', BEACON_HOSTED_PROVIDERS: 'true', BEACON_PROVIDER_ORIGIN: 'https://beacon.example', BEACON_HOSTED_PROVIDER_TOKEN: 'hosted-test-token', BEACON_PROVIDER_TOKEN: 'local-test-token' });
  assert.equal(config.descriptors[0].baseUrl, 'https://beacon.example/api/demo/providers/transit');
  assert.equal(config.tokenFor(config.descriptors[0]), 'hosted-test-token');
  assert.equal(config.descriptors.some(p => p.id === 'lyft-demo'), false);
  assert.throws(() => runtimeProviderConfiguration({ DEMO_MODE: 'true', BEACON_HOSTED_PROVIDERS: 'true' }));
});

test('demo credentials and descriptors cannot activate outside demo mode', () => {
  const config = runtimeProviderConfiguration({ DEMO_MODE: 'false', BEACON_LYFT_DEMO: 'true', BEACON_PROVIDER_TOKEN: 'test-token' });
  assert.deepEqual(config.descriptors, []);
});
