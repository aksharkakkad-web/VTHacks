#!/usr/bin/env node
/** Local public-data refresh; no credentials, cloud commands, or scheduling. */
import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data/campus');
const HOUR = 3_600_000, DAY = 24 * HOUR;
const DATASETS = ['weather', 'closures', 'transit', 'lighting', 'crime', 'waiting'];
const LIGHT_QUERY = '[out:json][timeout:40];(nwr["highway"="street_lamp"](37.205,-80.44,37.245,-80.395);nwr["lit"](37.205,-80.44,37.245,-80.395););out meta geom;';
const LIGHT_URL = 'https://overpass-api.de/api/interpreter';
const hash = value => createHash('sha256').update(value).digest('hex');
const instant = value => typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
const localDate = time => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n');
  await rename(temporary, path);
}
function captureState(capturedAt, now, ttl) {
  const capture = instant(capturedAt);
  if (!Number.isFinite(capture) || capture > now) throw new Error('Invalid source capture timestamp');
  const validUntil = ttl === null ? null : new Date(capture + ttl).toISOString();
  return { capturedAt, validUntil, state: ttl === null ? 'historical' : capture + ttl > now ? 'current_snapshot' : 'stale' };
}

/** Read-only inventory. A successful fetch does not assert operational conditions. */
export async function refreshStatus(dataRoot = DATA, now = Date.now()) {
  if (!Number.isFinite(now)) throw new Error('Invalid evaluation time');
  const datasets = {};
  const inspect = async (name, fn) => {
    try { datasets[name] = await fn(); }
    catch { datasets[name] = { state: 'unavailable_or_invalid', capturedAt: null, validUntil: null }; }
  };
  for (const name of ['weather', 'closures']) await inspect(name, async () => {
    const value = await json(join(dataRoot, `research/${name}.json`));
    if (!Array.isArray(value.records) || !value.sources?.length) throw new Error('Missing provenance');
    const captures = [value.captured_at, ...value.sources.map(source => source.captured_at)];
    captures.forEach(capture => captureState(capture, now, null));
    const result = captureState(new Date(Math.min(...captures.map(instant))).toISOString(), now, name === 'closures' ? HOUR : DAY);
    if (name === 'weather') {
      const current = value.records.filter(row => instant(row.valid_from) <= now && instant(row.valid_until) > now && instant(row.updated_at) <= now && instant(row.updated_at) + DAY > now);
      if (!current.length) result.state = 'stale';
      else result.validUntil = new Date(Math.min(instant(result.validUntil), ...current.map(row => Math.min(instant(row.valid_until), instant(row.updated_at) + DAY)))).toISOString();
    }
    return { ...result, records: value.records.length, limitations: value.limitations };
  });
  await inspect('transit', async () => {
    const value = await json(join(dataRoot, 'transit-full/manifest.json'));
    const result = captureState(value.captured_at, now, DAY);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.service_start) || !/^\d{4}-\d{2}-\d{2}$/.test(value.service_end) || value.service_end < value.service_start || !value.counts?.service_trips) throw new Error('Invalid transit horizon');
    const inHorizon = value.service_start <= localDate(now) && localDate(now) <= value.service_end;
    return { ...result, state: inHorizon ? result.state : 'outside_service_horizon', serviceStart: value.service_start, serviceEnd: value.service_end, serviceTrips: value.counts.service_trips, sourceKind: 'scheduled', liveArrivals: false };
  });
  await inspect('waiting', async () => {
    const value = await json(join(dataRoot, 'waiting-locations.json'));
    const result = captureState(value.captured_at, now, DAY);
    if (!value.records?.length || value.records.some(row => !(instant(row.closes_at) > instant(row.opens_at)))) throw new Error('Invalid hours');
    const closes = Math.max(...value.records.map(row => instant(row.closes_at)));
    result.validUntil = new Date(Math.min(instant(result.validUntil), closes)).toISOString();
    if (instant(result.validUntil) <= now || value.service_date !== localDate(now)) result.state = 'stale';
    return { ...result, serviceDate: value.service_date, records: value.records.length, refreshMode: 'reviewed_date_specific_hours', blocker: 'Review official rendered hours and exceptions for the demo date; pass --waiting-reviewed FILE. Published hours do not confirm access or pickup permission.' };
  });
  await inspect('lighting', async () => {
    const value = await json(join(dataRoot, 'research/lighting/provenance.json'));
    const observations = await json(join(dataRoot, 'research/lighting/observations.json'));
    if (!Array.isArray(observations) || !observations.length) throw new Error('No lighting observations');
    return { ...captureState(value.captured_at, now, 7 * DAY), records: observations.length, evidenceKind: 'community_unverified', operatingStatus: 'unknown', observationTime: 'Object edit times do not establish survey times.' };
  });
  await inspect('measuredLighting', async () => {
    const value = await json(join(dataRoot, 'research/lighting-measured-2026.json'));
    if (value.classification !== 'historical_field_measurement' || value.operational_lighting_verified_now !== false || !value.collection_windows?.length) throw new Error('Invalid historical evidence');
    return { ...captureState(value.captured_at, now, null), collectionWindows: value.collection_windows, refreshMode: 'static_historical_source', operatingStatus: 'unknown' };
  });
  await inspect('crime', async () => {
    const value = await json(join(dataRoot, `research/crime-manifest-${localDate(now).slice(0, 4)}.json`));
    return { ...captureState(value.captured_at, now, null), coverage: value.coverage, records: value.records, reportedDateEnd: value.reported_date_max_within_scope, sourceGaps: value.gaps?.length ?? null, sourceRefreshDue: instant(value.captured_at) + DAY <= now, refreshMode: 'published_historical_documents', liveThreatFeed: false };
  });
  let lastAttempt = null;
  try { lastAttempt = await json(join(dataRoot, 'journey-refresh-status.json')); } catch { /* No local run yet. */ }
  return { version: 'beacon-refresh-v1', evaluatedAt: new Date(now).toISOString(), dataRoot: resolve(dataRoot), datasets, lastAttempt,
    activation: { state: 'not_activated_by_this_tool', cloudWrites: false, requiredApproval: 'Akshar approval required before importing reviewed snapshots into Databricks or changing the existing job.' } };
}

