import { tripAction, tripEvents } from "@/lib/trip-state/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) { const { id, action } = await context.params; return tripAction(request, id, action); }
export async function GET(request: Request, context: { params: Promise<{ id: string; action: string }> }) { const { id, action } = await context.params; return tripEvents(request, id, action); }
