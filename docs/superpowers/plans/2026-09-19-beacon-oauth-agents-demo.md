# Beacon OAuth laptop planner and agent communication demo implementation plan

> **For agentic workers:** Use the executing-plans skill, if available, to implement this handoff task by task. Checkboxes below describe work to build, not completion claims. The user wants a teammate's Codex to execute this plan; do not start a second competing implementation in Mahin's task.

**Goal:** Run Beacon's hybrid planner through the demonstrator's supported ChatGPT/Codex login on a laptop, connect it to the deployed phone PWA, and show genuine, sanitized communication among separately callable agents and supporting services.

**Architecture:** The phone talks only to Beacon's authenticated Next.js backend. A private laptop worker pulls bounded model jobs from that backend and returns structured proposals or explanations; Databricks and application code retain evidence, ranking, validation, authorization, booking, and persistent trip ownership. Real server events drive the communication panel; simulated transport remains explicitly labeled.

**Tech stack:** Existing Next.js 16 / React / TypeScript / npm app; existing Redis/Upstash persistence, ANS and Databricks adapters; a separate Node.js laptop process using the official Codex app-server over local stdio; existing simulated provider HTTP services.

---

## 1. Starting point and integration dependency

Repository: `https://github.com/aksharkakkad-web/VTHacks`.

Verified repository references on September 19, 2026:

- Refreshed `origin/main`: `ef8b2bd`, including Akshar's Databricks completion PR #22.
- Mahin's provider-network backend: `origin/feat/mahin-provider-network-mvp`, inspected at `bcf8d94`, PR #23: https://github.com/aksharkakkad-web/VTHacks/pull/23.
- That backend commit was **not an ancestor of refreshed main** during this handoff. Do not assume its v2 authorization/payment/recovery behavior is already in main.
- The OAuth planner, laptop queue, independently callable research agent, and real communication panel described here are **new work**. No live OAuth inference, deployed bridge, or phone test was performed for this document.

Read `AGENTS.md`, `docs/TEAM_CONTRACT.md`, `docs/Beacon_Product_Direction.md`, `docs/Beacon_Pivot_What_Changes.md`, `src/agents/API.md`, `docs/DATABRICKS_APP_HANDOFF.md`, and `docs/DATABRICKS_FULL_VISION_COMPLETION.md`. From the backend branch also read `docs/MAHIN_MVP_CONTRACT.md`, `docs/MAHIN_MVP_STATUS.md`, and `docs/PROVIDER_DEVELOPER_GUIDE.md`.

- [ ] Start from a clean checkout using `./scripts/start-task.sh feat oauth-agent-demo`. Preserve other people's changes; never reset or clean an occupied checkout.
- [ ] Fetch the backend branch. If PR #23 has merged, use the merged implementation. Otherwise integrate the branch into this feature branch with `git merge --no-edit origin/feat/mahin-provider-network-mvp`; resolve against the new Databricks adapters, preserving both tracks. This does not authorize merging main or deploying.
- [ ] Run the baseline checks in section 11 before interpreting failures as new regressions.
- [ ] Record the agreed additions from section 5 in `docs/TEAM_CONTRACT.md` before Rishit or Akshar builds against them. This handoff is the concrete proposed contract notice. Do not silently change existing trip response shapes, frozen fixture prices, or scoring weights.
- [ ] Commit and push small, scoped increments as the user requested. Use a PR for integration into main; do not force-push shared branches or silently deploy a public model proxy.

## 2. Product boundaries and ownership

Beacon owns the student's objective from wanting to leave until arriving home, including recovery after a provider fails. It reduces avoidable walking, waiting, confusing pickups, and failed-plan improvisation. It does not certify routes as safe or predict personal crime risk.

| Owner | Work in this handoff |
| --- | --- |
| Mahin / executing backend agent | Laptop connection, Student Agent orchestration, versioned jobs/events, provider/research HTTP adapters, ANS checks, existing consent/booking/recovery integration |
| Rishit | Actual Trip API connection, planning/progress states, real agent activity panel, source labels, reconnect behavior, physical phone PWA testing |
| Akshar | Preserve and review Databricks network-offer mapping, evidence/readiness results, constraints, freshness, and explanation fact contract; no duplicate ranking engine |

Use one model login for the demo; different agent roles do not need separate accounts. Do not claim deterministic services are independent LLM brains. Do not enter card numbers, book a real Lyft/Uber, match strangers, infer sobriety, or send new real Telegram messages as part of automated tests. Existing confirmed contact consent and notification rules remain authoritative.

