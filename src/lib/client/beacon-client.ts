export type ActivityPhase = "request" | "response" | "rejected" | "timeout" | "info";
export type ActivityExecution = "live" | "simulated" | "local_fallback" | "not_called";
export type ActivityIdentity = "ans_verified" | "local_demo" | "not_verified" | "not_applicable";

export type AgentActivityEvent = {
  version: "beacon-agent-activity-v1";
  eventId: string;
  sequence: number;
  runId: string;
  requestId: string;
  causationId: string | null;
  occurredAt: string;
  sender: string;
  recipient: string;
  operation: string;
  phase: ActivityPhase;
  execution: ActivityExecution;
  identity: ActivityIdentity;
  summaryCode: string;
  safeData: Record<string, string | number | boolean | null>;
  evidenceIds: string[];
};

export type ActivityResponse = {
  version: "beacon-agent-activity-v1";
  events: AgentActivityEvent[];
  nextCursor: number;
  truncated: boolean;
};

export type PlanningEvidence = {
  version: "beacon-planning-v1";
  runId: string;
  phase: "understanding" | "gathering" | "evaluating" | "explaining" | "ready" | "needs_input" | "unavailable";
  worker: "online" | "offline" | "auth_required" | "rate_limited" | "not_required";
  modelSource: "codex_subscription" | "none";
  explanationSource: "llm_grounded" | "template" | "none";
  snapshotId?: string;
  messageCode: string;
  model?: string;
  explanation?: string;
};

export type ConnectedTrip = {
  id: string;
  state: string;
  statusMessage?: string;
  selectedPlan?: {
    planId: string;
    providerName: string;
    mode: "walk" | "transit" | "campus_ride" | "independent_ride";
    cost: number;
    waitMinutes: number;
    travelMinutes: number;
    walkingMinutes: number;
    totalMinutes: number;
    requiresProviderVerification: boolean;
  };
  recommendation?: { explanation?: string };
  providerVerified?: boolean;
  sensitiveDataReleased?: boolean;
};

export type CoordinationEvidence = {
  version: "beacon-coordination-v1";
  requiredAction: "none" | "confirm" | "refresh_quotes" | "check_booking" | "payment_declined";
  remainingBudgetMinor: number;
  currency: string;
  paymentMode: "simulated";
  paymentNotice: string;
  operator?: { name: string; ansId?: string | null; verification: "ans_verified" | "local_demo" | "not_verified" };
  selectedOffer?: {
    planId: string;
    quoteId: string;
    serviceId: string;
    totalMinor: number;
    currency: string;
    expiresAt: string;
    cancellationFeeMinor: number;
    pickupInstructions: string;
    pickupAccessVerified: boolean;
    simulated: boolean;
  };
  payments: Array<{ providerId: string; state?: string; amountMinor?: number; retainedMinor?: number }>;
};

export type TripEvidence = {
  coordination?: CoordinationEvidence;
  planning?: PlanningEvidence;
};

export type ActivityEdge = {
  id: string;
  sender: string;
  recipient: string;
  request: AgentActivityEvent;
  response?: AgentActivityEvent;
};

export function mergeActivityEvents(current: AgentActivityEvent[], incoming: AgentActivityEvent[]) {
  const byId = new Map<string, AgentActivityEvent>();
  for (const event of [...current, ...incoming]) byId.set(event.eventId, event);
  return [...byId.values()].sort((a, b) => a.sequence - b.sequence);
}

export function activityEdges(events: AgentActivityEvent[]): ActivityEdge[] {
  const requests = new Map<string, ActivityEdge>();
  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    if (event.phase === "request") {
      requests.set(event.requestId, { id: event.requestId, sender: event.sender, recipient: event.recipient, request: event });
      continue;
    }
    if (["response", "rejected", "timeout"].includes(event.phase)) {
      const edge = requests.get(event.requestId);
      if (edge) edge.response = event;
    }
  }
  return [...requests.values()];
}

export function planningStatus(planning?: Pick<PlanningEvidence, "phase" | "worker">) {
  if (!planning) return { kind: "idle" as const, label: "Planner has not started" };
  if (planning.worker === "offline") return { kind: "blocked" as const, label: "Planner worker offline" };
  if (planning.worker === "auth_required") return { kind: "blocked" as const, label: "Planner needs account authorization" };
  if (planning.worker === "rate_limited") return { kind: "blocked" as const, label: "Planner is temporarily rate limited" };
  if (planning.phase === "needs_input") return { kind: "blocked" as const, label: "Planner needs more information" };
  if (planning.phase === "unavailable") return { kind: "blocked" as const, label: "Planning is unavailable" };
  if (planning.phase === "ready") return { kind: "ready" as const, label: "Plan ready" };
  const labels = { understanding: "Understanding your trip", gathering: "Gathering current options", evaluating: "Evaluating options", explaining: "Preparing the explanation" } as const;
  return { kind: "working" as const, label: labels[planning.phase] };
}