export function normalizeLighting(document) {
  if (document.remark || !Array.isArray(document.elements) || !document.elements.length || document.elements.length > 10_000 || !Number.isFinite(instant(document.osm3s?.timestamp_osm_base))) throw new Error('Invalid or partial Overpass response');
  const ids = new Set();
  return document.elements.map(element => {
    const tags = element.tags ?? {};
    if (!['node', 'way'].includes(element.type) || !Number.isSafeInteger(element.id) || (!('lit' in tags) && tags.highway !== 'street_lamp')) throw new Error('Unsupported lighting feature; review required');
    const id = `${element.type}:${element.id}`;
    if (ids.has(id)) throw new Error('Duplicate lighting object');
    ids.add(id);
    let geometry;
    const position = value => {
      if (!Number.isFinite(value?.lon) || !Number.isFinite(value?.lat) || Math.abs(value.lon) > 180 || Math.abs(value.lat) > 90) throw new Error('Invalid coordinates');
      return [value.lon, value.lat];
    };
    if (element.type === 'node') geometry = { type: 'Point', coordinates: position(element) };
    else {
      if (!Array.isArray(element.geometry) || element.geometry.length < 2 || element.geometry.length > 10_000) throw new Error('Invalid way geometry');
      const coordinates = element.geometry.map(position);
      const polygon = tags.area === 'yes';
      if (polygon && (coordinates.length < 4 || String(coordinates[0]) !== String(coordinates.at(-1)))) throw new Error('Unclosed area');
      geometry = { type: polygon ? 'Polygon' : 'LineString', coordinates: polygon ? [coordinates] : coordinates };
    }
    if (!Number.isFinite(instant(element.timestamp))) throw new Error('Missing object edit timestamp');
    return { id, kind: tags.highway === 'street_lamp' ? 'street_lamp' : 'lit_tag', lit: tags.lit ?? null, geometry, source_url: `https://www.openstreetmap.org/${element.type}/${element.id}`, last_edited_at: element.timestamp, source: 'openstreetmap', verification: 'community_unverified' };
  });
}

export function validateWaiting(value, previous, now) {
  captureState(value.captured_at, now, DAY);
  if (instant(value.captured_at) + DAY <= now || value.schema_version !== 1 || value.timezone !== 'America/New_York' || value.service_date !== localDate(now) || !value.records?.length || !value.capture_method || !value.limitations?.length) throw new Error('Hours require a current dated review');
  if (new Set(value.records.map(row => row.site_id)).size !== value.records.length) throw new Error('Duplicate waiting site');
  for (const row of value.records) {
    const old = previous.records.find(record => record.site_id === row.site_id);
    if (!old || row.hours_source_url !== old.hours_source_url || JSON.stringify(row.reference_point) !== JSON.stringify(old.reference_point) || row.indoor !== old.indoor || row.building_object_id !== old.building_object_id || row.hours_kind !== 'published_schedule' || row.nighttime_access_confirmed !== null || row.provider_pickup_permitted !== null || !row.exception_status) throw new Error('Hours-only refresh cannot change place evidence or assert access');
    if (!(instant(row.opens_at) < instant(row.closes_at)) || localDate(instant(row.opens_at)) !== value.service_date || instant(row.closes_at) - instant(row.opens_at) > DAY) throw new Error('Invalid dated hours');
  }
  return value;
}

