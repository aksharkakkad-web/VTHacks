import type { Point } from '../../agents/contract';
import type { ArrivalEvidence } from './contracts';
export const arrivalPolicy={radiusMeters:75,maxAccuracyMeters:30,dwellMs:30000,maxSampleGapMs:20000,maxSampleAgeMs:30000,minSamples:3} as const;
function distance(a:Point,b:Point){const rad=Math.PI/180,h=Math.sin((b.lat-a.lat)*rad/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((b.lng-a.lng)*rad/2)**2;return 6371000*2*Math.asin(Math.min(1,Math.sqrt(h)));}
/** Both sample time and receipt time must advance; never infer dwell through a GPS outage. */
export function assessArrival(previous:ArrivalEvidence|undefined,sample:Point&{recordedAt:number;accuracyMeters:unknown},home:Point,now:number):{arrived:boolean;evidence?:ArrivalEvidence;reason:string}{
 if(typeof sample.accuracyMeters!=='number'||!Number.isFinite(sample.accuracyMeters)||sample.accuracyMeters<0||sample.accuracyMeters>arrivalPolicy.maxAccuracyMeters)return{arrived:false,reason:'ACCURACY_INSUFFICIENT'};
 if(sample.recordedAt>now||now-sample.recordedAt>arrivalPolicy.maxSampleAgeMs)return{arrived:false,reason:'LOCATION_NOT_CURRENT'};
 if(distance(sample,home)+sample.accuracyMeters>arrivalPolicy.radiusMeters)return{arrived:false,reason:'OUTSIDE_ARRIVAL_AREA'};
 if(previous&&sample.recordedAt<=previous.lastInsideAt)return{arrived:false,evidence:previous,reason:'LOCATION_OUT_OF_ORDER'};
 const continuous=previous&&sample.recordedAt-previous.lastInsideAt<=arrivalPolicy.maxSampleGapMs;
 const evidence:ArrivalEvidence={firstInsideAt:continuous?previous.firstInsideAt:sample.recordedAt,lastInsideAt:sample.recordedAt,samples:continuous?previous.samples+1:1};
 const arrived=evidence.samples>=arrivalPolicy.minSamples&&evidence.lastInsideAt-evidence.firstInsideAt>=arrivalPolicy.dwellMs;
 return{arrived,evidence,reason:arrived?'ARRIVAL_DWELL_CONFIRMED':'DWELL_PENDING'};
}
