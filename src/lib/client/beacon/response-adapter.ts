import type { DemoState, DemoStage } from "../../../components/safecircle/types";
import { demoCandidates, recommendationFor } from "../../../components/safecircle/mock-data";
import type { TripResponse } from "./trip-response";
import type { MobilityReadModel, WalkingRouteReadModel, RideStatusReadModel } from "./read-models";
import { routePoints } from "./route-geometry";
const stages = new Set<DemoStage>(["home","discovering","collecting-quotes","evaluating","recommendation","verifying-initial","authorizing-initial","coordinating-initial","accepted-initial","waiting-initial","arriving-initial","in-trip-initial","provider-cancelled","reconciling","replanning-discovery","replanning-evaluation","replacement-selected","verifying-replacement","authorizing-replacement","coordinating-replacement","accepted-replacement","waiting-replacement","arriving-replacement","in-trip-replacement","arrival","no-options","verification-failed","offline","reconnecting","context-fallback","overdue","offer-changed","payment-declined","payment-unknown","booking-unknown","session-error","location-error","slow-request","cancelling","cancelled"]);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max=2000) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const oneOf = (value: unknown, choices: readonly string[]) => typeof value === "string" && choices.includes(value);
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const date = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
function optionalStrings(o: Record<string,unknown>, keys:string[]) { return keys.every(k=>o[k]===undefined||text(o[k])); }
function optionalNumbers(o:Record<string,unknown>,keys:string[]) { return keys.every(k=>o[k]===undefined||number(o[k])); }
export function parseMobility(value: unknown): MobilityReadModel | null {
  if (!object(value) || !object(value.leg)) return null;
  const l=value.leg;
  if(!text(l.id)||!oneOf(l.kind,["walk","wait","ride","none"])||!oneOf(l.purpose,["home","pickup","transit-stop"])||!oneOf(l.status,["active","complete"]))return null;
  const model:MobilityReadModel={leg:{id:l.id as string,kind:l.kind as MobilityReadModel["leg"]["kind"],purpose:l.purpose as MobilityReadModel["leg"]["purpose"],status:l.status as MobilityReadModel["leg"]["status"]}};
  if(value.walkingRoute!==undefined){
    const r=value.walkingRoute;
    if(!object(r)||!text(r.routeId)||!oneOf(r.status,["loading","available","unavailable","stale"])||!oneOf(r.source,["google-routes","fixture","unknown"])||!optionalStrings(r,["originLabel","destinationLabel","warning"])||!optionalNumbers(r,["distanceMeters","durationSeconds"])||(r.updatedAt!==undefined&&!date(r.updatedAt)))return null;
    if(r.geometry!==undefined && (!object(r.geometry)||!oneOf(r.geometry.format,["encoded-polyline","coordinates"]))) return null;
    if(r.status==="available"&&!r.geometry)return null;
    if(r.steps!==undefined&&(!Array.isArray(r.steps)||r.steps.length>500||!r.steps.every(s=>object(s)&&text(s.instruction)&&optionalNumbers(s,["distanceMeters","durationSeconds"]))))return null;
    const route = {routeId:r.routeId,status:r.status,source:r.source,...(r.geometry?{geometry:r.geometry}:{}),...(r.steps?{steps:r.steps}:{}),...Object.fromEntries(["originLabel","destinationLabel","warning","updatedAt","distanceMeters","durationSeconds"].filter(k=>r[k]!==undefined).map(k=>[k,r[k]]))} as WalkingRouteReadModel;
    try{if(route.geometry)routePoints(route);}catch{return null;}
    model.walkingRoute=route;
  }
  if(value.ride!==undefined){
    const r=value.ride;
    if(!object(r)||!oneOf(r.providerSource,["simulated-rideshare","connected-provider","unknown"])||!oneOf(r.stage,["accepted","waiting","driver-assigned","approaching","arrived","riding","completed","cancelled","unknown"])||!optionalStrings(r,["pickupLocation","meetingInstructions","bookingReference","driverLocationLabel"])||!optionalNumbers(r,["pickupEtaSeconds","arrivalEtaSeconds"])||(r.updatedAt!==undefined&&!date(r.updatedAt)))return null;
    if(["stale"].some(k=>r[k]!==undefined&&typeof r[k]!=="boolean"))return null;
    if(r.driver!==undefined&&(!object(r.driver)||!optionalStrings(r.driver,["firstName","photoUrl"])))return null;
    if(object(r.driver)&&r.driver.photoUrl!==undefined){try{const u=new URL(r.driver.photoUrl as string);if(u.protocol!=="https:")return null;}catch{return null;}}
    if(r.vehicle!==undefined&&(!object(r.vehicle)||!optionalStrings(r.vehicle,["color","make","model","plate"])))return null;
    model.ride=Object.fromEntries(["providerSource","stage","pickupEtaSeconds","arrivalEtaSeconds","pickupLocation","meetingInstructions","driver","vehicle","bookingReference","driverLocationLabel","updatedAt","stale"].filter(k=>r[k]!==undefined).map(k=>[k,r[k]])) as RideStatusReadModel;
  }
  return model;
}
export function parseTripResponse(value: unknown): TripResponse | null {
  if(!object(value)||!oneOf(value.source,["backend","sample","demo"])||!text(value.tripId)||!Number.isSafeInteger(value.revision)||(value.revision as number)<1||!stages.has(value.stage as DemoStage))return null;
  if(![value.providerVerified,value.providerAuthorized,value.sensitiveDataReleased].every(v=>typeof v==="boolean"))return null;
  if(!oneOf(value.paymentStatus,["not-required","not-started","pending","approved","declined","unknown","voided"])||!oneOf(value.bookingStatus,["not-required","not-started","pending","accepted","unknown","cancelled"]))return null;
  if(value.attemptId!==undefined&&!text(value.attemptId))return null;
  if(value.selectedPlanId!==undefined&&!demoCandidates.some(p=>p.planId===value.selectedPlanId))return null;
  if(value.offerExpiresAt!==undefined&&(!number(value.offerExpiresAt)||(value.offerExpiresAt as number)>8.64e15))return null;
  if(value.updatedAt!==undefined&&!date(value.updatedAt))return null;
  const mobility=value.mobility===undefined?undefined:parseMobility(value.mobility);
  if(value.mobility!==undefined&&!mobility)return null;
  return {source:value.source,tripId:value.tripId,revision:value.revision,attemptId:value.attemptId,stage:value.stage,providerVerified:value.providerVerified,providerAuthorized:value.providerAuthorized,sensitiveDataReleased:value.sensitiveDataReleased,paymentStatus:value.paymentStatus,bookingStatus:value.bookingStatus,selectedPlanId:value.selectedPlanId,offerExpiresAt:value.offerExpiresAt,updatedAt:value.updatedAt,...(mobility?{mobility}: {})} as TripResponse;
}
export function applyTripResponse(state:DemoState,value:unknown,allowSample=false):DemoState {
  const r=parseTripResponse(value);
  if(!r||(r.source==="sample"&&!allowSample)||r.tripId!==(state.integration?.tripId??"trip-demo-2409")||r.revision<(state.integration?.responseRevision??0)||(r.revision===(state.integration?.responseRevision??0)&&state.stage!=="reconnecting"))return state;
  if(["home","bootstrap","setup-home","setup-preferences","offline","arrival","cancelled"].includes(state.stage))return state;
  if(r.attemptId!==state.attemptId)return state;
  if((r.providerVerified||r.providerAuthorized||r.sensitiveDataReleased||r.bookingStatus==="accepted")&&!state.userApproved)return state;
  if(r.providerAuthorized&&!r.providerVerified)return state;
  if(r.bookingStatus==="accepted"&&r.stage!=="arrival"&&(!r.providerVerified||!r.providerAuthorized))return state;
  if(["arrival","cancelled"].includes(r.stage)&&(r.providerAuthorized||r.sensitiveDataReleased))return state;
  if(r.sensitiveDataReleased&&(!r.providerVerified||!r.providerAuthorized))return state;
  if(state.cancellationRequested&&!["cancelling","cancelled","booking-unknown","payment-unknown"].includes(r.stage))return state;
  // An update cannot swap the student's approved exact offer under the same consent.
  if(state.userApproved&&r.selectedPlanId&&r.selectedPlanId!==state.selectedPlanId)return state;
  const failed=r.stage==="provider-cancelled";
  const newOffer=r.stage==="replacement-selected"||r.stage==="offer-changed"||failed;
  if(newOffer&&(r.providerVerified||r.providerAuthorized||r.sensitiveDataReleased))return state;
  if(r.mobility?.leg.kind==="walk"&&r.mobility.leg.status==="active"&&(!state.userApproved||!/^(waiting|in-trip|arriving)-/.test(r.stage)))return state;
  const selectedPlanId=r.selectedPlanId??state.selectedPlanId;
  const selected=demoCandidates.find(p=>p.planId===selectedPlanId);
  return {...state,stage:r.stage,statusRevision:state.statusRevision+1,selectedPlanId,
    providerVerified:r.providerVerified,providerAuthorized:r.providerAuthorized,sensitiveDataReleased:r.sensitiveDataReleased,paymentStatus:r.paymentStatus,bookingStatus:r.bookingStatus,
    ...(r.updatedAt?{lastTripUpdateAt:Date.parse(r.updatedAt)}:{}),
    ...(r.offerExpiresAt!==undefined?{offerExpiresAt:r.offerExpiresAt}:{}),
    ...(newOffer?{userApproved:false}:{}),
    ...(failed?{recoveryCount:state.recoveryCount+1,failedPlanIds:[...new Set([...state.failedPlanIds,...(state.selectedPlanId?[state.selectedPlanId]:[])])]}:{}),
    ...(selected&&["recommendation","replacement-selected"].includes(r.stage)?{recommendation:recommendationFor(selected)}:{}),
    ...(r.stage==="reconnecting"?{}:state.stage==="reconnecting"?{offlineResume:undefined,previousStage:undefined}:{}),
    integration:{tripId:r.tripId,responseRevision:r.revision,responseSource:r.source,...(r.mobility?{mobility:r.mobility}:{})}};
}
/** Conservative view gate: never infer active walking from a ride's walking estimate. */
export function visibleMobility(state:DemoState):MobilityReadModel|undefined {
  if(!/^(accepted|waiting|arriving|in-trip)-/.test(state.stage))return undefined;
  const m=state.integration?.mobility;
  return m;
}