## 3. Components to show in the network

| ID / display name | Execution and responsibility | Permitted outputs/actions |
| --- | --- | --- |
| `student` / Student Agent | Existing persistent coordinator plus laptop LLM for bounded intent interpretation and grounded explanation | Requests evidence/options, submits candidates to Databricks, presents one validated plan, coordinates confirmed booking and recovery |
| `safety-research` / Route Context Agent | New independently callable HTTP agent wrapping existing Databricks/public-source readers; optional bounded LLM evidence-query proposal | Weather, closures, lighting provenance, historical incident context, activity coverage, transit notices, waiting-place evidence and unknowns; no booking or safety score |
| existing Campus Ride service / Campus Ride demo | Existing independently callable provider, deterministic simulated fleet | Manifest, availability, fixed quote, pickup details, booking/status/cancellation/reconciliation |
| `lyft-demo` / Lyft-style developer agent — simulated | Separately callable example developer service using the existing v2 provider implementation | Same contract as every other provider; simulated booking and payment only; operator is Beacon demo team, not Lyft |
| `transit` / Transit information service | Wrapper over Akshar's scheduled-transit adapters | Dated schedules, fare, stop/public route evidence, explicit access/egress estimates; no booked seat or live bus claim |
| `databricks` / Databricks decision engine | Existing managed queries and deterministic scoring, with labeled local fallback | Ranked admissible alternatives, rejections, winning offer binding, provenance, evidence deadlines and missing information |
| `ans` / ANS identity verification | Existing directory/identity integration | Discovery and verified operator/endpoint identity; no payment authorization, brand affiliation, or truth certification |
| `authorization` / Booking authorization | Existing policy and bounded HMAC grant code | Consent-, recipient-, quote-, attempt-, payload-, amount- and expiry-bound grant; never an LLM decision |
| `monitor` / Journey monitor | Existing persistent trip monitoring/recovery | Provider status, cancellation handling, overdue/arrival state, authorized notification intent |
| `telegram` / Trusted-contact notifier | Existing notification adapter | Only consented notifications; simulated acceptance is not a delivered message |

Only the Student Agent must use the model on every normal planning cycle. The Route Context Agent is a real callable evidence service even if deterministic. If it uses the model, give it a separate request/thread and a narrow research schema; do not invent an LLM call for the panel. Walking is a candidate produced from mapped evidence, not a fictitious booking agent. Amtrak, Greyhound, airlines and other platforms are examples of future developers, not additional working integrations to fabricate.

## 4. Deployment topology and trust boundaries

```text
Installed phone PWA
  | HTTPS + existing owner session + short-lived demo pairing
Beacon Next.js backend on Vercel
  |-- durable job/event state in existing Redis
  |-- Student Agent -> ANS -> compatible provider HTTP services
  |-- Student Agent -> Route Context Agent -> Databricks/public sources
  |-- Student Agent -> Databricks ranking -> code validation
  |-- confirmed booking -> bounded grant -> provider
  |-- existing monitor -> provider status/replan/consented notification
  |
  | outbound laptop polling; no public laptop port
Private laptop worker
  | local stdio only
Official Codex app-server -> managed ChatGPT subscription login
```

The backend never runs Codex inside a Vercel request. The worker does not receive Databricks credentials, provider booking credentials, exact location, home addresses, contact data, payment grants, or user-session cookies. It receives only sanitized model jobs. OAuth credentials stay in Codex's managed local store; never copy them to Redis, Vercel, the PWA, Git, or another teammate's machine.

The phone and laptop only need Internet access, not the same Wi-Fi. The laptop must remain awake and online. Losing the worker stops new LLM work, but must not disable existing booking monitoring, cancellation reconciliation, manual arrival, or authorized notifications. The existing authenticated monitor needs an external caller in a serverless deployment; a Next.js interval is not a deployment scheduler.

Keep this a private demonstrator-controlled client with explicitly paired test sessions and a constrained model process. OAuth availability does not establish permission for a public/untrusted model execution service. Do not expose Codex's stdio/WebSocket interface through a tunnel. The initial authentication/structured-output smoke test in the companion runbook is a release prerequisite, not something to claim already passed.

## 5. Proposed additive contracts

