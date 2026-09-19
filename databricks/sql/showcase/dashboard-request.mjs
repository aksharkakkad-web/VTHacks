/** Build a Lakeview draft request. This does not create, publish or execute anything. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function buildDashboardRequest(catalog, schema, warehouseId) {
  for (const value of [catalog, schema]) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value ?? '')) throw new Error('Catalog and schema must be simple SQL identifiers.');
  }
  if (!/^[A-Za-z0-9-]+$/.test(warehouseId ?? '')) throw new Error('A warehouse ID is required.');
  const qualifiedSchema = `\`${catalog}\`.\`${schema}\``;
  const definitions = [
    ['what_if', 'Simulated quote scenarios', '01_what_if.sql'],
    ['decisions', 'Recorded evaluations', '02_recent_decisions.sql'],
    ['context', 'Source freshness and limits', '03_context_freshness.sql'],
    ['resources', 'Public campus resource locations', '04_emergency_resources.sql'],
    ['routes', 'Mapped walking alternatives', '08_route_evidence.sql'],
  ];
  const datasets = definitions.map(([name, displayName, file]) => ({
    name, displayName,
    queryLines: [readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('__SCHEMA__', qualifiedSchema).replace(/;\s*$/, '') + '\n'],
  }));
  const query = (datasetName, fields) => [{
    name: 'main_query',
    query: { datasetName, fields: fields.map(([name]) => ({ name, expression: `\`${name}\`` })), disaggregated: true },
  }];
  const table = (name, title, description, datasetName, fields, position) => ({
    widget: {
      name, queries: query(datasetName, fields),
      spec: {
        version: 2, widgetType: 'table',
        encodings: { columns: fields.map(([fieldName, displayName]) => ({ fieldName, displayName })) },
        frame: { showTitle: true, title, showDescription: true, description },
      },
    }, position,
  });
  const layout = [{
    widget: {
      name: 'beacon_header',
      multilineTextboxSpec: { lines: [
        '# Beacon | Decisions you can explain\n',
        '\nSimulated transport quotes. Real public campus source snapshots. No safety guarantees.\n',
        '\nBudget and walking preferences change the recommendation; source timestamps show what we actually know.',
      ] },
    }, position: { x: 0, y: 0, width: 12, height: 2 },
  }, table('scenario_table', 'What changes the choice?', 'Six frozen simulation scenarios. Not current service availability.', 'what_if', [
    ['scenario_order', '#'], ['scenario', 'Change'], ['status', 'Result'],
    ['selected_plan', 'Chosen plan'], ['cost', 'Cost ($)'], ['walking_minutes', 'Walk (min)'],
    ['weighted_minutes_not_a_safety_score', 'Policy score (not safety)'],
  ], { x: 0, y: 2, width: 12, height: 5 }), {
    widget: {
      name: 'resource_map',
      queries: query('resources', [['latitude'], ['longitude'], ['phone_id'], ['location']]),
      spec: {
        version: 2, widgetType: 'symbol-map',
        encodings: { coordinates: { latitude: { fieldName: 'latitude' }, longitude: { fieldName: 'longitude' } } },
        mark: { opacity: 0.8 },
        frame: {
          showTitle: true, title: 'Public campus emergency-phone locations', showDescription: true,
          description: 'Nearby a fixed campus demo reference. Operational status unknown; not student GPS or a safe-route map.',
        },
      },
    }, position: { x: 0, y: 7, width: 6, height: 5 },
  }, table('decision_table', 'The decision evidence', 'Actual recorded evaluations only. An empty table means no recorded evaluations.', 'decisions', [
    ['evaluated_at', 'Evaluated'], ['engine', 'Engine'], ['selected_plan_id', 'Plan'],
    ['decision_status', 'Status'], ['statement_id', 'SQL statement ID'],
  ], { x: 6, y: 7, width: 6, height: 5 }), table('context_table', 'Know what the sources can support', 'Unknown lighting stays unknown. Historical incident coverage is not a probability of harm.', 'context', [
    ['corridor_id', 'Area'], ['freshness', 'Freshness'], ['valid_until', 'Valid until'],
    ['weather', 'Weather'], ['lighting', 'Lighting'], ['historical_report_count', 'Contextual reports'],
    ['interpretation_limit', 'Limit'],
  ], { x: 0, y: 12, width: 12, height: 5 }), table('route_table', 'Real paths, explicit unknowns', 'Official connected campus paths. Phones are geometric proximity only; lighting and access may be unknown.', 'routes', [
    ['corridor_id', 'Corridor'], ['coverage', 'Coverage'], ['mapped_meters', 'Path meters'],
    ['phones_within_50m', 'Nearby phones'], ['lighting_unknown_meters', 'Unknown lighting (m)'],
    ['selected_endpoint_reports', 'Selected historical reports'], ['limits', 'Limits'],
  ], { x: 0, y: 17, width: 12, height: 5 })];
  return {
    display_name: 'Beacon — decisions, evidence and campus context',
    warehouse_id: warehouseId,
    serialized_dashboard: JSON.stringify({
      datasets,
      pages: [{ name: 'beacon', displayName: 'Beacon', pageType: 'PAGE_TYPE_CANVAS', layout }],
      uiSettings: { theme: {
        canvasBackgroundColor: { light: '#F5F7FA', dark: '#111827' },
        widgetBackgroundColor: { light: '#FFFFFF', dark: '#1F2937' },
        fontColor: { light: '#12263A', dark: '#F3F4F6' },
        selectionColor: { light: '#0072B2', dark: '#56B4E9' },
        visualizationColors: ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#D55E00'],
        widgetHeaderAlignment: 'LEFT',
      } },
    }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [catalog, schema, warehouseId] = process.argv.slice(2);
  try {
    process.stdout.write(JSON.stringify(buildDashboardRequest(catalog, schema, warehouseId)) + '\n');
  } catch (error) {
    process.stderr.write(`${error.message}\nUsage: node databricks/sql/showcase/dashboard-request.mjs CATALOG SCHEMA WAREHOUSE_ID\n`);
    process.exitCode = 1;
  }
}
