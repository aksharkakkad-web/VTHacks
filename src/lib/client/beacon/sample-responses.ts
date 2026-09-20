import { transitionDemo } from "../../../components/safecircle/demo-controller";
import type { DemoAction, DemoState } from "../../../components/safecircle/types";
import { demoCandidates } from "../../../components/safecircle/mock-data";
import type { MobilityReadModel, WalkingRouteReadModel } from "./read-models";
import type { TripResponse } from "./trip-response";

/** Published polyline algorithm example. NOT an agreed campus route or walking guidance.
 * Explicit judge/gallery contract test only; never selected automatically.
 */
export const contractRoute: WalkingRouteReadModel = {
  routeId:"polyline-algorithm-example",status:"available",source:"fixture",
  geometry:{format:"encoded-polyline",value:"_p~iF~ps|U_ulLnnqC_mqNvxq`@"},
  originLabel:"Example start",destinationLabel:"Example end",
  warning:"Decoder contract example only. Not a campus route. Do not use for navigation.",
};
export function fallbackMobility(state:DemoState):MobilityReadModel|undefined {
  const plan=demoCandidates.find(p=>p.planId===state.selectedPlanId);
  if(!plan||!/^(accepted|waiting|arriving|in-trip)-/.test(state.stage))return undefined;
  const walking=plan.mode==="walk" && state.integration?.responseSource!=="backend";
  const riding=state.stage.startsWith("in-trip")&&!walking;
  return {leg:{id:walking?"home-walk":"provider-leg",kind:walking?"walk":riding?"ride":"wait",purpose:walking?"home":plan.mode==="transit"?"transit-stop":"pickup",status:"active"},
    ...(walking?{walkingRoute:{routeId:"pending-route",status:"unavailable" as const,source:"unknown" as const,destinationLabel:state.profile?.homeName}}:{}),
    ...(!walking && plan.mode!=="transit"?{ride:{providerSource:"unknown" as const,stage:"unknown" as const}}:{})};
}
export function sampleResponse(state:DemoState,action:DemoAction={type:"ADVANCE",now:Date.now()}):TripResponse {
  let next=transitionDemo({...state,paused:false},action);
  // Applying this reconciliation result is a deliberate judge operation, never RETRY or a timer.
  if(action.type==="ADVANCE"&&["payment-unknown","booking-unknown"].includes(state.stage)) next={...state,stage:state.cancellationRequested?"cancelled":state.recoveryCount?"accepted-replacement":"accepted-initial",bookingStatus:state.cancellationRequested?"cancelled":"accepted",paymentStatus:state.cancellationRequested?"voided":"approved",providerAuthorized:!state.cancellationRequested&&state.providerVerified&&!!state.userApproved,sensitiveDataReleased:!state.cancellationRequested&&state.providerVerified&&!!state.userApproved};
  const mobility=state.stage==="reconnecting" ? next.integration?.mobility ?? fallbackMobility(next) : fallbackMobility(next);
  if(mobility?.ride){
    mobility.ride={providerSource:"simulated-rideshare",stage:next.stage.startsWith("in-trip")?"riding":next.stage.startsWith("arriving")?"approaching":next.stage.startsWith("accepted")?"accepted":"waiting"};
  }
  return {source:"sample",tripId:state.integration?.tripId??"trip-demo-2409",revision:(state.integration?.responseRevision??0)+1,
    attemptId:state.attemptId,stage:next.stage,providerVerified:next.providerVerified,providerAuthorized:next.providerAuthorized,sensitiveDataReleased:next.sensitiveDataReleased,
    paymentStatus:next.paymentStatus,bookingStatus:next.bookingStatus,selectedPlanId:next.selectedPlanId,offerExpiresAt:next.offerExpiresAt,...(mobility?{mobility}: {})};
}
export type MobilitySample = "walking-pickup"|"walking-stop"|"walking-home"|"route-loading"|"route-unavailable"|"route-stale"|"ride-waiting"|"ride-riding"|"source-unknown";
/** Deliberate judge response, not an automatically generated provider update. */
export function mobilitySample(state:DemoState,name:MobilitySample):TripResponse {
  const sample=sampleResponse(state,{type:"RESTORE_STATE",state});
  const walking=name.startsWith("walking")||name.startsWith("route");
  sample.stage=walking&&name==="walking-home"?"in-trip-initial":name==="ride-riding"?"in-trip-initial":"waiting-initial";
  const purpose=name==="walking-home"?"home":name==="walking-stop"?"transit-stop":"pickup";
  sample.mobility={leg:{id:`sample-${name}`,kind:walking?"walk":name==="ride-riding"?"ride":"wait",purpose,status:"active"},
    ...(walking?{walkingRoute:name==="route-loading"?{routeId:name,status:"loading",source:"unknown"}:name==="route-unavailable"?{routeId:name,status:"unavailable",source:"unknown"}:name==="route-stale"?{...contractRoute,status:"stale"}:contractRoute}:{}),
    ...(!walking?{ride:{providerSource:name==="source-unknown"?"unknown":"simulated-rideshare",stage:name==="ride-riding"?"riding":"approaching"}}:{})};
  return sample;
}