Put new internal types in `src/lib/planner/contracts.ts` and `src/lib/agent-activity/contracts.ts`, avoiding gratuitous changes in `src/types/**`. Use runtime JSON validation, not TypeScript casts. All durations/limits below are proposed demo configuration defaults, not measured performance claims.

### Planner jobs

```ts
export type PlannerRole = "student-intent" | "research-intent" | "student-explanation";
export type PlannerJobState = "queued" | "leased" | "succeeded" | "failed" | "expired";
export type PlannerJob = {
  version: "beacon-planner-job-v1";
  jobId: string;
  role: PlannerRole;
  snapshotId: string;
  inputHash: string;
  issuedAt: string;
  expiresAt: string;
  input: Record<string, unknown>; // validated by the role-specific schema below
};
export type PlannerCompletion = {
  version: "beacon-planner-result-v1";
  jobId: string;
  leaseId: string;
  attempt: number;
  snapshotId: string;
  inputHash: string;
  model: string;
  outcome: "succeeded" | "failed";
  output: unknown; // validated before application, never raw streamed text
  errorCode: "AUTH_REQUIRED" | "RATE_LIMITED" | "TIMEOUT" | "INVALID_OUTPUT" | "MODEL_UNAVAILABLE" | null;
};
```

Persist trip/owner mapping server-side; do not send those identifiers to the model. Authenticate the worker separately from OAuth with a locally generated `BEACON_PLANNER_WORKER_TOKEN`. This is a Beacon-to-worker credential, not a new paid model API key.

Role schemas (reject additional properties):

- `student-intent`: `{ objective: "get_home", priorities: Array<"minimize_walking" | "minimize_waiting" | "minimize_cost" | "minimize_transfers">, evidenceRequests: Array<{topic: "weather" | "closures" | "lighting" | "activity" | "crime" | "notices" | "transit" | "waiting_places"}>, clarification: string | null }`. Maximum four priorities, eight deduplicated evidence topics, and 160 characters of clarification. Coarse structured context goes in; no raw onboarding record. The model may propose preferences, but cannot raise budget, declare sobriety, authorize spending, override emergency handling, or silently invent policy weights. Unsupported objectives/preferences become explicit questions or limitations.
- `research-intent`: `{ topics: Array<"weather" | "closures" | "lighting" | "activity" | "crime" | "notices" | "transit" | "waiting_places"> }`, maximum eight unique topics. Code maps these to fixed adapter calls. Model output cannot name an arbitrary URL, SQL statement, command, file, host, or tool.
- `student-explanation`: `{ snapshotId: string, selectedPlanId: string, sentences: Array<{ text: string, factIds: string[] }> }`, maximum four sentences, each at most 240 characters and at most six known fact IDs. Code compares snapshot/selection, checks source expiry and referenced IDs, and preserves mandatory limitations. For numbers, either substitute validated fact values into controlled templates or validate every numeric claim against its cited facts; a plausible-looking fact ID alone does not validate prose. If unsupported claims survive, use existing fact templates. Do not claim a language-model critic proves correctness.

Backend planning sidecar, returned through evidence without changing `Trip.state`:

```ts
type PlanningView = {
  version: "beacon-planning-v1";
  runId: string;
  phase: "understanding" | "gathering" | "evaluating" | "explaining" | "ready" | "needs_input" | "unavailable";
  worker: "online" | "offline" | "auth_required" | "rate_limited";
  modelSource: "codex_subscription" | "none";
  explanationSource: "llm_grounded" | "template" | "none";
  snapshotId: string | null;
  messageCode: string;
};
```

### Activity events

```ts
export type ActivityEvent = {
  version: "beacon-agent-activity-v1";
  eventId: string;
  sequence: number;
  runId: string;
  requestId: string;
  causationId: string | null;
  occurredAt: string; // server time
  sender: string; // approved display ID, never raw provider endpoint
  recipient: string;
  operation: string; // fixed registry, see section 9
  phase: "request" | "response" | "rejected" | "timeout" | "info";
  execution: "live" | "simulated" | "local_fallback" | "not_called";
  identity: "ans_verified" | "local_demo" | "not_verified" | "not_applicable";
  summaryCode: string; // rendered from controlled templates
  safeData: Record<string, string | number | boolean | null>;
  evidenceIds: string[];
};
```

`execution: live` means an actual successful operation at that boundary, not live transport. Each offer/data result also retains its own simulated/scheduled/mapped/historical provenance. Log a live Databricks calculation over simulated quotes as exactly that. OAuth authentication is an infrastructure status, not an agent-to-agent message or an ANS badge.

