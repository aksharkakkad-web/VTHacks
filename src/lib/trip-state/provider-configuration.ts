import { configuredDemoDescriptors } from '../../agents/developer-demo';
import type { ProviderDescriptor } from '../../agents/contract';

/** Only explicitly self-operated demo endpoints receive the shared demo secret. */
export function runtimeProviderConfiguration(env: Record<string, string | undefined>) {
  const demo = env.DEMO_MODE === 'true';
  const hosted = env.BEACON_HOSTED_PROVIDERS === 'true';
  if (demo && hosted && !env.BEACON_PROVIDER_ORIGIN) throw new Error('Hosted provider origin is required');
  const descriptors = demo ? configuredDemoDescriptors(hosted ? env.BEACON_PROVIDER_ORIGIN : undefined, env.BEACON_LYFT_DEMO === 'true') : [];
  const token = hosted ? env.BEACON_HOSTED_PROVIDER_TOKEN : env.BEACON_PROVIDER_TOKEN;
  return {
    descriptors,
    tokenFor(provider: ProviderDescriptor): string | undefined {
      return demo && provider.source === 'demo' && descriptors.some(p => p.id === provider.id && p.baseUrl === provider.baseUrl) ? token : undefined;
    },
  };
}
