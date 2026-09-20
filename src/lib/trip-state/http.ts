import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getRuntime } from "./runtime";
import { TripError } from "./model";
import { object, text } from "../../agents/contract";
import type { Action } from "../../agents/student/service";
import { navigationHandoff } from '../journey/navigation';
import { bindPlanningToJourney } from '../journey/planning';

const cookieName = "beacon-session";
export function ownerSession(request: Request, create = false) {
  const existing = request.headers.get("cookie")?.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const token = existing && /^[a-f0-9]{64}$/.test(existing) ? existing : create ? randomBytes(32).toString("hex") : undefined;
  if (!token) throw new TripError("AUTH_REQUIRED", "Start a trip in this browser first", 401);
  return { owner: createHash("sha256").update(token).digest("hex"), cookie: existing === token ? undefined : `${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${new URL(request.url).protocol === "https:" ? "; Secure" : ""}` };
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new TripError("ORIGIN_REJECTED", "Cross-origin mutation rejected", 403);
}
export async function requestBody(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new TripError("JSON_REQUIRED", "Use application/json", 415);
  if (Number(request.headers.get("content-length") ?? 0) > 16_384) throw new TripError("BODY_TOO_LARGE", "Request too large", 413);
  const reader = request.body?.getReader(); if (!reader) return {};
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 16_384) { await reader.cancel(); throw new TripError("BODY_TOO_LARGE", "Request too large", 413); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  try { const raw = Buffer.concat(chunks).toString(); return raw ? object(JSON.parse(raw)) : {}; } catch { throw new TripError("INVALID_JSON", "JSON object required", 400); }
}
export function requireBearer(request: Request, expected: string | undefined) {
  if (!expected) throw new TripError("SERVICE_NOT_CONFIGURED", "Service authorization is not configured", 503);
  const actual = Buffer.from(request.headers.get("authorization") ?? ""); const token = Buffer.from(`Bearer ${expected}`);
  if (actual.length !== token.length || !timingSafeEqual(actual, token)) throw new TripError("UNAUTHORIZED", "Unauthorized", 401);
}
export function noStoreJson(value: unknown, status = 200, cookie?: string) { return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) } }); }
export async function handleTripHttp(fn: () => Promise<Response>) {
  try { return await fn(); }
  catch (error) {
    if (error instanceof TripError) return noStoreJson({ error: { code: error.code, message: error.message } }, error.status);
    // Never return upstream exception text, credentials, or provider URLs to the UI.
    if (error instanceof Error && /^(Invalid|Expected|Contact)/.test(error.message)) return noStoreJson({ error: { code: "INVALID_INPUT", message: "Check the trip request fields" } }, 400);
    return noStoreJson({ error: { code: "SERVICE_UNAVAILABLE", message: "Trip service unavailable; please try again" } }, 503);
  }
}
export function createTrip(request: Request) { return handleTripHttp(async () => { sameOrigin(request); const s = ownerSession(request, true); return noStoreJson(await getRuntime().agent.create(s.owner, await requestBody(request)), 201, s.cookie); }); }
export function getTrip(request: Request, id: string) { return handleTripHttp(async () => noStoreJson(await getRuntime().agent.read(id, ownerSession(request).owner))); }
export function tripAction(request: Request, id: string, action: string, demo = false) {
  return handleTripHttp(async () => {
    sameOrigin(request);
    if (action === "events" && !demo) {
      const input = await requestBody(request); requireBearer(request, process.env.BEACON_PROVIDER_EVENT_TOKEN);
      return noStoreJson(await getRuntime().agent.providerEvent(id, text(input.providerId, "provider id"), text(input.bookingId, "booking id"), text(input.event, "event"), input.details));
    }
    const allowed = demo ? ["cancel-provider", "expire-deadline", "scenario", "advance-ride"] : ["discover", "evaluate", "confirm", "verify", "request", "location", "arrive", "replan", "cancel"];
    if (!allowed.includes(action)) throw new TripError("NOT_FOUND", "Operation not found", 404);
    const s = ownerSession(request); const input = await requestBody(request);
    return noStoreJson(await getRuntime().agent.act(id, s.owner, action as Action, input));
  });
}
export function tripEvents(request: Request, id: string, action: string) {
  return handleTripHttp(async () => {
    if (!["events", "evidence"].includes(action)) throw new TripError("NOT_FOUND", "Operation not found", 404);
    const owner = ownerSession(request).owner;
    if(action==="evidence"){
      const evidence=await getRuntime().agent.evidence(id,owner);
      const {getPlannerRuntime}=await import("../planner/runtime");
      return noStoreJson({...evidence,planning:await getPlannerRuntime().planner.view(owner,id)});
    }
    return noStoreJson(await getRuntime().agent.events(id, owner));
  });
}
export function resetDemo(request: Request) { return handleTripHttp(async () => { sameOrigin(request); await getRuntime().agent.reset(ownerSession(request).owner); return noStoreJson({ reset: true }); }); }
export function monitorTrips(request: Request) { return handleTripHttp(async () => { requireBearer(request, process.env.BEACON_MONITOR_TOKEN); await getRuntime().agent.monitor(); return noStoreJson({ checked: true }); }); }

export function getJourney(request:Request,id:string){return handleTripHttp(async()=>{
  const owner = ownerSession(request).owner;
  const result = await getRuntime().agent.journey(id,owner);
  const {getPlannerRuntime} = await import('../planner/runtime');
  const planning = process.env.BEACON_PLANNER_MODE === 'codex_laptop' ? await getPlannerRuntime().planner.view(owner,id) : null;
  return noStoreJson({...result, navigation:navigationHandoff(result.journey), planning:bindPlanningToJourney(planning,result.planningSnapshotId)});
});}
