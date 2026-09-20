import type { ActivityStore } from "../agent-activity/store";
import type { Fact, Intent, Explanation, PlannerCompletion, PlanningView } from "./contracts";
import type { PlannerQueue } from "./queue";
import { digest, validateOutput } from "./validation";

export type PlanningSnapshot = { snapshotId:string; terminal:boolean; input:Record<string,unknown>; selectedPlanId?:string; expiresAt?:number; facts?:Fact[] };
export type PlanningSelection = { snapshotId:string; selectedPlanId:string; expiresAt:number; facts:Fact[] };
export interface PlanningTripAdapter {
  snapshot(tripId:string,owner:string):Promise<PlanningSnapshot>;
  evaluate(tripId:string,owner:string,expectedSnapshotId:string,intent:Intent):Promise<PlanningSelection>;
}

function selectedTemplateFacts(facts:Fact[]){const required=facts.filter(f=>f.id.startsWith("limitation_"));const ordinary=facts.filter(f=>!f.id.startsWith("limitation_")).slice(0,Math.max(0,4-required.length));return[...ordinary,...required].slice(0,4);}
function template(facts:Fact[]){return selectedTemplateFacts(facts).map(f=>f.text).join(" ");}
function grounded(value:unknown,run:{snapshotId:string;selectedPlanId?:string;facts?:Fact[]}){
  const output=validateOutput("student-explanation",value) as Explanation;
  if(output.snapshotId!==run.snapshotId||output.selectedPlanId!==run.selectedPlanId)throw new Error("STALE_SNAPSHOT");
  const facts=new Map((run.facts??[]).map(f=>[f.id,f.text]));
  if(!output.sentences.length)throw new Error("UNSUPPORTED_EXPLANATION");
  for(const sentence of output.sentences){
    if(sentence.factIds.length!==1||facts.get(sentence.factIds[0])!==sentence.text)throw new Error("UNSUPPORTED_EXPLANATION");
  }
  const cited=new Set(output.sentences.flatMap(s=>s.factIds));
  if((run.facts??[]).some(f=>f.id.startsWith("limitation_")&&!cited.has(f.id)))throw new Error("UNSUPPORTED_EXPLANATION");
  return output.sentences.map(s=>s.text).join(" ");
}

export class HybridPlanner {
 private evaluating = new Map<string,{stageToken:string;inputHash:string}>();
 constructor(private queue:PlannerQueue,private trips:PlanningTripAdapter,private now:()=>number=Date.now,private activity?:ActivityStore){}

 async start(owner:string,tripId:string){
  const snapshot=await this.trips.snapshot(tripId,owner);
  if(snapshot.terminal)throw new Error("TRIP_TERMINAL");
  await this.queue.requirePair(owner);
  const existing=await this.queue.readRun(tripId);
  if(existing&&existing.owner===owner&&(existing.snapshotId!==snapshot.snapshotId||(existing.selectionExpiresAt??Infinity)<=this.now()||(snapshot.expiresAt??Infinity)<=this.now()))await this.queue.invalidate(tripId);
  const result=await this.queue.startRun(owner,tripId,snapshot.snapshotId,snapshot.input),run=await this.queue.readRun(tripId),job=run&&await this.queue.readJob(run.jobId);
  if(job)await this.activity?.emit(tripId,{runId:result.runId,requestId:job.jobId,eventId:`${job.jobId}-request`,sender:"student",recipient:"planner",operation:"planner.intent",phase:"request",execution:"not_called",safeData:{}});
  return result;
 }

 async complete(completion:PlannerCompletion){
  const job=await this.queue.readJob(completion.jobId);
  if(!job)throw new Error("STALE_LEASE");
  if(job.resultHash){await this.queue.complete(completion);return;}
  const current=await this.trips.snapshot(job.tripId,job.owner);
  const run=await this.queue.readRun(job.tripId);
  if(!run||run.id!==job.runId||current.terminal||current.snapshotId!==job.snapshotId||(job.role==="student-explanation"&&((run.selectionExpiresAt??0)<=this.now()||(current.expiresAt??0)<=this.now()||run.snapshotId!==job.snapshotId)))throw new Error("STALE_SNAPSHOT");
  await this.queue.complete(completion);
 }

