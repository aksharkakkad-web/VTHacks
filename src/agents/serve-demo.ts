import { createServer } from "node:http";
import { DemoProvider, demoDescriptors, providerHandler, networkToken } from "./demo-provider";
import { developerDemoDescriptors } from "./developer-demo";

if (process.env.BEACON_PROVIDER_TOKEN && !networkToken(process.env.BEACON_PROVIDER_TOKEN)) throw new Error("BEACON_PROVIDER_TOKEN must have 16–4096 non-whitespace characters for network simulation");
const demoRideProgress = process.env.BEACON_DEMO_RIDE_PROGRESS === 'true';
if (demoRideProgress && !networkToken(process.env.BEACON_PROVIDER_TOKEN)) throw new Error('Demo ride progression requires BEACON_PROVIDER_TOKEN');

for (const seed of process.env.BEACON_LYFT_DEMO === "true" ? developerDemoDescriptors : demoDescriptors) {
  const descriptor = demoRideProgress && seed.mode !== 'transit' ? { ...seed, name: seed.mode === 'campus_ride' ? 'Beacon campus shuttle' : 'Beacon demo ride' } : seed;
  const server = createServer(providerHandler(new DemoProvider(descriptor, { token: process.env.BEACON_PROVIDER_TOKEN, demoRideProgress }), process.env.BEACON_PROVIDER_TOKEN));
  server.requestTimeout = 10_000;
  server.listen(Number(new URL(descriptor.baseUrl).port), "127.0.0.1", () => process.stdout.write(`${descriptor.name} demo: ${descriptor.baseUrl}\n`));
}
