import { createHash } from 'node:crypto';
import { object, point, type Point } from '../../agents/contract';
export type WalkingRoute={version:'beacon-walking-route-v1';routeId:string;source:'google_routes';fetchedAt:string;durationSeconds:number;distanceMeters:number;geometry:{type:'LineString';coordinates:[number,number][]};steps:{instruction:string|null;distanceMeters:number|null;durationSeconds:number|null}[];warnings:string[];attribution:'Google Maps';closureStatus:'not_checked';safetyStatus:'not_assessed'};
export type RoutingResult={status:'available';route:WalkingRoute}|{status:'unavailable';reason:'ACCESS_PENDING'|'NO_ROUTE'|'UPSTREAM_UNAVAILABLE'|'INVALID_RESPONSE'};
const mask='routes.duration,routes.distanceMeters,routes.polyline.geoJsonLinestring,routes.legs.steps.navigationInstruction.instructions,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration,routes.warnings';
function seconds(v:unknown){if(typeof v!=='string'||!/^\d+(\.\d{1,9})?s$/.test(v))throw Error('INVALID_RESPONSE');const n=Number(v.slice(0,-1));if(n<=0||n>86400)throw Error('INVALID_RESPONSE');return n;}
function meters(v:unknown){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>200000)throw Error('INVALID_RESPONSE');return v;}
function plain(v:unknown,max:number){if(typeof v!=='string'||v.length>max||/[<>\u0000-\u0008]/.test(v))throw Error('INVALID_RESPONSE');return v;}
export function parseWalkingRoute(value:unknown,now=Date.now()):WalkingRoute|null{
 const r=object(value);if(!Array.isArray(r.routes)||r.routes.length>3)throw Error('INVALID_RESPONSE');if(!r.routes.length)return null;
 const route=object(r.routes[0]),line=object(object(route.polyline).geoJsonLinestring);
 if(line.type!=='LineString'||!Array.isArray(line.coordinates)||line.coordinates.length<2||line.coordinates.length>20000)throw Error('INVALID_RESPONSE');
 const coordinates:[number,number][]=line.coordinates.map(v=>{if(!Array.isArray(v)||v.length!==2)throw Error('INVALID_RESPONSE');point({lng:v[0],lat:v[1]});return[v[0],v[1]];});
 if(!Array.isArray(route.legs)||route.legs.length!==1)throw Error('INVALID_RESPONSE');
 const rawSteps=object(route.legs[0]).steps;if(!Array.isArray(rawSteps)||rawSteps.length>500)throw Error('INVALID_RESPONSE');
 const steps=rawSteps.map(raw=>{const s=object(raw);return{instruction:s.navigationInstruction===undefined?null:plain(object(s.navigationInstruction).instructions,500),distanceMeters:s.distanceMeters===undefined?null:meters(s.distanceMeters),durationSeconds:s.staticDuration===undefined?null:s.staticDuration==='0s'?0:seconds(s.staticDuration)};});
 const warnings=route.warnings??[];if(!Array.isArray(warnings)||warnings.length>30)throw Error('INVALID_RESPONSE');
 const data={durationSeconds:seconds(route.duration),distanceMeters:meters(route.distanceMeters),geometry:{type:'LineString' as const,coordinates},steps,warnings:warnings.map(v=>plain(v,1000))};
 return{version:'beacon-walking-route-v1',routeId:createHash('sha256').update(JSON.stringify(data)).digest('hex'),source:'google_routes',fetchedAt:new Date(now).toISOString(),...data,attribution:'Google Maps',closureStatus:'not_checked',safetyStatus:'not_assessed'};
}
/** Server adapter only. Databricks owns complete-journey comparison and closure checks.
 * Explicit enablement prevents a discovered key from silently starting billable requests. */
export async function googleWalkingRoute(input:{origin:Point;destination:Point},options:{enabled?:boolean;apiKey?:string;fetch?:typeof fetch;now?:()=>number}={}):Promise<RoutingResult>{
 const origin=point(input.origin),destination=point(input.destination);
 const enabled=options.enabled??process.env.BEACON_GOOGLE_ROUTES_ENABLED==='true',key=options.apiKey??process.env.GOOGLE_ROUTES_API_KEY;
 if(!enabled||!key)return{status:'unavailable',reason:'ACCESS_PENDING'};
 try{
  const waypoint=(p:Point)=>({location:{latLng:{latitude:p.lat,longitude:p.lng}}});
  const response=await(options.fetch??fetch)('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':mask},body:JSON.stringify({origin:waypoint(origin),destination:waypoint(destination),travelMode:'WALK',polylineEncoding:'GEO_JSON_LINESTRING',computeAlternativeRoutes:false,languageCode:'en-US',units:'METRIC'})});
  if(!response.ok){void response.body?.cancel();return{status:'unavailable',reason:'UPSTREAM_UNAVAILABLE'};}
  if(Number(response.headers.get('content-length')??0)>1000000){void response.body?.cancel();return{status:'unavailable',reason:'INVALID_RESPONSE'};}
  const reader=response.body?.getReader();if(!reader)return{status:'unavailable',reason:'INVALID_RESPONSE'};
  let bytes=0,raw='';const decoder=new TextDecoder();
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1000000){await reader.cancel();throw Error('INVALID_RESPONSE');}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}finally{reader.releaseLock();}
  try{const route=parseWalkingRoute(JSON.parse(raw),options.now?.()??Date.now());return route?{status:'available',route}:{status:'unavailable',reason:'NO_ROUTE'};}catch{return{status:'unavailable',reason:'INVALID_RESPONSE'};}
 }catch{return{status:'unavailable',reason:'UPSTREAM_UNAVAILABLE'};}
}
