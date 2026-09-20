import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { buildFullTransitNative } from './full-transit-native.mjs';

const source = new URL('../data/campus/transit-full/', import.meta.url).pathname;
const unpack = notebook => JSON.parse(gunzipSync(Buffer.from(notebook.match(/base64\.b64decode\('([^']+)'\)/)[1], 'base64')));

test('real capture retains typed journey fields and expected counts', () => {
  const plan = buildFullTransitNative({ directory: source });
  const bundle = unpack(plan.notebook);
  assert.equal(bundle.tables.transit_stop_times.length, 74301);
  assert.equal(bundle.tables.transit_service_trips.length, 10456);
  assert.equal(bundle.tables.transit_imports[0].source_sha256, 'aed7634f4df2e942f1af101c24d05f53e2b8686013f0bbe843b0e1c8dd34dd85');
  assert.equal(typeof bundle.tables.transit_stop_times[0].arrival_seconds, 'number');
  assert.equal(typeof bundle.tables.transit_stop_times[0].stop_sequence, 'number');
  assert.equal(typeof bundle.tables.transit_stops[0].stop_lat, 'number');
  assert.equal(bundle.tables.transit_stop_times[0].arrival_seconds, 62400);
  assert.equal(plan.summary.counts.transit_stop_times, 74301);
  assert.equal(spawnSync('python3', ['-c', 'import sys; compile(sys.stdin.read(), "notebook", "exec")'], { input: plan.notebook, encoding: 'utf8' }).status, 0);
});

test('rejects altered source archive and broken normalized reference', () => {
  const dir = mkdtempSync(join(tmpdir(), 'transit-native-test-'));
  cpSync(source, dir, { recursive: true });
  writeFileSync(join(dir, 'source.zip'), Buffer.concat([readFileSync(join(dir, 'source.zip')), Buffer.from('x')]));
  assert.throws(() => buildFullTransitNative({ directory: dir }), /hash/i);
  cpSync(join(source, 'source.zip'), join(dir, 'source.zip'));
  const rows = JSON.parse(readFileSync(join(dir, 'stop_times.json')));
  rows[0].stop_id = 'missing-stop';
  writeFileSync(join(dir, 'stop_times.json'), JSON.stringify(rows));
  assert.throws(() => buildFullTransitNative({ directory: dir }), /source archive/i);
});

test('rejects same-count valid stop-time edit against authenticated ZIP', () => {
  const dir = mkdtempSync(join(tmpdir(), 'transit-native-time-edit-'));
  cpSync(source, dir, { recursive: true });
  const rows = JSON.parse(readFileSync(join(dir, 'stop_times.json')));
  rows[0].departure_time = '17:21:00';
  writeFileSync(join(dir, 'stop_times.json'), JSON.stringify(rows));
  assert.throws(() => buildFullTransitNative({ directory: dir }), /source archive/i);
});

test('rejects same-count valid service epoch edit against authenticated ZIP', () => {
  const dir = mkdtempSync(join(tmpdir(), 'transit-native-epoch-edit-'));
  cpSync(source, dir, { recursive: true });
  const rows = JSON.parse(readFileSync(join(dir, 'service_trips.json')));
  rows[0].service_start_at = '2026-09-19T05:00:00Z';
  writeFileSync(join(dir, 'service_trips.json'), JSON.stringify(rows));
  assert.throws(() => buildFullTransitNative({ directory: dir }), /source archive/i);
});

test('small controlled fixture keeps only its selected trip and typed seconds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'transit-native-small-'));
  const fixtureCode = `import json,sys
from pathlib import Path
sys.path.insert(0,sys.argv[2])
from test_full_transit import fixture
from full_transit import import_archive,TABLES
p=Path(sys.argv[1]); raw=fixture(); data=import_archive(raw,'2026-09-19',14)
(p/'source.zip').write_bytes(raw)
for name in (*TABLES,'service_trips'):
 (p/(name+'.json')).write_text(json.dumps(data[name]))
manifest={'sha256':data['source_sha256'],'counts':{name:len(data[name]) for name in (*TABLES,'service_trips')},'service_start':'2026-09-19','service_end':'2026-10-02','service_days':14,'agency_timezone':data['agency_timezone'],'captured_at':'2026-09-19T17:00:00Z','source_kind':'scheduled','source_url':'https://example.test/fixture.zip'}
(p/'manifest.json').write_text(json.dumps(manifest))
`;
  const ingest = new URL('./ingest/', import.meta.url).pathname;
  const setup = spawnSync('python3', ['-c', fixtureCode, dir, ingest], { encoding: 'utf8' });
  assert.equal(setup.status, 0, setup.stderr);
  const plan = buildFullTransitNative({ directory: dir });
  const bundle = unpack(plan.notebook);
  assert.equal(bundle.tables.transit_trips.length, 1);
  assert.equal(bundle.tables.transit_stop_times.length, 4);
  assert.equal(bundle.tables.transit_stop_times[0].trip_id, 'T');
  assert.equal(bundle.tables.transit_stop_times[0].arrival_seconds, 87000);
});

test('failed row merge cannot write completion marker', () => {
  const plan = buildFullTransitNative({ directory: source });
  const code = `import sys,types
sys.modules['pyspark']=types.ModuleType('pyspark')
sql=types.ModuleType('pyspark.sql')
sql.functions=types.SimpleNamespace(current_timestamp=lambda:None,col=lambda x:x)
sys.modules['pyspark.sql']=sql
class Frame:
 def withColumn(self,*a):return self
 def createOrReplaceTempView(self,*a):pass
class Spark:
 calls=[]
 def sql(self,q):
  self.calls.append(q)
  if q.startswith('MERGE'):raise RuntimeError('failed merge')
 def createDataFrame(self,*a):return Frame()
spark=Spark()
try:exec(compile(sys.stdin.read(),'notebook','exec'))
except RuntimeError as e:assert str(e)=='failed merge'
else:raise AssertionError('expected merge failure')
assert not any('transit_imports' in q for q in spark.calls)
`;
  const result = spawnSync('python3', ['-c', code], { input: plan.notebook, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('same ZIP refresh updates capture and horizon only after verified source rows, preserving older service dates', () => {
  const baseline = mkdtempSync(join(tmpdir(), 'transit-native-recapture-baseline-'));
  const seed = `import json,sys
from pathlib import Path
sys.path.insert(0,sys.argv[2])
from test_full_transit import fixture
from full_transit import import_archive,TABLES
p=Path(sys.argv[1]);raw=fixture();data=import_archive(raw,'2026-09-18',14)
(p/'source.zip').write_bytes(raw)
for name in (*TABLES,'service_trips'):(p/(name+'.json')).write_text(json.dumps(data[name]))
m={'sha256':data['source_sha256'],'counts':{name:len(data[name]) for name in (*TABLES,'service_trips')},'service_start':'2026-09-18','service_end':'2026-10-01','service_days':14,'agency_timezone':data['agency_timezone'],'captured_at':'2026-09-19T17:00:00Z','source_kind':'scheduled','source_url':'https://example.test/fixture.zip'}
(p/'manifest.json').write_text(json.dumps(m))
`;
  const seedResult = spawnSync('python3', ['-c', seed, baseline, new URL('./ingest/', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(seedResult.status, 0, seedResult.stderr);
  const dir = mkdtempSync(join(tmpdir(), 'transit-native-recapture-'));
  cpSync(baseline, dir, { recursive: true });
  const prepare = `import json,sys
from pathlib import Path
from datetime import date,datetime,timedelta
sys.path.insert(0,sys.argv[2])
from full_transit import import_archive
p=Path(sys.argv[1]); m=json.loads((p/'manifest.json').read_text())
start=date.fromisoformat(m['service_start'])+timedelta(days=1)
updated=import_archive((p/'source.zip').read_bytes(),start,m['service_days'])
m['service_start']=start.isoformat();m['service_end']=(start+timedelta(days=m['service_days']-1)).isoformat()
m['captured_at']=(datetime.fromisoformat(m['captured_at'].replace('Z','+00:00'))+timedelta(hours=1)).isoformat()
m['counts']['service_trips']=len(updated['service_trips'])
(p/'manifest.json').write_text(json.dumps(m));(p/'service_trips.json').write_text(json.dumps(updated['service_trips']))
`;
  const setup = spawnSync('python3', ['-c', prepare, dir, new URL('./ingest/', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(setup.status, 0, setup.stderr);
  const previous = buildFullTransitNative({ directory: baseline });
  const next = buildFullTransitNative({ directory: dir });
  assert.equal(previous.summary.source_sha256, next.summary.source_sha256);
  assert.notEqual(previous.summary.service_start, next.summary.service_start);
  const verify = `import sys,types,json,copy
from datetime import date,datetime
from collections import Counter
programs=json.load(sys.stdin)
sys.modules['pyspark']=types.ModuleType('pyspark')
module=types.ModuleType('pyspark.sql')
class Column:
 def __init__(self,name):self.name=name
 def __eq__(self,value):return lambda row:row[self.name]==value
 def between(self,a,b):return lambda row:a<=row[self.name]<=b
module.functions=types.SimpleNamespace(current_timestamp=lambda:datetime.now(),col=Column)
sys.modules['pyspark.sql']=module
class Frame:
 def __init__(self,rows):self.rows=copy.deepcopy(rows)
 def withColumn(self,key,value):
  for row in self.rows:row[key]=value
  return self
 def createOrReplaceTempView(self,name):spark.views[name]=self.rows
 def where(self,predicate):return Frame([row for row in self.rows if predicate(row)])
 def count(self):return len(self.rows)
 def select(self,*columns):return Frame([{key:row[key] for key in columns} for row in self.rows])
 def exceptAll(self,other):
  counts=Counter(json.dumps(row,sort_keys=True,default=str) for row in other.rows);out=[]
  for row in self.rows:
   key=json.dumps(row,sort_keys=True,default=str)
   if counts[key]:counts[key]-=1
   else:out.append(row)
  return Frame(out)
 def limit(self,n):return Frame(self.rows[:n])
class Spark:
 def __init__(self):self.data={};self.views={};self.calls=[];self.fail=False
 def sql(self,q):
  self.calls.append(q)
  if not q.startswith('MERGE'):return
  table=q.split(' ')[2].split('.')[-1];incoming=self.views['beacon_native_'+table]
  if self.fail and table=='transit_service_trips':raise RuntimeError('service merge failed')
  if table not in ('transit_source_archive','transit_imports'):assert 'WHEN MATCHED' not in q
  rows=self.data.setdefault(table,[]);keys=environment['bundle']['keys'][table]
  index={tuple(value[key] for key in keys):value for value in rows}
  for row in incoming:
   old=index.get(tuple(row[key] for key in keys))
   if old is None:rows.append(copy.deepcopy(row))
   elif table=='transit_imports':
    assert 's.captured_at > t.captured_at' in q
    if row['captured_at']>old['captured_at']:old.update(copy.deepcopy(row))
   elif table=='transit_source_archive':
    assert 'get_json_object' in q
    if json.loads(row['manifest_json'])['captured_at']>json.loads(old['manifest_json'])['captured_at']:old.update(copy.deepcopy(row))
 def createDataFrame(self,rows,fields):return Frame(rows)
 def table(self,name):return Frame(self.data.get(name.split('.')[-1],[]))
spark=Spark();completed=[]
dbutils=types.SimpleNamespace(notebook=types.SimpleNamespace(exit=lambda value:completed.append(json.loads(value))))
environment={'spark':spark,'dbutils':dbutils}
exec(programs['previous'],environment)
old_marker=copy.deepcopy(spark.data['transit_imports'][0]);old_services=copy.deepcopy(spark.data['transit_service_trips'])
before=len(spark.calls)
spark.data['transit_stop_times'][0]['arrival_seconds']+=60
try:exec(programs['next'],environment)
except AssertionError as error:assert 'stored values mismatch' in str(error)
else:raise AssertionError('Expected stored value mismatch')
assert spark.data['transit_imports'][0]==old_marker
assert not any('MERGE INTO workspace.beacon.transit_source_archive' in q for q in spark.calls[before:])
spark.data['transit_stop_times'][0]['arrival_seconds']-=60
spark.fail=True;before=len(spark.calls)
try:exec(programs['next'],environment)
except RuntimeError as error:assert str(error)=='service merge failed'
else:raise AssertionError('Expected failure')
assert spark.data['transit_imports'][0]==old_marker
assert not any('MERGE INTO workspace.beacon.transit_source_archive' in q or 'MERGE INTO workspace.beacon.transit_imports' in q for q in spark.calls[before:])
spark.fail=False;before=len(spark.calls)
exec(programs['next'],environment)
new_marker=spark.data['transit_imports'][0]
assert new_marker['captured_at']>old_marker['captured_at']
assert new_marker['service_start']>old_marker['service_start']
assert new_marker['source_sha256']==old_marker['source_sha256']
retained={json.dumps(row,sort_keys=True,default=str) for row in spark.data['transit_service_trips']}
assert all(json.dumps(row,sort_keys=True,default=str) in retained for row in old_services)
merges=[q for q in spark.calls[before:] if q.startswith('MERGE')]
assert 'transit_source_archive' in merges[-2] and 'transit_imports' in merges[-1]
assert len(completed)==2 and completed[-1]['import_completed']
# Replaying an older capture must fail validation and cannot roll back the current marker.
try:exec(programs['previous'],environment)
except AssertionError:pass
else:raise AssertionError('Expected stale capture rejection')
assert spark.data['transit_imports'][0]==new_marker
`;
  const result = spawnSync('python3', ['-c', verify], { input: JSON.stringify({ previous: previous.notebook, next: next.notebook }), encoding: 'utf8', maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
});
