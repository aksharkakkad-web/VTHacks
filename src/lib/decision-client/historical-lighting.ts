/** Historical measured context, never a source of current operational route lighting. */
const SOURCE = 'https://vtechworks.lib.vt.edu/bitstreams/cced4b56-86ac-4b53-8fad-ab04deb80f0f/download';
const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid historical lighting record');
  return v as Record<string, unknown>;
};
export type HistoricalLightingSummary = {
  status: 'historical_measurements'; intersections: number; measurements: number;
  locatedIntersections: number; unlocatedIntersections: number;
  sourceUrl: string; sourceVersion: string; capturedAt: string;
  operationalLightingVerified: false; routeCoverageFraction: null;
  collectionWindows: { round: number; localDates: string }[];
  limitations: string[];
};

export function summarizeHistoricalLighting(input: unknown): HistoricalLightingSummary {
  const data = record(input);
  if (data.schema_version !== 1 || data.classification !== 'historical_field_measurement' || data.operational_lighting_verified_now !== false
    || data.source_url !== SOURCE || typeof data.source_hash !== 'string' || !/^[a-f0-9]{64}$/.test(data.source_hash)
    || typeof data.captured_at !== 'string' || !Number.isFinite(Date.parse(data.captured_at))
    || !Array.isArray(data.records) || data.records.length < 1 || data.records.length > 1000) throw new Error('Invalid historical lighting source');
  const ids = new Set<number>();
  let located = 0;
  for (const item of data.records) {
    const row = record(item), id = row.intersection_id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 || ids.has(id)) throw new Error('Invalid historical lighting site');
    ids.add(id);
    for (const round of [1, 2]) {
      const lux = row[`round_${round}_min_vertical_lux`];
      if (typeof lux !== 'number' || !Number.isFinite(lux) || lux < 0 || lux > 100000) throw new Error('Invalid lux measurement');
      if (!['AW', 'NLP', 'NSW', 'NS'].includes(String(row[`round_${round}_status`]))) throw new Error('Invalid observation status');
    }
    if (row.coordinate !== null) {
      const c = row.coordinate;
      if (!Array.isArray(c) || c.length !== 2 || !c.every(v => typeof v === 'number' && Number.isFinite(v)) || Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) throw new Error('Invalid reported coordinate');
      located++;
    }
  }
  if (data.intersection_count !== ids.size || data.measurement_count !== ids.size * 2 || data.located_intersections !== located) throw new Error('Historical lighting counts mismatch');
  if (!Array.isArray(data.collection_windows) || data.collection_windows.length !== 2) throw new Error('Missing measurement windows');
  const dates = ['2026-01-20/2026-01-21', '2026-02-28/2026-03-01'];
  const collectionWindows = data.collection_windows.map((item, i) => {
    const window = record(item);
    if (window.round !== i + 1 || window.local_dates !== dates[i]) throw new Error('Measurement window does not match source');
    return { round: i + 1, localDates: dates[i] };
  });
  return { status: 'historical_measurements', intersections: ids.size, measurements: ids.size * 2,
    locatedIntersections: located, unlocatedIntersections: ids.size - located,
    sourceUrl: SOURCE, sourceVersion: data.source_hash, capturedAt: data.captured_at,
    operationalLightingVerified: false, routeCoverageFraction: null, collectionWindows,
    limitations: [
      'January–March 2026 sampled intersection measurements, not current route-wide illumination.',
      'Eight sites have no supplied coordinates; reported coordinate reference system is unverified. No automatic route join.',
      'Light operation and personal safety cannot be inferred from these historical values.',
    ] };
}
