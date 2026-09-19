import test from "node:test";
import assert from "node:assert/strict";
import { selectScheduledTransit, type ScheduledDeparture } from "./transit";
import { evaluateCandidates } from "./decision";

const row: ScheduledDeparture = { corridor_id:"newman-pritchard",trip_id:"night-trip",route_id:"CAS",route_name:"Campus Shuttle",service_date:"2026-09-18",departure_at:"2026-09-19T05:26:31Z",arrival_at:"2026-09-19T05:37:41Z",travel_minutes:11.166667,from_stop_id:"1100",to_stop_id:"1146",source_id:"bt-gtfs",source_version:"FY27 Blacksburg 1.6A" };
const request = { corridorId:"newman-pritchard" as const, evaluatedAt:"2026-09-19T05:20:00Z",accessWalkingMinutes:2,egressWalkingMinutes:1 };
test("overnight scheduled trip includes access and egress exactly once", () => {
  const result = selectScheduledTransit([row], request)!;
  assert.equal(result.candidate.cost, 0);
  assert.equal(result.candidate.walkingMinutes, 3);
  assert.equal(Math.round(result.candidate.totalMinutes * 60), 1121);
  assert.equal(result.signals.validUntil, "2026-09-19T05:23:31.000Z");
  assert.equal(evaluateCandidates([result.candidate], { maxBudget:0, evaluatedAt:request.evaluatedAt }, { [result.candidate.planId]:result.signals }).status, "RECOMMENDED");
});
test("missed bus, excessive wait, and unsupported stops do not become candidates", () => {
  assert.equal(selectScheduledTransit([row], { ...request, evaluatedAt:"2026-09-19T05:24:00Z" }), null);
  assert.equal(selectScheduledTransit([row], { ...request, maxWaitMinutes:1 }), null);
  assert.equal(selectScheduledTransit([{...row,to_stop_id:"wrong"}], request), null);
});
