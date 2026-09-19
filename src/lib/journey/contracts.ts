import type { WalkingRoute } from '../routing/google-routes';
import type { JourneyResult, Journey } from '../decision-client/journey-types';
import type { Point } from '../decision-client/walking-router';
export type JourneyLeg={id:string;kind:'walk'|'wait'|'ride'|'transit';durationSeconds:number|null;geometry:WalkingRoute['geometry']|null;directions:string[];source:'mapped_snapshot'|'provider_quote'|'unknown'|'walking_router'|'transit_schedule'|'planner';position:'whole_journey'|'pickup'|'dropoff'|'provider_leg'|'allocation_unknown'};
export type JourneySnapshot={schemaVersion:'beacon-journey-v1';revision:number;binding:string;createdAt:string;selectedPlanId:string|null;selectedOffer:{providerId:string;serviceId:string;quoteId:string;currency:'USD';totalMinor:number;expiresAt:string;simulated:boolean}|null;legs:JourneyLeg[];pickup:{point:Point|null;instructions:string|null;accessVerified:boolean|null};waiting:{point:Point|null;indoorAccessVerified:boolean|null};estimatedDurationSeconds:number|null;expectedArrivalAt:string|null;alertDeadlineAt:string|null;remainingBudgetMinor:number;currency:'USD';limitations:string[];
  /** Exact planner result, including route, location and evidence bindings. Owner-only. */
  complete:JourneyResult|null;nextStep:Journey['nextStep']|null;
};
export type RideStage='searching'|'assigned'|'approaching'|'arrived'|'in_trip'|'completed'|'cancelled'|'unknown';
export type RideObservation={stage:RideStage;providerStatus:string;pickupEtaSeconds:number|null;meetingInstructions:string|null;driver:{displayName:string|null}|null;vehicle:{make:string|null;model:string|null;color:string|null;licensePlate:string|null}|null;providerUpdatedAt:string|null;receivedAt:string;source:'provider_poll'|'provider_event';simulated:boolean};
export type ArrivalEvidence={firstInsideAt:number;lastInsideAt:number;samples:number};
