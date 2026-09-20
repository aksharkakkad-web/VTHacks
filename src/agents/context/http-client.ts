import { providerUrl } from '../http-provider';
import { publicJson } from '../../integrations/ans/transport';
import type { VerifiedIdentity } from '../../integrations/ans/directory';
import type { ContextDescriptor } from '../../integrations/ans/context-directory';
import { parseContextRequest, parseContextResponse, type ContextRequest } from './contract';
export class HttpContextAgent{
 constructor(private descriptor:ContextDescriptor,private identity:VerifiedIdentity,private token:string){}
 async query(input:ContextRequest,hop:0|1=0){
  const request=parseContextRequest(input),d=this.descriptor,i=this.identity;
  if(i.providerId!==d.id||i.baseUrl!==d.baseUrl||i.host!==d.agentHost||i.validUntil<=Date.now()||d.source==='ans'&&(i.source!=='ans'||!i.serverFingerprint)||this.token.length<32)throw Error('CONTEXT_IDENTITY_REJECTED');
  const url=providerUrl(d.baseUrl,d.source==='demo'),headers={Authorization:`Bearer ${this.token}`,'X-Beacon-Context-Hop':String(hop)};
  let value:unknown;
  if(d.source==='ans')value=(await publicJson(`${url.href.replace(/\/$/,'')}/query`,{method:'POST',body:request,headers,pin:i.serverFingerprint,timeoutMs:15000})).value;
  else {const response=await fetch(`${url.href.replace(/\/$/,'')}/query`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(request),redirect:'error',signal:AbortSignal.timeout(15000),cache:'no-store'});if(!response.ok)throw Error('CONTEXT_UNAVAILABLE');const raw=await response.text();if(raw.length>65536)throw Error('CONTEXT_RESPONSE_TOO_LARGE');value=JSON.parse(raw);}
  return parseContextResponse(value,request);
 }
}
