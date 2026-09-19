import { operations, type ActivityInput, type Operation } from './contracts';
const identities = ['student','planner','safety-research','route-context','context','transit','campus_ride','independent_ride','lyft-demo','provider','research-peer','databricks','ans','authorization','monitor','telegram','public-sources','code'];
const fields:Record<Operation,readonly string[]> = {
 'planner.intent':['model','priorityCount','topicCount','workerState'], 'planner.explain':['model','factCount','explanationSource'],
 'directory.discover':['providerCount','peerCount'], 'identity.verify':['verified','serviceCount'],
 'provider.quote':['available','costMinor','currency','waitMinutes','walkingMinutes','simulated','quoteExpiresAt'],
 'context.query':['evidenceCount','gapCount','leadCount','lookupMode'], 'context.delegate':['evidenceCount','gapCount','peerCount'],
 'source.lookup':['evidenceCount','leadCount','lookupMode'], 'decision.evaluate':['engine','candidateCount','rejectedCount','costMinor'],
 'plan.validate':['accepted','factCount','remainingBudgetMinor'], 'student.confirm':['confirmed'], 'booking.authorize':['authorized','amountMinor','currency'],
 'provider.book':['status','simulated','amountMinor','currency'], 'provider.status':['status','simulated'], 'provider.cancel':['status','simulated'],
 'payment.settle':['state','amountMinor','retainedMinor','currency','simulated'], 'trip.replan':['replanCount','remainingBudgetMinor'],
 'trip.arrive':['arrived'], 'notification.send':['delivered','simulated'],
};
const enums:Record<string,readonly string[]> = {
 model:['gpt-5.6-sol','gpt-5.6-terra'],workerState:['online','offline','auth_required','rate_limited'],currency:['USD'],
 status:['requested','accepted','waiting','arriving','arrived','in_progress','completed','cancelled','declined','unknown'],
 state:['authorized','captured','voided','refunded','partially_refunded','declined','pending','unknown'],
 engine:['databricks','local','local_policy','local_fallback','managed','local_snapshot'],
 explanationSource:['llm_grounded','template','none'], lookupMode:['fixed_official_sources','not_called'],
};
export function safeFields(operation:Operation, data:Record<string,unknown> = {}) {
 const result:Record<string,string|number|boolean|null> = {};
 for(const key of fields[operation]) {
  const value=data[key];
  if(value===null || typeof value==='boolean') result[key]=value;
  else if(typeof value==='number' && Number.isFinite(value) && value>=0 && value<=1e9) result[key]=value;
  else if(typeof value==='string' && enums[key]?.includes(value)) result[key]=value;
  else if(key==='quoteExpiresAt' && typeof value==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value))) result[key]=value;
 }
 return result;
}
export function validateActivity(input:ActivityInput) {
 if(!operations.includes(input.operation)||!identities.includes(input.sender)||!identities.includes(input.recipient)||!['request','response','rejected','timeout','info'].includes(input.phase)) throw new Error('INVALID_ACTIVITY');
 if(input.execution&&!['live','simulated','local_fallback','not_called'].includes(input.execution))throw new Error('INVALID_ACTIVITY');
 if(input.identity&&!['ans_verified','local_demo','not_verified','not_applicable'].includes(input.identity))throw new Error('INVALID_ACTIVITY');
}
export function opaque(value:string|null|undefined) { return value && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : undefined; }
