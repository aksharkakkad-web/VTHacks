import test from 'node:test';
import assert from 'node:assert/strict';
import { assessArrival } from '../lib/journey/arrival';
const home={lat:37,lng:-80};
test('arrival requires accurate fresh samples and continuous dwell',()=>{
 const a=assessArrival(undefined,{...home,accuracyMeters:10,recordedAt:100000},home,100000);assert.equal(a.arrived,false);
 const b=assessArrival(a.evidence,{...home,accuracyMeters:10,recordedAt:115000},home,115000);assert.equal(b.arrived,false);
 assert.equal(assessArrival(b.evidence,{...home,accuracyMeters:10,recordedAt:130000},home,130000).arrived,true);
});
test('poor accuracy, missing accuracy, stale samples and gaps cannot imply arrival',()=>{
 for(const accuracyMeters of [undefined,100,NaN,-1])assert.equal(assessArrival(undefined,{...home,accuracyMeters,recordedAt:100000},home,100000).evidence,undefined);
 const a=assessArrival(undefined,{...home,accuracyMeters:10,recordedAt:100000},home,100000);
 const b=assessArrival(a.evidence,{...home,accuracyMeters:10,recordedAt:140000},home,140000);assert.equal(b.evidence?.samples,1);
 assert.equal(assessArrival(a.evidence,{...home,accuracyMeters:10,recordedAt:110000},home,200000).evidence,undefined);
});
test('uncertainty circle must fit inside arrival area and leaving resets dwell',()=>{
 const result=assessArrival(undefined,{lat:37.0006,lng:-80,accuracyMeters:20,recordedAt:100000},home,100000);assert.equal(result.evidence,undefined);
});
