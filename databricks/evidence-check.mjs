import assert from 'node:assert/strict';
import { buildNativePublicImport } from './native-public-import.mjs';

/** Explicit live acceptance. Never inserts pretend provider observations. */
export async function checkPublicEvidence(track, config, { initializeOutcomes = false } = {}) {
  const { executeStatement } = track.load('integrations/databricks/statement.js');
  const { providerOutcomesSchemaSql, getProviderReliability } = track.load('integrations/databricks/provider-outcomes.js');
  const { loadDataset, datasets, routeConditions } = track.load('lib/campus-evidence/catalog.js');
  const { buildSafetyEvidence } = track.load('lib/decision-client/safety-evidence.js');
  const { loadRouteEvidence, walkingOption, runIntelligence } = track.load('integrations/databricks/intelligence.js');
  const { applyPublicRouteEvidence } = track.load('lib/campus-evidence/routing.js');
  const plan = buildNativePublicImport();
  const schema = plan.summary.target_schema;
  const counts = await executeStatement(config, {
    statement: `SELECT r.dataset, CAST(COUNT(*) AS STRING) record_count
      FROM ${schema}.public_evidence_records r
      WHERE r.import_id = :import_id AND EXISTS (SELECT 1 FROM ${schema}.public_research_imports i WHERE i.import_id = r.import_id)
      GROUP BY r.dataset ORDER BY r.dataset`,
    parameters: [{ name: 'import_id', value: plan.importId, type: 'STRING' }], timeoutMs: 60000,
  });
  const observedCounts = Object.fromEntries(counts.rows.map(([name, count]) => [name, Number(count)]));
  assert.deepEqual(observedCounts, plan.summary.native_record_counts, 'All public datasets must be present in a completed import');
  const archive = await executeStatement(config, {
    statement: `SELECT 'snapshots' kind, CAST(COUNT(*) AS STRING) n FROM ${schema}.public_research_snapshots WHERE import_id=:import_id
      UNION ALL SELECT 'items', CAST(COUNT(*) AS STRING) FROM ${schema}.public_research_items WHERE import_id=:import_id
      UNION ALL SELECT 'completion', CAST(COUNT(*) AS STRING) FROM ${schema}.public_research_imports WHERE import_id=:import_id`,
    parameters: [{ name: 'import_id', value: plan.importId, type: 'STRING' }], timeoutMs: 60000,
  });
  const archiveCounts = Object.fromEntries(archive.rows.map(([name, n]) => [name, Number(n)]));
  assert.deepEqual(archiveCounts, { snapshots: plan.summary.snapshot_parts, items: plan.summary.item_parts, completion: 1 });
  const outcomesTable = `${schema.replaceAll('`', '')}.provider_outcomes`;
  let bootstrapStatementId;
  if (initializeOutcomes) bootstrapStatementId = (await executeStatement(config, { statement: providerOutcomesSchemaSql(outcomesTable), timeoutMs: 60000 })).statementId;
  const at = new Date().toISOString();
  const reliability = await getProviderReliability(config, outcomesTable, 'campus_ride', at);
  assert.equal(reliability.status, 'unknown');
  assert.equal(reliability.sampleSize, 0);
  const campusDatasets = Object.fromEntries(datasets.map(name => [name, loadDataset(name)]));
  const corridorId = 'eggleston-pritchard';
  const workspace = { ...config, routeContextTable: process.env.DATABRICKS_ROUTE_CONTEXT_TABLE,
    auditTable: process.env.DATABRICKS_AUDIT_TABLE, routeEvidenceTable: process.env.DATABRICKS_ROUTE_EVIDENCE_TABLE };
  const loaded = await loadRouteEvidence(workspace, corridorId);
  assert.ok(loaded?.evidence?.geometry);
  const currentAt = new Date().toISOString();
  const walk = walkingOption(loaded.evidence, currentAt);
  assert.ok(walk);
  const safety = buildSafetyEvidence({ corridorId, evaluatedAt: currentAt, expectedRouteVersion: loaded.evidence.source_version,
    routeConditions: routeConditions(corridorId, Date.parse(currentAt)), campusDatasets });
  assert.equal(safety.routeExposureScore, null);
  assert.equal(safety.scoreStatus, 'unavailable');
  const ride = { planId: 'evidence-demo-ride', providerId: 'campus_ride', providerName: 'Simulated ride', mode: 'campus_ride',
    cost: 7, waitMinutes: 2, travelMinutes: 5, walkingMinutes: 1, totalMinutes: 8, transfers: 0, available: true, requiresProviderVerification: true };
  const plans = [ride, walk.candidate];
  const signals = applyPublicRouteEvidence(plans, { [ride.planId]: { source: 'simulated', validUntil: new Date(Date.now()+120000).toISOString() }, [walk.candidate.planId]: walk.signals }, Date.parse(currentAt));
  const context = { maxBudget: 10, minimizeWalking: true, evaluatedAt: currentAt };
  const result = await runIntelligence(plans, context, signals, { workspace, corridorId, loadedRoute: { evidence: loaded.evidence, source: 'databricks', statementId: loaded.statementId } });
  assert.equal(result.decision.engine, 'databricks');
  assert.equal(result.decision.auditPersisted, true);
  assert.equal(result.decision.status, 'RECOMMENDED');
  // This snapshot fixture verifies budget enforcement, not a forced change of winner.
  // A short free walk may legitimately win both; demo.mjs separately asserts a budget-driven switch.
  const constrained = await runIntelligence(plans, { ...context, maxBudget: 0, evaluatedAt: new Date().toISOString() }, signals, { workspace, corridorId, loadedRoute: { evidence: loaded.evidence, source: 'databricks', statementId: loaded.statementId } });
  assert.equal(constrained.decision.engine, 'databricks');
  assert.equal(constrained.decision.auditPersisted, true);
  if (signals[walk.candidate.planId].walkingPathClosed || signals[walk.candidate.planId].weather === 'severe') assert.equal(constrained.decision.status, 'NO_FEASIBLE_PLAN');
  else assert.equal(constrained.decision.recommendation.selectedPlanId, walk.candidate.planId);
  const unsupported = buildSafetyEvidence({ corridorId: 'downtown-pritchard', evaluatedAt: currentAt, routeConditions: routeConditions('downtown-pritchard', Date.parse(currentAt)), campusDatasets });
  assert.equal(unsupported.routeExposureScore, null);
  console.log(JSON.stringify({ importId: plan.importId, counts: observedCounts, countsStatementId: counts.statementId, archiveCounts,
    archiveStatementId: archive.statementId, providerReliability: { status: reliability.status, sampleSize: reliability.sampleSize, bootstrapStatementId, statementId: reliability.statementId },
    routeStatementId: loaded.statementId, decision: { engine: result.decision.engine, selected: result.decision.recommendation.selectedPlanId, statementId: result.decision.statementId, auditPersisted: result.decision.auditPersisted },
    zeroBudget: { status: constrained.decision.status, statementId: constrained.decision.statementId, auditPersisted: constrained.decision.auditPersisted },
    evidence: { coverage: safety.coverage, warnings: safety.warnings, hardBlocks: safety.hardBlocks, scoreStatus: safety.scoreStatus, routeExposureScore: safety.routeExposureScore },
    unsupportedRoute: { scoreStatus: unsupported.scoreStatus, routeExposureScore: unsupported.routeExposureScore } }, null, 2));
}
