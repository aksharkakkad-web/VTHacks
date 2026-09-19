import { createServer } from "node:http";
import { DemoProvider, demoDescriptors, providerHandler } from "./demo-provider";

for (const descriptor of demoDescriptors) {
  const server = createServer(providerHandler(new DemoProvider(descriptor), process.env.BEACON_PROVIDER_TOKEN));
  server.requestTimeout = 10_000;
  server.listen(Number(new URL(descriptor.baseUrl).port), "127.0.0.1", () => process.stdout.write(`${descriptor.name} demo: ${descriptor.baseUrl}\n`));
}
