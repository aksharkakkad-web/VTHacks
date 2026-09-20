#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { compileTrack } from './build.mjs';

export async function measureDecisions({ runs = 20, decide, clock = () => performance.now(), onSample = () => {} }) {
  if (!Number.isSafeInteger(runs) || runs < 20 || runs > 100) throw new Error('Use 20–100 sequential measurements');
  const samples = [];
  for (let run = 1; run <= runs; run++) {
    const start = clock();
    let result;
    try { result = await decide(run); } catch { result = { engine: 'error', status: 'ERROR', auditPersisted: false }; }
    const sample = { run, elapsedMs: Math.round(clock() - start), engine: result.engine, status: result.status,
      auditPersisted: result.auditPersisted, statementId: result.statementId ?? null, fallbackReason: result.fallbackReason ?? null };
    samples.push(sample); onSample(sample);
  }
  const times = samples.map(s => s.elapsedMs).sort((a, b) => a - b);
  const underTargetCount = samples.filter(s => s.elapsedMs < 10000 && s.engine === 'databricks' && s.status === 'RECOMMENDED' && s.auditPersisted).length;
  return { runs, targetMs: 10000, medianMs: (times[Math.floor((runs - 1) / 2)] + times[Math.floor(runs / 2)]) / 2,
    slowestMs: times.at(-1), underTargetCount, passed: underTargetCount === runs, samples };
}

async function main(args) {
  const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  if (!args.includes('--live')) throw new Error('Use --live --profile <chosen profile> --host <host> --warehouse <id>. Default is read-only; --audit writes synthetic decisions to workspace.beacon.decision_events.');
  const profile = option('--profile'), host = option('--host'), warehouseId = option('--warehouse');
  if (!profile || !host || !warehouseId) throw new Error('An explicit profile, host and warehouse are required');
  const cli = process.env.DATABRICKS_CLI_PATH || join(homedir(), '.local/bin/databricks');
  const tokenResult = spawnSync(cli, ['auth', 'token', '--profile', profile, '--host', host, '--timeout', '30s', '--output', 'json'], { encoding: 'utf8', timeout: 35000 });
  if (tokenResult.status !== 0) throw new Error('OAuth authentication failed; no credentials printed');
  const token = JSON.parse(tokenResult.stdout).access_token;
  const track = compileTrack();
  const { executeStatement } = track.load('integrations/databricks/statement.js');
  const { runDecision } = track.load('integrations/databricks/evaluate.js');
  const workspace = { host, warehouseId, token, routeContextTable: 'workspace.beacon.route_context',
    ...(args.includes('--audit') ? { auditTable: 'workspace.beacon.decision_events' } : {}) };
  const status = spawnSync(cli, ['warehouses', 'get', warehouseId, '--profile', profile, '--output', 'json'], { encoding: 'utf8', timeout: 30000 });
  const warehouseStateBefore = status.status === 0 ? JSON.parse(status.stdout).state : 'UNKNOWN';
  const warmupStart = performance.now();
  const warmup = await executeStatement(workspace, { statement: 'SELECT 1 AS warmup', timeoutMs: 60000 });
  const warmupMs = Math.round(performance.now() - warmupStart);
  const options = [
    ['campus', 'campus_ride', 0, 8, 11, 1, .98],
    ['independent', 'independent_ride', 7, 5, 10, 1, .94],
    ['transit', 'transit', 0, 15, 14, 5, .94],
    ['walk', 'walk', 0, 0, 0, 22, undefined],
  ].map(([planId, mode, cost, waitMinutes, travelMinutes, walkingMinutes, reliability]) => ({ planId,
    providerId: mode === 'walk' ? null : planId, providerName: planId, mode, cost, waitMinutes, travelMinutes, walkingMinutes,
    totalMinutes: waitMinutes + travelMinutes + walkingMinutes, reliability, transfers: 0, available: true, requiresProviderVerification: mode.includes('ride') }));
  const measured = await measureDecisions({ runs: Number(option('--runs') ?? 20),
    decide: () => {
      const now = new Date(), validUntil = new Date(now.getTime() + 120000).toISOString();
      const signals = Object.fromEntries(options.map(p => [p.planId, { source: 'simulated', collectedAt: now.toISOString(), validUntil, corridorId: 'newman-pritchard' }]));
      return runDecision(options, { maxBudget: 10, minimizeWalking: true, evaluatedAt: now.toISOString() }, signals, { workspace });
    }, onSample: sample => console.log(JSON.stringify(sample)) });
  const report = { capturedAt: new Date().toISOString(), warehouseId, warehouseStateBefore, warmupMs, warmupStatementId: warmup.statementId,
    measurementScope: args.includes('--audit') ? 'SQL decision including awaited audit; excludes discovery, route lookup, AI, HTTP and UI' : 'Read-only SQL decision; audit disabled; NOT end-to-end acceptance',
    syntheticOffers: true, ...measured };
  if (option('--output')) writeFileSync(option('--output'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, samples: `${report.samples.length} measurements above` }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(() => {
  console.error('Latency measurement failed. Check explicit arguments, OAuth and warehouse access; sensitive service errors withheld.');
  process.exitCode = 1;
});
