#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { compileTrack, root } from './build.mjs';
import { bootstrapStatements, importStatements, schemaName } from './setup.mjs';

// Environment values win. Nothing here prints or persists an access token.
const localEnv = join(root, '.env.local');
if (existsSync(localEnv)) for (const [key, value] of Object.entries(parseEnv(readFileSync(localEnv, 'utf8')))) process.env[key] ??= value;
const [command = 'help', ...args] = process.argv.slice(2);
function option(name) { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; }
const cli = process.env.DATABRICKS_CLI_PATH || (existsSync(join(homedir(), '.local/bin/databricks')) ? join(homedir(), '.local/bin/databricks') : 'databricks');
function credentials() {
  const env = process.env;
  if (!env.DATABRICKS_HOST || !env.DATABRICKS_WAREHOUSE_ID) throw new Error('Set DATABRICKS_HOST and DATABRICKS_WAREHOUSE_ID in .env.local. See databricks/README.md.');
  const profile = option('--profile') || env.DATABRICKS_CONFIG_PROFILE;
  if (!env.DATABRICKS_TOKEN && profile) {
    const token = spawnSync(cli, ['auth', 'token', '--profile', profile, '--host', env.DATABRICKS_HOST, '--timeout', '30s', '--output', 'json'], { encoding: 'utf8', timeout: 35_000 });
    if (token.status !== 0) throw new Error('OAuth login required: databricks auth login --host <workspace-url> --profile <chosen-name>.');
    try { env.DATABRICKS_TOKEN = JSON.parse(token.stdout).access_token; } catch { throw new Error('OAuth response invalid. Reauthenticate with the Databricks CLI.'); }
  }
  if (!env.DATABRICKS_TOKEN) throw new Error('Choose an authenticated DATABRICKS_CONFIG_PROFILE; no token will be written to disk.');
  const unquoted = schemaName().replaceAll('`', '');
  env.DATABRICKS_ROUTE_CONTEXT_TABLE ||= unquoted + '.route_context';
  env.DATABRICKS_AUDIT_TABLE ||= unquoted + '.decision_events';
  env.DATABRICKS_TRANSIT_TABLE ||= unquoted + '.transit_departures';
  env.DATABRICKS_ROUTE_EVIDENCE_TABLE ||= unquoted + '.route_evidence';
  return { host: env.DATABRICKS_HOST, token: env.DATABRICKS_TOKEN, warehouseId: env.DATABRICKS_WAREHOUSE_ID };
}

