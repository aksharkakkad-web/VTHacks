import { confirmationPayload, createPayload, parseAtomicJourney, type AtomicJourney } from './atomic-journey';
import type { SavedProfile, TripContext } from '../../../components/safecircle/types';
import type { Trip } from '../../../types/trip';
export class AtomicTransportError extends Error { constructor(public code:string,public status:number,message:string){super(message);this.name='AtomicTransportError';} }
async function http(path:string,body?:unknown,signal?:AbortSignal):Promise<unknown>{const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal,headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});let data:unknown;try{data=await response.json();}catch{throw new AtomicTransportError('INVALID_RESPONSE',response.status,'The trip service returned an unreadable response.');}if(!response.ok){const e=(data as {error?:{code?:string;message?:string}})?.error;throw new AtomicTransportError(e?.code??'SERVICE_UNAVAILABLE',response.status,e?.message??'The trip service is unavailable.');}return data;}
const path=(id:string)=>`/api/trips/${encodeURIComponent(id)}`;
export const atomicTransport={
 pair:(code:string)=>http('/api/demo/planner/pair',{code}),
 async create(profile:SavedProfile,context:TripContext={}){const v=await http('/api/trips',createPayload(profile,context));if(!v||typeof v!=='object'||typeof (v as Trip).id!=='string')throw new AtomicTransportError('INVALID_RESPONSE',502,'Missing trip identity.');return v as Trip;},
 async journey(id:string,signal?:AbortSignal){return parseAtomicJourney(await http(`${path(id)}/journey`,undefined,signal));},
 planning:(id:string)=>http(`${path(id)}/planning`,{}),
 confirm:(id:string,snapshot:AtomicJourney)=>http(`${path(id)}/confirm`,confirmationPayload(snapshot)),
 verify:(id:string)=>http(`${path(id)}/verify`,{}),
 request:(id:string)=>http(`${path(id)}/request`,{}),
 arrive:(id:string)=>http(`${path(id)}/arrive`,{}),
 location:(id:string,body:unknown)=>http(`${path(id)}/location`,body),
 replan:(id:string,snapshot:AtomicJourney)=>http(`${path(id)}/replan`,{journeyRevision:snapshot.journey.revision,reason:'conditions_changed'}),
 demo:(id:string,action:'cancel-provider'|'expire-deadline'|'scenario'|'advance-ride',body:unknown={})=>http(`/api/demo/trips/${encodeURIComponent(id)}/${action}`,body),
 cancel:(id:string)=>http(`${path(id)}/cancel`,{}),
};