### Routes and access

All responses use `Cache-Control: no-store`; all owner routes use existing session ownership. Reject oversized input and unexpected fields.

| New route | Auth / request | Response / effect |
| --- | --- | --- |
| `POST /api/trips/:id/planning` | Paired owner session; `{}` | `202 {runId, phase}`; coalesce duplicate active runs; queue sanitized intent job |
| `GET /api/trips/:id/activity?after=0` | Owner session | `{version, events, nextCursor, truncated}`; numeric cursor, bounded 100-event page |
| `POST /api/internal/planner/claim` | Worker bearer; `{workerId, roles}` | `200 {job, leaseId, attempt}` or `204`; atomic claim, no model tokens |
| `POST /api/internal/planner/heartbeat` | Worker bearer; `{workerId, jobId, leaseId, authState, model}` | `200`; nullable job/lease when idle; extend only a current lease |
| `POST /api/internal/planner/complete` | Worker bearer; `PlannerCompletion` | `202` accepted, identical duplicate idempotent, `409` stale/conflicting |
| `POST /api/internal/planner/tick` | Worker bearer; `{}` | Advance at most one ready backend planning stage within a bounded request; no arbitrary trip/action arguments |
| `POST /api/internal/planner/pairing` | Worker bearer; `{}` | Mint a one-time 128-bit random pairing code, store only its hash, ten-minute expiry |
| `POST /api/demo/planner/pair` | Same-origin browser; `{code}` | Consume code atomically, bind existing or newly issued owner session for two hours; no OAuth token returned |
| `POST /api/demo/context-agent/query` | Separately scoped context-service bearer; public context only | `beacon-context-v1` response described in section 8 |

Do not route `planning` through the existing catch-all action without an explicit implementation; `/[id]/[action]` currently rejects unknown names. Add static `planning` and `activity` route files so existing `/events` GET/POST semantics remain unchanged. `/events` POST is a provider callback, never an unrestricted browser event publisher.

Worker-only routes reject normal student cookies; owner routes reject the worker token alone. Public visitors cannot enqueue model work just by creating a trip. Pairing belongs to the installed PWA's cookie context; if the phone browser and installed app have separate storage, pair inside the installed app. Re-pairing or rotating the worker secret invalidates no existing booking. Pairing ends access to new model jobs at expiry, not access to one's trip.

## 6. Task A — local OAuth adapter and durable worker

**Create:** `tools/beacon-laptop-worker/{worker,client,schemas,worker.test}.mjs`, `scripts/planner-auth-smoke.mjs`, `docs/BEACON_OAUTH_DEMO_RUNBOOK.md`.

- [ ] Follow the companion runbook's managed login and local protocol setup. Use built-in Node APIs and local app-server stdio; no OpenAI API key or new root SDK dependency is required for this design.
- [ ] `client.mjs`: correlate JSON-RPC IDs; initialize once and await its response before `initialized`; reject pending requests on child exit; cap line/output bytes; await turn completion rather than interpreting a delta as a result. Discard reasoning, shell/file content, account identity and raw errors from event/UI logging.
- [ ] Expose a local-only `runStructured(role, input, schema)` adapter. Run in an empty workspace with restricted read access and disabled shell/apps/MCP/plugins/web tools, verified against the installed version. Do not treat `approvalPolicy: never` as tool denial. If managed configuration prevents required isolation, report it; do not bypass policy or offer unrestricted execution.
- [ ] Preflight with `account/read`: require managed `chatgpt` authentication. Never switch to API authentication automatically, buy credits, consume reset credits, or ask users to paste session tokens. Discover an available model via `model/list`, use its returned ID, and record it in local configuration. The brand of model host is not the name of every served model.
- [ ] `worker.mjs`: claim one job, run at most one inference at a time, heartbeat every ten seconds, submit structured completion, call the bounded backend tick to advance ready stages, then claim again. Back off idle polling from two seconds to ten seconds; use jitter. Exit gracefully on SIGINT/SIGTERM and leave a recoverable lease.
- [ ] Default job deadline: 90 seconds; lease: 30 seconds; at most two model attempts including the original; no recursive multi-agent model loop. A repair attempt counts against this limit. Queue limit: 20 pending jobs and one active planning run per paired owner. Enforce these caps on the backend too.
- [ ] Retry only transient failures within the same job identity. Authentication/rate-limit failures set worker state and stop model retries until recovery. Keep an existing validated decision visible with template explanation if only the explanation job fails.

