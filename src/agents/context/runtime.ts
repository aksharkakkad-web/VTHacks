import { getSafetyEvidence, getPublicTripOptions } from '../../lib/decision-client/server';
import { loadPocContext } from '../../lib/decision-client/poc-context';
import { researchPublicCampusSources } from '../../integrations/databricks/web-research';
import { AnsContextDirectory, LocalContextDirectory, type ContextDescriptor, type ContextDirectory } from '../../integrations/ans/context-directory';
import { ContextAgent } from './service';
import { HttpContextAgent } from './http-client';
import type { ContextRequest, ContextResponse } from './contract';

function directory():ContextDirectory{
 if(process.env.DEMO_MODE==='true'&&process.env.BEACON_ANS_MODE!=='live'){
  const baseUrl=process.env.BEACON_CONTEXT_AGENT_URL;
  if(!baseUrl)throw Error('CONTEXT_ENDPOINT_UNCONFIGURED');
  return new LocalContextDirectory({id:'safety-research',name:'Beacon Route Context',profileVersion:'beacon-context-v1',baseUrl,agentHost:new URL(baseUrl).hostname,source:'demo'});
 }
 return new AnsContextDirectory({apiBase:process.env.ANS_BASE_URL,apiKey:process.env.ANS_API_KEY,query:process.env.BEACON_ANS_QUERY});
}
function credential(d:ContextDescriptor){
 // A discovery result must never receive our self-operated service credential.
 if(d.source==='demo'&&d.baseUrl===process.env.BEACON_CONTEXT_AGENT_URL)return process.env.BEACON_CONTEXT_SERVICE_TOKEN??'';
 const parsed=JSON.parse(process.env.BEACON_CONTEXT_PEER_CREDENTIALS??'[]');
 if(!Array.isArray(parsed))return '';
 const found=parsed.find(x=>x&&x.id===d.id&&x.baseUrl===d.baseUrl&&x.ansId===d.ansId);
 return typeof found?.token==='string'?found.token:'';
}
export async function queryRouteContext(request:ContextRequest):Promise<ContextResponse>{
 const registry=directory(),descriptors=await registry.discover();
 const descriptor=descriptors.find(d=>credential(d).length>=32);
 if(!descriptor)throw Error('NO_COMPATIBLE_CONTEXT_AGENT');
 const identity=await registry.verify(descriptor);
 return new HttpContextAgent(descriptor,identity,credential(descriptor)).query(request);
}
export function contextRuntime(){
 const peers=async(request:ContextRequest)=>{
  const allowed=(process.env.BEACON_CONTEXT_PEER_ALLOWLIST??'').split(',').filter(Boolean);
  if(!allowed.length)return [];
  const registry=new AnsContextDirectory({apiBase:process.env.ANS_BASE_URL,apiKey:process.env.ANS_API_KEY,query:process.env.BEACON_ANS_QUERY});
  const candidates=(await registry.discover()).filter(d=>allowed.includes(d.id)&&d.ansId!==process.env.BEACON_ANS_AGENT_ID&&d.baseUrl!==process.env.BEACON_CONTEXT_AGENT_URL&&credential(d).length>=32).slice(0,2);
  const results=await Promise.allSettled(candidates.map(async d=>new HttpContextAgent(d,await registry.verify(d),credential(d)).query(request,1)));
  return results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
 };
 return new ContextAgent({safety:getSafetyEvidence,publicContext:loadPocContext,options:(id,at)=>getPublicTripOptions(id,process.env.DEMO_MODE==='true',at),
  ...(process.env.BEACON_CONTEXT_SOURCE_LOOKUP==='true'?{research:researchPublicCampusSources}:{}),peers});
}
