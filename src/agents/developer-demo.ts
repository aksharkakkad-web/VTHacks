import { demoDescriptors } from './demo-provider';
import type { ProviderDescriptor } from './contract';
import { providerUrl } from './http-provider';
export const lyftDemoDescriptor:ProviderDescriptor={...demoDescriptors[2],id:'lyft-demo',serviceId:'lyft-demo',name:'Lyft-style developer agent — simulated',baseUrl:'http://127.0.0.1:4314',profileVersion:'beacon-mobility-v2'};
export const developerDemoDescriptors=[...demoDescriptors,lyftDemoDescriptor];
/** Shared operator examples. No claim of affiliation or actual Lyft API access. */
export function configuredDemoDescriptors(origin?:string,includeLyft=false){
 const seeds=includeLyft?developerDemoDescriptors:demoDescriptors;
 if(!origin)return seeds;
 const url=providerUrl(origin,true);if(url.pathname!=='/')throw Error('INVALID_PROVIDER_ORIGIN');
 return seeds.map(d=>({...d,baseUrl:`${url.origin}/api/demo/providers/${d.id}`,agentHost:url.hostname}));
}
