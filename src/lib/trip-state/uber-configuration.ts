import type { UberGuestProviderConfig } from '../../agents/uber-guest-provider';

/** Enabling an integration never silently substitutes local fixtures for Uber. */
export function uberSandboxConfiguration(env: Record<string, string | undefined>): UberGuestProviderConfig | undefined {
  if (env.UBER_GUEST_SANDBOX_ENABLED !== 'true') return undefined;
  if (env.DEMO_MODE !== 'true' || env.BEACON_ANS_MODE === 'live') throw new Error('UBER_SANDBOX_REQUIRES_LOCAL_DEMO_IDENTITY');
  if (![env.UBER_GUEST_ACCESS_TOKEN, env.UBER_GUEST_RUN_ID, env.UBER_GUEST_ID].every(value => typeof value === 'string' && value.trim().length > 0)) throw new Error('UBER_SANDBOX_MISSING_CONFIGURATION');
  return {
    enabled: true, demoMode: true, apiFamily: 'guest-rides',
    accessToken: env.UBER_GUEST_ACCESS_TOKEN,
    organizationId: env.UBER_GUEST_ORGANIZATION_ID,
    runId: env.UBER_GUEST_RUN_ID, guestId: env.UBER_GUEST_ID,
    productId: env.UBER_GUEST_PRODUCT_ID,
  };
}
