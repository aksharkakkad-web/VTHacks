import type { PlanningView } from '../planner/contracts';

/** A later model read must not attach a different decision's prose to this journey. */
export function bindPlanningToJourney(planning: PlanningView | null, snapshotId: string): PlanningView | null {
  if (!planning || !planning.snapshotId || planning.snapshotId === snapshotId) return planning;
  return {...planning, phase:'unavailable', snapshotId:null, explanation:undefined, explanationSource:'none', messageCode:'PLANNER_STALE_SNAPSHOT'};
}