**Tests:** Node fake app-server covering successful initialization and turn completion; wrong auth mode; unavailable model; malformed/oversized output; interleaved notifications; child exit; rate limit; lease expiry while inference runs; no raw token/error/reasoning leakage. Then one actual account smoke with synthetic input and no tools. Record observed version/model/auth mode and pass/fail, never the token.

**Commit:** `feat: add private Codex planner worker and auth preflight`.

## 7. Task B — queue, snapshots, orchestrator and decision integration

**Create:** `src/lib/planner/{contracts,validation,queue,redis-queue,orchestrator,http}.ts`, `src/agents/planner-queue.test.ts`, `src/agents/hybrid-planner.test.ts`, and the exact routes in section 5. **Modify:** `src/lib/trip-state/{model,runtime,http}.ts`, `src/agents/student/service.ts`, and `src/agents/tsconfig.test.json` as needed to include new modules. Add imports rather than replacing existing trip logic.

- [ ] Persist owner-scoped job mappings, leases, result hashes, snapshots, planning stages, and activity in Redis. Local memory implementation is test-only or explicitly single-process local mode. Hosted multi-instance queue requires Redis.
- [ ] Use atomic compare-and-set / Lua for claim, heartbeat and completion. Completion is valid only for the current lease/attempt and active trip snapshot; reject stale results after arrival, cancellation, changed constraints, expired offers or reset. Completed identical retries do not rerun stages. Different output under one completion ID fails.
- [ ] Do not hold `TripStore.update` across an LLM wait. Record job/run state, release the lock, and return 202. Claim a short backend stage lease before external I/O and compare its snapshot again when committing results. Persist ready-stage intent so a crashed Vercel request can resume; request completion is not a background scheduler.
- [ ] Bind each selection snapshot to candidates, exact offer identities/versions/terms, budget liabilities, exclusions, public route version and evidence deadlines. Hash canonical validated JSON; never hash a serialization whose property order varies across producers.
- [ ] Implement this state sequence:

```text
planning request -> queue student-intent
valid intent -> collect compatible quotes + route-context response
completed evidence -> Databricks evaluation exactly once for that snapshot
code revalidation -> persist selected binding + queue student-explanation
validated explanation or honest template fallback -> ready
explicit current-offer confirmation -> existing verify/request path
provider cancellation -> settle/reconcile -> new snapshot -> replan -> new confirmation
```

- [ ] Mandatory budget, expiry, closure and boarding checks run regardless of what the LLM requested. Optional contextual research has a bounded deadline and reports gaps instead of blocking indefinitely. Hard emergencies continue to return the existing emergency response before any model call.
- [ ] Use Akshar's current `evaluateProviderNetwork` in `src/lib/decision-client/server.ts` for admitted v2 network offers, or retain the proven existing evaluator until the mapping is integrated and tested. Write an explicit mapper; `src/agents/provider-manifest.ts` and `src/lib/decision-client/network-offers.ts` contain different `NetworkOffer` types. Alias imports as `ProviderWireOffer` and `DecisionNetworkOffer`.
- [ ] Preserve the four-part operator/service/quote/version binding and map the returned selection back to the exact private wire offer. Never use array position or transport mode as identity. Public walking/transit selections do not require a fictional payment/booking grant.
- [ ] Supply original approved budget plus deduplicated committed liabilities to Akshar's recovery adapter, **or** remaining budget plus zero liabilities; do not deduct twice. Exclude the exact failed operator/service pair. Do not substitute a pending refund for released funds.
- [ ] Preserve Akshar's ranking policy, source labels, `assessJourneyReadiness` and unknowns. Do not compute a new LLM safety score or add arbitrary exhaustion/waiting weights. New preferences unsupported by the current policy must be disclosed and coordinated with Akshar.
- [ ] Disable the redundant Databricks AI briefing for the hybrid path using its existing `enableAi: false` option when that wrapper is used. Keep Databricks calculations and source facts. Record which explanation path actually ran.
- [ ] Immediately before confirmation/booking, recheck the exact selected quote and applicable evidence. If model latency exhausted validity, refresh and re-evaluate; do not present the expired plan as bookable.

