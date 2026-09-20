"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Activity, CloudOff, Database, KeyRound, MapPin, ShieldCheck, WalletCards } from "lucide-react";
import {
  beaconApi,
  mergeActivityEvents,
  planningStatus,
  pollDelay,
  type AgentActivityEvent,
  type ConnectedTrip,
  type TripEvidence,
} from "@/lib/client/beacon-client";
import { AgentActivityPanel } from "./agent-activity-panel";
import { AppShell } from "./app-shell";
import { PrimaryButton, SecondaryButton } from "./primitives";

export const CONNECTED_TRIP_STORAGE_KEY = "beacon.connectedTripId.v1";

type Props = { onFixtureMode: () => void };

export function ConnectedJourney({ onFixtureMode }: Props) {
  const [paired, setPaired] = useState(false);
  const [trip, setTrip] = useState<ConnectedTrip>();
  const [evidence, setEvidence] = useState<TripEvidence>();
  const [events, setEvents] = useState<AgentActivityEvent[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const cursor = useRef(0);
  const tripId = useRef<string | undefined>(undefined);

  const refresh = useCallback(async (id: string, signal?: AbortSignal) => {
    const [nextTrip, nextEvidence, activity] = await Promise.all([
      beaconApi.trip(id, signal),
      beaconApi.evidence(id, signal),
      beaconApi.activity(id, cursor.current, signal),
    ]);
    setTrip(nextTrip);
    setEvidence(nextEvidence);
    setEvents((current) => mergeActivityEvents(current, activity.events));
    cursor.current = activity.nextCursor;
    setOffline(false);
    setError("");
  }, []);

  useEffect(() => {
    let restored: string | null = null;
    try { restored = window.localStorage.getItem(CONNECTED_TRIP_STORAGE_KEY); }
    catch { queueMicrotask(() => setNotice("Browser storage is unavailable. This trip will remain session-only.")); }
    if (!restored) return;
    tripId.current = restored;
    queueMicrotask(() => setPaired(true));
    const controller = new AbortController();
    refresh(restored, controller.signal).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "The saved trip could not be loaded.");
    });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!trip?.id) return;
    let timer: number | undefined;
    let controller: AbortController | undefined;
    let stopped = false;
    const poll = async () => {
      controller = new AbortController();
      try { await refresh(trip.id, controller.signal); }
      catch (reason) {
        if (!controller.signal.aborted) {
          setOffline(!navigator.onLine);
          setError(reason instanceof Error ? reason.message : "The trip could not be refreshed.");
        }
      }
      if (!stopped) timer = window.setTimeout(poll, pollDelay(document.hidden));
    };
    timer = window.setTimeout(poll, pollDelay(document.hidden));
    return () => { stopped = true; if (timer) window.clearTimeout(timer); controller?.abort(); };
  }, [refresh, trip?.id]);

  useEffect(() => {
    const reconnect = () => {
      const id = tripId.current;
      if (!id) return;
      const controller = new AbortController();
      refresh(id, controller.signal).catch(() => setOffline(true));
    };
    const disconnected = () => setOffline(true);
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", disconnected);
    return () => { window.removeEventListener("online", reconnect); window.removeEventListener("offline", disconnected); };
  }, [refresh]);

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (tripId.current) await refresh(tripId.current);
      if (success) setNotice(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The request could not be completed.");
    } finally { setBusy(false); }
  }

  async function pair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code") ?? "").trim();
    if (!code) return setError("Enter the pairing code shown by the planner.");
    await run(async () => { await beaconApi.pair(code); setPaired(true); }, "Planner paired with this app.");
  }

  async function createTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const maxBudget = Number(form.get("budget"));
    const walkingPreference = form.get("walkingPreference") === "normal" ? "normal" : "minimal";
    const temporaryContext = form.get("temporaryContext") === "drinking" ? "drinking" : form.get("temporaryContext") === "tired" ? "tired" : "none";
    await run(async () => {
      const created = await beaconApi.createTrip({ maxBudget, walkingPreference, temporaryContext });
      tripId.current = created.id;
      let sessionOnly = false;
      try { window.localStorage.setItem(CONNECTED_TRIP_STORAGE_KEY, created.id); }
      catch { sessionOnly = true; }
      setTrip(created);
      await beaconApi.startPlanning(created.id);
      setNotice(sessionOnly ? "Planning started. Browser storage is unavailable, so this trip is session-only." : "Planning started with your approved preferences.");
    });
  }

  async function confirmProvider() {
    const offer = evidence?.coordination?.selectedOffer;
    if (!trip || !offer) return setError("The current offer is unavailable. Wait for a fresh plan.");
    await run(async () => {
      await beaconApi.action(trip.id, "confirm", { planId: offer.planId, quoteId: offer.quoteId });
      await beaconApi.action(trip.id, "verify");
      await beaconApi.action(trip.id, "request");
    }, "The simulated provider request was sent after your confirmation.");
  }

  const planning = evidence?.planning;
  const status = planningStatus(planning);
  const coordination = evidence?.coordination;
  const offer = coordination?.selectedOffer;
  const isWalk = trip?.selectedPlan?.mode === "walk";
  const ansSource = coordination?.operator?.verification ?? "not called";
  const databricksEvent = [...events].reverse().find((event) => event.sender.toLowerCase().includes("databricks") || event.recipient.toLowerCase().includes("databricks"));

  return (
    <AppShell modeLabel="Connected demo" technicalLabel="Open real agent activity" onTechnicalOpen={() => setShowActivity((value) => !value)}>
      <div className="sc-connected">
        <div className="sc-connected-topbar"><button type="button" onClick={onFixtureMode}>View fixture preview</button>{offline && <span><CloudOff size={14} />Offline · showing last server state</span>}</div>
        <div className="sc-connected-content">
          {!paired ? <section className="sc-connected-card sc-pair-card" aria-labelledby="pair-heading">
            <div className="sc-connected-symbol"><KeyRound size={24} /></div>
            <p className="sc-eyebrow">Installed app connection</p><h1 id="pair-heading">Pair your planner</h1>
            <p>Enter the one-time code on this device. The browser keeps the session cookie; Beacon never stores the code.</p>
            <form onSubmit={pair}><label htmlFor="pair-code">Pairing code</label><input id="pair-code" name="code" inputMode="text" autoComplete="one-time-code" maxLength={32} required /><PrimaryButton disabled={busy}>{busy ? "Pairing…" : "Pair planner"}</PrimaryButton></form>
          </section> : !trip ? <section className="sc-connected-card" aria-labelledby="trip-heading">
            <p className="sc-eyebrow">Connected preferences</p><h1 id="trip-heading">Plan a demo trip home</h1>
            <p>This uses the supported public demo corridor. Your exact home and pickup are not saved in browser storage.</p>
            <form className="sc-connected-form" onSubmit={createTrip}>
              <label>Maximum budget (USD)<input name="budget" type="number" min="0" max="50" step="1" defaultValue="10" required /></label>
              <fieldset><legend>Walking preference</legend><label><input type="radio" name="walkingPreference" value="minimal" defaultChecked /> Minimize walking</label><label><input type="radio" name="walkingPreference" value="normal" /> Normal</label></fieldset>
              <label>Temporary context<select name="temporaryContext" defaultValue="none"><option value="none">None</option><option value="tired">I’m exhausted</option><option value="drinking">I’ve been drinking</option></select></label>
              <PrimaryButton disabled={busy}>{busy ? "Starting…" : "Start connected planning"}</PrimaryButton>
            </form>
          </section> : <>
            <section className="sc-connected-card sc-journey-card" aria-labelledby="journey-heading">
              <div className="sc-planning-status"><span className={`is-${status.kind}`}><Activity size={16} /></span><div><p className="sc-eyebrow">{status.kind === "working" ? "Agent working" : "Authoritative status"}</p><h1 id="journey-heading">{status.label}</h1></div></div>
              <p>{planning?.explanation ?? trip.recommendation?.explanation ?? trip.statusMessage ?? "Waiting for the server to report the next step."}</p>
              <div className="sc-source-grid" aria-label="Current connected sources">
                <span><Activity /><strong>Worker</strong><small>{planning?.worker ?? "not started"}</small></span>
                <span><KeyRound /><strong>Model</strong><small>{planning?.model ?? planning?.modelSource ?? "none"}</small></span>
                <span><Database /><strong>Databricks</strong><small>{databricksEvent ? databricksEvent.execution.replaceAll("_", " ") : "not called"}</small></span>
                <span><ShieldCheck /><strong>ANS</strong><small>{ansSource.replaceAll("_", " ")}</small></span>
                <span><MapPin /><strong>Transport</strong><small>{offer ? offer.simulated ? "simulated" : "live" : "not called"}</small></span>
                <span><WalletCards /><strong>Payment</strong><small>{coordination ? `${coordination.paymentMode} · no charge` : "not started"}</small></span>
              </div>
              {trip.selectedPlan && <div className="sc-connected-plan"><div><MapPin size={19} /><span><strong>{trip.selectedPlan.providerName}</strong><small>{trip.selectedPlan.totalMinutes} min · {trip.selectedPlan.walkingMinutes} min walking · ${trip.selectedPlan.cost.toFixed(2)}</small></span></div>{offer && <p>{offer.pickupInstructions}</p>}{isWalk && <p className="sc-honesty-note">Walking guidance does not book or dispatch a provider.</p>}</div>}
              {coordination?.requiredAction === "confirm" && !isWalk && offer && <div className="sc-confirm-box"><strong>Confirm this exact simulated offer?</strong><p>${(offer.totalMinor / 100).toFixed(2)} · expires {new Date(offer.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Demo payment — no charge.</p><PrimaryButton disabled={busy} onClick={confirmProvider}>{busy ? "Coordinating…" : "Confirm and request provider"}</PrimaryButton></div>}
              {coordination?.requiredAction === "confirm" && isWalk && <div className="sc-confirm-box"><strong>Walking plan ready</strong><p>No provider verification, authorization, payment, or booking call will be made.</p></div>}
              {coordination?.requiredAction === "check_booking" && <p className="sc-honesty-note">Provider status is uncertain. Beacon is checking this trip before any replacement.</p>}
              {coordination?.requiredAction === "refresh_quotes" && <p className="sc-honesty-note">The displayed quote is stale. Wait for the server to select a fresh offer before confirming.</p>}
              <div className="sc-connected-actions"><SecondaryButton disabled={busy || trip.state === "ARRIVED"} onClick={() => run(() => beaconApi.action(trip.id, "arrive"), "Arrival recorded; private trip data is cleared server-side.")}>I’m home</SecondaryButton>{!isWalk && <SecondaryButton disabled={busy || !trip.selectedPlan || trip.state === "ARRIVED"} onClick={() => run(() => beaconApi.cancelProvider(trip.id), "Provider cancellation requested; replacement planning remains server-authoritative.")}>Demo provider cancellation</SecondaryButton>}</div>
            </section>
            {showActivity && <AgentActivityPanel events={events} planning={planning} />}
          </>}
          {notice && <p className="sc-connected-notice" role="status">{notice}</p>}
          {error && <p className="sc-connected-error" role="alert">{error}</p>}
        </div>
      </div>
    </AppShell>
  );
}
