#!/usr/bin/env node
/** Local-only, bounded Spark notebook candidate for the official scheduled feed. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const base = fileURLToPath(new URL('../data/campus/transit-full/', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const names = ['agency', 'stops', 'routes', 'trips', 'stop_times', 'calendar', 'calendar_dates', 'feed_info', 'service_trips'];
const schemas = Object.freeze({
  transit_stops: 'source_sha256 STRING,stop_id STRING,stop_name STRING,stop_lat DOUBLE,stop_lon DOUBLE',
  transit_routes: 'source_sha256 STRING,route_id STRING,route_short_name STRING,route_long_name STRING',
  transit_trips: 'source_sha256 STRING,trip_id STRING,route_id STRING,service_id STRING,trip_headsign STRING',
  transit_stop_times: 'source_sha256 STRING,trip_id STRING,stop_sequence INT,stop_id STRING,arrival_seconds INT,departure_seconds INT,pickup_type INT,drop_off_type INT',
  transit_service_trips: 'source_sha256 STRING,service_date DATE,trip_id STRING,service_start_at TIMESTAMP',
  transit_source_archive: 'source_sha256 STRING,manifest_json STRING,agency_json STRING,calendar_json STRING,calendar_dates_json STRING,feed_info_json STRING',
  transit_imports: 'source_sha256 STRING,captured_at TIMESTAMP,service_start DATE,service_end DATE,source_kind STRING,source_url STRING',
});
const keys = Object.freeze({
  transit_stops: ['source_sha256', 'stop_id'], transit_routes: ['source_sha256', 'route_id'],
  transit_trips: ['source_sha256', 'trip_id'], transit_stop_times: ['source_sha256', 'trip_id', 'stop_sequence'],
  transit_service_trips: ['source_sha256', 'service_date', 'trip_id'],
  transit_source_archive: ['source_sha256'], transit_imports: ['source_sha256'],
});
const fail = message => { throw new Error(message); };
const unique = (rows, key, label) => {
  const values = rows.map(row => row[key]);
  if (values.some(value => typeof value !== 'string' || !value) || new Set(values).size !== values.length) fail(`${label}: invalid key`);
  return new Set(values);
};
const integer = (value, label, max = 200000) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > max) fail(`Invalid ${label}`);
  return number;
};
const seconds = value => {
  if (!/^\d{1,2}:\d{2}:\d{2}$/.test(value ?? '')) fail('Invalid GTFS time');
  const [hour, minute, second] = value.split(':').map(Number);
  if (hour > 47 || minute > 59 || second > 59) fail('Invalid GTFS time');
  return hour * 3600 + minute * 60 + second;
};

export function buildFullTransitNative({ directory = base } = {}) {
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  const archive = readFileSync(join(directory, 'source.zip'));
  if (archive.length > 15_000_000 || sha(archive) !== manifest.sha256 || !/^[a-f0-9]{64}$/.test(manifest.sha256)) fail('Source archive hash or size mismatch');
  const source = manifest.sha256;
  const input = Object.fromEntries(names.map(name => [name, JSON.parse(readFileSync(join(directory, `${name}.json`), 'utf8'))]));
  for (const name of names) {
    if (!Array.isArray(input[name]) || input[name].length !== manifest.counts?.[name] || input[name].length > 100000) fail(`${name}: count or limit mismatch`);
  }
  const stopIds = unique(input.stops, 'stop_id', 'stops');
  const routeIds = unique(input.routes, 'route_id', 'routes');
  const tripIds = unique(input.trips, 'trip_id', 'trips');
  const services = new Set([...input.calendar, ...input.calendar_dates].map(row => row.service_id));
  if (!services.size) fail('Missing service calendar');
  const sequences = new Set();
  const tables = {
    transit_stops: input.stops.map(row => {
      const stop_lat = Number(row.stop_lat), stop_lon = Number(row.stop_lon);
      if (!Number.isFinite(stop_lat) || !Number.isFinite(stop_lon) || Math.abs(stop_lat) > 90 || Math.abs(stop_lon) > 180) fail('Invalid coordinates');
      return { source_sha256: source, stop_id: row.stop_id, stop_name: row.stop_name ?? '', stop_lat, stop_lon };
    }),
    transit_routes: input.routes.map(row => ({ source_sha256: source, route_id: row.route_id, route_short_name: row.route_short_name ?? '', route_long_name: row.route_long_name ?? '' })),
    transit_trips: input.trips.map(row => {
      if (!routeIds.has(row.route_id) || !services.has(row.service_id)) fail('Invalid trip reference');
      return { source_sha256: source, trip_id: row.trip_id, route_id: row.route_id, service_id: row.service_id, trip_headsign: row.trip_headsign ?? '' };
    }),
    transit_stop_times: input.stop_times.map(row => {
      if (!tripIds.has(row.trip_id) || !stopIds.has(row.stop_id)) fail('Invalid stop time reference');
      const stop_sequence = integer(row.stop_sequence, 'stop sequence');
      const key = `${row.trip_id}\0${stop_sequence}`;
      if (sequences.has(key)) fail('Duplicate stop sequence');
      sequences.add(key);
      const arrival_seconds = seconds(row.arrival_time), departure_seconds = seconds(row.departure_time);
      if (departure_seconds < arrival_seconds) fail('Invalid stop chronology');
      const pickup_type = integer(row.pickup_type || '0', 'pickup type', 3);
      const drop_off_type = integer(row.drop_off_type || '0', 'drop-off type', 3);
      return { source_sha256: source, trip_id: row.trip_id, stop_sequence, stop_id: row.stop_id, arrival_seconds, departure_seconds, pickup_type, drop_off_type };
    }),
    transit_service_trips: input.service_trips.map(row => {
      if (!tripIds.has(row.trip_id)) fail('Invalid service trip reference');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.service_date) || row.service_date < manifest.service_start || row.service_date > manifest.service_end || !Number.isFinite(Date.parse(row.service_start_at))) fail('Invalid service trip date');
      return { source_sha256: source, service_date: row.service_date, trip_id: row.trip_id, service_start_at: row.service_start_at };
    }),
    transit_source_archive: [{ source_sha256: source, manifest_json: JSON.stringify(manifest), agency_json: JSON.stringify(input.agency), calendar_json: JSON.stringify(input.calendar), calendar_dates_json: JSON.stringify(input.calendar_dates), feed_info_json: JSON.stringify(input.feed_info) }],
    transit_imports: [{ source_sha256: source, captured_at: manifest.captured_at, service_start: manifest.service_start, service_end: manifest.service_end, source_kind: manifest.source_kind, source_url: manifest.source_url }],
  };
  if (sequences.size < tripIds.size || new Set(input.service_trips.map(r => `${r.service_date}\0${r.trip_id}`)).size !== input.service_trips.length) fail('Invalid trip coverage or duplicate service trip');
  const bundle = { source_sha256: source, tables, schemas, keys };
  const payload = Buffer.from(JSON.stringify(bundle));
  if (payload.length > 32 * 1024 * 1024) fail('Decoded payload exceeds 32 MB');
  const encoded = gzipSync(payload).toString('base64');
  const notebook = `# Databricks notebook source\n# Local deployment candidate: official public scheduled GTFS, no credentials.\nimport base64, gzip, hashlib, json\nfrom pyspark.sql import functions as F\nfrom datetime import date, datetime\n\nraw = gzip.decompress(base64.b64decode('${encoded}'))\nassert len(raw) <= 32 * 1024 * 1024\nassert hashlib.sha256(raw).hexdigest() == '${sha(payload)}'\nbundle = json.loads(raw)\nschema = 'workspace.beacon'\nspark.sql('CREATE SCHEMA IF NOT EXISTS ' + schema)\ncounts = {}\nfor table in ['transit_stops','transit_routes','transit_trips','transit_stop_times','transit_service_trips','transit_source_archive','transit_imports']:\n    fields = bundle['schemas'][table]\n    spark.sql('CREATE TABLE IF NOT EXISTS ' + schema + '.' + table + ' (' + fields + ',imported_at TIMESTAMP) USING DELTA')\n    rows = bundle['tables'][table]\n    assert len(rows) <= 100000\n    if rows:\n        for row in rows:\n            for column in fields.split(','):\n                name, kind = column.split(' ')\n                if kind == 'DATE': row[name] = date.fromisoformat(row[name])\n                if kind == 'TIMESTAMP': row[name] = datetime.fromisoformat(row[name].replace('Z', '+00:00'))\n        frame = spark.createDataFrame(rows, fields).withColumn('imported_at', F.current_timestamp())\n        view = 'beacon_native_' + table\n        frame.createOrReplaceTempView(view)\n        condition = ' AND '.join('t.' + key + '=s.' + key for key in bundle['keys'][table])\n        spark.sql('MERGE INTO ' + schema + '.' + table + ' t USING ' + view + ' s ON ' + condition + ' WHEN NOT MATCHED THEN INSERT *')\n    actual = spark.table(schema + '.' + table).where(F.col('source_sha256') == bundle['source_sha256']).count()\n    assert actual == len(rows), table + ': count mismatch'\n    counts[table] = actual\n    print('BEACON_TRANSIT_IMPORT', table, actual)\ndbutils.notebook.exit(json.dumps({'import_completed': True, 'source_sha256': bundle['source_sha256'], 'counts': counts}))\n`;
  return { notebook, summary: { source_sha256: source, status: 'local_deployment_candidate_not_run', counts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])), source_archive_bytes: archive.length, payload_bytes: payload.length, notebook_bytes: Buffer.byteLength(notebook), service_start: manifest.service_start, service_end: manifest.service_end } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { output: { type: 'string' }, directory: { type: 'string' } } });
    const plan = buildFullTransitNative({ directory: values.directory ?? base });
    if (values.output) writeFileSync(values.output, plan.notebook, { flag: 'wx' });
    console.log(JSON.stringify(plan.summary, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
