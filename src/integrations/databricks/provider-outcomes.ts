/** Server-side only: call through Beacon's trusted server; never accept a browser-provided workspace/source. */
import { providerOutcomeTimestamp, providerReliabilityFromCounts, validateProviderId, validateProviderOutcome, ProviderOutcomeError } from "../../lib/decision-client/provider-outcomes";
import { executeStatement, qualifiedTable, type DatabricksConfig, type SqlParameter } from "./statement";

type TransportOptions = { fetch?: typeof fetch; pollIntervalMs?: number };

/** Additive managed Delta table, with no seeded rows and no automatic remote execution. */
export function providerOutcomesSchemaSql(table: string): string {
  return `CREATE TABLE IF NOT EXISTS ${qualifiedTable(table)} (
    observation_id STRING NOT NULL, provider_id STRING NOT NULL,
    requested_at TIMESTAMP NOT NULL, accepted_at TIMESTAMP, promised_pickup_at TIMESTAMP,
    actual_pickup_at TIMESTAMP, completed_at TIMESTAMP, canceled_at TIMESTAMP,
    cancellation_party STRING, final_outcome STRING NOT NULL, source STRING NOT NULL,
    observed_at TIMESTAMP NOT NULL, data_version STRING NOT NULL, payload_json STRING NOT NULL
  ) USING DELTA`;
}

/** Final immutable facts only. Exact retries are no-ops; changed facts with the same ID fail atomically. */
export async function ingestProviderOutcome(config: DatabricksConfig, table: string, payload: unknown, options: TransportOptions & { receivedAt?: string } = {}) {
  const row = validateProviderOutcome(payload);
  const receivedAt = providerOutcomeTimestamp(options.receivedAt ?? new Date().toISOString());
  if (row.observedAt > receivedAt) throw new ProviderOutcomeError("FUTURE_PROVIDER_OUTCOME");
  const parameter: SqlParameter = { name: "payload", value: JSON.stringify(row), type: "STRING" };
  const result = await executeStatement(config, {
    statement: `MERGE INTO ${qualifiedTable(table)} AS target
      USING (
        SELECT p.observationId AS observation_id, p.providerId AS provider_id,
          CAST(p.requestedAt AS TIMESTAMP) AS requested_at, CAST(p.acceptedAt AS TIMESTAMP) AS accepted_at,
          CAST(p.promisedPickupAt AS TIMESTAMP) AS promised_pickup_at, CAST(p.actualPickupAt AS TIMESTAMP) AS actual_pickup_at,
          CAST(p.completedAt AS TIMESTAMP) AS completed_at, CAST(p.canceledAt AS TIMESTAMP) AS canceled_at,
          p.cancellationParty AS cancellation_party, p.finalOutcome AS final_outcome, p.source,
          CAST(p.observedAt AS TIMESTAMP) AS observed_at, p.dataVersion AS data_version, :payload AS payload_json
        FROM (SELECT from_json(:payload, 'STRUCT<observationId:STRING,providerId:STRING,requestedAt:STRING,acceptedAt:STRING,promisedPickupAt:STRING,actualPickupAt:STRING,completedAt:STRING,canceledAt:STRING,cancellationParty:STRING,finalOutcome:STRING,source:STRING,observedAt:STRING,dataVersion:STRING>') AS p)
      ) AS incoming ON target.observation_id = incoming.observation_id
      WHEN MATCHED AND target.payload_json <> incoming.payload_json THEN
        UPDATE SET payload_json = CAST(raise_error('CONFLICTING_PROVIDER_OUTCOME') AS STRING)
      WHEN NOT MATCHED THEN INSERT *`,
    parameters: [parameter], timeoutMs: 10000,
  }, options);
  return { observationId: row.observationId, statementId: result.statementId };
}

