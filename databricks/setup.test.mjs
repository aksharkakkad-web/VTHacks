import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapStatements, importStatements, schemaName } from './setup.mjs';
import { buildDashboardRequest } from './sql/showcase/dashboard-request.mjs';

test('dashboard contains bound managed route evidence and current-context queries', () => {
  const draft = JSON.parse(buildDashboardRequest('workspace', 'beacon', 'test-warehouse').serialized_dashboard);
  assert.equal(draft.datasets.length, 5);
  assert.equal(draft.pages[0].layout.length, 6);
  assert.ok(draft.datasets.find(d => d.name === 'routes').queryLines[0].includes('`workspace`.`beacon`.route_evidence'));
  assert.ok(draft.datasets.find(d => d.name === 'context').queryLines[0].includes('SUPERSEDED_SOURCE'));
  assert.ok(draft.datasets.every(d => !d.queryLines[0].includes('__SCHEMA__')));
});

test('setup validates identifiers and has no destructive reset', () => {
  assert.equal(schemaName({}), '`workspace`.`beacon`');
  assert.throws(() => schemaName({ DATABRICKS_SCHEMA:"beacon; DROP TABLE users" }));
  const statements = bootstrapStatements({});
  assert.equal(statements.length, 9);
  assert.ok(statements.every(sql => !sql.includes('__SCHEMA__') && /CREATE (SCHEMA|TABLE) IF NOT EXISTS/.test(sql)));
  assert.ok(statements.every(sql => !/\b(DROP|TRUNCATE|DELETE)\b/i.test(sql)));
});
test('public snapshot imports are parameterized and bounded', () => {
  const statements = importStatements({});
  assert.ok(statements.length > 5);
  for (const item of statements) {
    assert.match(item.statement, /^MERGE INTO `workspace`\.`beacon`\./);
    assert.ok(item.parameters.every(p => typeof p.value === 'string'));
    assert.ok(Buffer.byteLength(JSON.stringify(item)) < 60000, `${item.name} must fit the transport limit`);
    const rows = item.parameters.find(p => p.name === 'rows');
    if (rows) assert.ok(JSON.parse(rows.value).length <= 200);
  }
});
