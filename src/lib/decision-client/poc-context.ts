import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { campusCatalog } from '../campus-evidence/catalog';
import { summarizeHistoricalLighting, type HistoricalLightingSummary } from './historical-lighting';

/** Fixed public paths only. Counts describe collected snapshots, not activated
 * Databricks tables or proof that every route is covered. */
function read(name: string): Record<string, unknown> {
  const raw = readFileSync(join(process.cwd(), 'data/campus', name));
  if (raw.length > 8_000_000) throw new Error('Public context snapshot exceeds bound');
  return JSON.parse(raw.toString());
}
const count = (x: unknown) => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 ? x : null;
export function loadPocContext(evaluatedAt = new Date().toISOString()) {
  const now = Date.parse(evaluatedAt);
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(evaluatedAt) || !Number.isFinite(now)) throw new Error('Invalid context evaluation time');
  const warnings: string[] = [];
  let lightingMeasurements: HistoricalLightingSummary | null = null;
  try {
    const summary = summarizeHistoricalLighting(read('research/lighting-measured-2026.json'));
    if (Date.parse(summary.capturedAt) <= now) lightingMeasurements = summary;
  } catch { warnings.push('Measured historical lighting snapshot is unavailable.'); }
  let transit: { stops: number | null; routes: number | null; stopTimes: number | null; serviceStart: string;
    serviceEnd: string; snapshotFresh: boolean; sourceVersion: string; sourceUrl: string } | null = null;
  try {
    const m = read('transit-full/manifest.json'), c = m.counts as Record<string, unknown>;
    if (m.source_kind !== 'scheduled' || !/^[a-f0-9]{64}$/.test(String(m.sha256))) throw new Error('Invalid transit manifest');
    const captured = Date.parse(String(m.captured_at));
    transit = { stops: count(c.stops), routes: count(c.routes), stopTimes: count(c.stop_times), serviceStart: String(m.service_start),
      serviceEnd: String(m.service_end), snapshotFresh: captured <= now && now - captured < 7 * 86400000,
      sourceVersion: String(m.sha256), sourceUrl: String(m.source_url) };
  } catch { warnings.push('Full transit manifest unavailable.'); }
  let pedestrianPilot: { supportedDirections: number | null; totalDirections: number | null; status: 'research_network_only' } | null = null;
  try {
    const p = read('pilot/coverage-matrix.json');
    pedestrianPilot = { supportedDirections: count(p.supported_count), totalDirections: count(p.directional_count), status: 'research_network_only' };
  } catch { warnings.push('Wider pedestrian coverage snapshot unavailable.'); }
  const waitingSites: { siteId: string; name: string; opensAt: string; closesAt: string; sourceUrl: string;
    hoursStatus: 'published_open_window' | 'stale_or_outside_window'; accessConfirmed: null; providerPickupPermitted: null }[] = [];
  try {
    const data = read('waiting-locations.json');
    if (!Array.isArray(data.records) || data.records.length > 100) throw new Error('Invalid waiting snapshot');
    const captured = Date.parse(String(data.captured_at)), fresh = captured <= now && now - captured < 86400000;
    for (const r of data.records) {
      const url = new URL(r.hours_source_url);
      if (url.protocol !== 'https:' || !(url.hostname === 'vt.edu' || url.hostname.endsWith('.vt.edu')) || url.username || url.password) continue;
      const opens = Date.parse(r.opens_at), closes = Date.parse(r.closes_at);
      if (!Number.isFinite(opens) || !Number.isFinite(closes) || closes <= opens) continue;
      waitingSites.push({ siteId: String(r.site_id), name: String(r.name), opensAt: r.opens_at, closesAt: r.closes_at,
        sourceUrl: url.href, hoursStatus: fresh && opens <= now && now < closes ? 'published_open_window' : 'stale_or_outside_window',
        accessConfirmed: null, providerPickupPermitted: null });
    }
  } catch { warnings.push('Published waiting-location hours unavailable.'); }
  return { evaluatedAt, source: 'local_public_snapshots' as const, campus: campusCatalog(now), transit, pedestrianPilot,
    lightingMeasurements, waitingSites, warnings: [...warnings,
      'Unsupported coverage is permitted for this POC, not presented as verified operational data.',
      'Published hours do not establish admission, indoor waiting availability or provider pickup permission.',
      'Pedestrian pilot geometry is research-only; no entrance connection or navigable route is implied.',
      'Crime records are incomplete historical reports, not current danger or absence of crime.',
    ] };
}
