import { createServer } from "node:http";
import { DemoProvider, demoDescriptors, providerHandler, networkToken } from "./demo-provider";
import { developerDemoDescriptors } from "./developer-demo";

if (process.env.BEACON_PROVIDER_TOKEN && !networkToken(process.env.BEACON_PROVIDER_TOKEN)) throw new Error("BEACON_PROVIDER_TOKEN must have 16–4096 non-whitespace characters for network simulation");

for (const descriptor of process.env.BEACON_LYFT_DEMO === "true" ? developerDemoDescriptors : demoDescriptors) {
  const server = createServer(providerHandler(new DemoProvider(descriptor, { token: process.env.BEACON_PROVIDER_TOKEN }), process.env.BEACON_PROVIDER_TOKEN));
  server.requestTimeout = 10_000;
  server.listen(Number(new URL(descriptor.baseUrl).port), "127.0.0.1", () => process.stdout.write(`${descriptor.name} demo: ${descriptor.baseUrl}\n`));
}
