import { createHash } from 'node:crypto';
import { object } from '../contract';
export const contextTopics=['weather','closures','lighting','activity','crime','notices','transit','waiting_places'] as const;
export const corridors=['newman-pritchard','eggleston-pritchard','downtown-pritchard'] as const;
export type ContextTopic=typeof contextTopics[number];
export type ContextRequest={version:'beacon-context-v1';requestId:string;corridorId:typeof corridors[number];topics:ContextTopic[];evaluatedAt:string};
export type ContextEvidence={id:string;topic:ContextTopic;sourceTitle:string;sourceUrl:string|null;sourceVersion:string|null;observedAt:string|null;publishedAt:string|null;retrievedAt:string|null;validUntil:string|null;geographicScope:string;provenance:'managed'|'local_snapshot'|'historical'|'scheduled';rankingEligible:boolean;statement:string};
export type ContextResponse={version:'beacon-context-v1';requestId:string;status:'partial'|'unavailable';evidence:ContextEvidence[];leads:ContextEvidence[];gaps:string[];expiresAt:string;lookupMode:'fixed_official_sources'|'not_called'};
export function parseContextRequest(value:unknown,now=Date.now()):ContextRequest{
 const r=object(value),keys=['version','requestId','corridorId','topics','evaluatedAt'];
 if(Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k))||r.version!=='beacon-context-v1'||typeof r.requestId!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(r.requestId)||!corridors.includes(r.corridorId as ContextRequest['corridorId'])||!Array.isArray(r.topics)||r.topics.length>8||!r.topics.every(t=>contextTopics.includes(t))||new Set(r.topics).size!==r.topics.length||typeof r.evaluatedAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(r.evaluatedAt)||!Number.isFinite(Date.parse(r.evaluatedAt))||Math.abs(Date.parse(r.evaluatedAt)-now)>120000)throw new Error('INVALID_CONTEXT_REQUEST');
 return r as ContextRequest;
}
export const evidenceId=(value:string)=>`ctx_${createHash('sha256').update(value).digest('hex').slice(0,24)}`;
export function parseContextResponse(value:unknown,request:ContextRequest,now=Date.now()):ContextResponse{
 const r=object(value);
 if(Object.keys(r).some(k=>!['version','requestId','status','evidence','leads','gaps','expiresAt','lookupMode'].includes(k))||r.version!=='beacon-context-v1'||r.requestId!==request.requestId||!['partial','unavailable'].includes(String(r.status))||!Array.isArray(r.evidence)||r.evidence.length>100||!Array.isArray(r.leads)||r.leads.length>24||!Array.isArray(r.gaps)||r.gaps.length>40||!r.gaps.every(g=>typeof g==='string'&&/^[A-Z0-9_]{1,100}$/.test(g))||!['fixed_official_sources','not_called'].includes(String(r.lookupMode))||typeof r.expiresAt!=='string'||!(Date.parse(r.expiresAt)>now)||Date.parse(r.expiresAt)>now+120000)throw new Error('INVALID_CONTEXT_RESPONSE');
 for(const raw of [...r.evidence,...r.leads]){
  const e=object(raw);if(Object.keys(e).length!==13||!contextTopics.includes(e.topic as ContextTopic)||!request.topics.includes(e.topic as ContextTopic)||typeof e.id!=='string'||!/^ctx_[a-f0-9]{24}$/.test(e.id)||e.geographicScope!==request.corridorId||typeof e.sourceTitle!=='string'||e.sourceTitle.length>180||typeof e.statement!=='string'||e.statement.length>500||typeof e.rankingEligible!=='boolean'||!['managed','local_snapshot','historical','scheduled'].includes(String(e.provenance)))throw new Error('INVALID_CONTEXT_RESPONSE');
  for(const field of ['observedAt','publishedAt','retrievedAt','validUntil'])if(e[field]!==null&&(typeof e[field]!=='string'||!Number.isFinite(Date.parse(e[field] as string))))throw new Error('INVALID_CONTEXT_RESPONSE');
  if(e.sourceVersion!==null&&(typeof e.sourceVersion!=='string'||e.sourceVersion.length>128))throw new Error('INVALID_CONTEXT_RESPONSE');
  if(e.sourceUrl!==null){const url=new URL(String(e.sourceUrl));if(url.protocol!=='https:'||url.username||url.password)throw new Error('INVALID_CONTEXT_RESPONSE');}
 }
 if(r.leads.some(e=>object(e).rankingEligible!==false))throw new Error('INVALID_CONTEXT_RESPONSE');
 return r as ContextResponse;
}
