import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { buildNativePublicImport } from './native-public-import.mjs';

test('native import retains all accepted source records and completion identity', () => {
  const plan = buildNativePublicImport({ env: {} });
  const encoded = plan.notebook.match(/base64\.b64decode\('([^']+)'\)/)[1];
  const bytes = gunzipSync(Buffer.from(encoded, 'base64'));
  const data = JSON.parse(bytes);
  assert.ok(plan.notebook.includes(createHash('sha256').update(bytes).digest('hex')));
  assert.equal(data.schema, '`workspace`.`beacon`');
  assert.equal(data.tables.public_evidence_records.filter(r => r.dataset === 'crime').length, 719);
  assert.equal(data.tables.public_evidence_records.filter(r => r.dataset === 'lighting').length, 1179);
  assert.equal(data.tables.public_research_imports[0].import_id, plan.importId);
  assert.equal(data.tables.public_evidence_records.length, plan.summary.native_record_count);
  const crime = data.tables.public_evidence_records.find(r => r.dataset === 'crime');
  assert.equal(crime.provenance_status, 'recorded');
  assert.ok(JSON.parse(crime.payload_json).source_url.startsWith('https://police.vt.edu/'));
});

test('native notebook compiles and rejects identifier injection before generation', () => {
  const plan = buildNativePublicImport({ env: {} });
  const result = spawnSync('python3', ['-c', 'import sys; compile(sys.stdin.read(), "native-import", "exec")'], { input: plan.notebook, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.throws(() => buildNativePublicImport({ env: { DATABRICKS_SCHEMA: 'bad; DROP TABLE x' } }));
});

test('native script verifies data merges before writing the completion table', () => {
  const plan = buildNativePublicImport({ env: {} });
  const testCode = `
import sys, types
sys.modules['pyspark'] = types.ModuleType('pyspark')
sql = types.ModuleType('pyspark.sql')
sql.functions = types.SimpleNamespace(current_timestamp=lambda: None, col=lambda name: None)
sys.modules['pyspark.sql'] = sql
class Frame:
    def withColumn(self, *args): return self
    def createOrReplaceTempView(self, name): pass
class Spark:
    calls = []
    def sql(self, query):
        self.calls.append(query)
        if query.startswith('MERGE'): raise RuntimeError('injected upload failure')
    def createDataFrame(self, *args): return Frame()
spark = Spark()
try:
    exec(compile(sys.stdin.read(), 'notebook', 'exec'))
except RuntimeError as error:
    assert str(error) == 'injected upload failure'
else:
    raise AssertionError('expected failure')
assert not any('public_research_imports' in q for q in spark.calls)
`;
  const result = spawnSync('python3', ['-c', testCode], { input: plan.notebook, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
