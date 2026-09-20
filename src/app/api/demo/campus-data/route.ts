import { campusCatalog, corridorEvidence, loadDataset, corridors, datasets } from "@/lib/campus-evidence/catalog";

export const runtime = "nodejs";
/** Public source snapshots only. No trip identifiers or student data are accepted. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const dataset = query.get("dataset"), corridor = query.get("corridorId");
  if ([...query.keys()].some(k => !["dataset", "corridorId"].includes(k)) || (dataset && corridor) || (dataset && !(datasets as readonly string[]).includes(dataset)) || (corridor && !(corridors as readonly string[]).includes(corridor))) {
    return Response.json({ error: "Choose a supported dataset or corridorId" }, { status: 400 });
  }
  try {
    const value = dataset ? loadDataset(dataset) : corridor ? corridorEvidence(corridor) : campusCatalog();
    return Response.json(value, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Public evidence unavailable; coverage is unknown" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
