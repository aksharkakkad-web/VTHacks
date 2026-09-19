#!/usr/bin/env node
/** Bounded native Spark import: one merge per public table, completion marker last. */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildPublicEvidencePlan } from './public-evidence.mjs';
import { root } from './build.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const recordSchema = 'import_id STRING,dataset STRING,record_index INT,record_id STRING,source_document STRING,source_version STRING,captured_at STRING,provenance_status STRING,payload_json STRING';
const fields = {
  public_research_snapshots: 'import_id STRING,document_path STRING,snapshot_hash STRING,byte_count BIGINT,part_index INT,part_count INT,payload_base64 STRING,provenance_status STRING,provenance_json STRING',
  public_research_items: 'import_id STRING,row_id STRING,document_path STRING,snapshot_hash STRING,json_pointer STRING,item_hash STRING,part_index INT,part_count INT,payload_base64 STRING,classification STRING,provenance_status STRING,provenance_json STRING',
  public_evidence_records: recordSchema,
  public_research_imports: 'import_id STRING,format_version STRING,manifest_json STRING',
};
const keys = {
  public_research_snapshots: ['import_id', 'document_path', 'part_index'],
  public_research_items: ['import_id', 'row_id', 'part_index'],
  public_evidence_records: ['import_id', 'dataset', 'record_index'],
  public_research_imports: ['import_id'],
};
const documents = {
  crime: 'crime-records-2026.json', lighting: 'lighting/observations.json',
  activity: 'activity/historical-pedestrian-summary-2015.json', closures: 'closures.json',
  'emergency-equipment': 'emergency-equipment.json', notices: 'notices.json', weather: 'weather.json',
};

export function buildNativePublicImport({ directory = join(root, 'data/campus/research'), env = process.env } = {}) {
  const plan = buildPublicEvidencePlan({ directory, env });
  const normalized = [];
  for (const [dataset, document] of Object.entries(documents)) {
    const summary = plan.summary.documents.find(row => row.path === document);
    if (!summary) throw new Error(`Missing required public dataset: ${dataset}`);
    const value = JSON.parse(readFileSync(join(directory, document), 'utf8'));
    const rows = Array.isArray(value) ? value : value.records;
    if (!Array.isArray(rows)) throw new Error(`Invalid public records: ${dataset}`);
    const companionPath = dataset === 'crime' ? 'crime-manifest-2026.json' : ['lighting', 'activity'].includes(dataset) ? `${dataset}/provenance.json` : null;
    const metadata = companionPath ? JSON.parse(readFileSync(join(directory, companionPath), 'utf8')) : value;
    if (!Number.isFinite(Date.parse(metadata.captured_at))) throw new Error(`Missing capture time: ${dataset}`);
    rows.forEach((row, index) => normalized.push({ import_id: plan.importId, dataset, record_index: index,
      record_id: String(row.record_id ?? row.id ?? row.context_version ?? index), source_document: document,
      source_version: summary.snapshot_hash, captured_at: metadata.captured_at,
      provenance_status: summary.provenance_status, payload_json: JSON.stringify(row) }));
  }
  const tables = {
    public_research_snapshots: plan.snapshotRows, public_research_items: plan.itemRows,
    public_evidence_records: normalized,
    public_research_imports: JSON.parse(plan.statements.at(-1).parameters[0].value),
  };
  const payload = Buffer.from(JSON.stringify({ schema: plan.summary.target_schema, import_id: plan.importId, tables, fields, keys }));
  if (payload.length > 32 * 1024 * 1024) throw new Error('Native import exceeds 32 MB decoded bound');
  const encoded = gzipSync(payload).toString('base64');
  const notebook = `# Databricks notebook source
# Generated from verified public snapshots; no credentials or student data.
import base64, gzip, hashlib, json, re
from pyspark.sql import functions as F

raw = gzip.decompress(base64.b64decode('${encoded}'))
assert len(raw) <= 32 * 1024 * 1024
assert hashlib.sha256(raw).hexdigest() == '${hash(payload)}'
bundle = json.loads(raw)
schema = bundle['schema']
assert re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*\\.[A-Za-z_][A-Za-z0-9_]*', schema.replace(chr(96), ''))
spark.sql('CREATE SCHEMA IF NOT EXISTS ' + schema)
counts = {}
for table in ['public_research_snapshots', 'public_research_items', 'public_evidence_records', 'public_research_imports']:
    # All identifiers and schemas come from this generated code, never source text.
    fields = bundle['fields'][table]
    spark.sql('CREATE TABLE IF NOT EXISTS ' + schema + '.' + table + ' (' + fields + ',imported_at TIMESTAMP) USING DELTA')
    rows = bundle['tables'][table]
    assert len(rows) <= 20000
    if rows:
        frame = spark.createDataFrame(rows, fields).withColumn('imported_at', F.current_timestamp())
        view = 'beacon_native_' + table
        frame.createOrReplaceTempView(view)
        condition = ' AND '.join('t.' + key + '=s.' + key for key in bundle['keys'][table])
        spark.sql('MERGE INTO ' + schema + '.' + table + ' t USING ' + view + ' s ON ' + condition + ' WHEN NOT MATCHED THEN INSERT *')
    actual = spark.table(schema + '.' + table).where(F.col('import_id') == bundle['import_id']).count()
    assert actual == len(rows), table + ': imported count mismatch'
    counts[table] = actual
    print('BEACON_NATIVE_IMPORT', table, actual)
# Completion marker is absent if any preceding merge or count check fails.
dbutils.notebook.exit(json.dumps({'import_completed': True, 'import_id': bundle['import_id'], 'counts': counts}))
`;
  return { notebook, importId: plan.importId, summary: { ...plan.summary, native: true,
    transport: 'single native Spark merge per table', native_record_count: normalized.length,
    native_record_counts: Object.fromEntries(Object.keys(documents).map(name => [name, normalized.filter(r => r.dataset === name).length])),
    source_payload_bytes: payload.length, notebook_bytes: Buffer.byteLength(notebook) } };
}