try {
  if (command === 'help') {
    console.log(`Beacon Databricks track (Node 22+, no extra dependencies)
  node databricks/run.mjs doctor          Check configuration without printing secrets
  node databricks/run.mjs test            Compile and run track tests
  node databricks/run.mjs demo            Local choice, cancellation, budget, no-option demo
  node databricks/run.mjs demo --live     Same demo, require actual Databricks results
  node databricks/run.mjs intelligence --live --enable-ai  Route-aware, grounded AI briefing
  node databricks/run.mjs evidence --live Verify expanded managed data and trip evidence
  node databricks/run.mjs setup           Preview tables/import sizes, no cloud writes
  node databricks/run.mjs setup --apply   Create Beacon tables + MERGE public snapshots
  node databricks/run.mjs sql <file.sql>  Run one repository SQL showcase query
  node databricks/run.mjs dev            Start Next with short-lived OAuth in memory
All live commands accept --profile <explicitly chosen OAuth profile>.
Optional AI queries require --enable-ai; this may consume AI quota. No paid upgrades.`);
  } else if (command === 'doctor') {
    console.log({ node: process.version, host: process.env.DATABRICKS_HOST || 'missing', warehouse: process.env.DATABRICKS_WAREHOUSE_ID ? 'set' : 'missing', profile: option('--profile') || process.env.DATABRICKS_CONFIG_PROFILE || 'not chosen', token: process.env.DATABRICKS_TOKEN ? 'set (hidden)' : 'not set; OAuth profile preferred', schema: schemaName() });
    const result = spawnSync(cli, ['version'], { encoding:'utf8' });
    console.log(result.status === 0 ? result.stdout.trim() : 'Databricks CLI not found.');
  } else if (command === 'test') {
    const track = compileTrack();
    const test = spawnSync(process.execPath, ['--test', ...track.tests, join(root, 'databricks/setup.test.mjs')], { cwd:root, stdio:'inherit' });
    process.exitCode = test.status ?? 1;
  } else if (command === 'setup') {
    const definitions = args.includes('--data-only') ? [] : bootstrapStatements();
    const datasets = option('--datasets')?.split(',');
    const imports = importStatements().filter(item => !datasets || datasets.some(name => item.name.startsWith(`snapshot:${name}:`) || item.name === `snapshot:${name}` || item.name.startsWith(`${name.replaceAll('-', '_')}:`)));
    if (!imports.length) throw new Error('No matching public datasets to import.');
    console.log(`Target ${schemaName()}: ${definitions.length} schema/table statements, ${imports.length} snapshot/import statements.`);
    if (!args.includes('--apply')) console.log('Preview only. Use --apply after authenticating to the intended hackathon workspace.');
    else {
      const config = credentials();
      const track = compileTrack();
      const { executeStatement } = track.load('integrations/databricks/statement.js');
      for (const [i, statement] of definitions.entries()) {
        const result = await executeStatement(config, { statement, timeoutMs:60_000 });
        console.log(`Schema ${i + 1}/${definitions.length}: ${result.statementId}`);
      }
      // Additive upgrade for an existing pre-hourly-context workspace; repeatable, no data reset.
      const columns = await executeStatement(config, {statement:`DESCRIBE TABLE ${schemaName()}.route_context`,timeoutMs:60_000});
      if (!columns.rows.some(row=>row[0]==='valid_from')) {
        await executeStatement(config, {statement:`ALTER TABLE ${schemaName()}.route_context ADD COLUMNS (valid_from TIMESTAMP)`,timeoutMs:60_000});
        console.log('Added route-context forecast validity start.');
      }
      for (const item of imports) {
        const result = await executeStatement(config, { statement:item.statement, parameters:item.parameters, timeoutMs:60_000 });
        console.log(`Imported ${item.name}: ${result.statementId}`);
      }
      console.log('Setup completed. Run demo --live to prove real ranking; setup alone is not runtime proof.');
    }
  } else if (command === 'demo') {
    if (args.includes('--live')) credentials();
    const { runDemo } = await import('./demo.mjs');
    await runDemo(compileTrack(), args.includes('--live'));
  } else if (command === 'intelligence') {
    if(args.includes('--enable-ai') && !args.includes('--live')) throw new Error('AI requires --live and the selected workspace.');
    if(args.includes('--live')) credentials();
    const {runIntelligenceDemo}=await import('./intelligence-demo.mjs');
    await runIntelligenceDemo(compileTrack(),args.includes('--live'),args.includes('--enable-ai'));
  } else if (command === 'evidence') {
    if (!args.includes('--live')) throw new Error('Evidence acceptance requires --live; no simulated cloud proof.');
    const config = credentials();
    const { checkPublicEvidence } = await import('./evidence-check.mjs');
    await checkPublicEvidence(compileTrack(), config, { initializeOutcomes: args.includes('--initialize-outcomes') });
  } else if (command === 'sql') {
    const file = resolve(root, args[0] || '');
    const permitted = join(root, 'databricks/sql/showcase/');
    if (!file.startsWith(permitted) || !file.endsWith('.sql')) throw new Error('Choose a .sql file inside databricks/sql/showcase/.');
    const optional = file.includes('/optional/');
    if (optional && !args.includes('--enable-ai')) throw new Error('AI showcase is opt-in. Verify your workspace quota before passing --enable-ai.');
    const config = credentials();
    const track = compileTrack();
    const { executeStatement } = track.load('integrations/databricks/statement.js');
    const statement = readFileSync(file, 'utf8').replaceAll('__SCHEMA__', schemaName());
    const result = await executeStatement(config, { statement, timeoutMs:optional ? 120_000 : 60_000, parameters:optional ? [{name:'enable_ai', value:'true', type:'BOOLEAN'}] : [] });
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'dev') {
    credentials();
    const result = spawnSync('npm', ['run', 'dev'], { cwd:root, env:process.env, stdio:'inherit' });
    process.exitCode = result.status ?? 1;
  } else throw new Error('Unknown command. Run node databricks/run.mjs help.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Databricks task failed.');
  process.exitCode = 1;
}
