"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DemoStage, DemoViewModel, SavedProfile, TripContext } from "../../../components/safecircle/types";
import { backendErrorStage, normalizeJourney, type AtomicJourney } from "./atomic-journey";
import { atomicTransport as api, AtomicTransportError } from "./atomic-transport";

export const ACTIVE_JOURNEY_KEY = "beacon.atomic-trip.v1";
type Failure = { code: string; message: string; stage: DemoStage };
function failure(error: unknown): Failure {
  const code = error instanceof AtomicTransportError ? error.code : "CONNECTION_UNAVAILABLE";
  return { code, message: error instanceof AtomicTransportError ? error.message : "Could not verify the latest trip update. Your trip has not been changed.", stage: backendErrorStage(code) };
}
function homeModel(profile: SavedProfile, context: TripContext): DemoViewModel {
  return { stage: "home", backendDetails: {}, profile, constraints: { maxBudget: context.maxBudget ?? profile.maxBudget, walkingPreference: context.walkingPreference ?? profile.walkingPreference, avoidTransfers: profile.avoidTransfers }, trip: { id: "", state: "IDLE", candidates: [] }, paymentStatus: "not-required", bookingStatus: "not-required", cancellationFee: 0, providerVerified: false, providerAuthorized: false, sensitiveDataReleased: false, isReplacement: false, isActiveTrip: false, isRouteVisible: false, isStale: false, progressStep: "none", timeline: [], paused: false };
}

/** One owner for trip identity, authoritative reads, commands and restoration.
 * Storage contains only an opaque trip ID, never a serialized UI or journey. */
