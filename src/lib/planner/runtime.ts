import { join } from "node:path";
import { tmpdir } from "node:os";
import { getRuntime as getTripRuntime } from "../trip-state/runtime";
import { redisConfiguration } from "../trip-state/redis-config";
import { getActivityRuntime } from "../agent-activity/runtime";
import { FileJsonStore, RedisJsonStore } from "./store";
import { emptyPlannerState, PlannerQueue } from "./queue";
import { HybridPlanner } from "./orchestrator";

type PlannerRuntime={queue:PlannerQueue;planner:HybridPlanner};
const shared=globalThis as typeof globalThis&{beaconPlanner?:PlannerRuntime};
export function getPlannerRuntime():PlannerRuntime{
 if(shared.beaconPlanner)return shared.beaconPlanner;
 const redis=redisConfiguration();
 if(process.env.VERCEL&&!redis)throw new Error("A shared Redis planner store is required on Vercel");
 const state=redis?new RedisJsonStore(redis.url,redis.token,"beacon:planner:v1",emptyPlannerState):new FileJsonStore(join(process.env.BEACON_STATE_DIR??join(tmpdir(),"beacon-trips-local"),"planner-v1.json"),emptyPlannerState());
 const queue=new PlannerQueue(state),agent=getTripRuntime().agent;
 const planner=new HybridPlanner(queue,{snapshot:(tripId,owner)=>agent.planningSnapshot(tripId,owner),evaluate:(tripId,owner,snapshotId,intent)=>agent.planningEvaluate(tripId,owner,snapshotId,intent)},Date.now,getActivityRuntime());
 return shared.beaconPlanner={queue,planner};
}
