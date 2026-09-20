import { join } from "node:path";
import { tmpdir } from "node:os";
import { getRuntime as getTripRuntime } from "../trip-state/runtime";
import { redisConfiguration } from "../trip-state/redis-config";
import { getActivityRuntime } from "../agent-activity/runtime";
import { FileJsonStore, RedisJsonStore } from "./store";
import { emptyPlannerState, PlannerQueue } from "./queue";
import { DeterministicPlanner, HybridPlanner } from "./orchestrator";

type PlannerRuntime={queue:PlannerQueue;planner:HybridPlanner;deterministic:DeterministicPlanner};
const shared=globalThis as typeof globalThis&{beaconPlanner?:PlannerRuntime};
export function getPlannerRuntime():PlannerRuntime{
 if(shared.beaconPlanner)return shared.beaconPlanner;
 const redis=redisConfiguration();
 if(process.env.VERCEL&&!redis)throw new Error("A shared Redis planner store is required on Vercel");
 const state=redis?new RedisJsonStore(redis.url,redis.token,"beacon:planner:v1",emptyPlannerState):new FileJsonStore(join(process.env.BEACON_STATE_DIR??join(tmpdir(),"beacon-trips-local"),"planner-v1.json"),emptyPlannerState());
 const queue=new PlannerQueue(state),agent=getTripRuntime().agent;
 const adapter={snapshot:(tripId:string,owner:string)=>agent.planningSnapshot(tripId,owner),evaluate:(tripId:string,owner:string,snapshotId:string,intent:Parameters<typeof agent.planningEvaluate>[3])=>agent.planningEvaluate(tripId,owner,snapshotId,intent)};
 const planner=new HybridPlanner(queue,adapter,Date.now,getActivityRuntime());
 const deterministic=new DeterministicPlanner(adapter);
 return shared.beaconPlanner={queue,planner,deterministic};
}

export function activePlanner(){
 const runtime=getPlannerRuntime();
 if(process.env.BEACON_PLANNER_MODE==="deterministic")return runtime.deterministic;
 if(process.env.BEACON_PLANNER_MODE==="codex_laptop")return runtime.planner;
 throw new Error("SERVICE_NOT_CONFIGURED");
}