**Tests:** competing claims; worker restart/reclaim; stale completion; duplicate planning requests; old explanation after a replacement; wrong-owner polling; arrival during inference; no booking from worker endpoints; quote expiry during explanation; over-budget replacement including retained fee; rejected closure/catchability; unavailable Databricks with honest fallback; no unsupported safety claim. Preserve all existing v2 grant/idempotency/reconciliation tests.

**Commit:** `feat: coordinate hybrid planning with durable snapshots`.

## 8. Task C — callable context agent and Lyft-style provider

**Create:** `src/agents/context/{contract,service,http-client}.ts`, `src/agents/context-agent.test.ts`, `src/integrations/ans/context-directory.ts`. **Modify:** existing provider demo/hosting configuration and provider conformance tests only as needed to add the new service. Keep frozen default fixture values unchanged.

- [ ] Implement context request `{version: "beacon-context-v1", requestId, corridorId, topics, evaluatedAt}`. Accept only existing named public corridors, the topic enum in section 5, and a server-validated instant. No passenger ID, precise GPS, home address, free-text URL or contact fields.
- [ ] Return `{version, requestId, status, evidence, leads, gaps, expiresAt}`. Each normalized evidence item carries ID, topic, source title/URL, source version, observed/published/retrieved times when known, validity, geographic scope, provenance (`managed`, `local_snapshot`, `historical`, `scheduled`), and whether it is eligible for ranking. Missing fields are null. Keep raw pages out of prompts and UI events.
- [ ] First call the existing Databricks/public-context readers: `getSafetyEvidence`, `getPublicTripOptions`, `getFullTransitOption` where inputs support it, plus `loadPocContext` and existing weather/closure readers. Reuse the facts already returned by the evaluator when the snapshot matches; do not duplicate expensive SQL for the same evidence.
- [ ] Use `researchPublicCampusSources` in `src/integrations/databricks/web-research.ts` for bounded source discovery. It currently returns page metadata only and `rankingEligible: false`. Preserve this contract. Fixed official-source retrieval must be labeled `fixed_official_sources`, not generic live web search. If no search provider is configured, show that limitation. Waiting-place queries need an explicit adapter over Akshar's published-hours data; do not pass an unsupported topic into the existing research function.
- [ ] To demonstrate actual generic web search without buying a key, make it a separately gated extension only if the chosen official model runtime demonstrably supports the relevant search tool under the account. The first MVP uses existing official-source retrieval. Do not assume subscription OAuth includes an arbitrary search API or scrape a logged-in consumer UI. Search leads cannot silently become ranking evidence; typed extraction/source validation belongs in Akshar's adapters.
- [ ] Use `assessJourneyReadiness` for existing source-bound lighting/pickup/waiting observations. Historical measurements, OSM lamp inventory and posted hours do not establish current illumination, an open accessible indoor refuge, pickup permission, or companionship. Current main has historical measured-lighting data; do not repeat the older claim that no measured-lighting dataset exists at all.
- [ ] Add a separate ANS context capability parser/profile, proposed `beacon-context-v1` with `query_context`. Do not shoehorn research agents into `quote_trip` or edit the transport profile's function list. Reuse existing endpoint/identity verification mechanics via a narrow shared identity interface if needed, preserving mobility tests.
- [ ] Student Agent discovers/verifies the context service before contacting it when live ANS is configured. The context service may discover and contact another compatible, explicitly allowlisted research agent using the same checks: at most one delegation hop, at most two peers, no cycle, bounded deadline, public context only. Zero compatible peers yields `NO_COMPATIBLE_RESEARCH_PEER`, not fake success. Databricks itself does not need an invented ANS identity.
- [ ] Keep self-operated service identity honest: multiple services under one registered operator are not multiple independent companies. Local demo identity remains `local_demo`; never synthesize `ans_verified`. Do not modify domain/DNS or claim Lyft affiliation to obtain a badge.
- [ ] Add `lyft-demo` as a service configuration using the existing v2 manifest/offer/provider HTTP implementation. Display name: `Lyft-style developer agent — simulated`; operator: `Beacon demo team`. Preserve existing Campus Ride and Independent Ride fixtures; the demo may choose the added service only through the evaluator.
- [ ] Exercise quote, authorized simulated booking, status, cancellation, reconciliation and deletion through HTTP, not direct imports in the orchestrator. For Vercel, configure reachable hosted provider/context endpoints; `127.0.0.1:4311` on the laptop is not reachable from a Vercel function. Separately callable routes may share infrastructure, but label their shared operator.

