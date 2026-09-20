import type { SafetyEvidence } from '../../lib/decision-client/safety-evidence';
import type { loadPocContext } from '../../lib/decision-client/poc-context';
import type { PublicTripOptions } from '../../lib/decision-client/trip-options';
import type { PublicResearchResult, ResearchRequest } from '../../integrations/databricks/web-research';
import { evidenceId, parseContextRequest, type ContextRequest, type ContextResponse, type ContextTopic } from './contract';
export type ContextReaders={
 safety:(id:string,at:string,routeVersion?:string)=>SafetyEvidence;
 publicContext:typeof loadPocContext;
 options?:(id:'newman-pritchard'|'eggleston-pritchard',at:string)=>Promise<PublicTripOptions>;
 research?:(request:ResearchRequest)=>Promise<PublicResearchResult>;
 peers?:(request:ContextRequest)=>Promise<ContextResponse[]>;
 now?:()=>number;
};
async function bounded<T>(operation:Promise<T>,ms:number):Promise<T>{let timer:ReturnType<typeof setTimeout>;try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('CONTEXT_DEADLINE')),ms);})]);}finally{clearTimeout(timer!);}}
export class ContextAgent {
 constructor(private deps:ContextReaders){}
 async query(value:unknown,hop:0|1=0):Promise<ContextResponse>{
  const now=this.deps.now?.()??Date.now(),r=parseContextRequest(value,now);
  const result:ContextResponse={version:'beacon-context-v1',requestId:r.requestId,status:'unavailable',evidence:[],leads:[],gaps:['CURRENT_LIGHTING_UNKNOWN','CURRENT_ACTIVITY_UNKNOWN','INDOOR_ACCESS_UNCONFIRMED','PICKUP_PERMISSION_UNCONFIRMED','GENERIC_SEARCH_NOT_CONFIGURED'],expiresAt:new Date(now+60000).toISOString(),lookupMode:this.deps.research?'fixed_official_sources':'not_called'};
  let options:PublicTripOptions|undefined;
  if(this.deps.options&&r.corridorId!=='downtown-pritchard')try{options=await bounded(this.deps.options(r.corridorId,r.evaluatedAt),5000);}catch{result.gaps.push('PUBLIC_OPTIONS_UNAVAILABLE');}
  let safety:SafetyEvidence|undefined;
  try{safety=this.deps.safety(r.corridorId,r.evaluatedAt,options?.walkingAlternative?.route.source_version);}catch{result.gaps.push('SAFETY_EVIDENCE_UNAVAILABLE');}
  if(safety)for(const source of safety.sourceProvenance){
   if(!r.topics.includes(source.dataset as ContextTopic))continue;
   const fresh=safety.freshness[source.dataset],historical=['crime','lighting','activity'].includes(source.dataset);
   result.evidence.push({id:evidenceId(`${source.dataset}:${source.sha256}`),topic:source.dataset as ContextTopic,sourceTitle:`Published ${source.dataset} source`,sourceUrl:source.url,sourceVersion:source.version,observedAt:null,publishedAt:null,retrievedAt:source.captured_at,validUntil:fresh.validUntil,geographicScope:r.corridorId,provenance:historical?'historical':'local_snapshot',rankingEligible:false,statement:historical?'Historical or mapped context; does not establish current route conditions.':'Source-bound context; ranking remains with the validated Databricks adapter.'});
  }
  try{
   const poc=this.deps.publicContext(r.evaluatedAt);
   if(r.topics.includes('waiting_places'))for(const site of poc.waitingSites)result.evidence.push({id:evidenceId(`hours:${site.siteId}:${site.closesAt}`),topic:'waiting_places',sourceTitle:'Published campus hours',sourceUrl:site.sourceUrl,sourceVersion:null,observedAt:null,publishedAt:null,retrievedAt:null,validUntil:site.hoursStatus==='published_open_window'?site.closesAt:null,geographicScope:r.corridorId,provenance:'local_snapshot',rankingEligible:false,statement:'Published hours only. Admission, indoor waiting availability, route access and provider pickup permission are unconfirmed.'});
   if(r.topics.includes('transit')&&poc.transit)result.evidence.push({id:evidenceId(`transit:${poc.transit.sourceVersion}`),topic:'transit',sourceTitle:'Published bus timetable',sourceUrl:poc.transit.sourceUrl,sourceVersion:poc.transit.sourceVersion,observedAt:null,publishedAt:null,retrievedAt:null,validUntil:null,geographicScope:r.corridorId,provenance:'scheduled',rankingEligible:false,statement:'Scheduled service only. Catchable departures and access walks are validated separately; no live vehicle position.'});
  }catch{result.gaps.push('PUBLIC_CONTEXT_UNAVAILABLE');}
  if(r.topics.includes('transit')&&options?.transit.status!=='scheduled')result.gaps.push('CATCHABLE_TRANSIT_NOT_ESTABLISHED');
  if(r.topics.includes('lighting')&&safety?.walkingAlternativeReadiness)result.gaps.push('READINESS_REQUIRES_CURRENT_OBSERVATIONS');
  if(this.deps.research){
   const topics=r.topics.filter((t):t is ResearchRequest['topic']=>t!=='waiting_places').slice(0,3);
   if(r.topics.length>topics.length+(r.topics.includes('waiting_places')?1:0))result.gaps.push('RESEARCH_TOPIC_LIMIT');
   const researched=await Promise.allSettled(topics.map(topic=>bounded(this.deps.research!({corridorId:r.corridorId,topic}),8500)));
   for(let i=0;i<researched.length;i++){const item=researched[i];if(item.status==='rejected'){result.gaps.push('SOURCE_LOOKUP_UNAVAILABLE');continue;}
    for(const s of item.value.sources)result.leads.push({id:evidenceId(s.contentSha256),topic:topics[i],sourceTitle:s.title,sourceUrl:s.url,sourceVersion:s.contentSha256,observedAt:null,publishedAt:s.pageTimestampKind==='published'?s.pageTimestamp:null,retrievedAt:s.retrievedAt,validUntil:null,geographicScope:r.corridorId,provenance:'local_snapshot',rankingEligible:false,statement:'Retrieved page metadata only; not verified route evidence.'});
   }
  }
  if(hop===0&&this.deps.peers)try{const peers=await bounded(this.deps.peers(r),5000);if(!peers.length)result.gaps.push('NO_COMPATIBLE_RESEARCH_PEER');for(const peer of peers.slice(0,2))result.leads.push(...peer.evidence.slice(0,4).map(e=>({...e,rankingEligible:false,statement:'Peer research lead; requires local source validation before decision use.'})));}catch{result.gaps.push('RESEARCH_PEER_UNAVAILABLE');}
  else result.gaps.push(hop===1?'DELEGATION_HOP_LIMIT':'NO_COMPATIBLE_RESEARCH_PEER');
  result.evidence=result.evidence.slice(0,100);result.leads=result.leads.slice(0,24);result.gaps=[...new Set(result.gaps)].slice(0,40);result.status=result.evidence.length?'partial':'unavailable';return result;
 }
}
