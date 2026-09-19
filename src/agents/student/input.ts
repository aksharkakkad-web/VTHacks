import { number, object, point, text } from "../contract";
import { TripError, type Contact, type TripContext } from "../../lib/trip-state/model";
import { telegramChatId } from "../../integrations/notifications/telegram";
import { isPublicCorridor, matchesPublicCorridor, publicCorridorEndpoints } from "../../lib/decision-client/trip-options";

export function parseTripInput(value: unknown, demo: boolean, now: number) {
  const input = object(value); const prefs = object(input.preferences ?? {});
  if(input.journeyContract!==undefined&&input.journeyContract!=='beacon-journey-v1')throw new TripError('INVALID_JOURNEY_CONTRACT','Unsupported journey contract',400);
  const temporary = object(input.temporary_context ?? {});
  if (temporary.immediate_danger === true || temporary.medical_emergency === true || temporary.serious_injury === true) throw new TripError("EMERGENCY_HELP_REQUIRED", "Use emergency help immediately; Beacon does not dispatch emergency services.", 422);
  const corridorId = input.corridorId;
  if (corridorId !== undefined && !isPublicCorridor(corridorId)) throw new TripError("UNSUPPORTED_CORRIDOR", "Choose a supported public campus route", 400);
  const endpoints = corridorId ? publicCorridorEndpoints(corridorId) : undefined;
  const origin = point(input.origin ?? (demo ? endpoints?.origin ?? { lat: 37.229, lng: -80.414 } : undefined));
  const home = point(prefs.home ?? (demo ? endpoints?.home ?? { lat: 37.221, lng: -80.420 } : undefined));
  if (corridorId && !matchesPublicCorridor(corridorId, origin, home)) throw new TripError("CORRIDOR_ENDPOINT_MISMATCH", "This public walking route does not match the trip endpoints", 400);
  const savedBudget = number(prefs.maxBudget ?? (demo ? 10 : undefined), "budget");
  const maxBudget = temporary.max_budget === undefined ? savedBudget : number(temporary.max_budget, "budget");
  const context: TripContext = { maxBudget, minimizeWalking: temporary.minimize_walking === true || prefs.walkingPreference === "minimize" || (demo && prefs.walkingPreference === undefined), minimizeTransfers: temporary.minimize_transfers === true || prefs.transferPreference === "minimize", hasBeenDrinking: temporary.has_been_drinking === true, exhausted: temporary.exhausted === true, currentTime: new Date(now).toISOString() };
  let contact: Contact | undefined;
  if (prefs.trustedContact !== undefined) {
    const c = object(prefs.trustedContact);
    contact = { name: text(c.name, "contact name", 80), telegramChatId: telegramChatId(c.telegramChatId), consent: c.consent === true, shareLocation: c.shareLocation === true };
  }
  // Arbitrary exact addresses are never reused as coarse provider context.
  const originZone = corridorId ? "VT academic campus" : "Downtown Blacksburg"; const destinationZone = "VT residential campus";
  return { private: { origin, home, contact }, context, originZone, destinationZone, ...(corridorId ? { corridorId } : {}), ...(input.journeyContract==='beacon-journey-v1'?{journeyContract:'beacon-journey-v1' as const}:{}) };
}