export function useAtomicJourney(profile: SavedProfile | null, context: TripContext) {
  const [snapshot, setSnapshot] = useState<AtomicJourney | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [offline, setOffline] = useState(false);
  const [sessionOnly, setSessionOnly] = useState(false);
  const identity = useRef<string | null>(null);
  const current = useRef<AtomicJourney | null>(null);
  const generation = useRef(0);
  const readSequence = useRef(0);
  const appliedSequence = useRef(0);
  const busy = useRef(false);
  const alive = useRef(false);
  const readAbort = useRef<AbortController | null>(null);
  const reading = useRef(false);

  const persistIdentity = useCallback((id: string | null) => {
    identity.current = id;
    try { if (id) localStorage.setItem(ACTIVE_JOURNEY_KEY, JSON.stringify({ version: 1, tripId: id })); else localStorage.removeItem(ACTIVE_JOURNEY_KEY); }
    catch { setSessionOnly(true); }
  }, []);

  const refresh = useCallback(async () => {
    const id = identity.current;
    if (!id || !navigator.onLine) return null;
    const epoch = generation.current, sequence = ++readSequence.current;
    readAbort.current?.abort();
    const controller = new AbortController(); readAbort.current = controller;
    reading.current = true;
    try {
      const next = await api.journey(id, controller.signal);
      if (!alive.current || epoch !== generation.current || id !== identity.current || sequence < appliedSequence.current) return null;
      if (next.trip.id !== id) throw new Error("TRIP_ID_MISMATCH");
      if (current.current && next.journey.revision < current.current.journey.revision) return current.current;
      appliedSequence.current = sequence; current.current = next; setSnapshot(next); setNotice("");
      return next;
    } catch (e) {
      if (controller.signal.aborted || !alive.current || epoch !== generation.current) return null;
      const f = failure(e);
      if (["AUTH_REQUIRED", "TRIP_NOT_FOUND"].includes(f.code)) setError(f);
      else setNotice(f.message);
      throw e;
    } finally { if (readAbort.current === controller) reading.current = false; }
  }, []);

  useEffect(() => {
    alive.current = true;
    const epoch = generation.current;
    const online = () => { setOffline(false); if (!busy.current) void refresh().catch(() => {}); };
    const disconnected = () => { setOffline(true); setNotice("Offline. Showing the last verified update; no requests can be sent."); };
    queueMicrotask(async () => {
      if (!alive.current || generation.current !== epoch) return;
      setOffline(!navigator.onLine);
      try {
        let stored: string | null = null;
        try { stored = localStorage.getItem(ACTIVE_JOURNEY_KEY); } catch { setSessionOnly(true); }
        if (stored) {
          const value = JSON.parse(stored);
          if (value?.version !== 1 || typeof value.tripId !== "string" || !/^[a-zA-Z0-9_-]{1,150}$/.test(value.tripId)) throw Error("INVALID_SAVED_TRIP");
          identity.current = value.tripId;
          await refresh();
        }
      } catch (e) {
        if (alive.current) setError(failure(e));
      } finally { if (alive.current) setRestoring(false); }
    });
    window.addEventListener("online", online); window.addEventListener("offline", disconnected);
    const timer = window.setInterval(() => {
      const terminal = current.current?.trip.state === "ARRIVED" && !current.current.trip.sensitiveDataReleased || current.current?.cancellation?.status === "resolved";
      if (identity.current && !terminal && !busy.current && !reading.current && navigator.onLine && !document.hidden) void refresh().catch(() => {});
    }, 1200);
    return () => { alive.current = false; generation.current = epoch + 1; readAbort.current?.abort(); window.clearInterval(timer); window.removeEventListener("online", online); window.removeEventListener("offline", disconnected); };
  }, [refresh]);

  async function command(name: string, work: (epoch: number) => Promise<void>) {
    if (busy.current || !navigator.onLine) return;
    busy.current = true; const epoch = generation.current;
    readAbort.current?.abort(); appliedSequence.current = ++readSequence.current;
    setPending(name); setError(null); setNotice("");
    try { await work(epoch); }
    catch (e) { if (alive.current && epoch === generation.current) { setError(failure(e)); await refresh().catch(() => {}); } }
    finally { if (alive.current && epoch === generation.current) setPending(null); busy.current = false; }
  }
  const validEpoch = (epoch: number) => alive.current && epoch === generation.current;
  async function start() {
    if (!profile || identity.current) return;
    await command("Finding your options…", async epoch => {
      const trip = await api.create(profile, context);
      if (!validEpoch(epoch)) return;
      persistIdentity(trip.id);
      await refresh();
      if (!validEpoch(epoch)) return;
      await api.planning(trip.id);
      if (validEpoch(epoch)) await refresh();
    });
  }
  async function pair(code: string) {
    await command("Pairing planner…", async epoch => {
      await api.pair(code.trim());
      if (!validEpoch(epoch)) return;
      setNotice("Planner paired for this browser.");
      if (identity.current && (!current.current || ["IDLE", "OBJECTIVE_RECEIVED", "DISCOVERING"].includes(current.current.trip.state))) { await api.planning(identity.current); await refresh(); }
    });
  }
  async function approve() {
    await command("Confirming your plan…", async epoch => {
      const s = current.current; if (!s) return;
      await api.confirm(s.trip.id, s);
      if (!validEpoch(epoch)) return;
      await refresh();
      if (!validEpoch(epoch)) return;
      setPending("Checking provider permissions…");
      await api.verify(s.trip.id);
      if (!validEpoch(epoch)) return;
      await refresh();
      if (!validEpoch(epoch)) return;
      setPending("Requesting your journey…");
      await api.request(s.trip.id);
      if (validEpoch(epoch)) await refresh();
    });
  }
  async function mutate(name: string, operation: (s: AtomicJourney) => Promise<unknown>) {
    await command(name, async epoch => { const s = current.current; if (!s) return; await operation(s); if (validEpoch(epoch)) await refresh(); });
  }
  async function retry() {
    await command("Checking your trip…", async epoch => {
      const s = await refresh();
      if (!s || !validEpoch(epoch)) return;
      // An uncertain booking is reconciled by the backend monitor, never re-booked.
      if (s.coordination.requiredAction === "check_booking" || s.cancellation) return;
      if (["OBJECTIVE_RECEIVED", "DISCOVERING", "COLLECTING_QUOTES", "EVALUATING"].includes(s.trip.state)) await api.planning(s.trip.id);
      else if (s.trip.state === "FAILED") { setNotice("No plan is available. Return Home to adjust preferences and start a new trip."); return; }
      else if (s.coordination.requiredAction === "refresh_quotes" || s.coordination.requiredAction === "payment_declined") await api.replan(s.trip.id, s);
      else if (s.selectionCurrent && s.coordination.requiredAction === "none" && ["SELECTED", "VERIFYING_PROVIDER"].includes(s.trip.state)) {
        if (s.trip.state === "SELECTED") { setPending("Checking provider permissions…"); await api.verify(s.trip.id); }
        if (!validEpoch(epoch)) return;
        await refresh();
        if (!validEpoch(epoch)) return;
        setPending("Requesting your journey…"); await api.request(s.trip.id);
      }
      if (validEpoch(epoch)) await refresh();
    });
  }
  function finish() {
    if (busy.current) return;
    if (identity.current && !current.current) { setNotice("The saved trip could not be verified. Restore its session before starting another trip."); return; }
    if (current.current && !["ARRIVED", "FAILED"].includes(current.current.trip.state)) { setNotice("Cancel the active trip before starting another one."); return; }
    if (current.current?.cancellation?.status === "pending") { setNotice("Cancellation is still being confirmed. Keep this trip open."); return; }
    generation.current++; readAbort.current?.abort(); persistIdentity(null); current.current = null; setSnapshot(null); setError(null); setNotice("");
  }
  const normalized = useMemo(() => snapshot && profile ? normalizeJourney(snapshot, profile, context) : null, [snapshot, profile, context]);
  const model = useMemo(() => {
    if (!profile) return null;
    const base = normalized?.model ?? homeModel(profile, context);
    const resumeStage = normalized?.canResumeConsent ? `authorizing-${base.isReplacement ? "replacement" : "initial"}` as DemoStage : base.stage;
    const pendingStage: DemoStage = pending === "Cancelling your trip…" ? "cancelling" : pending === "Checking provider permissions…" ? `verifying-${base.isReplacement ? "replacement" : "initial"}` : pending === "Requesting your journey…" ? `coordinating-${base.isReplacement ? "replacement" : "initial"}` : resumeStage;
    const stage = offline ? "offline" : error?.stage ?? (restoring ? "reconnecting" : !snapshot && pending ? "discovering" : pendingStage);
    return { ...base, stage, isStale: base.isStale || offline || !!notice, ...(notice ? { isRouteVisible: false } : {}) };
  }, [profile, context, normalized, snapshot, error, offline, restoring, pending, notice]);
  return { model, normalized, snapshot, pending, restoring, error, notice, sessionOnly, offline, start, pair, approve, retry, refresh, finish, setNotice,
    cancel: () => mutate("Cancelling your trip…", s => api.cancel(s.trip.id)),
    arrive: () => mutate("Confirming arrival…", s => api.arrive(s.trip.id)),
    location: (body: unknown) => mutate("Checking your location…", s => api.location(s.trip.id, body)),
    replan: () => mutate("Refreshing your options…", s => api.replan(s.trip.id, s)),
    demo: (action: Parameters<typeof api.demo>[1], body?: unknown) => mutate("Applying backend demo scenario…", s => api.demo(s.trip.id, action, body)),
  };
}
