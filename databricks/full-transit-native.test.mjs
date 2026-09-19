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
  assert.throws(() => buildFullTransitNative({ directory: dir }), /reference/i);
});

test('small controlled fixture keeps only its selected trip and typed seconds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'transit-native-small-'));
  cpSync(source, dir, { recursive: true });
  const read = name => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
  const trip = read('trips')[0];
  const times = read('stop_times').filter(row => row.trip_id === trip.trip_id);
  const stopIds = new Set(times.map(row => row.stop_id));
  const serviceTrip = read('service_trips').find(row => row.trip_id === trip.trip_id);
  const tables = {
    agency: read('agency'), stops: read('stops').filter(row => stopIds.has(row.stop_id)),
    routes: read('routes').filter(row => row.route_id === trip.route_id), trips: [trip],
    stop_times: times, calendar: read('calendar'),
    calendar_dates: read('calendar_dates').filter(row => row.service_id === trip.service_id),
    feed_info: read('feed_info'), service_trips: [serviceTrip],
  };
  const manifest = read('manifest');
  manifest.counts = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  for (const [name, rows] of Object.entries(tables)) writeFileSync(join(dir, `${name}.json`), JSON.stringify(rows));
  const plan = buildFullTransitNative({ directory: dir });
  const bundle = unpack(plan.notebook);
  assert.equal(bundle.tables.transit_trips.length, 1);
  assert.equal(bundle.tables.transit_stop_times.length, times.length);
  assert.equal(bundle.tables.transit_stop_times[0].trip_id, trip.trip_id);
  assert.equal(bundle.tables.transit_stop_times[0].arrival_seconds, 62400);
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
