import { DemoTransportServer } from "../../../lib/demo/transport-server";

const globalDemo = globalThis as typeof globalThis & { beaconDemoServer?: DemoTransportServer };
const server = globalDemo.beaconDemoServer ??= new DemoTransportServer();

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Origin rejected" }, { status: 403, headers });
    const body = await request.text();
    if (body.length > 4096) throw new Error("Command too large");
    return Response.json(server.request(JSON.parse(body)), { headers });
  } catch { return Response.json({ error: "Demo session or command unavailable. Start a new demo trip." }, { status: 400, headers }); }
}