function runProcess(command, args) {
  return new Promise(resolveResult => {
    // Do not expose stdout, stderr or inherited credentials in the status document.
    const child = spawn(command, args, { cwd: ROOT, stdio: 'ignore', timeout: 180_000 });
    child.on('error', () => resolveResult({ code: null, error: 'PROCESS_UNAVAILABLE_OR_TIMEOUT' }));
    child.on('close', (code, signal) => resolveResult({ code, error: signal ? 'PROCESS_INTERRUPTED_OR_TIMEOUT' : code ? 'SOURCE_REFRESH_FAILED' : null }));
  });
}

async function executeTask(name, stage, options) {
  const campus = join(stage, 'data/campus');
  await mkdir(campus, { recursive: true });
  if (name === 'lighting') {
    const response = await (options.fetchImpl ?? fetch)(LIGHT_URL, { method: 'POST', headers: { 'User-Agent': 'BeaconCampusEvidence/1.0 (public campus infrastructure refresh)', Accept: 'application/json' }, body: new URLSearchParams({ data: LIGHT_QUERY }), signal: AbortSignal.timeout(55_000), redirect: 'error' });
    if (!response.ok) throw Object.assign(new Error('Lighting source request failed'), { refreshCode: `SOURCE_HTTP_${response.status}` });
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > 8_000_000) throw new Error('Lighting source exceeds size bound'); chunks.push(chunk); }
    const raw = Buffer.concat(chunks); const document = JSON.parse(raw.toString('utf8'));
    const records = normalizeLighting(document);
    if (instant(document.osm3s.timestamp_osm_base) > Date.now() || instant(document.osm3s.timestamp_osm_base) + DAY < Date.now()) throw new Error('Stale OSM source database');
    const provenance = await json(join(options.sourceRoot, 'research/lighting/provenance.json'));
    const captured = new Date().toISOString();
    await atomicJson(join(campus, 'research/lighting/observations.json'), records);
    await writeFile(join(campus, 'research/lighting/osm-lighting-latest.json'), raw);
    const normalized = await readFile(join(campus, 'research/lighting/observations.json'));
    const counts = { total: records.length, kinds: {}, lit_values: {}, geometry_types: {} };
    for (const row of records) for (const [group, key] of [['kinds', row.kind], ['lit_values', String(row.lit)], ['geometry_types', row.geometry.type]]) counts[group][key] = (counts[group][key] ?? 0) + 1;
    await atomicJson(join(campus, 'research/lighting/provenance.json'), { ...provenance, captured_at: captured, osm_base_timestamp: document.osm3s.timestamp_osm_base, sha256: hash(raw), counts, url: LIGHT_URL, query: LIGHT_QUERY, files: [{ path: 'osm-lighting-latest.json', sha256: hash(raw), role: 'unaltered source response' }, { path: 'observations.json', sha256: hash(normalized), role: 'normalized geometry and lighting metadata' }] });
    return { code: 0 };
  }
  if (name === 'waiting') {
    if (!options.waitingReviewed) return { code: null, error: 'MANUAL_HOURS_REVIEW_REQUIRED', state: 'blocked' };
    const reviewed = validateWaiting(await json(options.waitingReviewed), await json(join(options.sourceRoot, 'waiting-locations.json')), Date.now());
    await atomicJson(join(campus, 'waiting-locations.json'), reviewed);
    return { code: 0 };
  }
  await cp(join(ROOT, 'databricks/ingest'), join(stage, 'databricks/ingest'), { recursive: true, filter: path => !path.includes('__pycache__') });
  let args;
  if (['weather', 'closures'].includes(name)) args = [join(stage, 'databricks/ingest/public_sources.py'), '--datasets', name];
  if (name === 'transit') {
    const yesterday = localDate(Date.now() - DAY);
    args = [join(stage, 'databricks/ingest/full_transit.py'), '--start-date', yesterday, '--days', '14'];
  }
  if (name === 'crime') {
    const dependency = await (options.runProcess ?? runProcess)(options.python ?? 'python3', ['-c', 'import pdfplumber']);
    if (dependency.code !== 0) return { code: null, error: 'PYTHON_PDFPLUMBER_UNAVAILABLE', state: 'blocked' };
    args = [join(stage, 'databricks/ingest/public_crime.py'), '--refresh', '--year', localDate(Date.now()).slice(0, 4), '--as-of', localDate(Date.now())];
  }
  const result = await (options.runProcess ?? runProcess)(options.python ?? 'python3', args);
  if (name === 'crime' && result.code === 2) {
    try {
      const manifest = await json(join(campus, `research/crime-manifest-${localDate(Date.now()).slice(0, 4)}.json`));
      result.error = 'PUBLISHED_DOCUMENT_EXTRACTION_PARTIAL';
      result.diagnostics = { coverage: manifest.coverage, extractedRecords: manifest.records, sourceGaps: manifest.gaps.length, gapKinds: [...new Set(manifest.gaps.map(gap => gap.kind))].filter(kind => typeof kind === 'string' && /^[a-z_]{1,60}$/.test(kind)) };
    } catch { result.error = 'SOURCE_REFRESH_INCOMPLETE'; }
  }
  return result;
}

