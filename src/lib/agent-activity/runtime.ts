import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileJsonStore, RedisJsonStore, type JsonStore } from '../planner/store';
import { redisConfiguration } from '../trip-state/redis-config';
import { ActivityStore, emptyActivity, type ActivityState } from './store';
const shared=globalThis as typeof globalThis & {beaconActivity?:ActivityStore};
export function getActivityRuntime() {
 if(shared.beaconActivity)return shared.beaconActivity;
 const redis=redisConfiguration();
 if(process.env.VERCEL&&!redis)throw new Error('REDIS_REQUIRED');
 const stores=new Map<string,JsonStore<ActivityState>>();
 shared.beaconActivity=new ActivityStore(tripId=>{
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(tripId))throw new Error('INVALID_TRIP_ID');
  if(redis)return new RedisJsonStore(redis.url,redis.token,`beacon:activity:v1:${tripId}`,emptyActivity);
  let store=stores.get(tripId);if(!store){store=new FileJsonStore(join(process.env.BEACON_STATE_DIR??join(tmpdir(),'beacon-trips-local'),'activity',`${tripId}.json`),emptyActivity());stores.set(tripId,store);}return store;
 });return shared.beaconActivity;
}
