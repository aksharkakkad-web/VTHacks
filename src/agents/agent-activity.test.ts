import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityStore, emptyActivity } from '../lib/agent-activity/store';
import { MemoryJsonStore } from '../lib/planner/store';
import { safeFields } from '../lib/agent-activity/redaction';
test('activity orders concurrent writes and idempotently pairs actual dispatch',async()=>{
 const storage=new MemoryJsonStore(emptyActivity()),events=new ActivityStore(()=>storage);
 await Promise.all(Array.from({length:8},(_,i)=>events.emit('trip',{eventId:`event${i}`,sender:'student',recipient:'ans',operation:'directory.discover',phase:'request'})));
 await events.call('trip',{sender:'student',recipient:'provider',operation:'provider.quote'},async()=>7,r=>({safeData:{costMinor:r}}));
 const page=await events.read('trip');assert.deepEqual(page.events.map(e=>e.sequence),Array.from({length:10},(_,i)=>i+1));
 const [request,response]=page.events.slice(-2);assert.equal(request.requestId,response.requestId);assert.equal(response.safeData.costMinor,7);
 await events.emit('trip',{eventId:'event0',sender:'student',recipient:'ans',operation:'directory.discover',phase:'request'});assert.equal((await events.read('trip')).events.length,10);
});
test('allowlists discard nested secrets, private coordinates, raw errors and domains',()=>{
 const fields=safeFields('provider.quote',{costMinor:100,currency:'USD',waitMinutes:3,token:'secret',pickup:{lat:37,lng:-80},engine:'geta36.app',quoteExpiresAt:'https://geta36.app/secret'});
 assert.deepEqual(fields,{costMinor:100,currency:'USD',waitMinutes:3});
 assert.deepEqual(safeFields('decision.evaluate',{engine:'https://geta36.app',candidateCount:2}),{candidateCount:2});
});
test('failed telemetry never retries an external booking and exposes a trace gap',async()=>{
 const events=new ActivityStore(()=>({read:async()=>emptyActivity(),update:async()=>{throw Error('offline');}}));let bookings=0;
 assert.equal(await events.call('trip',{sender:'student',recipient:'provider',operation:'provider.book'},async()=>++bookings),1);
 assert.equal(bookings,1);assert.equal((await events.read('trip')).traceGap,true);
});
test('provider failures preserve original rejection without storing exception text',async()=>{
 const storage=new MemoryJsonStore(emptyActivity()),events=new ActivityStore(()=>storage);
 await assert.rejects(events.call('trip',{sender:'student',recipient:'provider',operation:'provider.book'},async()=>{throw Error('secret geta36.app');}));
 const page=await events.read('trip');assert.equal(page.events[1].phase,'rejected');assert.equal(JSON.stringify(page).includes('geta36.app'),false);
});
test('retention reports truncation and arrival leaves only a safe terminal event',async()=>{
 let now=1000000;const storage=new MemoryJsonStore(emptyActivity()),events=new ActivityStore(()=>storage,()=>now);
 for(let i=0;i<505;i++)await events.emit('trip',{sender:'student',recipient:'planner',operation:'planner.intent',phase:'info'});
 const page=await events.read('trip');assert.equal(page.truncated,true);assert.equal(page.events.length,100);
 await events.clear('trip');assert.equal((await events.read('trip')).events.length,1);
 now+=86400001;assert.equal((await events.read('trip')).events.length,0);
});
