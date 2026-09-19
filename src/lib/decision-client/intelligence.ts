import type { DecisionContext, DecisionResult } from "./decision";
import type { RouteEvidence } from "./route-evidence";
export type EvidenceFact = { id:string; text:string; sourceUrl?:string; sourceKind:string };
export type EvidenceBrief = { status:DecisionResult["status"]; selectedPlanId:string|null; facts:EvidenceFact[]; requiredFactIds:string[]; alternatives:{planId:string;costDifference:number;walkingDifference:number}[] };
const money = (value:number) => `$${value.toFixed(2)}`;
const minutes = (value:number) => Number(value.toFixed(1));
/** Facts are generated from accepted numeric results, never provider prose or model assertions. */
export function buildEvidenceBrief(decision:DecisionResult,context:DecisionContext,route?:RouteEvidence|null):EvidenceBrief {
  const facts:EvidenceFact[] = [];
  const selected = decision.status === "RECOMMENDED" ? decision.ranked.find(p=>p.planId===decision.recommendation.selectedPlanId)! : undefined;
  const alternatives:EvidenceBrief["alternatives"] = [];
  facts.push({id:"selected",text:selected ? `Recommended option costs ${money(selected.cost)}, takes ${minutes(selected.totalMinutes)} minutes overall and includes ${minutes(selected.walkingMinutes)} minutes of walking.` : decision.status === "EMERGENCY" ? "Use the emergency-help flow; no ride has been selected or contacted." : "No option meets the current constraints. No ride has been selected.",sourceKind:"verified_calculation"});
  facts.push({id:"limitations",text:"This is not a safety guarantee. Lighting, current campus crime alerts, path closures and phone working condition may be unknown. Historical reports do not predict danger.",sourceKind:"coverage_limit"});
  const requiredFactIds = ["selected","limitations"];
  if (selected) {
    facts.push({id:"source",text:`Selected option evidence is ${selected.source}; decision engine is ${decision.engine}. Scheduled means timetable, not live vehicle tracking.`,sourceKind:"provenance"});
    requiredFactIds.push("source");
    facts.push({id:"budget",text:`Your budget is ${money(context.maxBudget)}; this option leaves ${money(context.maxBudget-selected.cost)} within that limit.`,sourceKind:"verified_calculation"});
    facts.push({id:"preference",text:context.priority==="lowest_cost" ? "Lowest cost is your priority; the choice is the cheapest eligible option." : context.minimizeWalking || context.priority==="less_exposed" ? "Your reduced-walking preference increases the weight of walking in the comparison; it is not a crime-risk score." : "The choice balances waiting, travel, walking, price, transfers and available reliability evidence.",sourceKind:"policy"});
    for (const [i,other] of decision.ranked.filter(p=>p.planId!==selected.planId).slice(0,3).entries()) {
      const costDifference = Math.round((other.cost-selected.cost)*100)/100;
      const walkingDifference = minutes(other.walkingMinutes-selected.walkingMinutes);
      alternatives.push({planId:other.planId,costDifference,walkingDifference});
      facts.push({id:`alternative_${i+1}`,text:`Alternative ${i+1} costs ${money(other.cost)} and includes ${minutes(other.walkingMinutes)} minutes of walking: ${money(Math.abs(costDifference))} ${costDifference<0?"less":"more"} and ${Math.abs(walkingDifference)} minutes ${walkingDifference<0?"less":"more"} walking than the selection.`,sourceKind:"verified_calculation"});
    }
    if (selected.evidence?.weather && selected.evidence.weather!=="unknown") facts.push({id:"weather",text:`Current matched weather category: ${selected.evidence.weather}. Rain increases the walking penalty under policy beacon-v2; severe weather rules out walking-only options.`,sourceUrl:"https://api.weather.gov/gridpoints/RNK/58,66/forecast/hourly",sourceKind:"official_forecast"});
  }
  if (Object.keys(decision.rejected).length) facts.push({id:"excluded",text:`${Object.keys(decision.rejected).length} option(s) were excluded by constraints or evidence checks; excluded options are not alternatives.`,sourceKind:"verified_calculation"});
  if(route && decision.status!=="EMERGENCY") {
    facts.push({id:"route",text:route.status==="supported" ? `Mapped full walking alternative for ${route.origin} to ${route.destination}: ${Math.round(route.distance_meters!)} meters along connected campus-path geometry. This is not the ride's pickup or drop-off walking route.` : `A connected walking path for ${route.origin} to ${route.destination} is not established by this dataset.`,sourceKind:"official_map_snapshot",sourceUrl:route.source_url});
    facts.push({id:"route_limits",text:`Route lighting coverage: ${route.lighting.known_meters} meters known, ${route.lighting.unknown_meters??"all"} meters unknown. ${route.limitations.join(" ")}`,sourceKind:"coverage_limit",sourceUrl:route.source_url});
    requiredFactIds.push("route_limits");
    if(route.status==="supported") {
      facts.push({id:"resources",text:`${route.nearby_phones.length} mapped emergency phone(s) lie within 50 meters of this full walking path. This is geometric proximity, not verified access or working condition.`,sourceKind:"official_map_snapshot",sourceUrl:route.nearby_phones[0]?.source_url??route.source_url});
      if(route.historical_reports.length) {
        facts.push({id:"history",text:`${route.historical_reports.length} selected historical report(s) match the named endpoint places. This is an incomplete sample, not reports along the path, a crime rate, or a current alert.`,sourceKind:"historical_sample",sourceUrl:route.historical_reports[0].source_url});
      }
    }
  }
  return {status:decision.status,selectedPlanId:selected?.planId??null,facts,requiredFactIds,alternatives};
}
/** Model can curate only existing fact identifiers; extra fields and unknown/duplicate IDs fail closed. */
export function validateEvidenceOrder(raw:string,brief:EvidenceBrief):string[] {
  if(raw.length>8192) throw new Error("AI_OUTPUT_INVALID");
  const parsed:unknown = JSON.parse(raw);
  if(!parsed || typeof parsed!=="object" || Array.isArray(parsed) || Object.keys(parsed).length!==1 || !("fact_ids" in parsed)) throw new Error("AI_OUTPUT_INVALID");
  const ids = parsed.fact_ids;
  if(!Array.isArray(ids) || ids.length<1 || ids.length>8 || !ids.includes("selected") || new Set(ids).size!==ids.length || ids.some(id=>typeof id!=="string" || !brief.facts.some(f=>f.id===id))) throw new Error("AI_OUTPUT_INVALID");
  return ids as string[];
}
export function renderBrief(brief:EvidenceBrief,ids:string[]):EvidenceFact[] {
  return [...new Set([...ids,...brief.requiredFactIds])].map(id=>brief.facts.find(f=>f.id===id)).filter((f):f is EvidenceFact=>!!f);
}