**Tests:** research privacy schema; capability mismatch; failed ANS verification; no compatible peer; cycle/deadline; fixed-source vs search labels; stale historical data; hours without access permission; HTTP conformance for the added provider; valid/tampered/replayed/expired grant; one operator with two same-mode services remains distinct.

**Commit:** `feat: expose route context and simulated developer provider agents`.

## 9. Task D — persist real communication at actual boundaries

**Create:** `src/lib/agent-activity/{contracts,store,redaction}.ts`, `src/agents/agent-activity.test.ts`. **Modify:** Student Agent, HTTP provider/context clients, ANS adapter calls, planner orchestration and notification/monitor boundaries.

- [ ] Emit requests immediately before actual dispatch and responses after actual completion. Include request/correlation IDs so a judge can connect both sides. Never turn a planned but uncalled action into a success event.
- [ ] Initial operation registry: `planner.intent`, `directory.discover`, `identity.verify`, `provider.quote`, `context.query`, `context.delegate`, `source.lookup`, `decision.evaluate`, `plan.validate`, `planner.explain`, `student.confirm`, `booking.authorize`, `provider.book`, `provider.status`, `provider.cancel`, `payment.settle`, `trip.replan`, `trip.arrive`, `notification.send`. Validate operation/sender/recipient against service identities and operation-specific payload schemas.
- [ ] Derive money and timing from accepted offers/evidence; source engine from the real adapter result; identity state from verified records. Use controlled summaries such as `QUOTE_RECEIVED` and `IDENTITY_REJECTED`. Do not publish provider-supplied strings or raw exception messages as summaries.
- [ ] Redact by selecting permitted fields, not deleting a few keys from raw payloads. No OAuth/API tokens, auth headers, grants, private coordinates, contact IDs, raw student text, hidden reasoning, raw SQL, full internal payloads or provider URLs. In all mobile panels, including judge mode, retain the user's requirement not to display `geta36.app`; use approved agent display names and opaque evidence handles. Approved public evidence links may be shown separately.
- [ ] Sequence events atomically per trip; retain the last 500 with a 24-hour maximum TTL and delete earlier on trip reset/arrival according to the existing private-state retention policy. Preserve only the minimum safe terminal summary for the current viewer. Handle pagination truncation explicitly.
- [ ] Integrate events with state changes using a durable outbox or the same transaction. Do not recursively update the trip store from inside its existing lock. External-call request events can be written to a separate event key so the panel does not wait for the whole call to finish. Make retries idempotent using stable event IDs.
- [ ] Activity writes cannot grant permission or drive trip state. Failed logging must never bypass confirmation or replay a provider booking. Keep trace-loss visible as a diagnostic gap instead of fabricating a complete timeline.

**Tests:** request/response pairing; atomic ordering; duplicate/replayed callbacks; source labels; event injected by wrong worker/session; secrets in nested payloads/errors; domain/private-location suppression; trace retention; failed telemetry without duplicate booking.

**Commit:** `feat: record sanitized agent requests and responses`.

## 10. Task E — connect the phone PWA and communication panel

**Create:** `src/components/safecircle/{agent-activity-panel,agent-network-diagram}.tsx`, `src/lib/client/{trip-api,use-agent-activity}.ts`. **Modify:** `src/components/safecircle/{technical-panel,safe-circle-app}.tsx`, `src/components/safecircle/types.ts`, plus existing screens/styles as needed. Preserve Rishit's visual system; read installed Next.js guides before implementation.

