import { object, text } from '../../agents/contract';
import { providerUrl } from '../../agents/http-provider';
import { GoDaddyDirectory, type VerifiedIdentity } from './directory';
import { publicJson } from './transport';
export type ContextDescriptor={id:string;name:string;baseUrl:string;agentHost:string;source:'ans'|'demo';ansId?:string;profileVersion:'beacon-context-v1'};
export interface ContextDirectory {discover():Promise<ContextDescriptor[]>;verify(descriptor:ContextDescriptor):Promise<VerifiedIdentity>}
export function parseContextAgents(value:unknown):ContextDescriptor[]{
 const r=object(value);if(!Array.isArray(r.agents))throw Error('INVALID_CONTEXT_DIRECTORY');
 const result:ContextDescriptor[]=[];
 for(const raw of r.agents)try{
  const a=object(raw);if(a.status!=='ACTIVE'||!Array.isArray(a.endpoints)||(a.expiresAt!==undefined&&!(Date.parse(String(a.expiresAt))>Date.now())))continue;
  for(const rawEndpoint of a.endpoints){const e=object(rawEndpoint);if(e.protocol!=='HTTP-API'||!Array.isArray(e.functions)||!e.functions.some(f=>{const c=object(f);return c.id==='query_context'&&Array.isArray(c.tags)&&c.tags.includes('beacon-context-v1');}))continue;
   const baseUrl=text(e.agentUrl,'context URL',2000),url=providerUrl(baseUrl),agentHost=text(a.agentHost,'host',253).toLowerCase(),ansId=text(a.agentId,'agent id');
   if(url.hostname!==agentHost)continue;
   if(!result.some(p=>p.id===`${ansId}:context`))result.push({id:`${ansId}:context`,name:text(a.agentDisplayName,'name'),baseUrl,agentHost,ansId,source:'ans',profileVersion:'beacon-context-v1'});
  }
 }catch{/* Unsupported capabilities are not callable context peers. */}
 return result.slice(0,32);
}
export class AnsContextDirectory implements ContextDirectory{
 private identity:GoDaddyDirectory;private api:string;
 constructor(private options:{apiBase?:string;apiKey?:string;query?:string}={}){this.identity=new GoDaddyDirectory(options);this.api=options.apiBase??'https://api.godaddy.com';}
 async discover(){const query=new URLSearchParams({agentDisplayName:this.options.query??'Beacon',protocol:'HTTP-API',status:'ACTIVE',limit:'100'});return parseContextAgents((await publicJson(`${this.api}/v1/agents?${query}`,{headers:this.options.apiKey?{Authorization:`sso-key ${this.options.apiKey}`}:{}})).value);}
 verify(d:ContextDescriptor){return this.identity.verify(d);}
}
export class LocalContextDirectory implements ContextDirectory{
 constructor(private descriptor:ContextDescriptor){}
 async discover(){return[this.descriptor];}
 async verify(d:ContextDescriptor):Promise<VerifiedIdentity>{if(d.source!=='demo'||d.id!==this.descriptor.id||d.baseUrl!==this.descriptor.baseUrl)throw Error('CONTEXT_IDENTITY_REJECTED');providerUrl(d.baseUrl,true);return{providerId:d.id,host:d.agentHost,baseUrl:d.baseUrl,source:'local-demo',validUntil:Date.now()+60000};}
}
