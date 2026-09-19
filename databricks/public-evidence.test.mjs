import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { root } from './build.mjs';

const api = await import('./public-evidence.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
  throw error;
});
const hash = value => createHash('sha256').update(value).digest('hex');
const source = { source_url: 'https://police.vt.edu/example.pdf', source_hash: 'a'.repeat(64), captured_at: '2026-09-19T12:00:00Z' };
function fixture(t, files) {
  const directory = mkdtempSync(join(tmpdir(), 'beacon-research-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [name, value] of Object.entries(files)) {
    mkdirSync(join(directory, name, '..'), { recursive: true });
    writeFileSync(join(directory, name), typeof value === 'string' ? value : JSON.stringify(value));
  }
  return directory;
}
function decode(parts) {
  return Buffer.concat([...parts].sort((a, b) => a.part_index - b.part_index).map(part => Buffer.from(part.payload_base64, 'base64'))).toString('utf8');
}

test.beforeEach(() => assert.ok(api, 'The standalone public evidence loader must exist'));

test('preview covers actual crime, weather hourly/alerts, provenance and quarantine', () => {
  const plan = api.buildPublicEvidencePlan({ env: {} });
  const byPath = Object.fromEntries(plan.summary.documents.map(doc => [doc.path, doc]));
  assert.equal(byPath['crime-records-2026.json'].collections[''], 719);
  assert.equal(byPath['crime-manifest-2026.json'].collections['/gaps'], 1);
  assert.equal(byPath['weather.json'].collections['/hourly'], 72);
  assert.equal(byPath['weather.json'].collections['/alerts'], 0);
  assert.equal(byPath['lighting/observations.json'].collections[''], 1179);
  assert.ok(plan.itemRows.some(row => row.document_path === 'weather.json' && row.json_pointer === '/alerts' && row.classification === 'empty_collection'));
  assert.ok(plan.itemRows.some(row => row.document_path === 'crime-manifest-2026.json' && row.json_pointer === '/gaps/0' && row.classification === 'quarantined_source_row'));
  assert.ok(plan.itemRows.some(row => row.document_path === 'notices.json' && row.json_pointer.startsWith('/sources/')));
  assert.ok(plan.itemRows.some(row => row.document_path === 'lighting/provenance.json' && row.json_pointer === '/limitations/0'));
  assert.equal(plan.summary.mode, 'preview');
});

test('default CLI previews with no credentials or cloud calls', t => {
  const directory = fixture(t, { 'records.json': [{ id: 'same', ...source }] });
  const result = spawnSync(process.execPath, ['databricks/public-evidence.mjs', '--directory', directory], {
    cwd: root, encoding: 'utf8', env: { ...process.env, DATABRICKS_HOST: '', DATABRICKS_WAREHOUSE_ID: '', DATABRICKS_TOKEN: '', DATABRICKS_CONFIG_PROFILE: '' },
  });
  assert.equal(result.status, 0, result.stderr);
  const preview = JSON.parse(result.stdout);
  assert.equal(preview.mode, 'preview');
  assert.equal(preview.cloud_writes, false);
});

test('identity is repeatable, preserves repeated IDs, and versions changed bytes', t => {
  const directory = fixture(t, { 'records.json': [{ id: 'duplicate', text: 'one', ...source }, { id: 'duplicate', text: 'two', ...source }] });
  const first = api.buildPublicEvidencePlan({ directory, env: {} });
  const again = api.buildPublicEvidencePlan({ directory, env: {} });
  assert.equal(first.importId, again.importId);
  assert.deepEqual(first.itemRows, again.itemRows);
  assert.equal(new Set(first.itemRows.map(row => row.row_id)).size, 2);
  writeFileSync(join(directory, 'records.json'), JSON.stringify([{ id: 'duplicate', text: 'new', ...source }]));
  const changed = api.buildPublicEvidencePlan({ directory, env: {} });
  assert.notEqual(changed.importId, first.importId);
  assert.notEqual(changed.itemRows[0].row_id, first.itemRows[0].row_id);
});

test('raw snapshots and large JSON values reconstruct exactly within transport bounds', t => {
  const text = 'O’Shaughnessy\n"quoted"\\path\u0000 ☔'.repeat(5000);
  const raw = JSON.stringify({ ...source, notes: text }, null, 2) + '\n';
  const directory = fixture(t, { 'notes.json': raw });
  const plan = api.buildPublicEvidencePlan({ directory, env: {} });
  assert.equal(decode(plan.snapshotRows), raw);
  assert.equal(hash(decode(plan.snapshotRows)), plan.snapshotRows[0].snapshot_hash);
  const noteParts = plan.itemRows.filter(row => row.json_pointer === '/notes');
  assert.ok(noteParts.length > 1);
  assert.equal(JSON.parse(decode(noteParts)), text);
  for (const item of plan.statements) {
    assert.ok(Buffer.byteLength(JSON.stringify(item)) < 60000, item.name);
    assert.ok(item.parameters.every(parameter => parameter.type === 'STRING'));
  }
});

test('SQL values remain named parameters and tables are insert-only', t => {
  const injected = "O'Shaughnessy'); DROP TABLE students; --";
  const directory = fixture(t, { 'records.json': [{ id: injected, ...source }] });
  const plan = api.buildPublicEvidencePlan({ directory, env: {} });
  for (const item of plan.statements) {
    assert.ok(!item.statement.includes(injected));
    assert.ok(!/\b(DROP|TRUNCATE|DELETE|REPLACE|UPDATE)\b/i.test(item.statement));
    if (/^MERGE/.test(item.statement)) assert.ok(item.statement.includes(':rows'));
  }
  assert.equal(JSON.parse(decode(plan.itemRows)).id, injected);
  assert.throws(() => api.buildPublicEvidencePlan({ directory, env: { DATABRICKS_SCHEMA: 'x; DROP' } }), /identifiers/);
});

test('malformed JSON fails before a plan can be applied', t => {
  const directory = fixture(t, { 'bad.json': '{"bad":' });
  assert.throws(() => api.buildPublicEvidencePlan({ directory, env: {} }), /Invalid JSON.*bad.json/);
});

test('missing or malformed provenance is preserved and explicitly quarantined', t => {
  const directory = fixture(t, { 'missing.json': [{ id: '1', location: 'public' }], 'bad-source.json': [{ id: '2', ...source, source_hash: 'not-a-hash' }] });
  const plan = api.buildPublicEvidencePlan({ directory, env: {} });
  assert.equal(plan.summary.documents.find(doc => doc.path === 'missing.json').provenance_status, 'missing');
  assert.equal(plan.summary.documents.find(doc => doc.path === 'bad-source.json').provenance_status, 'invalid');
  assert.ok(plan.itemRows.every(row => row.provenance_status !== 'recorded'));
  assert.equal(plan.snapshotRows.length, 2);
  assert.ok(plan.summary.provenance_issues.length >= 2);
});

test('companion file hashes are checked instead of silently trusting provenance', t => {
  const directory = fixture(t, {
    'lighting/observations.json': [{ id: 'lamp', source_url: 'https://www.openstreetmap.org/node/1' }],
    'lighting/provenance.json': { url: 'https://overpass-api.de/api/interpreter', sha256: 'b'.repeat(64), captured_at: source.captured_at, files: [{ path: 'observations.json', sha256: 'c'.repeat(64) }] },
  });
  const plan = api.buildPublicEvidencePlan({ directory, env: {} });
  const doc = plan.summary.documents.find(row => row.path === 'lighting/observations.json');
  assert.equal(doc.provenance_status, 'invalid');
  assert.ok(doc.provenance_issues.some(issue => issue.includes('HASH_MISMATCH')));
});

test('a mismatched source PDF also invalidates records that cite its metadata', t => {
  const directory = fixture(t, {
    'records.json': [{ id: '1', ...source }],
    'crime-2026-01-source.json': { ...source, archive_file: 'crime-2026-01.pdf.gz' },
  });
  writeFileSync(join(directory, 'crime-2026-01.pdf.gz'), gzipSync('changed PDF bytes'));
  const plan = api.buildPublicEvidencePlan({ directory, env: {} });
  const records = plan.summary.documents.find(row => row.path === 'records.json');
  assert.equal(records.provenance_status, 'invalid');
  assert.ok(records.provenance_issues.some(issue => issue.includes('HASH_MISMATCH')));
});

test('every cited source hash is checked when records share a URL', t => {
  const directory = fixture(t, {
    'records.json': [{ id: 'bad', ...source, source_hash: 'b'.repeat(64) }, { id: 'good', ...source }],
    'crime-2026-01-source.json': source,
  });
  const plan = api.buildPublicEvidencePlan({ directory, env: {} });
  assert.equal(plan.summary.documents.find(row => row.path === 'records.json').provenance_status, 'invalid');
});

test('the completion manifest does not retain a misleading preview execution state', t => {
  const directory = fixture(t, { 'records.json': [{ id: '1', ...source }] });
  const plan = api.buildPublicEvidencePlan({ directory, env: {} });
  const completion = JSON.parse(plan.statements.at(-1).parameters[0].value)[0];
  const manifest = JSON.parse(completion.manifest_json);
  assert.equal(manifest.mode, undefined);
  assert.equal(manifest.cloud_writes, undefined);
  assert.equal(manifest.import_id, plan.importId);
});

test('successful apply writes completion last and failure never writes completion', async t => {
  const directory = fixture(t, { 'records.json': [{ id: '1', ...source }] });
  const plan = api.buildPublicEvidencePlan({ directory, env: {} });
  const executed = [];
  await api.applyPublicEvidencePlan(plan, {}, async (_config, request) => { executed.push(request.statement); return { statementId: `s${executed.length}` }; });
  assert.match(executed.at(-1), /MERGE INTO .*public_research_imports/);
  const failing = [];
  await assert.rejects(api.applyPublicEvidencePlan(plan, {}, async (_config, request) => {
    failing.push(request.statement);
    if (failing.length === 5) throw new Error('test failure');
    return { statementId: 's' };
  }), /test failure/);
  assert.ok(!failing.some(sql => /MERGE INTO .*public_research_imports/.test(sql)));
});
