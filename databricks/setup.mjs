import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { root } from './build.mjs';

export function schemaName(env = process.env) {
  const names = [env.DATABRICKS_CATALOG || 'workspace', env.DATABRICKS_SCHEMA || 'beacon'];
  if (names.some(name => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))) throw new Error('Catalog/schema must be simple identifiers (letters, digits, underscores).');
  return names.map(name => '`' + name + '`').join('.');
}
export function bootstrapStatements(env = process.env) {
  return readFileSync(join(root, 'databricks/sql/bootstrap.sql'), 'utf8')
    .replaceAll('__SCHEMA__', schemaName(env)).split('-- COMMAND --').map(sql => sql.trim()).filter(Boolean);
}
const imports = {
  'source-manifest': ['source_manifest', 'source_id', 'source_id STRING,title STRING,source_url STRING,captured_at TIMESTAMP,sha256 STRING,source_kind STRING,coverage STRING,license_note STRING,limitations STRING,row_count BIGINT'],
  'incident-reports': ['incident_reports', 'report_id', 'report_id STRING,reported_date DATE,offense STRING,location STRING,occurrence_start STRING,occurrence_end STRING,disposition STRING,source_id STRING,source_url STRING,source_page INT,extraction_method STRING,coverage_note STRING'],
  'emergency-phones': ['emergency_phones', 'phone_id', 'phone_id STRING,location STRING,longitude DOUBLE,latitude DOUBLE,operational_status STRING,source_id STRING'],
  'transit-departures': ['transit_departures', 'corridor_id,trip_id,service_date', 'corridor_id STRING,trip_id STRING,route_id STRING,route_name STRING,service_date DATE,departure_at TIMESTAMP,arrival_at TIMESTAMP,travel_minutes DOUBLE,from_stop_id STRING,to_stop_id STRING,source_id STRING,source_version STRING'],
  'route-context': ['route_context', 'corridor_id,context_version', 'corridor_id STRING,context_version STRING,updated_at TIMESTAMP,valid_until TIMESTAMP,valid_from TIMESTAMP,weather STRING,lighting STRING,walking_path_closed BOOLEAN,active_official_alert BOOLEAN,historical_report_count BIGINT,history_lookback_days INT,source_url STRING'],
  'route-evidence': ['route_evidence', 'corridor_id', 'corridor_id STRING,source_version STRING,captured_at TIMESTAMP,payload_json STRING'],
};
export function importStatements(env = process.env) {
  const schema = schemaName(env);
  const dir = join(root, 'data/campus');
  const statements = [];
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const dataset = file.slice(0, -5);
    const raw = readFileSync(join(dir, file), 'utf8');
    const rows = JSON.parse(raw);
    const hash = createHash('sha256').update(raw).digest('hex');
    // Large source objects are reversible key/index/value records in bronze;
    // the source-file SHA remains the identity of the original snapshot.
    const records = Array.isArray(rows) ? rows : Object.entries(rows).flatMap(([key, value]) =>
      Array.isArray(value) ? value.length ? value.map((entry, index) => ({ key, index, value:entry })) : [{key,value:[]}] : [{key,value}]);
    const parts = batches(records).map(part => JSON.stringify(part));
    for (const [index, payload] of parts.entries()) {
      if (Buffer.byteLength(JSON.stringify(payload)) > 40000) throw new Error(`${file} contains an oversized snapshot record.`);
      const partName = parts.length > 1 ? `${dataset}:part-${index + 1}-of-${parts.length}` : dataset;
      statements.push({ name: `snapshot:${partName}`, statement: `MERGE INTO ${schema}.public_snapshots t USING (SELECT :dataset dataset, :hash snapshot_hash, :payload payload, current_timestamp() imported_at) s ON t.dataset=s.dataset AND t.snapshot_hash=s.snapshot_hash WHEN NOT MATCHED THEN INSERT *`, parameters: [{ name:'dataset', value:partName }, { name:'hash', value:hash }, { name:'payload', value:payload }] });
    }
    const spec = imports[dataset];
    if (!spec) continue;
    if (!Array.isArray(rows)) throw new Error(`${file} must contain an array.`);
    const [table, keys, fields] = spec;
    const normalized = dataset === 'route-evidence' ? rows.map(row=>({corridor_id:row.corridor_id,source_version:row.source_version,captured_at:row.captured_at,payload_json:JSON.stringify(row)})) : rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Array.isArray(value) || (value && typeof value === 'object') ? JSON.stringify(value) : value])));
    // Small bounded batches keep INLINE statement payloads predictable.
    for (const [index, batch] of batches(normalized).entries()) {
      statements.push({ name:`${table}:${index}`, statement: `MERGE INTO ${schema}.${table} t USING (SELECT r.* FROM (SELECT explode(from_json(:rows, 'ARRAY<STRUCT<${fields}>>')) r)) s ON ${keys.split(',').map(k => `t.${k}=s.${k}`).join(' AND ')} WHEN MATCHED THEN UPDATE SET * WHEN NOT MATCHED THEN INSERT *`, parameters:[{ name:'rows', value:JSON.stringify(batch) }] });
    }
  }
  return statements;
}

function batches(rows) {
  const chunks = [];
  let batch = [], bytes = 2;
  for (const row of rows) {
    const size = Buffer.byteLength(JSON.stringify(JSON.stringify(row))) + 1;
    if (size > 20000) throw new Error('Public data record is too large for a bounded import.');
    if (batch.length && (bytes + size > 20000 || batch.length >= 100)) { chunks.push(batch); batch = []; bytes = 2; }
    batch.push(row); bytes += size;
  }
  if (batch.length) chunks.push(batch);
  return chunks.length ? chunks : [[]];
}