- [ ] Replace live-mode reliance on `demo-controller.ts` with actual trip, planning, evidence and activity responses. Keep fixture mode available with a persistent `Recorded / simulated UI demo` label; never merge its timer events into a live network timeline.
- [ ] Create/pair session, create trip, then call `/planning`. Poll trip/evidence/activity every two seconds while visible; back off when hidden or disconnected. Abort in-flight reads on unmount; after reconnect reload authoritative snapshots before enabling actions. Do not cache private responses in the service worker.
- [ ] Show planning stage and worker status; use `Planner unavailable — reconnect demo laptop` for worker loss. If only the model explanation failed, show the already validated plan and `Template explanation` provenance. Do not simulate progress to hide a dead connection.
- [ ] Add a collapsible `Agent activity` bottom sheet on mobile and a wider judge view. Top row: planner connection, actual model ID, ANS mode, Databricks engine and `Simulated transport / no charge`. No account email or tokens.
- [ ] Network diagram nodes come from registered components; animate an edge only when a matching event arrives. Differentiate pending, response, rejected and timeout with text/icons as well as color. Keep Databricks, ANS and authorization labeled as services/code rather than LLMs.
- [ ] Timeline rows show timestamp, sender -> recipient, operation, status, provenance and a short controlled summary. Expand to allowlisted JSON and evidence references. Filter by agent, errors, or booking attempt; pause autoscroll without pausing trip monitoring; respect reduced motion and use restrained live-region announcements.
- [ ] Show the actual winning offer price, expiry, pickup details, relevant walking/waiting burden, rejected alternatives and uncertainty from evidence. Unknown is never displayed as zero. Do not describe the walking-alternative geometry as a vehicle route.
- [ ] On GO, use the existing exact `{planId, quoteId}` confirmation, then verify/request. A replaced quote gets a fresh button/confirmation; an old tap must receive `SELECTION_CHANGED`. Worker/model output must never press GO.
- [ ] Cancellation demo control calls the existing server demo route. Route completion/movement fixtures are provider-side simulations, not UI timers changing authoritative state. Arrival and reconnect remain functional if the planner is offline.
- [ ] Add physical-phone instructions to the runbook: install PWA, pair within it, test over cellular with laptop on a separate network, inspect sources, induce provider cancellation, confirm replacement, arrive, then disconnect laptop and observe truthful failure behavior.

**Tests:** wrong-owner event access; event-driven edges without synthetic timers; no green ANS badge for local trust; no domain/secret strings; keyboard/reduced-motion usability; duplicate-click confirmation; old selection rejected; installed PWA reconnect and worker loss; no private cache entries. Use the existing test stack first and add a UI test dependency only through a recorded shared-file change.

**Commit:** `feat: connect PWA journey and live agent activity view`.

## 11. Acceptance checks and exact demo story

Existing repository commands (run against the integrated branch):

```sh
npm ci
bash src/agents/test.sh
node databricks/run.mjs test
./scripts/pre-pr.sh
```

New commands the implementation must supply:

```sh
node --test tools/beacon-laptop-worker/worker.test.mjs
node scripts/planner-auth-smoke.mjs
node scripts/hybrid-demo-smoke.mjs
```

`hybrid-demo-smoke.mjs` must use synthetic public endpoints, simulated providers/payment/notifications, and its own paired owner session. Implement it to create a run; await bounded ready state; fetch activity; confirm the exact quote; verify/book; cancel the active provider; verify settlement; await replacement; assert no second booking before fresh confirmation; confirm replacement; arrive; test a disconnected worker on a new run. Clean only its own fixtures in `finally`. It must support configurable deployment URL and never reset another session or send a real Telegram alert.

Use this judge story, with values read from the actual snapshot rather than invented numbers:

1. Student enters tired/minimize-walking context and a budget; model proposes bounded evidence needs.
2. The panel shows ANS discovery/verification, real HTTP quote exchange and the context-agent request/response.
3. Databricks evaluates eligible options; code excludes violations; the panel displays actual source and rejected-option reasons.
4. Model explains the selected validated plan, including unknown lighting/access where applicable.
5. Student confirms. The provider receives a bounded grant, accepts a simulated booking and returns pickup/status details.
6. Provider cancellation appears as an actual provider/server event. Beacon reconciles liabilities, refreshes quotes and recommends a replacement. The student confirms the new offer before it is booked.
7. Arrival stops the trip and clears private data. Display what was actual HTTP, actual model inference, actual Databricks/ANS, simulated transport/payment, or fallback separately.

The OAuth demo is accepted only after: the real local managed-login smoke passes; the installed phone PWA completes this flow over the deployed backend; a second anonymous session cannot enqueue work/read the trip; the laptop disconnect test is honest; and no current provider location/authorization gate has regressed. Report live ANS or Databricks failures separately rather than relabeling local success.

## 12. Handoff completion report required from the executing agent

Return commit/PR links, exact tested revision, new configuration names and their locations (names only), observed model/auth method, test commands/results, physical-phone result, and a truth table for model inference, transport, payment, ANS, Databricks, research, notification and fallback. State any missing teammate credentials or pairing action in one concise list. Do not call this complete merely because the UI animates.

For exact operator setup and OAuth boundaries, use [the companion runbook](../../BEACON_OAUTH_DEMO_RUNBOOK.md).
