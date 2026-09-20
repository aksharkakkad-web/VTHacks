import { number, object, point, text } from "../contract";
import { TripError, type Contact, type TripContext } from "../../lib/trip-state/model";
import { telegramChatId } from "../../integrations/notifications/telegram";
import { isPublicCorridor, matchesPublicCorridor, publicCorridorEndpoints } from "../../lib/decision-client/trip-options";

export function parseTripInput(value: unknown, demo: boolean, now: number, scenarioEnabled = false) {
  const input = object(value); const prefs = object(input.preferences ?? {});
  const scenario = input.demoScenarioVariant;
  if (scenario !== undefined && (!demo || !scenarioEnabled || !['baseline','lighting_outage','incident_pressure','rain'].includes(String(scenario)))) throw new TripError('DEMO_SCENARIO_DISABLED', 'Choose an enabled demo scenario', 400);
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
  const cannotWalk = temporary.cannot_walk ?? prefs.cannotWalk;
  const maxWalkingMinutes = temporary.max_walking_minutes ?? prefs.maxWalkingMinutes;
  if (cannotWalk !== undefined && typeof cannotWalk !== 'boolean') throw new TripError('INVALID_WALKING_PREFERENCE', 'Walking ability must be explicit', 400);
  const context: TripContext = { maxBudget, minimizeWalking: temporary.minimize_walking === true || prefs.walkingPreference === "minimize" || (demo && prefs.walkingPreference === undefined), minimizeTransfers: temporary.minimize_transfers === true || prefs.transferPreference === "minimize", hasBeenDrinking: temporary.has_been_drinking === true, exhausted: temporary.exhausted === true, currentTime: new Date(now).toISOString() };
  if (cannotWalk !== undefined) context.cannotWalk = cannotWalk;
  if (maxWalkingMinutes !== undefined) context.maxWalkingMinutes = number(maxWalkingMinutes, 'maximum walking minutes', 1440);
  let contact: Contact | undefined;
  if (prefs.trustedContact !== undefined) {
    const c = object(prefs.trustedContact);
    contact = { name: text(c.name, "contact name", 80), telegramChatId: telegramChatId(c.telegramChatId), consent: c.consent === true, shareLocation: c.shareLocation === true };
  }
  // Arbitrary exact addresses are never reused as coarse provider context.
  const originZone = corridorId ? "VT academic campus" : "Downtown Blacksburg"; const destinationZone = "VT residential campus";
  // Hard mobility limits must never be silently ignored by the legacy evaluator.
  const completeJourney = input.journeyContract === 'beacon-journey-v1' || cannotWalk !== undefined || maxWalkingMinutes !== undefined || scenarioEnabled;
  return { private: { origin, home, contact }, context, originZone, destinationZone, ...(scenario === undefined ? {} : {demoScenarioVariant: scenario as 'baseline'|'lighting_outage'|'incident_pressure'|'rain'}), ...(corridorId ? { corridorId } : {}), ...(completeJourney?{journeyContract:'beacon-journey-v1' as const}:{}) };
}
