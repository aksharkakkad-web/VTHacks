#!/usr/bin/env node
/** Explicit fixture example or authorized read-only service checks. Never persists audits. */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { compileTrack } from './build.mjs';
const args=process.argv.slice(2),liveDb=args.includes('--live-db'),liveRouting=args.includes('--live-routing');
const track=compileTrack();
const {planJourney}=track.load('lib/decision-client/journey-planner.js');
const {loadJourneyPlaces}=track.load('lib/decision-client/journey-data.js');
const {createWalkingRouter,distanceMeters}=track.load('lib/decision-client/walking-router.js');
const {assessPathEvidence}=track.load('lib/decision-client/path-evidence.js');
const {executeStatement}=track.load('integrations/databricks/statement.js');
const {loadFullTransit}=track.load('integrations/databricks/full-transit-query.js');
const at=new Date().toISOString(),plus=s=>new Date(Date.parse(at)+s*1000).toISOString();
const origin={id:'newman-reference',name:'Newman Library public reference point',point:{lat:37.2287881,lng:-80.41916034}};
const destination={id:'pritchard-reference',name:'Pritchard Hall public reference point',point:{lat:37.222,lng:-80.42}};
const request={objectiveVersion:1,origin,destination,evaluatedAt:at,budgetMinor:1000,tired:true,
 rides:[{offer:{operatorId:'demo-operator',serviceId:'demo-campus',quoteId:'fixture-quote',offerVersion:'1',displayName:'Simulated campus ride',mode:'campus_ride',source:'simulated',available:true,issuedAt:at,expiresAt:plus(120),admission:{serviceAreaMatch:true,authSupported:true,paymentSupported:true},price:{currency:'USD',kind:'fixed',totalMinor:200,includesAllFees:true},waitMinutes:5,travelMinutes:4,walkingMinutes:0,transfers:0},pickup:origin,dropoff:destination,pickupAt:plus(300),arrivalAt:plus(540),pickupPermitted:true}]};
let workspace;
if(liveDb){
 const env=process.env;
 if(!env.DATABRICKS_HOST||!env.DATABRICKS_WAREHOUSE_ID||!env.DATABRICKS_CONFIG_PROFILE&&!env.DATABRICKS_TOKEN) throw new Error('Configure the existing explicitly selected Databricks workspace/profile.');
 let token=env.DATABRICKS_TOKEN;
 if(!token){const r=spawnSync('databricks',['auth','token','--profile',env.DATABRICKS_CONFIG_PROFILE,'--host',env.DATABRICKS_HOST,'--output','json'],{encoding:'utf8',timeout:35000});if(r.status!==0)throw new Error('Databricks authentication failed');token=JSON.parse(r.stdout).access_token;}
 workspace={host:env.DATABRICKS_HOST,warehouseId:env.DATABRICKS_WAREHOUSE_ID,token};
}
const checks=[];
if(workspace){
 for(const statement of ["SELECT 1 AS reachable", "SELECT table_name, data_source_format FROM workspace.information_schema.tables WHERE table_schema='beacon' ORDER BY table_name", "SELECT source_sha256, CAST(captured_at AS STRING), CAST(service_start AS STRING), CAST(service_end AS STRING) FROM workspace.beacon.transit_imports ORDER BY captured_at DESC LIMIT 1", "SELECT CAST(count(*) AS STRING) AS audit_count FROM workspace.beacon.decision_events"]){const r=await executeStatement(workspace,{statement,timeoutMs:30000});checks.push({statementId:r.statementId,columns:r.columns,rows:r.rows});}
}
const places=loadJourneyPlaces(at);
const fixtureRoute=async(from,to)=>{const distance=distanceMeters(from,to),duration=Math.ceil(distance/1.2);return {routeId:'fixture-only-'+from.lat+'-'+to.lat,from,to,geometry:{type:'LineString',coordinates:[[from.lng,from.lat],[to.lng,to.lat]]},distanceMeters:distance,durationSeconds:duration,instructions:[{text:'Fixture path only; do not navigate this example.',distanceMeters:distance,durationSeconds:duration}],provider:'fixture_only',capturedAt:at,validUntil:plus(300)};};
const result=await planJourney({...request,waitingPlaces:places.waitingPlaces},{route:liveRouting?createWalkingRouter(process.env):fixtureRoute,evidence:assessPathEvidence,
 stops:places.stops,transitSourceSha256:places.transitSourceSha256,directTransit:workspace?q=>loadFullTransit({...workspace,transitSchema:'workspace.beacon'},q):undefined,rankOptions:{workspace,persistAudit:false}});
const output={checkedAt:new Date().toISOString(),routing:liveRouting?'live_requested':'fixture_only_not_live',providers:'simulated_not_booked',audit:'read_only_no_writes',checks,input:request,result};
const save=args.indexOf('--output');if(save>=0)writeFileSync(args[save+1],JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({checkedAt:output.checkedAt,routing:output.routing,providers:output.providers,checks,result},null,2));
if(liveDb&&result.execution.engine!=='databricks')process.exitCode=1;
if(liveRouting&&!result.selected?.legs.some(l=>l.route?.provider==='google_routes')&&!result.alternatives.some(j=>j.legs.some(l=>l.route?.provider==='google_routes')))process.exitCode=1;
