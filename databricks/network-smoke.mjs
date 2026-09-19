#!/usr/bin/env node
/** Read-only live acceptance for the data-side network adapter. No bookings,
 * notifications, table writes, or audit writes. Offers are explicitly simulated. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { compileTrack } from './build.mjs';

const live = process.argv.includes('--live');
const profileIndex = process.argv.indexOf('--profile');
const profile = profileIndex < 0 ? undefined : process.argv[profileIndex + 1];
try {
  const track = compileTrack();
  const { evaluateNetworkOffers } = track.load('lib/decision-client/network-offers.js');
  const { runDecision } = track.load('integrations/databricks/evaluate.js');
  const { executeStatement } = track.load('integrations/databricks/statement.js');
  let workspace;
  const report = { simulatedOffers: true, auditWrites: false, live, checks: [] };
  if (live) {
    const host = process.env.DATABRICKS_HOST, warehouseId = process.env.DATABRICKS_WAREHOUSE_ID;
    if (!profile || !host || !warehouseId) throw new Error('Live check requires explicit --profile and configured host/warehouse');
    const cli = process.env.DATABRICKS_CLI_PATH || join(homedir(), '.local/bin/databricks');
    const result = spawnSync(cli, ['auth', 'token', '--profile', profile, '--host', host, '--timeout', '30s', '--output', 'json'], { encoding: 'utf8', timeout: 35000 });
    if (result.status !== 0) throw new Error('OAuth authentication required; no credentials printed');
    workspace = { host, warehouseId, token: JSON.parse(result.stdout).access_token };
    const warm = await executeStatement(workspace, { statement: 'SELECT 1 AS connection_check', timeoutMs: 60000 });
    report.checks.push({ check: 'workspace_read', statementId: warm.statementId });
    const tables = await executeStatement(workspace, { statement: 'SHOW TABLES IN workspace.beacon', timeoutMs: 10000 });
    const index = tables.columns.indexOf('tableName');
    if (index < 0) throw new Error('Unexpected table inventory response');
    const actual = new Set(tables.rows.map(row => row[index]));
    report.checks.push({ check: 'full_feed_activation', present: ['transit_stops', 'transit_routes', 'transit_trips', 'transit_stop_times', 'transit_service_trips', 'transit_source_archive', 'transit_imports'].filter(name => actual.has(name)), statementId: tables.statementId });
  }
  const decide = (p, c, s, admission) => runDecision(p, c, s, { workspace, admission });
  function offers() {
    const now = Date.now();
    return [['campus', 'campus_ride', 0, 8, 11], ['independent', 'independent_ride', 700, 5, 10]].map(([serviceId, mode, totalMinor, waitMinutes, travelMinutes]) => ({
      operatorId: 'beacon-demo', serviceId, quoteId: `quote-${serviceId}`, offerVersion: '1', displayName: serviceId,
      mode, source: 'simulated', available: true, issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 120000).toISOString(),
      admission: { serviceAreaMatch: true, authSupported: true, paymentSupported: true },
      price: { currency: 'USD', kind: 'fixed', totalMinor, includesAllFees: true }, waitMinutes, travelMinutes, walkingMinutes: 1, transfers: 0,
    }));
  }
  for (const scenario of [
    { name: 'initial', recovery: {}, expectedService: 'campus' },
    { name: 'cancel_and_replace', recovery: { excludedServices: [{ operatorId: 'beacon-demo', serviceId: 'campus' }] }, expectedService: 'independent' },
    { name: 'liabilities_prevent_overspend', recovery: { excludedServices: [{ operatorId: 'beacon-demo', serviceId: 'campus' }], committedMinor: 400 }, expectedService: null },
  ]) {
    const options = offers();
    const result = await evaluateNetworkOffers(options, { maxBudget: 10, minimizeWalking: true, evaluatedAt: new Date().toISOString() }, scenario.recovery, decide);
    assert.equal(result.selectedOffer?.serviceId ?? null, scenario.expectedService);
    assert.equal(result.decision.status, scenario.expectedService ? 'RECOMMENDED' : 'NO_FEASIBLE_PLAN');
    if (live && scenario.expectedService) assert.equal(result.decision.engine, 'databricks');
    report.checks.push({ check: scenario.name, status: result.decision.status, engine: result.decision.engine,
      selectedService: result.selectedOffer?.serviceId ?? null, statementId: result.decision.statementId ?? null,
      remainingBudgetMinor: result.remainingBudgetMinor });
  }
  report.capturedAt = new Date().toISOString();
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error instanceof assert.AssertionError ? `Acceptance failed: ${error.message}` : 'Network smoke failed. Check explicit profile, workspace access and build output; sensitive service errors withheld.');
  process.exitCode = 1;
}
