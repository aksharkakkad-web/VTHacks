"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BeaconFrame, BeaconHomeScreen, FindingScreen, RecommendationScreen } from "./flow-screens";
import { JourneyScreen } from "./journey-screens";
import { MobilityScreen } from "./mobility-screens";
import { EditHomeSheet, EditPreferencesSheet, TrustedContactSheet, TripContextSheet, HelpSheet, TripDetailsSheet, JourneySheet, CancelTripDialog } from "./journey-dialogs";
import { readProfile, saveProfile } from "./profile-storage";
import type { DemoAction, SavedProfile, TripContext } from "../safecircle/types";
import { useAtomicJourney } from "@/lib/client/beacon/use-atomic-journey";
import styles from "./backend-beacon-app.module.css";
import { beaconApi, type AgentActivityEvent } from "@/lib/client/beacon-client";
import { AgentActivityPanel } from "../safecircle/agent-activity-panel";

type Panel = "home" | "preferences" | "contact" | "context" | "help" | "details" | "cancel" | "technical" | "location" | null;
export function BackendBeaconApp({ demoControls = false }: { demoControls?: boolean }) {
  const router = useRouter();
  const [profile, setProfile] = useState<SavedProfile | null>(null);
  const [context, setContext] = useState<TripContext>({});
  const [panel, setPanel] = useState<Panel>(null);
  const [code, setCode] = useState("");
  const [variant, setVariant] = useState("baseline");
  const [locationMessage, setLocationMessage] = useState("");
  const [activity, setActivity] = useState<{tripId:string;events:AgentActivityEvent[]} | null>(null);
  const [activityMessage, setActivityMessage] = useState("");
  const journey = useAtomicJourney(profile, context);
  const { model, normalized, snapshot } = journey;
  const currentStage = model?.stage;
  useEffect(() => {
    queueMicrotask(() => {
      const saved = readProfile();
      if (saved) setProfile(saved);
      else router.replace(`/onboarding/welcome${demoControls ? "?demo=1" : ""}`);
    });
  }, [router, demoControls]);
  useEffect(() => {
    if (!currentStage) return;
    window.scrollTo(0, 0);
    document.querySelectorAll<HTMLElement>("main, main section, main section > div").forEach(el => { if (el.scrollTop) el.scrollTop = 0; });
    if (!document.querySelector('[role="dialog"]')) {
      const heading = document.querySelector<HTMLElement>("h1"); heading?.setAttribute("tabindex", "-1"); heading?.focus({ preventScroll: true });
    }
  }, [currentStage]);
  const open = (value: Panel) => (visible: boolean) => setPanel(visible ? value : null);
  function persist(next: SavedProfile) {
    if (snapshot && !["ARRIVED", "FAILED"].includes(snapshot.trip.state)) { journey.setNotice("Finish or cancel this trip before changing saved preferences."); return; }
    if (!saveProfile(next)) journey.setNotice("Preferences are saved for this session only.");
    setProfile(next);
  }
  function act(action: DemoAction) {
    if (action.type === "GO") void journey.approve();
    else if (action.type === "START_TRIP") void journey.start();
    else if (action.type === "CONFIRM_ARRIVAL") void journey.arrive();
    else if (action.type === "REQUEST_CANCEL") { setPanel(null); void journey.cancel(); }
    else if (action.type === "RETRY" || action.type === "RECONNECT") void journey.retry();
    else if (action.type === "FINISH") { journey.finish(); if (snapshot && ["ARRIVED", "FAILED"].includes(snapshot.trip.state) && snapshot.cancellation?.status !== "pending") setContext({}); }
    else if (action.type === "STILL_TRAVELLING") { journey.setNotice("Your trip remains active. Location updates can confirm progress; the overdue notification record is unchanged."); setPanel("location"); }
    else if (action.type === "WALK_LEG_COMPLETE" || action.type === "BOARD_TRANSIT") setPanel("location");
  }
  function updateLocation() {
    if (!snapshot) { setLocationMessage("This hackathon uses a synthetic Blacksburg corridor, not your saved address. No device location is needed to start it."); return; }
    if (!navigator.geolocation) { setLocationMessage("Device location is unavailable. You can still confirm arrival manually when you reach home."); return; }
    setLocationMessage("Requesting a location sample with your permission…");
    navigator.geolocation.getCurrentPosition(position => {
      void journey.location({ lat: position.coords.latitude, lng: position.coords.longitude, accuracyMeters: position.coords.accuracy, recordedAt: new Date(position.timestamp).toISOString() });
      setLocationMessage("A location sample was submitted for backend assessment. One sample does not establish arrival.");
    }, () => setLocationMessage("Location was not shared. Check device permission or use manual arrival when appropriate."), { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
  }
  if (!model || !profile || journey.restoring) return <BeaconFrame><p className={styles.restore} role="status">Restoring your trip from Beacon…</p></BeaconFrame>;
  const stage = model.stage;
  const mobility = !journey.error && !journey.offline && !journey.notice && stage !== "overdue" && stage !== "cancelling" ? normalized?.mobility : undefined;
  const showPairing = stage === "home" || journey.error?.code === "PAIRING_REQUIRED" || journey.error?.code === "PAIR_CODE_INVALID";
  const busy = !!journey.pending;
  const runtimeLabel = process.env.NEXT_PUBLIC_BEACON_TEST_RUNTIME === "1" ? "Test runtime · fixture planner, offline ranking, simulated rides and payments" : "Connected to Beacon’s trip backend · simulated providers and payments";
  return <>
    <div data-testid={`screen-${stage}`} data-stage={stage} data-attempt={model.attemptId ?? ""} data-backend="atomic" aria-busy={busy}>
      <fieldset className={styles.screenBoundary} disabled={busy}>
        {stage === "home" ? <BeaconHomeScreen model={model} onStart={() => void journey.start()} onEditProfile={() => setPanel("preferences")} onEditHome={() => setPanel("home")} onContext={() => setPanel("context")} onHelp={() => setPanel("help")} onLocation={() => setPanel("location")} onTrustedContact={() => setPanel("contact")} />
          : stage === "recommendation" || stage === "replacement-selected" ? <RecommendationScreen model={model} onGo={() => void journey.approve()} onBack={() => setPanel("cancel")} onDetails={() => setPanel("details")} onSelectPlan={() => journey.setNotice("These are the backend’s compared options. Only the current recommendation can be confirmed; refresh options to request a new recommendation.")} />
          : ["discovering", "collecting-quotes", "evaluating", "replanning-discovery", "replanning-evaluation"].includes(stage) ? <FindingScreen model={model} onCancel={() => setPanel("cancel")} />
          : mobility ? <MobilityScreen mobility={mobility} onWalkComplete={() => mobility.leg.purpose === "home" ? void journey.arrive() : setPanel("location")} onArrival={() => void journey.arrive()} onHelp={() => setPanel("help")} onDetails={() => setPanel("details")} onCancel={() => setPanel("cancel")} onRetryRoute={() => void journey.retry()} navigation={normalized?.navigation ?? undefined} onBoard={mobility.leg.purpose === "transit-stop" ? () => setPanel("location") : undefined} boardingLabel="Update trip location" />
          : <JourneyScreen model={model} onAction={act} onDetails={() => setPanel("details")} onHelp={() => setPanel("help")} />}
      </fieldset>
    </div>
    <aside className={styles.connection} aria-label="Backend connection">
      {demoControls && <button className={styles.action} onClick={() => setPanel("technical")}>Judge controls</button>}
      <p role="status" aria-live="polite">{journey.pending ?? journey.error?.message ?? journey.notice ?? (snapshot?.planning && ["OBJECTIVE_RECEIVED","DISCOVERING","COLLECTING_QUOTES","EVALUATING"].includes(snapshot.trip.state) && snapshot.planning.phase !== "ready" ? `Planner: ${snapshot.planning.phase.replaceAll("_", " ")} · ${snapshot.planning.worker.replaceAll("_", " ")}` : runtimeLabel)}</p>
      {showPairing && <form onSubmit={event => { event.preventDefault(); void journey.pair(code); setCode(""); }} className={styles.pairing}>
        <label>Pairing code<input aria-label="Pairing code" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" placeholder="Laptop planner code" /></label>
        <button type="submit" disabled={busy || !code.trim()}>Pair planner</button>
      </form>}
      {stage === "home" && <small>Demo corridor: Downtown Blacksburg → campus home. Saved address labels are not geocoded. Pair the laptop planner before your first trip.</small>}
      {snapshot && <small>{snapshot.journey.nextStep?.instruction ?? snapshot.trip.statusMessage}{snapshot.notification ? ` · Contact notification: ${snapshot.notification.state}` : " · No contact notification reported"}</small>}
      {journey.sessionOnly && <small>Storage unavailable: keep this tab open to retain the trip identifier.</small>}
    </aside>
    <CancelTripDialog open={panel === "cancel"} onOpenChange={open("cancel")} model={model} onAction={act} />
    <EditHomeSheet open={panel === "home"} onOpenChange={open("home")} profile={profile} onSave={persist} />
    <EditPreferencesSheet open={panel === "preferences"} onOpenChange={open("preferences")} profile={profile} onSave={persist} />
    <TrustedContactSheet open={panel === "contact"} onOpenChange={open("contact")} profile={profile} onSave={persist} />
    <TripContextSheet open={panel === "context"} onOpenChange={open("context")} current={context} onApply={setContext} onClear={() => setContext({})} />
    <HelpSheet open={panel === "help"} onOpenChange={open("help")} trustedContact={profile.trustedContact} />
    <TripDetailsSheet open={panel === "details"} onOpenChange={open("details")} model={model} />
    <JourneySheet open={panel === "location"} onOpenChange={open("location")} title="Location and trip progress" description="Device location is sent only when you choose to share it. The backend checks accuracy and freshness before advancing a leg or confirming arrival.">
      <p className={styles.note}>The demo route uses a synthetic campus corridor. Your real device position may not match it. No precise location is shared with a provider before the backend’s consent and authorization gates pass.</p>
      <button className={styles.action} disabled={busy} onClick={updateLocation}>Share one location sample</button>
      <p role="status">{locationMessage}</p>
      {snapshot && <p>Arrival assessment: {snapshot.arrival.status.replaceAll("_", " ")}</p>}
    </JourneySheet>
    {demoControls && <>
      <JourneySheet open={panel === "technical"} onOpenChange={open("technical")} title="Backend demo controls" description="These controls call owner-scoped backend endpoints. Provider data and payments are simulated; they do not book a commercial ride.">
        <div className={styles.controls}>
          <p>Journey revision: {normalized?.revision ?? "No active trip"}. Planner: {snapshot?.planning?.phase ?? "Not started"}. Source: {normalized?.source ?? "Backend"}.</p>
          <label>Scenario<select value={variant} onChange={event => setVariant(event.target.value)}><option value="baseline">Baseline walking</option><option value="lighting_outage">Lighting outage</option><option value="incident_pressure">Incident pressure</option><option value="rain">Rain</option></select></label>
          <button disabled={busy || !snapshot} onClick={() => { void journey.demo("scenario", { variant, journeyRevision: snapshot?.journey.revision }); setPanel(null); }}>Apply scenario</button>
          {(["approaching", "arrived", "in_trip", "completed"] as const).map(value => <button key={value} disabled={busy || !snapshot?.ride} onClick={() => { void journey.demo("advance-ride", { stage: value }); setPanel(null); }}>Advance ride: {value}</button>)}
          <button disabled={busy || !snapshot?.ride} onClick={() => { void journey.demo("cancel-provider"); setPanel(null); }}>Cancel provider</button>
          <button disabled={busy || !snapshot} onClick={() => { void journey.demo("expire-deadline"); setPanel(null); }}>Make trip overdue</button>
          <button disabled={busy || !snapshot} onClick={() => { void journey.replan(); setPanel(null); }}>Refresh options</button>
          <p>Provider identity: {normalized?.operator?.verification ?? "Not reported"}. Notification: {normalized?.notification?.state ?? "Not requested"}.</p>
          <button disabled={!snapshot} onClick={async()=>{
            if(!snapshot)return;
            try{const result=await beaconApi.activity(snapshot.trip.id,0);setActivity({tripId:snapshot.trip.id,events:result.events});setActivityMessage("");}
            catch{setActivityMessage("Agent evidence is unavailable. Trip coordination is unchanged.");}
          }}>Refresh agent evidence</button>
          <p role="status">{activityMessage}</p>
          {activity?.tripId===snapshot?.trip.id&&activity ? <AgentActivityPanel events={activity.events} planning={snapshot?.planning ? {...snapshot.planning,snapshotId:snapshot.planning.snapshotId??undefined} : undefined} /> : null}
        </div>
      </JourneySheet></>}
  </>;
}
