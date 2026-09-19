import { digest } from '../planner/validation';
import type { TripRecord } from '../trip-state/model';
import { remainingBudgetMinor } from '../../agents/student/coordination';
import type { JourneyLeg, JourneySnapshot } from './contracts';
type JourneyRecord=TripRecord&{journey?:JourneySnapshot;journeyRevision?:number};
export function syncJourney(r:JourneyRecord,now:number){
 const p=r.trip.selectedPlan,network=p?r.networkOffers?.[p.planId]:undefined,route=p?.mode==='walk'?r.optionEvidence?.walkingAlternative?.route:undefined;
 const selected=p&&!['ARRIVED','FAILED','OBJECTIVE_RECEIVED','DISCOVERING','COLLECTING_QUOTES','PROVIDER_FAILED','REPLANNING'].includes(r.trip.state)?p:undefined;
 const deadline=selected?Math.min(r.quoteDeadline,r.quoteExpirations?.[selected.planId]??Infinity):0;
 const binding=digest({plan:selected??null,offer:selected?network??null:null,route:selected?route??null:null,replanCount:r.replanCount,remainingBudgetMinor:remainingBudgetMinor(r)});
 if(r.journey?.binding===binding){r.journey.expectedArrivalAt=r.trip.expectedArrivalAt??null;r.journey.alertDeadlineAt=r.trip.alertDeadlineAt??null;return r.journey;}
 const revision=(r.journeyRevision??0)+1;r.journeyRevision=revision;
 const legs:JourneyLeg[]=[];
 if(selected){
  if(selected.mode==='walk')legs.push({id:'walk-home',kind:'walk',position:'whole_journey',durationSeconds:selected.totalMinutes*60,geometry:route?.status==='supported'?route.geometry??null:null,directions:[],source:route?.status==='supported'?'mapped_snapshot':'unknown'});
  else{
   // A total walking estimate does not establish which side of the ride contains that walk.
   legs.push({id:'walking-total',kind:'walk',position:'allocation_unknown',durationSeconds:selected.walkingMinutes*60,geometry:null,directions:[],source:'provider_quote'});
   legs.push({id:'wait-pickup',kind:'wait',position:'pickup',durationSeconds:selected.waitMinutes*60,geometry:null,directions:[],source:'provider_quote'});
   legs.push({id:'provider-leg',kind:selected.mode==='transit'?'transit':'ride',position:'provider_leg',durationSeconds:selected.travelMinutes*60,geometry:null,directions:[],source:'provider_quote'});
  }
 }
 r.journey={schemaVersion:'beacon-journey-v1',revision,binding,createdAt:new Date(now).toISOString(),selectedPlanId:selected?.planId??null,
  selectedOffer:selected&&network?{providerId:network.offer.providerId,serviceId:network.offer.serviceId,quoteId:network.offer.quoteId,currency:'USD',totalMinor:network.offer.price.totalMinor,expiresAt:new Date(Math.min(deadline,Date.parse(network.offer.expiresAt))).toISOString(),simulated:network.offer.simulated}:null,
  legs,pickup:{point:null,instructions:selected&&network?network.offer.pickup.instructions:null,accessVerified:selected&&network?network.offer.pickup.accessVerified:null},waiting:{point:null,indoorAccessVerified:null},estimatedDurationSeconds:selected?selected.totalMinutes*60:null,expectedArrivalAt:r.trip.expectedArrivalAt??null,alertDeadlineAt:r.trip.alertDeadlineAt??null,remainingBudgetMinor:remainingBudgetMinor(r),currency:'USD',limitations:['Current illumination and indoor access are unknown.','Provider walking totals do not establish pickup and dropoff geometry.','A walking route is not a vehicle route.']};
 return r.journey;
}