function cli(args) {
  const result = spawnSync('databricks', args, { encoding: 'utf8', timeout: 60000 });
  if (result.status !== 0) throw new Error(`Databricks ${args.slice(0, 2).join(' ')} failed; inspect the workspace operation before retrying.`);
  return result.stdout;
}

async function main() {
  const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false }, profile: { type: 'string' } } });
  const plan = buildNativePublicImport();
  if (!values.apply) { console.log(JSON.stringify(plan.summary, null, 2)); return; }
  if (!values.profile) throw new Error('Provide the previously approved Databricks --profile.');
  const profiles = JSON.parse(cli(['auth', 'profiles', '--output', 'json'])).profiles;
  const profile = profiles.find(p => p.name === values.profile && p.valid);
  if (!profile || profile.host !== process.env.DATABRICKS_HOST) throw new Error('Profile does not match the explicitly configured DATABRICKS_HOST.');
  const directory = mkdtempSync(join(tmpdir(), 'beacon-native-import-'));
  const notebookFile = join(directory, 'import.py');
  const notebookPath = `/Shared/Beacon/import-public-${hash(plan.notebook).slice(0, 16)}`;
  writeFileSync(notebookFile, plan.notebook);
  cli(['workspace', 'import', notebookPath, '--file', notebookFile, '--format', 'SOURCE', '--language', 'PYTHON', '--overwrite', '--profile', values.profile]);
  const request = { run_name: 'Beacon public evidence import', timeout_seconds: 900, performance_target: 'STANDARD',
    idempotency_token: hash(plan.notebook), tasks: [{ task_key: 'import_public_evidence', notebook_task: { notebook_path: notebookPath, source: 'WORKSPACE' }, timeout_seconds: 900, max_retries: 0 }] };
  const requestFile = join(directory, 'run.json');
  writeFileSync(requestFile, JSON.stringify(request));
  const run = JSON.parse(cli(['jobs', 'submit', '--json', `@${requestFile}`, '--no-wait', '--output', 'json', '--profile', values.profile]));
  console.log(JSON.stringify({ import_id: plan.importId, notebook_path: notebookPath, run_id: run.run_id, status: 'submitted_not_yet_verified', record_counts: plan.summary.native_record_counts }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
