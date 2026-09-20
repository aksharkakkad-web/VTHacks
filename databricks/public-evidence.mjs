#!/usr/bin/env node
/** Preview-first, additive archive of the public research JSON snapshots. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, posix, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs, parseEnv } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { compileTrack, root } from './build.mjs';
import { schemaName } from './setup.mjs';

const VERSION = 'public-research-v1';
const PART_BYTES = 8192;
const MAX_BATCH_BYTES = 40000;
const MAX_FILES = 128;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const escapePointer = value => value.replaceAll('~', '~0').replaceAll('/', '~1');

function filesUnder(directory, prefix = '') {
  return readdirSync(join(directory, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const path = posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not accepted in research snapshots: ${path}`);
    return entry.isDirectory() ? filesUnder(directory, path) : entry.isFile() ? [path] : [];
  });
}

function sourceFields(value) {
  return { url: value.source_url ?? value.url ?? value.source_index_url,
    hash: value.source_hash ?? value.sha256 ?? value.source_index_hash, capturedAt: value.captured_at };
}

function validUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}

function provenanceFor(doc, documents, allFiles) {
  const issues = [];
  const companionPath = posix.join(posix.dirname(doc.path), 'provenance.json');
  const companion = doc.path === companionPath ? undefined : documents.get(companionPath);
  const parent = object(doc.value) ? doc.value : {};
  const companionValue = object(companion?.value) ? companion.value : {};
  const parentSources = [parent, ...[parent.sources, parent.documents].filter(Array.isArray).flat(), companionValue];
  const inline = Array.isArray(doc.value) ? doc.value : Array.isArray(parent.records) ? parent.records : [];
  const candidates = [...parentSources, ...inline].filter(object);
  let complete = 0;
  for (const candidate of candidates) {
    const fields = sourceFields(candidate);
    if (fields.url !== undefined && !validUrl(fields.url)) issues.push('INVALID_SOURCE_URL');
    if (fields.hash !== undefined && (typeof fields.hash !== 'string' || !HASH.test(fields.hash))) issues.push('INVALID_SOURCE_HASH');
    if (fields.capturedAt !== undefined && (typeof fields.capturedAt !== 'string' || !Number.isFinite(Date.parse(fields.capturedAt)))) issues.push('INVALID_CAPTURE_TIME');
    if (validUrl(fields.url) && HASH.test(fields.hash ?? '') && Number.isFinite(Date.parse(fields.capturedAt ?? ''))) complete++;
  }
  const parentComplete = parentSources.some(candidate => {
    const fields = sourceFields(candidate);
    return validUrl(fields.url) && HASH.test(fields.hash ?? '') && Number.isFinite(Date.parse(fields.capturedAt ?? ''));
  });
  if (Array.isArray(doc.value) && !parentComplete && inline.some(row => {
    const fields = object(row) ? sourceFields(row) : {};
    return !validUrl(fields.url) || !HASH.test(fields.hash ?? '') || !Number.isFinite(Date.parse(fields.capturedAt ?? ''));
  })) issues.push('MISSING_ROW_PROVENANCE');

  function checkReference(basePath, name, expectedHash, compressed = false) {
    if (typeof name !== 'string' || !name || name.startsWith('/') || name.includes('\\')) { issues.push('INVALID_LOCAL_SOURCE_REFERENCE'); return; }
    const path = posix.normalize(posix.join(posix.dirname(basePath), name));
    if (path.startsWith('../')) { issues.push('INVALID_LOCAL_SOURCE_REFERENCE'); return; }
    const file = allFiles.get(path);
    if (!file) { issues.push(`MISSING_REFERENCED_FILE:${path}`); return; }
    if (!HASH.test(expectedHash ?? '')) { issues.push(`INVALID_REFERENCE_HASH:${path}`); return; }
    let actual = file.hash;
    if (compressed) {
      try { actual = sha256(gunzipSync(file.raw, { maxOutputLength: 15_000_000 })); }
      catch { issues.push(`INVALID_SOURCE_ARCHIVE:${path}`); return; }
    }
    if (actual !== expectedHash) issues.push(`HASH_MISMATCH:${path}`);
  }

  for (const provenance of [doc, companion].filter(Boolean)) {
    const value = object(provenance.value) ? provenance.value : {};
    for (const entry of [...(Array.isArray(value.files) ? value.files : []), ...(Array.isArray(value.derived_files) ? value.derived_files : [])]) {
      checkReference(provenance.path, entry.path ?? entry.filename, entry.sha256);
    }
    if (value.filename && value.sha256) checkReference(provenance.path, value.filename, value.sha256);
    if (value.archive_file && value.source_hash) checkReference(provenance.path, value.archive_file, value.source_hash, true);
    if (typeof value.html === 'string' && value.source_hash && sha256(value.html) !== value.source_hash) issues.push('INDEX_HTML_HASH_MISMATCH');
  }
  // A malformed retained PDF must also quarantine the records that cite it,
  // rather than only the separate source-metadata document.
  const inlineSources = inline.filter(object).map(row => sourceFields(row)).filter(fields => fields.url && fields.hash);
  for (const metadata of documents.values()) {
    if (!object(metadata.value)) continue;
    const fields = sourceFields(metadata.value);
    const cited = inlineSources.filter(source => source.url === fields.url);
    if (!cited.length) continue;
    if (cited.some(source => source.hash !== fields.hash)) issues.push(`SOURCE_HASH_MISMATCH:${metadata.path}`);
    if (metadata.value.archive_file) checkReference(metadata.path, metadata.value.archive_file, fields.hash, true);
    if (metadata.value.filename) checkReference(metadata.path, metadata.value.filename, fields.hash);
  }
  const metadataOnly = doc.path === 'refresh-status.json';
  if (!complete && !metadataOnly && !issues.length) issues.push('MISSING_PROVENANCE');
  const uniqueIssues = [...new Set(issues)].sort();
  const status = uniqueIssues.length ? uniqueIssues.every(issue => issue.startsWith('MISSING_')) ? 'missing' : 'invalid' : metadataOnly ? 'metadata' : 'recorded';
  return { status, issues: uniqueIssues, references: {
    document: { path: doc.path, snapshot_hash: doc.hash },
    ...(companion ? { companion: { path: companion.path, snapshot_hash: companion.hash } } : {}),
    provenance_status: status, issues: uniqueIssues,
  } };
}

function parts(bytes, fields) {
  const count = Math.max(1, Math.ceil(bytes.length / PART_BYTES));
  return Array.from({ length: count }, (_, part_index) => ({ ...fields, part_index, part_count: count,
    payload_base64: bytes.subarray(part_index * PART_BYTES, (part_index + 1) * PART_BYTES).toString('base64') }));
}

function documentItems(value) {
  const result = [];
  const add = (pointer, entry, collection) => result.push({ pointer, value: entry, collection });
  const array = (pointer, entries, collection) => {
    if (!entries.length) add(pointer, [], collection);
    else entries.forEach((entry, index) => add(`${pointer}/${index}`, entry, collection));
  };
  if (Array.isArray(value)) array('', value, 'records');
  else if (object(value)) {
    if (!Object.keys(value).length) add('', {}, 'metadata');
    for (const [key, entry] of Object.entries(value)) {
      const pointer = `/${escapePointer(key)}`;
      if (Array.isArray(entry)) array(pointer, entry, key);
      else add(pointer, entry, key);
    }
  } else add('', value, 'metadata');
  return result;
}

function classification(item, path) {
  if (item.collection === 'gaps' || item.collection === 'failures') return 'quarantined_source_row';
  if (Array.isArray(item.value) && item.value.length === 0) return 'empty_collection';
  if (['notes', 'limitations', 'coverage_note'].includes(item.collection)) return 'note';
  if (path.endsWith('provenance.json') || ['sources', 'documents'].includes(item.collection) || /-source\.json$/.test(path)) return 'provenance';
  if (['records', 'hourly', 'alerts', 'elements'].includes(item.collection)) return 'record';
  return 'metadata';
}

const snapshotFields = 'import_id STRING,document_path STRING,snapshot_hash STRING,byte_count BIGINT,part_index INT,part_count INT,payload_base64 STRING,provenance_status STRING,provenance_json STRING';
const itemFields = 'import_id STRING,row_id STRING,document_path STRING,snapshot_hash STRING,json_pointer STRING,item_hash STRING,part_index INT,part_count INT,payload_base64 STRING,classification STRING,provenance_status STRING,provenance_json STRING';
const completionFields = 'import_id STRING,format_version STRING,manifest_json STRING';

function mergeStatements(schema, table, fields, keys, rows) {
  const batches = [];
  let batch = [];
  for (const row of rows) {
    if (Buffer.byteLength(JSON.stringify(row)) > MAX_BATCH_BYTES) throw new Error(`Oversized public evidence row for ${table}`);
    if (batch.length && (batch.length >= 100 || Buffer.byteLength(JSON.stringify([...batch, row])) > MAX_BATCH_BYTES)) {
      batches.push(batch); batch = [];
    }
    batch.push(row);
  }
  if (batch.length) batches.push(batch);
  return batches.map((group, index) => ({ name: `${table}:${index + 1}`, statement:
    `MERGE INTO ${schema}.${table} t USING (SELECT r.*, current_timestamp() imported_at FROM (SELECT explode(from_json(:rows, 'ARRAY<STRUCT<${fields}>>')) r)) s ON ${keys.map(key => `t.${key}=s.${key}`).join(' AND ')} WHEN NOT MATCHED THEN INSERT *`,
  parameters: [{ name: 'rows', value: JSON.stringify(group), type: 'STRING' }] }));
}

export function buildPublicEvidencePlan({ directory = join(root, 'data/campus/research'), env = process.env } = {}) {
  const schema = schemaName(env);
  const paths = filesUnder(directory);
  const jsonPaths = paths.filter(path => path.endsWith('.json'));
  if (!jsonPaths.length || jsonPaths.length > MAX_FILES) throw new Error(`Research import requires 1–${MAX_FILES} JSON files`);
  const allFiles = new Map();
  let totalBytes = 0;
  for (const path of paths) {
    const raw = readFileSync(join(directory, path));
    totalBytes += raw.length;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('Public research bundle exceeds the 32 MB bound');
    allFiles.set(path, { path, raw, hash: sha256(raw) });
  }
  const documents = new Map();
  for (const path of jsonPaths) {
    const file = allFiles.get(path);
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.raw)); }
    catch { throw new Error(`Invalid JSON or UTF-8 in ${path}`); }
    documents.set(path, { ...file, value });
  }
  const versionInputs = [...allFiles.values()].map(file => [file.path, file.hash]);
  const importId = sha256(JSON.stringify([VERSION, versionInputs]));
  const snapshotRows = [], itemRows = [], documentSummaries = [];
  for (const doc of documents.values()) {
    const provenance = provenanceFor(doc, documents, allFiles);
    const shared = { import_id: importId, document_path: doc.path, snapshot_hash: doc.hash,
      provenance_status: provenance.status, provenance_json: JSON.stringify(provenance.references) };
    snapshotRows.push(...parts(doc.raw, { ...shared, byte_count: doc.raw.length }));
    const items = documentItems(doc.value);
    for (const item of items) {
      const bytes = Buffer.from(JSON.stringify(item.value));
      itemRows.push(...parts(bytes, { ...shared, row_id: sha256(JSON.stringify([doc.path, doc.hash, item.pointer])),
        json_pointer: item.pointer, item_hash: sha256(bytes), classification: classification(item, doc.path) }));
    }
    const collections = Array.isArray(doc.value) ? { '': doc.value.length } : object(doc.value) ?
      Object.fromEntries(Object.entries(doc.value).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [`/${escapePointer(key)}`, value.length])) : {};
    documentSummaries.push({ path: doc.path, snapshot_hash: doc.hash, bytes: doc.raw.length, items: items.length,
      collections, provenance_status: provenance.status, provenance_issues: provenance.issues });
  }
  if (itemRows.length > 20000) throw new Error('Public evidence import exceeds 20,000 item parts');
  const statements = [
    { name: 'schema', statement: `CREATE SCHEMA IF NOT EXISTS ${schema}`, parameters: [] },
    ...[['public_research_snapshots', snapshotFields], ['public_research_items', itemFields], ['public_research_imports', completionFields]].map(([table, fields]) => ({
      name: `table:${table}`, statement: `CREATE TABLE IF NOT EXISTS ${schema}.${table} (${fields},imported_at TIMESTAMP) USING DELTA`, parameters: [],
    })),
    ...mergeStatements(schema, 'public_research_snapshots', snapshotFields, ['import_id', 'document_path', 'part_index'], snapshotRows),
    ...mergeStatements(schema, 'public_research_items', itemFields, ['import_id', 'row_id', 'part_index'], itemRows),
  ];
  const attachments = [...allFiles.values()].filter(file => !file.path.endsWith('.json')).map(file => ({ path: file.path, sha256: file.hash, bytes: file.raw.length, storage: 'local_source_attachment_not_uploaded' }));
  const summary = { mode: 'preview', cloud_writes: false, format_version: VERSION, import_id: importId, target_schema: schema,
    json_documents: documents.size, json_bytes: [...documents.values()].reduce((sum, doc) => sum + doc.raw.length, 0),
    snapshot_parts: snapshotRows.length, item_parts: itemRows.length, items: documentSummaries.reduce((sum, doc) => sum + doc.items, 0),
    statements: statements.length + 1, documents: documentSummaries, attachments,
    provenance_issues: documentSummaries.filter(doc => doc.provenance_issues.length).map(doc => ({ path: doc.path, issues: doc.provenance_issues })),
    limitations: ['Only JSON bytes are uploaded; source PDFs remain local and their hashes are listed.',
      'Provenance status recorded means required metadata is present, with local referenced-file hashes checked where available; it does not establish current conditions or source completeness.',
      'Missing or invalid provenance is retained and labeled for quarantine, never promoted to verified evidence.',
      'Source gaps, empty alerts, uncertainty notes, and all original JSON fields are preserved. An import completion marker is not an assertion of source completeness.'],
  };
  const completionManifest = { ...summary };
  delete completionManifest.mode;
  delete completionManifest.cloud_writes;
  statements.push(...mergeStatements(schema, 'public_research_imports', completionFields, ['import_id'], [
    { import_id: importId, format_version: VERSION, manifest_json: JSON.stringify(completionManifest) },
  ]));
  if (statements.length > 1500) throw new Error('Public evidence import exceeds 1,500 statements');
  for (const item of statements) {
    if (Buffer.byteLength(JSON.stringify({ warehouse_id: 'x'.repeat(128), ...item, timeoutMs: 60000 })) >= 60000) throw new Error(`Statement exceeds the bounded transport size: ${item.name}`);
  }
  return { importId, summary, snapshotRows, itemRows, statements };
}

export async function applyPublicEvidencePlan(plan, config, executeStatement, { onStatement = () => {}, deadlineMs = 15 * 60_000 } = {}) {
  const deadline = Date.now() + deadlineMs;
  const statementIds = [];
  for (const item of plan.statements) {
    const remaining = deadline - Date.now();
    if (remaining < 1000) throw new Error('Public evidence import reached its 15-minute run bound; no remaining statements were submitted');
    const result = await executeStatement(config, { statement: item.statement, parameters: item.parameters, timeoutMs: Math.min(60000, remaining) });
    statementIds.push(result.statementId);
    onStatement(item.name, result.statementId);
  }
  return { import_id: plan.importId, statements_executed: statementIds.length, statement_ids: statementIds, import_completed: true };
}

function credentials(env, profile) {
  if (!env.DATABRICKS_HOST || !env.DATABRICKS_WAREHOUSE_ID) throw new Error('Set DATABRICKS_HOST and DATABRICKS_WAREHOUSE_ID for the intended workspace before --apply.');
  let token = env.DATABRICKS_TOKEN;
  const selected = profile || env.DATABRICKS_CONFIG_PROFILE;
  if (!token && selected) {
    const localCli = join(homedir(), '.local/bin/databricks');
    const cli = env.DATABRICKS_CLI_PATH || (existsSync(localCli) ? localCli : 'databricks');
    const result = spawnSync(cli, ['auth', 'token', '--profile', selected, '--host', env.DATABRICKS_HOST, '--timeout', '30s', '--output', 'json'], { encoding: 'utf8', timeout: 35000 });
    if (result.status !== 0) throw new Error('OAuth login required for the explicitly chosen Databricks profile.');
    try { token = JSON.parse(result.stdout).access_token; }
    catch { throw new Error('Invalid OAuth response; reauthenticate with the Databricks CLI.'); }
  }
  if (typeof token !== 'string' || !token.trim()) throw new Error('Choose an authenticated DATABRICKS_CONFIG_PROFILE or an existing server-side token. Nothing will be written to disk.');
  return { host: env.DATABRICKS_HOST, warehouseId: env.DATABRICKS_WAREHOUSE_ID, token };
}

async function main() {
  const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false }, profile: { type: 'string' }, directory: { type: 'string' }, help: { type: 'boolean' } }, strict: true });
  if (values.help) {
    console.log('node databricks/public-evidence.mjs [--directory <research-directory>] [--apply --profile <chosen-profile>]\nDefault: local preview only. --apply creates additive versioned public research tables; it does not replace existing data.');
    return;
  }
  const localEnv = join(root, '.env.local');
  const env = { ...(existsSync(localEnv) ? parseEnv(readFileSync(localEnv, 'utf8')) : {}), ...process.env };
  const plan = buildPublicEvidencePlan({ directory: values.directory ? resolve(values.directory) : undefined, env });
  if (!values.apply) { console.log(JSON.stringify(plan.summary, null, 2)); return; }
  const config = credentials(env, values.profile);
  const track = compileTrack();
  const { executeStatement, validateConfig } = track.load('integrations/databricks/statement.js');
  const result = await applyPublicEvidencePlan(plan, validateConfig(config), executeStatement, {
    onStatement: (name, id) => console.error(`${name}: ${id}`),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'Public evidence import failed'); process.exitCode = 1; });
}
