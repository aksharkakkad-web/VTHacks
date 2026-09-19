/** Sanitized final observations only. No trip, booking, student, location or free-text fields. */
export type ProviderOutcome = {
  providerId: string;
  observationId: string;
  requestedAt: string;
  acceptedAt: string | null;
  promisedPickupAt: string | null;
  actualPickupAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  cancellationParty: "provider" | "student" | "unknown" | null;
  finalOutcome: "completed" | "canceled";
  source: "beacon_observed" | "provider_reported" | "simulated";
  observedAt: string;
  dataVersion: string;
};

export const PROVIDER_RELIABILITY_POLICY = {
  version: "provider-reliability-v1", windowDays: 30, minimumObservations: 10,
  priorCompletions: 5, priorTotal: 10, snapshotValidityHours: 24,
} as const;

export type ProviderReliability = {
  providerId: string;
  status: "sufficient" | "unknown";
  reliability: number | null;
  reason: "OBSERVED_HISTORY" | "INSUFFICIENT_OBSERVATIONS";
  sampleSize: number;
  completed: number;
  providerCanceled: number;
  excluded: number;
  pickupObservations: number;
  averagePickupDelayMinutes: number | null;
  evaluatedAt: string;
  validUntil: string;
  windowStart: string;
  lastObservedAt: string | null;
  policyVersion: typeof PROVIDER_RELIABILITY_POLICY.version;
};

export class ProviderOutcomeError extends Error {
  constructor(public readonly code: string) { super(code); this.name = "ProviderOutcomeError"; }
}
const fail = (code: string): never => { throw new ProviderOutcomeError(code); };
const fields = ["providerId", "observationId", "requestedAt", "acceptedAt", "promisedPickupAt", "actualPickupAt", "completedAt", "canceledAt", "cancellationParty", "finalOutcome", "source", "observedAt", "dataVersion"];
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

export function validateProviderId(value: unknown): string {
  if (typeof value !== "string" || !idPattern.test(value)) return fail("INVALID_PROVIDER_ID");
  return value;
}

/** UTC ISO only; Date.parse alone accepts impossible dates such as February 30. */
export function providerOutcomeTimestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return fail("INVALID_OUTCOME_TIMESTAMP");
  const expected = value.includes(".") ? value.replace(/\.(\d{1,3})Z$/, (_, fraction: string) => `.${fraction.padEnd(3, "0")}Z`) : value.replace("Z", ".000Z");
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== expected) return fail("INVALID_OUTCOME_TIMESTAMP");
  return expected;
}

export function validateProviderOutcome(input: unknown): ProviderOutcome {
  if (!input || typeof input !== "object" || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return fail("INVALID_PROVIDER_OUTCOME");
  const row = input as Record<string, unknown>;
  if (Object.keys(row).some(key => !fields.includes(key))) return fail("UNEXPECTED_OUTCOME_FIELD");
  const providerId = validateProviderId(row.providerId);
  // A dedicated random UUID, never an existing trip/booking ID or a hash of student information.
  if (typeof row.observationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.observationId)) return fail("INVALID_OBSERVATION_ID");
  if (typeof row.dataVersion !== "string" || !idPattern.test(row.dataVersion)) return fail("INVALID_OUTCOME_VERSION");
  if (typeof row.finalOutcome !== "string" || !["completed", "canceled"].includes(row.finalOutcome)
    || typeof row.source !== "string" || !["beacon_observed", "provider_reported", "simulated"].includes(row.source)) return fail("INVALID_OUTCOME_PROVENANCE");
  const optionalTime = (key: string) => row[key] === undefined || row[key] === null ? null : providerOutcomeTimestamp(row[key]);
  const requestedAt = providerOutcomeTimestamp(row.requestedAt), observedAt = providerOutcomeTimestamp(row.observedAt);
  const acceptedAt = optionalTime("acceptedAt"), promisedPickupAt = optionalTime("promisedPickupAt"), actualPickupAt = optionalTime("actualPickupAt");
  const completedAt = optionalTime("completedAt"), canceledAt = optionalTime("canceledAt");
  const cancellationParty = row.cancellationParty ?? null;
  if (cancellationParty !== null && (typeof cancellationParty !== "string" || !["provider", "student", "unknown"].includes(cancellationParty))) return fail("INVALID_CANCELLATION_PARTY");
  if (row.finalOutcome === "completed" ? !completedAt || canceledAt !== null || cancellationParty !== null : !canceledAt || completedAt !== null || cancellationParty === null) return fail("INCONSISTENT_FINAL_OUTCOME");
  const terminal = completedAt ?? canceledAt!;
  if ([acceptedAt, promisedPickupAt, actualPickupAt, terminal].some(value => value !== null && value < requestedAt)
    || [acceptedAt, actualPickupAt].some(value => value !== null && value > terminal)
    || (acceptedAt !== null && actualPickupAt !== null && actualPickupAt < acceptedAt)
    || terminal > observedAt) return fail("INVALID_OUTCOME_SEQUENCE");
  return { providerId, observationId: row.observationId, requestedAt, acceptedAt, promisedPickupAt, actualPickupAt, completedAt, canceledAt,
    cancellationParty: cancellationParty as ProviderOutcome["cancellationParty"], finalOutcome: row.finalOutcome as ProviderOutcome["finalOutcome"],
    source: row.source as ProviderOutcome["source"], observedAt, dataVersion: row.dataVersion };
}

