import { createHash } from 'node:crypto';
import { topics, type PlannerRole, type Intent, type Explanation } from './contracts';
export function canonical(value: unknown): string {
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(',')}}`;
 throw new Error('INVALID_INPUT');
}
export const digest=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
export function exact(value:unknown,keys:string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw new Error('INVALID_OUTPUT');return value as Record<string,unknown>;
}
function text(v:unknown,max:number){if(typeof v!=='string'||!v.length||v.length>max)throw new Error('INVALID_OUTPUT');return v;}
function list(v:unknown,max:number){if(!Array.isArray(v)||v.length>max)throw new Error('INVALID_OUTPUT');return v;}
function unique(values:unknown[]){if(new Set(values.map(canonical)).size!==values.length)throw new Error('INVALID_OUTPUT');return values;}
export function validateOutput(role:PlannerRole,value:unknown):Intent|Explanation|{topics:string[]}{
 if(role==='student-intent'){
  const v=exact(value,['objective','priorities','evidenceRequests','clarification']);if(v.objective!=='get_home')throw new Error('INVALID_OUTPUT');
  const priorities=unique(list(v.priorities,4));if(priorities.some(p=>typeof p!=='string'||!['minimize_walking','minimize_waiting','minimize_cost','minimize_transfers'].includes(p)))throw new Error('INVALID_OUTPUT');
  const requests=unique(list(v.evidenceRequests,8));for(const r of requests){const e=exact(r,['topic']);if(!topics.includes(e.topic as typeof topics[number]))throw new Error('INVALID_OUTPUT');}
  if(v.clarification!==null)text(v.clarification,160);
  return structuredClone(value) as Intent;
 }
 if(role==='research-intent'){const v=exact(value,['topics']);if(unique(list(v.topics,8)).some(t=>typeof t!=='string'||!topics.includes(t as typeof topics[number])))throw new Error('INVALID_OUTPUT');return structuredClone(value) as {topics:string[]};}
 const v=exact(value,['snapshotId','selectedPlanId','sentences']);text(v.snapshotId,128);text(v.selectedPlanId,256);
 for(const s of list(v.sentences,4)){const a=exact(s,['text','factIds']);text(a.text,240);for(const id of unique(list(a.factIds,6)))text(id,128);}
 return structuredClone(value) as Explanation;
}
