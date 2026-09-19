import { randomUUID } from "node:crypto";
import type { CandidatePlan } from "../../types/provider";
import type { Recommendation } from "../../types/recommendation";
import type { ProviderAgent, ProviderDescriptor } from "../contract";
import { object, point } from "../contract";
import type { AgentDirectory, VerifiedIdentity } from "../../integrations/ans/directory";
import { authorize } from "../../lib/authorization/policy";
import { owns, requireState, transition, TripError, type TripRecord, type TripContext, type Contact } from "../../lib/trip-state/model";
import type { TripStore } from "../../lib/trip-state/store";
import { distanceMeters } from "../../lib/trip-state/geofence";
import { collectCandidates } from "../discovery";
import { parseTripInput } from "./input";
import type { DecisionHandoff } from "./databricks";
import { isCurrentWeather, withinCampusForecast, type WeatherEvidence } from "../../lib/campus-evidence/evidence";
import { matchesPublicCorridor, type PublicCorridor, type PublicTripOptions } from "../../lib/decision-client/trip-options";

export type Action = "discover" | "evaluate" | "confirm" | "verify" | "request" | "location" | "arrive" | "cancel-provider" | "expire-deadline";
export type Dependencies = {
  store: TripStore; directory: AgentDirectory; demo: boolean; clock?: () => number; graceMinutes?: number;
  provider: (descriptor: ProviderDescriptor, identity?: VerifiedIdentity) => ProviderAgent;
  recommend: (plans: CandidatePlan[], context: TripContext, handoff: DecisionHandoff) => Promise<Recommendation>;
  notify: (contact: Contact, message: string, key: string) => Promise<{ id: string; simulated: boolean }>;
  campusWeather?: (now: number) => WeatherEvidence;
  publicTripOptions?: (corridorId: PublicCorridor, demo: boolean, evaluatedAt: string) => Promise<PublicTripOptions>;
};
const activeStates = ["NAVIGATING", "WAITING_FOR_PICKUP", "IN_TRIP", "OVERDUE"] as const;
export class StudentAgent {
  private readonly now: () => number;
  constructor(private readonly deps: Dependencies) { this.now = deps.clock ?? Date.now; }
  async create(owner: string, input: unknown) {
    const record: TripRecord = { trip: { id: randomUUID(), state: "OBJECTIVE_RECEIVED", candidates: [], providerVerified: false, sensitiveDataReleased: false, alertSent: false, statusMessage: "Finding a way home" }, owner, ...parseTripInput(input, this.deps.demo, this.now()), providers: [], excluded: [], confirmed: false, quoteDeadline: 0, replanCount: 0, events: [] };
    transition(record, "OBJECTIVE_RECEIVED", "OBJECTIVE_RECEIVED", "Trip objective received", this.now());
    await this.deps.store.create(record); return record.trip;
  }
  async read(id: string, owner: string) { const record = await this.deps.store.read(id); owns(record, owner); return record.trip; }
  async events(id: string, owner: string) { const record = await this.deps.store.read(id); owns(record, owner); return record.events; }
  async evidence(id: string, owner: string) {
    const r = await this.deps.store.read(id); owns(r, owner);
    const current = isCurrentWeather(r.weatherEvidence, this.now());
    return { weather: current ? r.weatherEvidence! : { status: "unknown", condition: "unknown" },
      appliedToPlanIds: current ? r.weatherPlanIds ?? [] : [], catalog: "/api/demo/campus-data",
      ...(r.corridorId ? { corridorId: r.corridorId } : {}),
      ...(r.optionEvidence ? { options: r.optionEvidence } : {}),
      ...(r.decisionEvidence ? { intelligence: r.decisionEvidence, selectionCurrent: !!r.trip.selectedPlan && !["FAILED", "ARRIVED", "COLLECTING_QUOTES"].includes(r.trip.state) && this.selectedDeadline(r) > this.now(), evidenceEvaluatedAt: r.decisionEvidence.decision.evaluatedAt } : {}),
      limitations: ["Area forecast, not observed conditions on each path.", "No current foot-traffic measurement, verified route lighting or crime-risk score is available."] };
  }
  async providerEvent(id: string, providerId: string, bookingId: string, event: string) {
    return this.deps.store.update(id, async (r) => {
      if (r.booking?.providerId !== providerId || r.booking.id !== bookingId) throw new TripError("STALE_PROVIDER_EVENT", "Event does not belong to the active booking");
      requireState(r, [...activeStates]);
      if (event === "provider.cancelled") await this.recover(r, true);
      else if (event === "provider.in_trip") this.log(r, "IN_TRIP", "PROVIDER_IN_TRIP", "Trip in progress");
      else if (event === "provider.completed") await this.arrive(r);
      else throw new TripError("INVALID_EVENT", "Unsupported provider event", 400);
      return r.trip;
    });
  }
  async reset(owner: string) {
    if (!this.deps.demo) throw new TripError("DEMO_DISABLED", "Demo controls are disabled", 404);
    for (const id of await this.deps.store.list()) {
      await this.deps.store.update(id, async (r) => {
        if (r.owner !== owner) return;
        if (r.private) await this.arrive(r);
        this.log(r, "FAILED", "DEMO_RESET", "Demo trip reset");
      });
    }
  }
  async act(id: string, owner: string, action: Action, input: unknown = {}) {
    return this.deps.store.update(id, async (record) => {
      owns(record, owner);
      if (action === "discover") { requireState(record, ["OBJECTIVE_RECEIVED", "COLLECTING_QUOTES"]); await this.discover(record); }
      if (action === "evaluate") { requireState(record, ["COLLECTING_QUOTES", "SELECTED"]); if (record.confirmed) throw new TripError("ALREADY_CONFIRMED", "Plan is already confirmed"); await this.evaluate(record); }
      if (action === "confirm") { requireState(record, ["SELECTED"]); if (this.selectedDeadline(record) <= this.now()) this.expireSelection(record); record.confirmed = true; this.log(record, "SELECTED", "USER_CONFIRMED", "Plan confirmed"); }
      if (action === "verify") { requireState(record, ["SELECTED"]); await this.verify(record); }
      if (action === "request") {
        if (record.pendingBooking) { await this.reconcileBooking(record); await this.checkDeadline(record); return structuredClone(record.trip); }
        if (record.booking && (activeStates as readonly string[]).includes(record.trip.state)) return record.trip;
        requireState(record, ["SELECTED", "VERIFYING_PROVIDER"]); await this.coordinate(record);
      }
      if (action === "location") await this.location(record, input);
      if (action === "arrive") { if (!record.pendingBooking && !record.pendingReplacement) requireState(record, [...activeStates, "ARRIVED"]); if (record.trip.state !== "ARRIVED") await this.arrive(record); }
      if (action === "cancel-provider") { if (!this.deps.demo) throw new TripError("DEMO_DISABLED", "Demo controls are disabled", 404); requireState(record, ["WAITING_FOR_PICKUP", "IN_TRIP"]); await this.recover(record); }
      if (action === "expire-deadline") { if (!this.deps.demo) throw new TripError("DEMO_DISABLED", "Demo controls are disabled", 404); requireState(record, [...activeStates]); record.trip.alertDeadlineAt = new Date(this.now() - 1).toISOString(); await this.checkDeadline(record); }
      return structuredClone(record.trip);
    });
  }
  private log(r: TripRecord, state: TripRecord["trip"]["state"], code: string, message: string) { transition(r, state, code, message, this.now()); }
  private selectedProvider(r: TripRecord) { const p = r.providers.find((p) => p.id === r.trip.selectedPlan?.providerId); if (!p) throw new TripError("PROVIDER_MISSING", "Selected provider is unavailable"); return p; }
  private planDeadline(r: TripRecord, planId: string) {
    const weatherLimit = r.weatherPlanIds?.includes(planId) && r.weatherEvidence?.validUntil ? Date.parse(r.weatherEvidence.validUntil) : Infinity;
    const signalLimit = r.planSignals?.[planId]?.validUntil;
    return Math.min(r.quoteDeadline, r.quoteExpirations?.[planId] ?? Infinity, weatherLimit, signalLimit ? Date.parse(signalLimit) : Infinity);
  }
  private selectedDeadline(r: TripRecord) { return this.planDeadline(r, r.trip.selectedPlan?.planId ?? ""); }
  private expireSelection(r: TripRecord): never {
    delete r.trip.selectedPlan; delete r.trip.recommendation; delete r.identity;
    r.trip.providerVerified = false;
    // Cancellation recovery already has authorization within the saved objective.
    // An ordinary stale selection needs a fresh, explicit confirmation.
    if (!r.pendingReplacement) r.confirmed = false;
    this.log(r, "COLLECTING_QUOTES", "QUOTE_EXPIRED", "Quotes or weather context expired; refresh the recommendation");
    throw new TripError("QUOTE_EXPIRED", "Refresh the recommendation before confirming or booking");
  }
  private async discover(r: TripRecord) {
    this.log(r, "DISCOVERING", "DISCOVERY_STARTED", "Finding transportation providers");
    try { r.providers = await this.deps.directory.discover(); }
    catch { this.log(r, "FAILED", "DISCOVERY_FAILED", "Provider discovery is unavailable; no location was shared"); throw new TripError("DISCOVERY_FAILED", "Provider discovery unavailable", 503); }
    this.log(r, "COLLECTING_QUOTES", "COARSE_QUOTES", "Requesting quotes using approximate zones only");
    const result = await collectCandidates(r.providers.map((p) => this.deps.provider(p)), { originZone: r.originZone, destinationZone: r.destinationZone, ...r.context }, new Set(r.excluded), 22, this.now());
    r.trip.candidates = result.candidates; r.quoteDeadline = this.now() + 120_000; r.quoteExpirations = result.quoteExpirations; r.simulatedPlanIds = result.simulatedPlanIds;
    delete r.decisionEvidence; delete r.optionEvidence; r.planSignals = {};
    if (r.corridorId) {
      // Remove the fixed walk for a named real route even when route data fails.
      r.trip.candidates = r.trip.candidates.filter(p => p.mode !== "walk");
      const latest = r.trip.lastKnownLocation;
      const origin = latest && Date.parse(latest.recordedAt) >= this.now() - 120_000 ? latest : r.private?.origin;
      if (origin && r.private && matchesPublicCorridor(r.corridorId, origin, r.private.home) && this.deps.publicTripOptions) {
        try {
          const { candidates, signals, ...evidence } = await this.deps.publicTripOptions(r.corridorId, this.deps.demo, new Date(this.now()).toISOString());
          const publicOptions = candidates.filter(p => !r.excluded.includes(p.providerId ?? ""));
          // Reserve capacity for mapped/timetable options without changing the provider search contract.
          const omitted = Math.max(0, r.trip.candidates.length + publicOptions.length - 16);
          r.trip.candidates = [...r.trip.candidates.slice(0, 16 - publicOptions.length), ...publicOptions];
          if (omitted) this.log(r, "COLLECTING_QUOTES", "PROVIDER_LIMIT", `${omitted} provider offer(s) omitted to include public route options within the 16-plan limit`);
          r.planSignals = signals; r.optionEvidence = evidence;
          for (const plan of publicOptions) if (signals[plan.planId]?.validUntil) r.quoteExpirations[plan.planId] = Date.parse(signals[plan.planId].validUntil!);
          this.log(r, "COLLECTING_QUOTES", "PUBLIC_OPTIONS_ADDED", "Checked mapped walking and scheduled transit for the selected public campus route");
        } catch { this.log(r, "COLLECTING_QUOTES", "PUBLIC_OPTIONS_UNAVAILABLE", "Public route options unavailable; provider offers remain separately labeled"); }
      } else this.log(r, "COLLECTING_QUOTES", "PUBLIC_ROUTE_NOT_APPLICABLE", "The saved public route does not apply to the current pickup; no mapped path was attached");
      r.simulatedPlanIds = r.simulatedPlanIds.filter(id => r.trip.candidates.some(p => p.planId === id));
    }
    if (result.omittedProviderCount) this.log(r, "COLLECTING_QUOTES", "PROVIDER_LIMIT", `${result.omittedProviderCount} additional providers omitted from this bounded search`);
    if (result.failures.length) this.log(r, "COLLECTING_QUOTES", "PROVIDER_UNAVAILABLE", `${result.failures.length} unavailable provider(s) excluded`);
  }
  private async evaluate(r: TripRecord) {
    const expired = (): never => this.expireSelection(r);
    if (r.quoteDeadline <= this.now()) expired();
    delete r.weatherEvidence; r.weatherPlanIds = [];
    // Research reads a pre-imported campus forecast. Student coordinates stay local.
    const latest = r.trip.lastKnownLocation;
    const origin = latest && Date.parse(latest.recordedAt) >= this.now() - 120_000 ? latest : r.private?.origin;
    if (origin && r.private && withinCampusForecast(origin) && withinCampusForecast(r.private.home)) {
      try { r.weatherEvidence = this.deps.campusWeather?.(this.now()); } catch { /* Missing evidence stays unknown. */ }
      if (isCurrentWeather(r.weatherEvidence, this.now())) r.weatherPlanIds = [...(r.simulatedPlanIds ?? [])];
    }
    this.log(r, "EVALUATING", "EVALUATION_STARTED", "Evaluating transportation options");
    let recommendation: Recommendation;
    delete r.decisionEvidence;
    try { recommendation = await this.deps.recommend(r.trip.candidates, { ...r.context, currentTime: new Date(this.now()).toISOString() }, { quoteDeadline: r.quoteDeadline, quoteExpirations: r.quoteExpirations ?? {}, simulatedPlanIds: r.simulatedPlanIds ?? [], excludedProviderIds: [...r.excluded], weatherEvidence: r.weatherEvidence, planSignals: r.planSignals, corridorId: r.optionEvidence?.walkingAlternative ? r.corridorId : undefined, walkingAlternative: r.optionEvidence?.walkingAlternative, onEvidence: evidence => {
      r.decisionEvidence = evidence;
      // Managed weather and explanation latency can shorten evidence validity too.
      for (const plan of evidence.decision.ranked) if (plan.evidence?.validUntil) (r.planSignals ??= {})[plan.planId] = plan.evidence;
    } }); }
    catch (error) { this.log(r, "FAILED", "EVALUATION_FAILED", "No recommendation is available"); if (error instanceof TripError) throw error; throw new TripError("EVALUATION_FAILED", "Recommendation unavailable", 503); }
    const plan = r.trip.candidates.find((p) => p.planId === recommendation.selectedPlanId && p.available && p.cost <= r.context.maxBudget && !r.excluded.includes(p.providerId ?? ""));
    if (!plan || !Array.isArray(recommendation.reasonCodes) || !recommendation.reasonCodes.every((c) => typeof c === "string") || typeof recommendation.explanation !== "string" || !Number.isFinite(Date.parse(recommendation.evaluatedAt))) { this.log(r, "FAILED", "INVALID_RECOMMENDATION", "No valid plan fits the approved constraints"); throw new TripError("INVALID_RECOMMENDATION", "Decision engine returned an invalid plan", 502); }
    if (this.planDeadline(r, plan.planId) <= this.now()) expired();
    r.trip.recommendation = recommendation; r.trip.selectedPlan = plan; r.trip.providerVerified = false; r.trip.sensitiveDataReleased = Boolean(r.cleanup?.length); delete r.identity;
    this.log(r, "SELECTED", "PLAN_SELECTED", `${plan.providerName} recommended; awaiting confirmation`);
  }
  private async verify(r: TripRecord) {
    if (!r.confirmed) throw new TripError("CONFIRMATION_REQUIRED", "Confirm the plan before provider verification");
    const plan = r.trip.selectedPlan; if (!plan) throw new TripError("PLAN_REQUIRED", "Select a plan first");
    if (plan.mode === "walk" || plan.mode === "transit") return;
    this.log(r, "VERIFYING_PROVIDER", "VERIFY_STARTED", "Checking provider identity and permissions");
    try {
      const provider = this.selectedProvider(r); r.identity = await this.deps.directory.verify(provider);
      if (!authorize(provider, r.identity, r.confirmed, this.deps.demo, this.now()).preciseLocation) throw new Error("Policy denied");
      r.trip.providerVerified = r.identity.source === "ans";
      this.log(r, "VERIFYING_PROVIDER", r.trip.providerVerified ? "ANS_VERIFIED" : "LOCAL_DEMO_TRUST", r.trip.providerVerified ? "Provider identity verified through ANS" : "Local demo provider pretrusted; live ANS not used");
    } catch { delete r.identity; r.trip.providerVerified = false; this.log(r, "SELECTED", "VERIFICATION_DENIED", "Provider verification failed; precise location withheld"); throw new TripError("VERIFICATION_DENIED", "Provider verification or authorization failed", 403); }
  }
  private async coordinate(r: TripRecord) {
    if (!r.confirmed || !r.private || !r.trip.selectedPlan) throw new TripError("CONFIRMATION_REQUIRED", "Confirm a plan before requesting a trip");
    if (this.selectedDeadline(r) <= this.now()) this.expireSelection(r);
    const plan = r.trip.selectedPlan;
    if (plan.mode === "walk" || plan.mode === "transit") { delete r.pendingReplacement; this.startMonitoring(r); this.log(r, "NAVIGATING", "NAVIGATION_STARTED", "Navigation started; no precise data shared with a provider"); return; }
    const provider = this.selectedProvider(r);
    if (!authorize(provider, r.identity, r.confirmed, this.deps.demo, this.now()).preciseLocation) throw new TripError("VERIFICATION_REQUIRED", "A current verified and authorized provider is required", 403);
    this.log(r, "COORDINATING", "POLICY_ALLOWED", "Precise pickup and destination permitted for this provider");
    r.trip.sensitiveDataReleased = true;
    r.pendingBooking = { providerId: provider.id, requestId: `${r.trip.id}-${r.replanCount}` };
    delete r.pendingReplacement;
    this.startMonitoring(r);
    // A lost response does not mean the provider rejected or erased this request.
    await this.deps.store.checkpoint(r);
    try {
      const latest = r.trip.lastKnownLocation;
      const pickup = latest && Date.parse(latest.recordedAt) >= this.now() - 120_000 ? { lat: latest.lat, lng: latest.lng } : r.private.origin;
      const result = await this.deps.provider(provider, r.identity).requestTrip({ tripId: r.pendingBooking.requestId, pickup, destination: r.private.home });
      if (!["accepted", "waiting"].includes(result.status)) throw new Error("Provider rejected trip");
      r.booking = { providerId: provider.id, id: result.id }; delete r.pendingBooking;
      this.log(r, "WAITING_FOR_PICKUP", "PROVIDER_ACCEPTED", `${plan.providerName} accepted your trip`);
    } catch {
      // A timeout may mean the provider accepted. Keep the idempotency key and require
      // status reconciliation rather than silently booking another provider.
      this.log(r, "FAILED", "BOOKING_UNCERTAIN", "Provider response unavailable; booking status needs checking");
      throw new TripError("BOOKING_UNCERTAIN", "Provider response unavailable; do not create a duplicate booking", 502);
    }
  }
  private startMonitoring(r: TripRecord) {
    const eta = this.now() + r.trip.selectedPlan!.totalMinutes * 60_000;
    r.trip.expectedArrivalAt = new Date(eta).toISOString();
    r.trip.alertDeadlineAt = new Date(eta + (this.deps.graceMinutes ?? 5) * 60_000).toISOString();
  }
  private async reconcileBooking(r: TripRecord) {
    const pending = r.pendingBooking;
    if (!pending || (pending.retryAt ?? 0) > this.now()) return;
    const provider = this.selectedProvider(r);
    let result;
    try {
      const client = this.deps.provider(provider, r.identity);
      if (!client.getRequestStatus) throw new Error("Provider cannot reconcile requests");
      result = await client.getRequestStatus(pending.requestId);
      if (!result) {
        // A missing lookup is not proof that a delayed original request cannot
        // arrive. Fence that request with a durable cancellation before replanning.
        if (!client.cancelRequest) throw new Error("Provider cannot cancel requests");
        await client.cancelRequest(pending.requestId);
      }
    } catch {
      pending.attempts = (pending.attempts ?? 0) + 1;
      pending.retryAt = this.now() + Math.min(60_000, 10_000 * 2 ** Math.min(pending.attempts - 1, 3));
      if (pending.attempts === 1) this.log(r, r.trip.state, "BOOKING_CHECK_PENDING", "Booking status unavailable; checking again before any replacement");
      return;
    }
    delete r.pendingBooking;
    if (!result) { await this.replace(r, provider, "Previous request cancelled; finding a replacement"); return; }
    r.booking = { providerId: provider.id, id: result.id };
    if (result.status === "completed") { await this.arrive(r); return; }
    if (result.status === "cancelled") { await this.recover(r, true); return; }
    if (r.trip.state !== "OVERDUE") this.log(r, result.status === "in_trip" ? "IN_TRIP" : "WAITING_FOR_PICKUP", "BOOKING_RECONCILED", "Provider booking confirmed; monitoring resumed");
  }
  private async recover(r: TripRecord, cancellationConfirmed = false) {
    if (!r.booking) throw new TripError("NO_BOOKING", "No provider booking to replace");
    const failed = this.selectedProvider(r);
    if (cancellationConfirmed) this.queueCleanup(r);
    else await this.deps.provider(failed, r.identity).cancelTrip(r.booking.id);
    await this.replace(r, failed, "Your provider cancelled; finding a replacement");
  }
  private async replace(r: TripRecord, failed: ProviderDescriptor, message: string) {
    r.excluded.push(failed.id); delete r.booking; delete r.identity;
    r.trip.providerVerified = false; r.trip.sensitiveDataReleased = Boolean(r.cleanup?.length); r.replanCount++;
    r.pendingReplacement = { attempts: 0, retryAt: this.now() };
    this.log(r, "PROVIDER_FAILED", "PROVIDER_CANCELLED", message);
    await this.deps.store.checkpoint(r);
    await this.flushCleanup(r);
    await this.resumeReplacement(r);
  }
  private async resumeReplacement(r: TripRecord) {
    if (!r.pendingReplacement || r.pendingReplacement.retryAt > this.now()) return;
    if (r.replanCount > 3) { delete r.pendingReplacement; this.log(r, "FAILED", "RECOVERY_LIMIT", "No replacement is available within your constraints"); return; }
    try {
      this.log(r, "REPLANNING", "REPLAN_STARTED", "Replanning within your approved budget and preferences");
      await this.discover(r); await this.evaluate(r); await this.verify(r); await this.coordinate(r);
    } catch (error) {
      if (r.pendingReplacement) {
        r.pendingReplacement.attempts++;
        r.pendingReplacement.retryAt = this.now() + Math.min(60_000, 10_000 * 2 ** Math.min(r.pendingReplacement.attempts - 1, 3));
      }
      throw error;
    }
  }
  private async location(r: TripRecord, input: unknown) {
    if (!r.pendingBooking && !r.pendingReplacement) requireState(r, [...activeStates]); const raw = object(input); const location = point(raw);
    const recorded = Date.parse(String(raw.recordedAt ?? new Date(this.now()).toISOString()));
    if (!Number.isFinite(recorded) || recorded > this.now() + 30_000 || recorded < this.now() - 120_000 || (r.trip.lastKnownLocation && recorded <= Date.parse(r.trip.lastKnownLocation.recordedAt))) throw new TripError("INVALID_LOCATION_TIME", "Location timestamp is stale or out of order", 400);
    r.trip.lastKnownLocation = { ...location, recordedAt: new Date(recorded).toISOString() };
    if (r.private && distanceMeters(location, r.private.home) <= 75) await this.arrive(r);
  }
  private async arrive(r: TripRecord) {
    this.queueCleanup(r);
    delete r.private; delete r.identity; delete r.booking; delete r.pendingBooking; delete r.pendingReplacement; delete r.trip.lastKnownLocation; delete r.trip.alertDeadlineAt;
    r.trip.sensitiveDataReleased = Boolean(r.cleanup?.length); r.trip.providerVerified = false;
    this.log(r, "ARRIVED", "TRIP_COMPLETED", r.cleanup?.length ? "Home reached; provider cleanup pending" : "Home reached; location sharing ended");
    // Persist the minimal revocation task before calling an external service.
    // It contains identifiers and TLS evidence, never home/contact/location data.
    await this.deps.store.checkpoint(r);
    await this.flushCleanup(r);
  }
  private queueCleanup(r: TripRecord) {
    if (!r.booking && !r.pendingBooking) return;
    const cleanup = r.cleanup ??= [];
    if (r.booking && !cleanup.some((job) => job.provider.id === r.booking!.providerId && job.bookingId === r.booking!.id)) cleanup.push({ provider: this.selectedProvider(r), identity: r.identity, bookingId: r.booking.id, attempts: 0, retryAt: this.now() });
    if (r.pendingBooking && !cleanup.some((job) => job.provider.id === r.pendingBooking!.providerId && job.requestId === r.pendingBooking!.requestId)) cleanup.push({ provider: this.selectedProvider(r), identity: r.identity, requestId: r.pendingBooking.requestId, attempts: 0, retryAt: this.now() });
  }
  private async flushCleanup(r: TripRecord) {
    if (!r.cleanup?.length) return;
    for (const job of [...(r.cleanup ?? [])]) {
      if (job.retryAt > this.now()) continue;
      try {
        const client = this.deps.provider(job.provider, job.identity);
        if (job.requestId !== undefined) {
          if (!client.cancelRequest) throw new Error("Provider cannot cancel requests");
          await client.cancelRequest(job.requestId);
        } else await client.cancelTrip(job.bookingId);
        r.cleanup = r.cleanup!.filter((pending) => pending !== job);
      } catch {
        job.attempts++; job.retryAt = this.now() + Math.min(60_000, 10_000 * 2 ** Math.min(job.attempts - 1, 3));
        if (job.attempts === 1) this.log(r, r.trip.state, "ACCESS_REVOCATION_PENDING", "Provider cleanup pending; retry scheduled");
      }
    }
    if (!r.cleanup?.length && !r.booking && !r.pendingBooking) {
      delete r.cleanup; r.trip.sensitiveDataReleased = false;
      if (r.trip.state === "ARRIVED") r.trip.statusMessage = "Home reached; location sharing ended";
    }
  }
  async monitor() {
    for (const id of await this.deps.store.list()) {
      await this.deps.store.update(id, async (r) => {
        await this.flushCleanup(r);
        if (r.pendingBooking) {
          try { await this.reconcileBooking(r); } catch { /* A replacement outage must not disable the deadline. */ }
          if (r.pendingBooking) { await this.checkDeadline(r); return; }
        }
        if (r.pendingReplacement) {
          try { await this.resumeReplacement(r); } catch { /* Retry intent remains durable through an outage. */ }
        }
        if (!(activeStates as readonly string[]).includes(r.trip.state)) { await this.checkDeadline(r); return; }
        if (r.booking) {
          try {
            const result = await this.deps.provider(this.selectedProvider(r), r.identity).getStatus(r.booking.id);
            if (result.status === "cancelled") { await this.recover(r, true); return; }
            if (result.status === "completed") { await this.arrive(r); return; }
            if (result.status === "in_trip" && r.trip.state !== "IN_TRIP" && r.trip.state !== "OVERDUE") this.log(r, "IN_TRIP", "PROVIDER_IN_TRIP", "Trip in progress");
          } catch { /* Provider status outage must not disable the overdue deadline. */ }
        }
        await this.checkDeadline(r);
      }).catch(() => { /* A corrupt/unavailable record must not stop other monitors. */ });
    }
  }
  private async checkDeadline(r: TripRecord) {
    if (!r.trip.alertDeadlineAt || Date.parse(r.trip.alertDeadlineAt) > this.now() || r.trip.state === "ARRIVED") return;
    if (r.trip.state !== "OVERDUE") { r.lastStatusBeforeOverdue = r.trip.state; this.log(r, "OVERDUE", "TRIP_OVERDUE", "Trip is overdue; please check in"); }
    const contact = r.private?.contact;
    if (!contact?.consent || r.notification) return;
    const location = contact.shareLocation && r.trip.lastKnownLocation ? ` Last known location: ${r.trip.lastKnownLocation.lat}, ${r.trip.lastKnownLocation.lng} (${r.trip.lastKnownLocation.recordedAt}).` : "";
    r.notification = { state: "sending" };
    // Persist the outbox claim before the external send. An ambiguous/crashed send
    // is not automatically retried, since Telegram cannot promise exactly once.
    await this.deps.store.checkpoint(r);
    try {
      const message = await this.deps.notify(contact, `Beacon trip is overdue. Last trip status: ${r.lastStatusBeforeOverdue}. Please check in.${location}`, r.trip.id);
      r.notification = { state: message.simulated ? "simulated" : "sent", id: message.id }; r.trip.alertSent = !message.simulated;
      this.log(r, "OVERDUE", message.simulated ? "DEMO_ALERT" : "ALERT_SENT", message.simulated ? "Demo alert recorded; no Telegram message was sent" : "Trusted-contact alert accepted by Telegram");
    } catch { r.notification = { state: "uncertain" }; this.log(r, "OVERDUE", "ALERT_UNCERTAIN", "Telegram acceptance could not be confirmed; check your contact directly"); }
  }
}
