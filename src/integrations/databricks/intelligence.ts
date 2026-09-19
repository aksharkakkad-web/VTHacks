import type { CandidatePlan } from "../../types/provider";
import type { DecisionContext,PlanSignals,DecisionResult } from "../../lib/decision-client/decision";
import { getRouteEvidence, type RouteEvidence } from "../../lib/decision-client/route-evidence";
import { buildEvidenceBrief } from "../../lib/decision-client/intelligence";
import { runDecision, type DecisionWorkspace } from "./evaluate";
import { explainEvidence, type Explanation } from "./explain";
import { executeStatement, qualifiedTable } from "./statement";
type Workspace=DecisionWorkspace & {routeEvidenceTable?:string};
type Options={workspace?:Workspace;fetch?:typeof fetch;corridorId?:string;enableAi?:boolean;aiTimeoutMs?:number;loadedRoute?:{evidence:RouteEvidence;statementId?:string;source:"databricks"|"local_snapshot"}};
export async function loadRouteEvidence(workspace:Workspace,corridorId:string,options:{fetch?:typeof fetch}={}):Promise<{evidence:RouteEvidence;statementId:string}|null>{
  if(!/^[a-z0-9-]{1,80}$/.test(corridorId)) throw new Error("INVALID_CORRIDOR");
  if(!workspace.routeEvidenceTable) return null;
  const result=await executeStatement(workspace,{statement:`SELECT payload_json FROM ${qualifiedTable(workspace.routeEvidenceTable)} WHERE corridor_id = :corridor LIMIT 1`,parameters:[{name:"corridor",value:corridorId,type:"STRING"}],timeoutMs:8000},options);
  if(result.columns.length!==1 || result.columns[0]!=="payload_json") throw new Error("INVALID_ROUTE_RESULT");
  if(!result.rows.length) return null;
  const evidence=getRouteEvidence(corridorId,[JSON.parse(result.rows[0][0]??"null")]);
  if(!evidence) throw new Error("ROUTE_CORRIDOR_MISMATCH");
  return {evidence,statementId:result.statementId};
}
/** Walking duration is an explicit 80 m/min estimate of mapped geometry, not doorstep navigation. */
export function walkingOption(route:RouteEvidence,at=new Date().toISOString()):{candidate:CandidatePlan;signals:PlanSignals}|null{
  const now=Date.parse(at),captured=Date.parse(route.captured_at);
  if(!Number.isFinite(now) || !Number.isFinite(captured) || captured>now || now-captured>7*86400000 || route.status!=="supported" || !route.distance_meters) return null;
  const construction=route.construction_avoidance;
  const constructionDeadline=construction?Date.parse(construction.valid_until??""):Infinity;
  if(construction && (construction.status!=="applied" || !Number.isFinite(constructionDeadline) || !Number.isFinite(Date.parse(construction.evaluated_at)) || Date.parse(construction.evaluated_at)>now || constructionDeadline<=now)) return null;
  const duration=Math.round(route.distance_meters/80*60)/60;
  return {candidate:{planId:`mapped:${route.corridor_id}`,providerId:null,providerName:"Mapped campus walking estimate (not doorstep navigation)",mode:"walk",available:true,cost:0,waitMinutes:0,travelMinutes:0,walkingMinutes:duration,totalMinutes:duration,requiresProviderVerification:false},signals:{source:"mapped",corridorId:route.corridor_id,dataVersion:route.source_version,validUntil:new Date(Math.min(now+120000,captured+7*86400000,constructionDeadline)).toISOString(),lighting:"unknown"}};
}
export async function runIntelligence(plans:CandidatePlan[],context:DecisionContext,signals:Record<string,PlanSignals>,options:Options={}):Promise<{decision:DecisionResult;route:RouteEvidence|null;explanation:Explanation;warnings:string[];routeStatementId?:string}>{
  const began=Date.now();
  const warnings:string[]=[];
  let decision=await runDecision(plans,context,signals,options);
  let route:RouteEvidence|null=null,routeStatementId:string|undefined;
  if(options.corridorId && decision.status!=="EMERGENCY") {
    try {
      const supplied=options.loadedRoute;
      const suppliedAt=supplied?Date.parse(supplied.evidence.captured_at):NaN;
      const at=Date.parse(context.evaluatedAt??decision.evaluatedAt);
      const validSupplied=supplied && suppliedAt<=at && at-suppliedAt<=7*86400000 && getRouteEvidence(options.corridorId,[supplied.evidence]);
      const result=validSupplied?supplied:options.workspace?await loadRouteEvidence(options.workspace,options.corridorId,{fetch:options.fetch}):null;
      if(result){route=result.evidence;routeStatementId=result.statementId;}
      if(validSupplied && supplied.source==="local_snapshot") warnings.push("LOCAL_ROUTE_SNAPSHOT");
    } catch { /* core decision remains usable; missing context is explicit below */ }
    if(!route) warnings.push("ROUTE_EVIDENCE_UNAVAILABLE");
  }
  let explanation=await explainEvidence(buildEvidenceBrief(decision,context,route),{workspace:options.workspace,fetch:options.fetch,enabled:options.enableAi,timeoutMs:options.aiTimeoutMs});
  const evaluated=Date.parse(context.evaluatedAt??decision.evaluatedAt);
  const completed=evaluated+Date.now()-began;
  const expired=Object.values(signals).some(s=>{
    const limit=Math.min(s.validUntil?Date.parse(s.validUntil):Infinity,s.source==="live"&&s.collectedAt?Date.parse(s.collectedAt)+120000:Infinity);
    return limit>evaluated&&limit<=completed;
  });
  if(expired){
    // Never let an AI delay revive an expired offer; recompute and discard the stale briefing.
    decision=await runDecision(plans,{...context,evaluationId:undefined,evaluatedAt:new Date(completed).toISOString()},signals,options);
    explanation=await explainEvidence(buildEvidenceBrief(decision,context,route));
    warnings.push("REEVALUATED_AFTER_EXPLANATION_DELAY");
  }
  if(explanation.warning) warnings.push(explanation.warning);
  return {decision,route,explanation,warnings,...(routeStatementId?{routeStatementId}:{})};
}