/** Aggregate in SQL so the 30-day sample is not silently truncated at the Statement API row limit. */
export async function getProviderReliability(config: DatabricksConfig, table: string, provider: string, at: string, options: TransportOptions = {}) {
  const providerId = validateProviderId(provider), evaluatedAt = providerOutcomeTimestamp(at);
  const result = await executeStatement(config, {
    statement: `WITH observations AS (
      SELECT observation_id, COUNT(DISTINCT payload_json) AS variants,
        FIRST(source) AS source, FIRST(final_outcome) AS final_outcome,
        FIRST(cancellation_party) AS cancellation_party, FIRST(observed_at) AS observed_at,
        FIRST(actual_pickup_at) AS actual_pickup_at, FIRST(promised_pickup_at) AS promised_pickup_at
      FROM ${qualifiedTable(table)}
      WHERE provider_id = :provider
        AND COALESCE(completed_at, canceled_at) > timestampadd(DAY, -30, CAST(:at AS TIMESTAMP))
        AND COALESCE(completed_at, canceled_at) <= CAST(:at AS TIMESTAMP)
        AND observed_at <= CAST(:at AS TIMESTAMP)
      GROUP BY observation_id
    ), classified AS (
      SELECT *, source = 'beacon_observed' AND (final_outcome = 'completed' OR (final_outcome = 'canceled' AND cancellation_party = 'provider')) AS eligible
      FROM observations
    ) SELECT
      CAST(COUNT_IF(eligible AND final_outcome = 'completed') AS STRING) AS completed,
      CAST(COUNT_IF(eligible AND final_outcome = 'canceled') AS STRING) AS provider_canceled,
      CAST(COUNT_IF(NOT eligible) AS STRING) AS excluded,
      CAST(COUNT_IF(eligible AND final_outcome = 'completed' AND actual_pickup_at IS NOT NULL AND promised_pickup_at IS NOT NULL) AS STRING) AS pickup_observations,
      CAST(COALESCE(SUM(CASE WHEN eligible AND final_outcome = 'completed' AND actual_pickup_at IS NOT NULL AND promised_pickup_at IS NOT NULL
        THEN greatest(0, unix_millis(actual_pickup_at) - unix_millis(promised_pickup_at)) ELSE 0 END), 0) AS STRING) AS pickup_delay_ms,
      CAST(unix_millis(MAX(CASE WHEN eligible THEN observed_at END)) AS STRING) AS last_observed_ms,
      CAST(COUNT_IF(variants > 1) AS STRING) AS conflicts
    FROM classified`,
    parameters: [{ name: "provider", value: providerId, type: "STRING" }, { name: "at", value: evaluatedAt, type: "STRING" }], timeoutMs: 10000,
  }, options);
  const expected = ["completed", "provider_canceled", "excluded", "pickup_observations", "pickup_delay_ms", "last_observed_ms", "conflicts"];
  if (JSON.stringify(result.columns) !== JSON.stringify(expected) || result.rows.length !== 1) throw new ProviderOutcomeError("INVALID_PROVIDER_OUTCOME_RESULT");
  const row = result.rows[0];
  const integer = (value: string | null) => {
    if (value === null || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new ProviderOutcomeError("INVALID_PROVIDER_OUTCOME_RESULT");
    return Number(value);
  };
  if (integer(row[6]) > 0) throw new ProviderOutcomeError("CONFLICTING_PROVIDER_OUTCOME");
  const last = row[5] === null ? null : integer(row[5]);
  if (last !== null && last > 8640000000000000) throw new ProviderOutcomeError("INVALID_PROVIDER_OUTCOME_RESULT");
  const reliability = providerReliabilityFromCounts(providerId, evaluatedAt, {
    completed: integer(row[0]), providerCanceled: integer(row[1]), excluded: integer(row[2]),
    pickupObservations: integer(row[3]), pickupDelayMilliseconds: integer(row[4]), lastObservedAt: last === null ? null : new Date(last).toISOString(),
  });
  return { ...reliability, statementId: result.statementId };
}