export type ProviderOutcomeCounts = {
  completed: number; providerCanceled: number; excluded: number;
  pickupObservations: number; pickupDelayMilliseconds: number; lastObservedAt: string | null;
};

/** Shared SQL/local policy. Delay is display context; it does not change completion reliability. */
export function providerReliabilityFromCounts(provider: string, at: string, counts: ProviderOutcomeCounts): ProviderReliability {
  const providerId = validateProviderId(provider), evaluatedAt = providerOutcomeTimestamp(at);
  if ([counts.completed, counts.providerCanceled, counts.excluded, counts.pickupObservations, counts.pickupDelayMilliseconds].some(value => !Number.isSafeInteger(value) || value < 0)
    || counts.pickupObservations > counts.completed || (counts.pickupObservations === 0 && counts.pickupDelayMilliseconds !== 0)) return fail("INVALID_OUTCOME_COUNTS");
  const sampleSize = counts.completed + counts.providerCanceled;
  if (!Number.isSafeInteger(sampleSize)) return fail("INVALID_OUTCOME_COUNTS");
  const lastObservedAt = counts.lastObservedAt === null ? null : providerOutcomeTimestamp(counts.lastObservedAt);
  if ((sampleSize > 0 && lastObservedAt === null) || (sampleSize === 0 && lastObservedAt !== null) || (lastObservedAt !== null && lastObservedAt > evaluatedAt)) return fail("INVALID_OUTCOME_COUNTS");
  const sufficient = sampleSize >= PROVIDER_RELIABILITY_POLICY.minimumObservations;
  return { providerId, status: sufficient ? "sufficient" : "unknown", reliability: sufficient ? (counts.completed + 5) / (sampleSize + 10) : null,
    reason: sufficient ? "OBSERVED_HISTORY" : "INSUFFICIENT_OBSERVATIONS", sampleSize,
    completed: counts.completed, providerCanceled: counts.providerCanceled, excluded: counts.excluded,
    pickupObservations: counts.pickupObservations, lastObservedAt, evaluatedAt,
    validUntil: new Date(Date.parse(evaluatedAt) + 86400000).toISOString(), windowStart: new Date(Date.parse(evaluatedAt) - 30 * 86400000).toISOString(),
    policyVersion: PROVIDER_RELIABILITY_POLICY.version,
    averagePickupDelayMinutes: counts.pickupObservations ? counts.pickupDelayMilliseconds / counts.pickupObservations / 60000 : null };
}

/** Final outcomes within (evaluation minus 30 days, evaluation]. Identical retries count once. */
export function calculateProviderReliability(inputs: readonly unknown[], provider: string, at: string): ProviderReliability {
  const providerId = validateProviderId(provider), evaluatedAt = providerOutcomeTimestamp(at);
  if (!Array.isArray(inputs) || inputs.length > 10000) return fail("TOO_MANY_PROVIDER_OUTCOMES");
  const cutoff = Date.parse(evaluatedAt) - 30 * 86400000;
  const unique = new Map<string, ProviderOutcome>();
  for (const input of inputs) {
    const row = validateProviderOutcome(input), previous = unique.get(row.observationId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) return fail("CONFLICTING_PROVIDER_OUTCOME");
    unique.set(row.observationId, row);
  }
  const counts: ProviderOutcomeCounts = { completed: 0, providerCanceled: 0, excluded: 0, pickupObservations: 0, pickupDelayMilliseconds: 0, lastObservedAt: null };
  for (const row of unique.values()) {
    const terminal = row.completedAt ?? row.canceledAt!;
    if (row.providerId !== providerId || Date.parse(terminal) <= cutoff || terminal > evaluatedAt || row.observedAt > evaluatedAt) continue;
    if (row.source !== "beacon_observed" || (row.finalOutcome === "canceled" && row.cancellationParty !== "provider")) { counts.excluded++; continue; }
    if (row.finalOutcome === "completed") {
      counts.completed++;
      if (row.actualPickupAt !== null && row.promisedPickupAt !== null) {
        counts.pickupObservations++;
        counts.pickupDelayMilliseconds += Math.max(0, Date.parse(row.actualPickupAt) - Date.parse(row.promisedPickupAt));
      }
    } else counts.providerCanceled++;
    if (counts.lastObservedAt === null || row.observedAt > counts.lastObservedAt) counts.lastObservedAt = row.observedAt;
  }
  return providerReliabilityFromCounts(providerId, evaluatedAt, counts);
}
