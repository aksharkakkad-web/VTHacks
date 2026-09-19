import { randomUUID } from 'node:crypto';
import { executeStatement, qualifiedTable, type DatabricksConfig } from './statement';
import type { Journey, JourneyResult } from '../../lib/decision-client/journey-types';

export type JourneyRankOptions = {
  workspace?: DatabricksConfig & { auditTable?: string };
  /** Explicit opt-in for cloud writes. Read-only is the default. */
  persistAudit?: boolean; fetch?: typeof fetch; pollIntervalMs?: number;
};
export type JourneyFeatures = { id: string; arrival: number; duration: number; walking: number; outdoor: number; unknownWait: number; cost: number; complexity: number; walkingWeight: number };
export function journeyFeatures(journeys: Journey[], minimize: boolean): JourneyFeatures[] {
  return journeys.map(j => ({ id: j.journeyId, arrival: Date.parse(j.arrivalAt), duration: Math.ceil(j.durationSeconds), walking: Math.ceil(j.walkingSeconds),
    outdoor: Math.ceil(j.outdoorWaitingSeconds), unknownWait: Math.ceil(j.unknownWaitingSeconds), cost: j.costMinor,
    complexity: j.legs.filter(l => l.kind !== 'wait').length - 1, walkingWeight: minimize ? 5 : 2 }));
}
/** Integer seconds of burden plus cents; historical crime/missing lamps never affect score. */
export function journeyScore(f: JourneyFeatures) {
  return f.duration + f.walking * f.walkingWeight + f.outdoor * 2 + f.unknownWait + f.cost + f.complexity * 60;
}
export async function rankJourneys(journeys: Journey[], minimize: boolean, objectiveVersion: number, at: string, options: JourneyRankOptions = {}) {
  const features = journeyFeatures(journeys, minimize);
  for (const f of features) {
    if (!/^journey:[a-f0-9]{40}$/.test(f.id) || Object.entries(f).some(([k,v]) => k !== 'id' && (!Number.isSafeInteger(v) || Number(v) < 0))) throw new Error('Invalid journey ranking features');
  }
  for (const j of journeys) j.scoreUnits = journeyScore(features.find(f => f.id === j.journeyId)!);
  journeys.sort((a,b) => a.scoreUnits - b.scoreUnits || a.arrivalAt.localeCompare(b.arrivalAt) || a.journeyId.localeCompare(b.journeyId));
  const execution: JourneyResult['execution'] = { engine: 'local_fallback', fallbackReason: 'WORKSPACE_NOT_CONFIGURED', auditPersisted: false, auditStatus: 'DISABLED_READ_ONLY' };
  if (!options.workspace || !features.length) return { journeys, execution };
  try {
    const result = await executeStatement(options.workspace, {
      statement: `WITH features AS (SELECT explode(from_json(:features, 'ARRAY<STRUCT<id:STRING,arrival:BIGINT,duration:BIGINT,walking:BIGINT,outdoor:BIGINT,unknownWait:BIGINT,cost:BIGINT,complexity:BIGINT,walkingWeight:BIGINT>>')) f)
        SELECT f.id AS journey_id, CAST(f.duration + f.walking*f.walkingWeight + f.outdoor*2 + f.unknownWait + f.cost + f.complexity*60 AS STRING) AS score_units FROM features ORDER BY score_units::BIGINT, f.arrival, journey_id`,
      parameters: [{ name: 'features', value: JSON.stringify(features), type: 'STRING' }], timeoutMs: 10000,
    }, options);
    if (JSON.stringify(result.columns) !== JSON.stringify(['journey_id','score_units']) || result.rows.length !== journeys.length) throw new Error('Invalid rank result');
    const seen = new Set<string>();
    for (const [index,row] of result.rows.entries()) {
      const [id, score] = row, expected = journeys.find(j => j.journeyId === id);
      if (row.length !== 2 || id !== journeys[index].journeyId || !expected || !id || seen.has(id) || !score || !/^\d+$/.test(score) || Number(score) !== expected.scoreUnits) throw new Error('Invalid rank result');
      seen.add(id);
    }
    execution.engine = 'databricks'; execution.statementId = result.statementId; delete execution.fallbackReason;
  } catch { execution.fallbackReason = 'DATABRICKS_UNAVAILABLE_OR_INVALID_RESULT'; }
  if (options.persistAudit) {
    if (!options.workspace.auditTable) execution.auditStatus = 'NOT_CONFIGURED';
    else try {
      const payload = { policyVersion: 'beacon-journey-rank-v1', engine: execution.engine, features, selectedJourneyId: journeys[0]?.journeyId ?? null };
      await executeStatement(options.workspace, {
        statement: `MERGE INTO ${qualifiedTable(options.workspace.auditTable)} t USING (SELECT :evaluation_id evaluation_id, CAST(:objective_version AS BIGINT) objective_version, CAST(:evaluated_at AS TIMESTAMP) evaluated_at, :policy_version policy_version, :engine engine, :result_json result_json, :statement_id statement_id) s ON t.evaluation_id=s.evaluation_id WHEN NOT MATCHED THEN INSERT *`,
        parameters: Object.entries({ evaluation_id: randomUUID(), objective_version: String(objectiveVersion), evaluated_at: at,
          policy_version: 'beacon-journey-rank-v1', engine: execution.engine, result_json: JSON.stringify(payload), statement_id: execution.statementId ?? '' }).map(([name,value]) => ({name,value,type:'STRING'})), timeoutMs: 8000,
      }, options);
      execution.auditPersisted = true; execution.auditStatus = 'PERSISTED';
    } catch { execution.auditStatus = 'WRITE_FAILED'; }
  }
  return { journeys, execution };
}