export function pollDelay(hidden: boolean) {
  return hidden ? 10_000 : 2_000;
}

const panelForbiddenKey = /(url|uri|endpoint|domain|credential|token|secret|password|latitude|longitude|\blat\b|\blng\b|coordinate|raw.*error|stack|reasoning|prompt)/i;
const panelForbiddenValue = /(https?:\/\/|www\.|geta36\.app)/i;

export function panelSafeData(data: AgentActivityEvent["safeData"]) {
  return Object.fromEntries(Object.entries(data).filter(([key, value]) => !panelForbiddenKey.test(key) && !(typeof value === "string" && panelForbiddenValue.test(value))));
}

const errorMessages: Record<string, string> = {
  PAIR_CODE_INVALID: "Pairing code was not accepted.",
  PAIR_CODE_EXPIRED: "That pairing code has expired.",
  EMERGENCY_HELP_REQUIRED: "This request needs immediate emergency help.",
  NO_FEASIBLE_PLAN: "No available option fits the approved constraints.",
  BOOKING_UNCERTAIN: "The provider response is uncertain. Beacon is checking the same trip.",
  TRIP_NOT_FOUND: "This trip is no longer available in this session.",
  UNAUTHORIZED: "Pair this app again to continue.",
};

export function safeErrorMessage(payload: unknown) {
  const code = typeof payload === "object" && payload !== null && "error" in payload
    ? (payload as { error?: { code?: unknown } }).error?.code
    : undefined;
  return typeof code === "string" && errorMessages[code]
    ? errorMessages[code]
    : "The request could not be completed. Try again.";
}

async function requestJson<T>(path: string, init?: RequestInit, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
    cache: "no-store",
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(safeErrorMessage(payload));
  return payload as T;
}

export const beaconApi = {
  pair: (code: string, signal?: AbortSignal) => requestJson<unknown>("/api/demo/planner/pair", { method: "POST", body: JSON.stringify({ code }) }, signal),
  createTrip: (preferences: { maxBudget: number; walkingPreference: "normal" | "minimal"; temporaryContext: "none" | "tired" | "drinking" }, signal?: AbortSignal) => requestJson<ConnectedTrip>("/api/trips", {
    method: "POST",
    body: JSON.stringify({
      origin: { lat: 37.229, lng: -80.414 },
      preferences: {
        home: { lat: 37.221, lng: -80.420 },
        maxBudget: preferences.maxBudget,
        walkingPreference: preferences.walkingPreference,
        transferPreference: "minimize",
      },
      temporary_context: {
        exhausted: preferences.temporaryContext === "tired",
        has_been_drinking: preferences.temporaryContext === "drinking",
      },
    }),
  }, signal),
  startPlanning: (tripId: string, signal?: AbortSignal) => requestJson<{ runId: string; phase: string }>(`/api/trips/${encodeURIComponent(tripId)}/planning`, { method: "POST", body: "{}" }, signal),
  trip: (tripId: string, signal?: AbortSignal) => requestJson<ConnectedTrip>(`/api/trips/${encodeURIComponent(tripId)}`, undefined, signal),
  evidence: (tripId: string, signal?: AbortSignal) => requestJson<TripEvidence>(`/api/trips/${encodeURIComponent(tripId)}/evidence`, undefined, signal),
  activity: (tripId: string, after: number, signal?: AbortSignal) => requestJson<ActivityResponse>(`/api/trips/${encodeURIComponent(tripId)}/activity?after=${after}`, undefined, signal),
  action: <T = ConnectedTrip>(tripId: string, action: "confirm" | "verify" | "request" | "arrive", body: Record<string, unknown> = {}, signal?: AbortSignal) => requestJson<T>(`/api/trips/${encodeURIComponent(tripId)}/${action}`, { method: "POST", body: JSON.stringify(body) }, signal),
  cancelProvider: (tripId: string, signal?: AbortSignal) => requestJson<ConnectedTrip>(`/api/demo/trips/${encodeURIComponent(tripId)}/cancel-provider`, { method: "POST", body: "{}" }, signal),
};
