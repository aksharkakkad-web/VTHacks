import test from 'node:test';
import assert from 'node:assert/strict';
import { googleWalkingRoute, parseWalkingRoute } from '../lib/routing/google-routes';
const input={origin:{lat:37.2,lng:-80.4},destination:{lat:37.21,lng:-80.41}};
const result={routes:[{duration:'123.5s',distanceMeters:123,polyline:{geoJsonLinestring:{type:'LineString',coordinates:[[-80.4,37.2],[-80.41,37.21]]}},legs:[{steps:[{navigationInstruction:{instructions:'Walk north'},distanceMeters:123,staticDuration:'123.5s'}]}],warnings:['Walking route may have missing sidewalks.']}]};
test('Google routing stays disabled until explicit API access and billing enablement',async()=>{
 let calls=0;assert.deepEqual(await googleWalkingRoute(input,{enabled:false,apiKey:'key',fetch:async()=>{calls++;throw Error();}}),{status:'unavailable',reason:'ACCESS_PENDING'});assert.equal(calls,0);
});
test('walking adapter supplies source geometry duration and directions without ranking',async()=>{
 const response=await googleWalkingRoute(input,{enabled:true,apiKey:'private-key',fetch:async(url,init)=>{assert.equal(url,'https://routes.googleapis.com/directions/v2:computeRoutes');assert.equal(init?.redirect,'error');const body=JSON.parse(String(init?.body));assert.equal(body.travelMode,'WALK');assert.equal(Object.hasOwn(body,'routingPreference'),false);assert.equal(Object.hasOwn(body,'student'),false);return Response.json(result);}});
 assert.equal(response.status,'available');if(response.status==='available'){assert.equal(response.route.durationSeconds,123.5);assert.equal(response.route.safetyStatus,'not_assessed');assert.equal(response.route.closureStatus,'not_checked');assert.equal(response.route.steps[0].instruction,'Walk north');assert.ok(!JSON.stringify(response).includes('private-key'));}
});
test('routing validates geometry and preserves unknown missing step metrics',()=>{
 assert.throws(()=>parseWalkingRoute({routes:[{...result.routes[0],polyline:{geoJsonLinestring:{type:'LineString',coordinates:[[200,37],[-80,37]]}}}]}));
 const parsed=parseWalkingRoute({routes:[{...result.routes[0],legs:[{steps:[{}]}]}]});assert.equal(parsed?.steps[0].durationSeconds,null);
});
test('routing failure and empty result do not invent a path or leak upstream errors',async()=>{
 assert.deepEqual(await googleWalkingRoute(input,{enabled:true,apiKey:'key',fetch:async()=>new Response('secret billing details',{status:403})}),{status:'unavailable',reason:'UPSTREAM_UNAVAILABLE'});
 assert.deepEqual(await googleWalkingRoute(input,{enabled:true,apiKey:'key',fetch:async()=>Response.json({routes:[]})}),{status:'unavailable',reason:'NO_ROUTE'});
});