/** Every source runs independently in a staging directory; failed output never replaces prior evidence. */
export async function runRefresh(options) {
  const sourceRoot = resolve(options.sourceRoot ?? DATA), output = resolve(options.output ?? '');
  if (!options.output || output === sourceRoot || output.startsWith(sourceRoot + '/') || sourceRoot.startsWith(output + '/')) throw new Error('Use a separate new --out directory for review; canonical data is not overwritten');
  try { await stat(output); throw new Error('Output already exists; choose a new directory'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const names = options.datasets ?? DATASETS;
  if (!names.length || new Set(names).size !== names.length || names.some(name => !DATASETS.includes(name))) throw new Error('Unknown or duplicate dataset');
  await mkdir(dirname(output), { recursive: true });
  await cp(sourceRoot, output, { recursive: true });
  const report = { version: 'beacon-refresh-run-v1', startedAt: new Date().toISOString(), finishedAt: null, state: 'running', sources: [], cloudWrites: false };
  await atomicJson(join(output, 'journey-refresh-status.json'), report);
  for (const name of names) {
    const stage = await mkdtemp(join(tmpdir(), 'beacon-refresh-source-'));
    const entry = { dataset: name, attemptedAt: new Date().toISOString(), state: 'failed', exitCode: null, error: null, priorSnapshotRetained: true };
    try {
      const result = await (options.executeTask ?? executeTask)(name, stage, { ...options, sourceRoot });
      entry.exitCode = result.code;
      if (result.diagnostics) entry.diagnostics = result.diagnostics;
      if (result.code === 0) {
        // Staged source artifacts only. The old snapshot remains outside this review directory.
        const stageData = join(stage, 'data/campus');
        await cp(stageData, output, { recursive: true });
        entry.state = 'refreshed'; entry.priorSnapshotRetained = false;
      } else { entry.state = result.state ?? (result.code === 2 ? 'partial_source_rejected' : 'failed'); entry.error = result.error ?? 'SOURCE_REFRESH_INCOMPLETE'; }
    } catch (error) { entry.error = /^SOURCE_HTTP_[1-5][0-9]{2}$/.test(error.refreshCode) ? error.refreshCode : 'SOURCE_REFRESH_OR_VALIDATION_FAILED'; }
    finally { await rm(stage, { recursive: true, force: true }); }
    entry.finishedAt = new Date().toISOString(); report.sources.push(entry);
    await atomicJson(join(output, 'journey-refresh-status.json'), report);
  }
  report.finishedAt = new Date().toISOString();
  report.state = report.sources.every(source => source.state === 'refreshed') ? 'success' : 'partial_or_blocked';
  await atomicJson(join(output, 'journey-refresh-status.json'), report);
  return { report, status: await refreshStatus(output) };
}

async function main() {
  const args = process.argv.slice(2), options = {};
  let run = false, now = Date.now();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--run') { run = true; continue; }
    if (flag === '--status') continue;
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error('Flag requires a value');
    if (flag === '--out') options.output = value;
    else if (flag === '--data-root') options.sourceRoot = value;
    else if (flag === '--datasets') options.datasets = value.split(',');
    else if (flag === '--waiting-reviewed') options.waitingReviewed = value;
    else if (flag === '--python') options.python = value;
    else if (flag === '--at') { now = instant(value); if (!Number.isFinite(now)) throw new Error('Invalid --at timestamp'); }
    else throw new Error('Unknown flag');
  }
  const result = run ? await runRefresh(options) : await refreshStatus(options.sourceRoot ?? DATA, now);
  console.log(JSON.stringify(result, null, 2));
  if (run && result.report.state !== 'success') process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Refresh command failed; check flags, output directory and source access. No cloud action was performed.'); process.exitCode = 1; });
