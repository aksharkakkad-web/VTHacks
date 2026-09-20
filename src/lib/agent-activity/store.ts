import { createHash, randomUUID } from 'node:crypto';
import type { JsonStore } from '../planner/store';
import type { ActivityEvent, ActivityInput, CallInput, CallResult } from './contracts';
import { opaque, safeFields, validateActivity } from './redaction';
export type ActivityState={sequence:number;events:ActivityEvent[]};
export const emptyActivity=():ActivityState=>({sequence:0,events:[]});
export class ActivityStore {
 private gaps = new Set<string>();
 constructor(private storage:(tripId:string)=>JsonStore<ActivityState>,private now:()=>number=Date.now){}
 async emit(tripId:string,input:ActivityInput):Promise<void> {
  try {
   validateActivity(input);
   const now=this.now(), requestId=opaque(input.requestId)??randomUUID();
   const eventId=opaque(input.eventId)??createHash('sha256').update(`${requestId}:${input.phase}`).digest('hex');
   await this.storage(tripId).update(s=>{
    s.events=s.events.filter(e=>Date.parse(e.occurredAt)>now-86400000);
    if(s.events.some(e=>e.eventId===eventId))return;
    s.events.push({version:'beacon-agent-activity-v1',eventId,sequence:++s.sequence,runId:opaque(input.runId)??'trip',requestId,causationId:opaque(input.causationId)??null,occurredAt:new Date(now).toISOString(),sender:input.sender,recipient:input.recipient,operation:input.operation,phase:input.phase,
     execution:input.execution??(input.phase==='request'?'not_called':'live'),identity:input.identity??'not_applicable',
     summaryCode:`${input.operation.replaceAll('.','_').toUpperCase()}_${input.phase.toUpperCase()}`,
     safeData:safeFields(input.operation,input.safeData),evidenceIds:(input.evidenceIds??[]).slice(0,16).map(id=>`evidence_${createHash('sha256').update(id).digest('hex').slice(0,16)}`)});
    s.events=s.events.slice(-500);
   });
  }catch { this.gaps.add(tripId); }
 }
 async call<T>(tripId:string,input:CallInput,fn:()=>Promise<T>,summarize?:(result:T)=>CallResult):Promise<T> {
  const requestId=opaque(input.requestId)??randomUUID();
  await this.emit(tripId,{...input,requestId,phase:'request',execution:'not_called'});
  try {
   const result=await fn();
   let details:CallResult={};try{details=summarize?.(result)??{};}catch{this.gaps.add(tripId);}
   await this.emit(tripId,{...input,...details,requestId,phase:'response',execution:details.execution??input.execution??'live'});
   return result;
  }catch(error) { await this.emit(tripId,{...input,requestId,phase:error instanceof Error && ['TimeoutError','AbortError'].includes(error.name)?'timeout':'rejected',execution:'not_called',safeData:{}});throw error; }
 }
 async read(tripId:string,after=0) {
  if(!Number.isSafeInteger(after)||after<0)throw new Error('INVALID_CURSOR');
  const s=await this.storage(tripId).read(), retained=s.events.filter(e=>Date.parse(e.occurredAt)>this.now()-86400000);
  const events=retained.filter(e=>e.sequence>after).slice(0,100);
  return {version:'beacon-agent-activity-v1' as const,events,nextCursor:events.at(-1)?.sequence??Math.max(after,s.sequence),truncated:(retained[0]?.sequence??s.sequence+1)>after+1,traceGap:this.gaps.has(tripId)};
 }
 async clear(tripId:string) {
  try {await this.storage(tripId).update(s=>{s.events=[];});this.gaps.delete(tripId);
   await this.emit(tripId,{sender:'student',recipient:'monitor',operation:'trip.arrive',phase:'info',safeData:{arrived:true}});
  }catch{this.gaps.add(tripId);}
 }
}
