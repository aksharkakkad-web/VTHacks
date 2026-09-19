import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextAgent } from './context/service';
import { parseContextRequest, parseContextResponse, type ContextRequest } from './context/contract';
import { parseContextAgents } from '../integrations/ans/context-directory';
import { HttpContextAgent } from './context/http-client';
const now=Date.now(),request:ContextRequest={version:'beacon-context-v1',requestId:'request',corridorId:'newman-pritchard',topics:['waiting_places','lighting'],evaluatedAt:new Date(now).toISOString()};
const emptyReaders={now:()=>now,safety:()=>{throw Error('unavailable');},publicContext:()=>{throw Error('unavailable');}};
test('context privacy rejects precise location, unknown topics and stale clocks',()=>{
 assert.deepEqual(parseContextRequest(request,now),request);
 assert.throws(()=>parseContextRequest({...request,pickup:{lat:37,lng:-80}},now));
 assert.throws(()=>parseContextRequest({...request,topics:['shell']},now));
 assert.throws(()=>parseContextRequest(request,now+120001));
});
test('unavailable context stays explicit and delegation stops at one hop',async()=>{
 let calls=0;const agent=new ContextAgent({...emptyReaders,peers:async()=>{calls++;return [];}});
 const first=await agent.query(request);assert.equal(first.status,'unavailable');assert.ok(first.gaps.includes('NO_COMPATIBLE_RESEARCH_PEER'));
 const second=await agent.query(request,1);assert.equal(calls,1);assert.ok(second.gaps.includes('DELEGATION_HOP_LIMIT'));
 assert.deepEqual(parseContextResponse(second,request,now),second);
});
test('research source retrieval produces non-ranking leads and no search claim',async()=>{
 const agent=new ContextAgent({...emptyReaders,research:async r=>({schemaVersion:'beacon-public-research-v1',request:r,discoveryMethod:'fixed_official_sources',status:'sources_found',sources:[{url:'https://police.vt.edu/',discoveredUrl:'https://police.vt.edu/',title:'Published page',retrievedAt:new Date(now).toISOString(),pageTimestamp:null,pageTimestampKind:null,contentSha256:'a'.repeat(64),contentBytes:100,extraction:'page_metadata_only',coverageWarning:'not current'}],gaps:[],rankingEligible:false,limitations:[]})});
 const result=await agent.query(request);assert.equal(result.lookupMode,'fixed_official_sources');assert.equal(result.leads[0].rankingEligible,false);assert.equal(result.evidence.length,0);
 assert.deepEqual(parseContextResponse(result,request,now),result);
 assert.throws(()=>parseContextResponse({...result,leads:[{...result.leads[0],rankingEligible:true}]},request,now));
});
test('context capability cannot be inferred from transport tags',()=>{
 const a={agentId:'operator',agentHost:'example.com',agentDisplayName:'Example',status:'ACTIVE',endpoints:[{agentUrl:'https://example.com/context',protocol:'HTTP-API',functions:[{id:'query_context',tags:['beacon-context-v1']}]}]};
 assert.equal(parseContextAgents({agents:[a]}).length,1);
 assert.equal(parseContextAgents({agents:[{...a,endpoints:[{...a.endpoints[0],functions:[{id:'quote_trip',tags:['beacon-mobility-v2']}]}]}]}).length,0);
 assert.equal(parseContextAgents({agents:[{...a,agentHost:'other.example.com'}]}).length,0);
});
test('context client refuses mismatched identity before any network call',async()=>{
 const descriptor={id:'context',name:'Context',baseUrl:'https://example.com',agentHost:'example.com',source:'ans' as const,ansId:'a',profileVersion:'beacon-context-v1' as const};
 const client=new HttpContextAgent(descriptor,{providerId:'other',baseUrl:descriptor.baseUrl,host:descriptor.agentHost,source:'ans',validUntil:Date.now()+60000},'x'.repeat(32));
 await assert.rejects(client.query(request),/CONTEXT_IDENTITY_REJECTED/);
});