 async tick(){
  const stage=await this.queue.claimReadyStage();
  if(!stage)return {advanced:false};
  const {run,job,stageToken}=stage;
  try{
   if(job.role==="student-intent"){
    if(job.state==="failed"||!job.result){
     await this.queue.finishRun(run,stageToken,{phase:"unavailable",messageCode:`PLANNER_${job.result?.errorCode??"UNAVAILABLE"}`,explanationSource:"none"});
     await this.activity?.emit(run.tripId,{runId:run.id,requestId:job.jobId,eventId:`${job.jobId}-rejected`,sender:"planner",recipient:"student",operation:"planner.intent",phase:"rejected",execution:"not_called",safeData:{}});
     return{advanced:true};
    }
    const intent=validateOutput("student-intent",job.result.output) as Intent;
    await this.activity?.emit(run.tripId,{runId:run.id,requestId:job.jobId,eventId:`${job.jobId}-response`,sender:"planner",recipient:"student",operation:"planner.intent",phase:"response",execution:"live",safeData:{model:job.result.model}});
    if(intent.clarification){await this.queue.finishRun(run,stageToken,{phase:"needs_input",messageCode:"PLANNER_NEEDS_INPUT",model:job.result.model,explanationSource:"none"});return{advanced:true};}
    const current=await this.trips.snapshot(run.tripId,run.owner);
    if(current.terminal)throw new Error("STALE_SNAPSHOT");
    await this.queue.setRunPhase(run.tripId,run.id,stageToken,"gathering","PLANNER_GATHERING");
    if(current.snapshotId===run.snapshotId&&!current.selectedPlanId)this.evaluating.set(run.id,{stageToken,inputHash:digest(current.input)});
    const selection=current.selectedPlanId&&current.expiresAt&&current.expiresAt>this.now()&&current.facts?.length?{snapshotId:current.snapshotId,selectedPlanId:current.selectedPlanId,expiresAt:current.expiresAt,facts:current.facts}:current.snapshotId===run.snapshotId?await this.trips.evaluate(run.tripId,run.owner,run.snapshotId,intent):(()=>{throw new Error("STALE_SNAPSHOT");})();
    if(selection.expiresAt<=this.now())throw new Error("STALE_SNAPSHOT");
    const explanationJob=await this.queue.queueExplanation(run,stageToken,selection);
    await this.activity?.emit(run.tripId,{runId:run.id,requestId:explanationJob.jobId,eventId:`${explanationJob.jobId}-request`,sender:"student",recipient:"planner",operation:"planner.explain",phase:"request",execution:"not_called",safeData:{},evidenceIds:selection.facts.map(f=>f.id)});
    return{advanced:true};
   }
   if(job.role==="student-explanation"){
    const current=await this.trips.snapshot(run.tripId,run.owner);
    if(current.terminal||current.snapshotId!==run.snapshotId||(run.selectionExpiresAt??0)<=this.now())throw new Error("STALE_SNAPSHOT");
    let explanation:string,source:PlanningView["explanationSource"]="template",model:string|undefined;
    if(job.state==="succeeded"&&job.result){try{explanation=grounded(job.result.output,run);source="llm_grounded";model=job.result.model;}catch{explanation=template(run.facts??[]);}}
    else explanation=template(run.facts??[]);
    if(!explanation)throw new Error("EXPLANATION_UNAVAILABLE");
    await this.queue.finishRun(run,stageToken,{phase:"ready",messageCode:source==="llm_grounded"?"PLAN_READY_GROUNDED":"PLAN_READY_TEMPLATE",explanation,model,explanationSource:source});
    await this.activity?.emit(run.tripId,{runId:run.id,requestId:job.jobId,eventId:`${job.jobId}-response`,sender:"planner",recipient:"student",operation:"planner.explain",phase:"response",execution:source==="llm_grounded"?"live":"local_fallback",safeData:{model:model??"",factCount:(run.facts??[]).length,explanationSource:source},evidenceIds:(run.facts??[]).map(f=>f.id)});
    return{advanced:true};
   }
   await this.queue.finishRun(run,stageToken,{phase:"unavailable",messageCode:"UNSUPPORTED_PLANNER_STAGE",explanationSource:"none"});
   return{advanced:true};
  }catch(error){
   await this.queue.finishRun(run,stageToken,{phase:"unavailable",messageCode:error instanceof Error&&error.message==="STALE_SNAPSHOT"?"PLANNER_STALE_SNAPSHOT":"PLANNER_STAGE_UNAVAILABLE",explanationSource:"none"}).catch(()=>{});
   throw error;
  }finally{this.evaluating.delete(run.id);}
 }

 async view(owner:string,tripId:string):Promise<PlanningView>{
  const current=await this.trips.snapshot(tripId,owner);const run=await this.queue.readRun(tripId);const worker=await this.queue.worker();
  if(!run||run.owner!==owner)return{version:"beacon-planning-v1",runId:"none",phase:"unavailable",worker:worker.state,modelSource:"none",explanationSource:"none",snapshotId:null,messageCode:"PLANNER_NOT_STARTED"};
  // Our active evaluator changes the trip snapshot before queueExplanation binds
  // the new selection. Expose only progress during that leased operation, never
  // old prose or confirmation authority. Changed objective inputs remain stale.
  const evaluating=this.evaluating.get(run.id);
  if(evaluating&&run.phase==="gathering"&&run.stageToken===evaluating.stageToken&&(run.stageUntil??0)>this.now()&&!current.terminal&&(current.expiresAt??Infinity)>this.now()&&digest(current.input)===evaluating.inputHash)
   return{version:"beacon-planning-v1",runId:run.id,phase:"gathering",worker:worker.state,modelSource:"none",explanationSource:"none",snapshotId:null,messageCode:"PLANNER_GATHERING"};
  // Polling is read-only: changed/expired selections need an explicit planning action.
  const stale=current.terminal||current.snapshotId!==run.snapshotId||(run.selectionExpiresAt??Infinity)<=this.now()||(current.expiresAt??Infinity)<=this.now();
  return{version:"beacon-planning-v1",runId:run.id,phase:stale?"unavailable":run.phase,worker:worker.state,modelSource:run.model?"codex_subscription":"none",explanationSource:stale?"none":run.explanationSource,snapshotId:stale?null:run.snapshotId,messageCode:stale?"PLANNER_STALE_SNAPSHOT":run.messageCode,...(!stale&&run.model?{model:run.model}:{}),...(!stale&&run.explanation?{explanation:run.explanation}:{})};
 }
}
