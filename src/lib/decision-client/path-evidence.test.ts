import assert from 'node:assert/strict';
import test from 'node:test';
import { assessPathEvidence, type PathEvidenceSources } from './path-evidence';
import type { WalkingRoute } from './walking-router';
const at = '2026-09-19T20:00:00Z', captured = '2026-09-19T19:45:00Z', version = 'a'.repeat(64);
const from = {lng:-80.42,lat:37.23}, to = {lng:-80.419,lat:37.23};
const route: WalkingRoute = {routeId:'explicit-test-route',from,to,geometry:{type:'LineString',coordinates:[[-80.42,37.23],[-80.419,37.23]]},distanceMeters:89,durationSeconds:70,instructions:[{text:'Fixture walk',distanceMeters:89,durationSeconds:70}],provider:'offline_fixture',capturedAt:at,validUntil:'2026-09-19T20:05:00Z'};
const polygon = {type:'Polygon',coordinates:[[[-80.4196,37.2299],[-80.4194,37.2299],[-80.4194,37.2301],[-80.4196,37.2301],[-80.4196,37.2299]]]};
const url = 'https://arcgis-central.gis.vt.edu/arcgis/rest/services/facilities/Construction_Closures/FeatureServer/0/query';
function closureSources(): PathEvidenceSources { return {closures:{schema_version:1,dataset:'closures',captured_at:captured,sources:[{url,sha256:version,captured_at:captured,row_count:1,coverage:'test polygon',limitations:'explicit fixture'}],limitations:['fixture'],records:[{id:'test-closure',kind:'area',name:'Fixture closure',starts_at:'2026-09-19T19:00:00Z',ends_at:'2026-09-19T22:00:00Z',source_url:url,geometry:polygon}]}}; }
test('exact crossing of current polygon blocks even when neither endpoint lies inside', () => {
  const result = assessPathEvidence(route,at,closureSources()); assert.equal(result.blocked,true); assert.equal(result.facts[0].spatialMatch,'path_polygon_intersection'); assert.equal(result.validUntil,'2026-09-19T20:45:00.000Z');
});
test('nonintersecting line and stale snapshot cannot assert a current closure', () => {
  const elsewhere = {...route,geometry:{type:'LineString' as const,coordinates:[[-80.42,37.232],[-80.419,37.232]]}};
  assert.equal(assessPathEvidence(elsewhere,at,closureSources()).blocked,false);
  const stale = assessPathEvidence(route,'2026-09-19T22:00:00Z',closureSources()); assert.equal(stale.blocked,false); assert.match(stale.unknowns.join(' '),/closure coverage is unavailable or stale/);
});
test('mapped lamp and lit tag are inventory; unverified CRS measurements never produce illumination', () => {
  const result = assessPathEvidence(route,at,{lightingProvenance:{captured_at:captured,sha256:version,coordinate_reference_system:'EPSG:4326'},lighting:[{id:'lamp',kind:'street_lamp',geometry:{type:'Point',coordinates:[-80.4195,37.23]},verification:'community_unverified',source_url:'https://www.openstreetmap.org/node/1',last_edited_at:captured}]});
  assert.equal(result.facts.length,1); assert.equal(result.facts[0].confidence,'community_unverified'); assert.equal(result.facts[0].details.operationalStatus,'unknown'); assert.match(result.unknowns.join(' '),/coordinate reference system is unverified/);
});
test('historical report joins exact endpoint building polygon and explicit published name only', () => {
  const buildingPolygon = [[[-80.4201,37.2299],[-80.4199,37.2299],[-80.4199,37.2301],[-80.4201,37.2301],[-80.4201,37.2299]]];
  const sources = {buildings:{captured_at:captured,source_version:version,building_source_url:url,buildings:[{attributes:{name:'Pritchard Hall'},geometry:{rings:buildingPolygon}}]},crime:[{record_id:'r1',report_id:'1',location:'630 Washington St (Pritchard Hall)',reported_date:'2026-01-02',captured_at:captured,source_hash:version,source_url:'https://police.vt.edu/log.pdf',offense:'Published report',disposition:'Active',data_quality_flags:[]},{record_id:'r2',location:'Near Pritchard Hall',reported_date:'2026-01-02',captured_at:captured,source_hash:version,source_url:'https://police.vt.edu/log.pdf'}]};
  const result = assessPathEvidence(route,at,sources); assert.equal(result.facts.length,1); assert.equal(result.facts[0].spatialMatch,'exact_endpoint_building'); assert.equal(result.facts[0].details.completeCoverage,false); assert.equal(result.blocked,false);
});
test('missing sources remain unknown, never become a safety score or closure-free claim', () => {
  const result = assessPathEvidence(route,at,{}); assert.deepEqual(result.facts,[]); assert.equal(result.validUntil,null); assert.equal(result.blocked,false); assert.match(result.unknowns.join(' '),/coverage is unknown/);
});
test('repository public data can be assessed without external calls and preserves historical uncertainty', () => {
  const result = assessPathEvidence(route,at); assert.ok(result.unknowns.some(x => x.includes('unverified'))); assert.ok(result.facts.every(x => x.sourceUrl.startsWith('https://')));
});
test('upcoming intersecting closure expires the assessment before it starts', () => {
  const sources = closureSources();
  const closure = sources.closures as { records: {starts_at:string}[] };
  closure.records[0].starts_at = '2026-09-19T20:02:00Z';
  const result = assessPathEvidence(route,at,sources);
  assert.equal(result.blocked,false); assert.equal(result.validUntil,'2026-09-19T20:02:00.000Z');
});
test('severe current official weather blocks, stale official alert context stays unknown', () => {
  const sourceUrl = 'https://api.weather.gov/gridpoints/RNK/58,66/forecast/hourly';
  const sources = { weather: { schema_version:1,dataset:'weather',captured_at:captured,sources:[{url:sourceUrl,sha256:version,captured_at:captured,row_count:1,coverage:'campus reference forecast',limitations:'not a route observation'}],limitations:[],records:[{corridor_id:'newman-pritchard',weather:'severe',active_official_alert:true,updated_at:captured,valid_from:captured,valid_until:'2026-09-19T21:00:00Z',source_url:sourceUrl}] } };
  const result = assessPathEvidence(route,at,sources);
  assert.equal(result.blocked,true); assert.equal(result.facts[0].confidence,'forecast'); assert.equal(result.facts[0].details.routeObserved,false);
  assert.equal(assessPathEvidence(route,'2026-09-19T21:00:00Z',sources).blocked,false);
});
test('phone coordinates match only near the route and never claim working or accessible equipment', () => {
  const sources = { manifest: [{source_id:'vt-emergency-phones',source_url:url,sha256:version,captured_at:captured}],phones:[{source_id:'vt-emergency-phones',phone_id:'1',location:'Fixture phone',longitude:-80.4195,latitude:37.23},{source_id:'vt-emergency-phones',phone_id:'2',longitude:-80.43,latitude:37.23}] };
  const result = assessPathEvidence(route,at,sources); assert.equal(result.facts.length,1); assert.equal(result.facts[0].details.operationalStatus,'unknown'); assert.equal(result.facts[0].details.accessNow,'unknown');
});
