"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BeaconFrame, BeaconHomeScreen, FindingScreen, RecommendationScreen } from "../beacon/flow-screens";
import { JourneyScreen } from "../beacon/journey-screens";
import { EditHomeSheet, EditPreferencesSheet, HelpSheet, LocationSheet, TripContextSheet, TripDetailsSheet, TrustedContactSheet, JourneySheet, CancelTripDialog } from "../beacon/journey-dialogs";
import { clearProfile, readProfile, saveProfile } from "../beacon/profile-storage";
import { clearTrip, readTrip, saveTrip } from "../beacon/trip-storage";
import { createDemoState, deriveViewModel, transitionDemo, validatedProfile } from "./demo-controller";
import { TechnicalPanel } from "./technical-panel";
import type { DemoAction, DemoState, SavedProfile } from "./types";

import { MobilityScreen } from "../beacon/mobility-screens";
import { applyTripResponse, visibleMobility } from "../../lib/client/beacon/response-adapter";
import { fallbackMobility, mobilitySample, sampleResponse, type MobilitySample } from "../../lib/client/beacon/sample-responses";
import type { TripCommand, TripTransport } from "../../lib/client/beacon/trip-response";
import { demoTransport } from "../../lib/client/beacon/demo-transport";
import { BackendBeaconApp } from "../beacon/backend-beacon-app";
import { CAMPUS_LOCATIONS, DEFAULT_FROM_LOCATION_ID, DEFAULT_TO_LOCATION_ID } from "../../lib/client/beacon/campus-locations";

type AppAction = DemoAction | { type: "APPLY_RESPONSE"; value: unknown; sample?: boolean };
function appReducer(state: DemoState, action: AppAction): DemoState {
  return action.type === "APPLY_RESPONSE" ? applyTripResponse(state, action.value, action.sample) : transitionDemo(state, action);
}
export { PROFILE_STORAGE_KEY } from "../beacon/profile-storage";
type Panel = "home" | "preferences" | "contact" | "context" | "details" | "help" | "location" | "technical" | "cancel" | null;

export function SafeCircleApp({ demoControls = false, presenter = false, transport, fixture = false }: { demoControls?: boolean; presenter?: boolean; transport?: TripTransport | null; fixture?: boolean }) {
  if (fixture || transport !== undefined) return <FixtureApp demoControls={demoControls} transport={transport === undefined ? demoTransport : transport} />;
  return <BackendBeaconApp presenter={presenter} />;
}

/** Explicit visual-regression fixtures only; never a fallback after backend errors. */
function FixtureApp({ demoControls = false, transport = demoTransport }: { demoControls?: boolean; transport?: TripTransport | null }) {
  const router = useRouter();
  const [state, dispatch] = useReducer(appReducer, null, () => createDemoState(null));
  const [panel, setPanel] = useState<Panel>(null);
  const [sessionOnly, setSessionOnly] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [connectionMessage, setConnectionMessage] = useState("");
  const stateRef = useRef(state);
  const pendingCommands = useRef(new Set<string>());
  const generation = useRef(0);
  const previousStage = useRef(state.stage);
  const model = useMemo(() => deriveViewModel(state), [state]);
  const integratedTripId = state.integration?.tripId;
  const responseSource = state.integration?.responseSource;

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    if (!transport || !integratedTripId || responseSource === "sample" || ["home", "offline", "arrival", "cancelled", "session-error"].includes(state.stage)) return;
    let active = true;
    let busy = false;
    // This timer only requests an authoritative server snapshot. It never dispatches ADVANCE.
    const timer = window.setInterval(async () => {
      if (busy || !navigator.onLine) return;
      busy = true;
      const current = stateRef.current;
      try {
        const value = await transport.request({ kind: "refresh", tripId: current.integration!.tripId, attemptId: current.attemptId, revision: current.integration!.responseRevision });
        if (active) { dispatch({ type: "APPLY_RESPONSE", value }); setConnectionMessage(""); }
      } catch { if (active) setConnectionMessage("Connection paused. Showing the last known update."); }
      finally { busy = false; }
    }, 500);
    return () => { active = false; window.clearInterval(timer); };
  }, [transport, integratedTripId, responseSource, state.stage]);
  useEffect(() => {
    if (!transport?.subscribe) return;
    return transport.subscribe(state.integration?.tripId ?? "trip-demo-2409", value => dispatch({ type: "APPLY_RESPONSE", value }));
  }, [transport, state.integration?.tripId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const profile = readProfile();
      if (!profile) { router.replace("/onboarding/welcome"); return; }
      const restored = readTrip(profile);
      let next = restored.state;
      if (!navigator.onLine) next = transitionDemo(next, { type: "SIMULATE", scenario: "offline" });
      dispatch({ type: "RESTORE_STATE", state: next });
      if (next.stage === "reconnecting" && transport) {
        void transport.request({ kind: "refresh", tripId: next.integration?.tripId ?? "trip-demo-2409", attemptId: next.attemptId, revision: next.integration?.responseRevision ?? 0 })
          .then(value => { if (active) dispatch({ type: "APPLY_RESPONSE", value }); })
          .catch(() => { if (active) setConnectionMessage("Trip restoration pending. Your provider status is not yet confirmed."); });
      }
      try { localStorage.setItem("beacon.storage-check", "1"); localStorage.removeItem("beacon.storage-check"); }
      catch { setSessionOnly(true); }
    });
    return () => { active = false; };
  }, [router, transport]);

  useEffect(() => {
    if (!saveTrip(state)) queueMicrotask(() => setSessionOnly(true));
  }, [state]);

  useEffect(() => {
    if (previousStage.current === state.stage) return;
    previousStage.current = state.stage;
    document.querySelectorAll<HTMLElement>("main, main section, main section > div").forEach(element => { if (element.scrollTop) element.scrollTop = 0; });
    window.scrollTo(0, 0);
    // Preserve modal focus. Otherwise place screen-reader focus on the new task.
    if (!document.querySelector('[role="dialog"]')) {
      const heading = document.querySelector<HTMLElement>("h1");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus({ preventScroll: true });
    }
  }, [state.stage]);

  useEffect(() => {
    if (!["recommendation", "replacement-selected"].includes(state.stage) || !state.offerExpiresAt) return;
    const timer = window.setTimeout(() => dispatch({ type: "EXPIRE_OFFER" }), Math.max(0, state.offerExpiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [state.stage, state.offerExpiresAt]);

  useEffect(() => {
    const offline = () => dispatch({ type: "SIMULATE", scenario: "offline" });
    const online = () => { dispatch({ type: "RECONNECT" }); if (transport) void transport.request({ kind: "refresh", tripId: stateRef.current.integration?.tripId ?? "trip-demo-2409", attemptId: stateRef.current.attemptId, revision: stateRef.current.integration?.responseRevision ?? 0 }).then(value => dispatch({ type: "APPLY_RESPONSE", value })).catch(() => setConnectionMessage("Reconnection pending. Your trip has not changed.")); };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => { window.removeEventListener("offline", offline); window.removeEventListener("online", online); };
  }, [transport]);

  async function request(kind: TripCommand["kind"], next: DemoState) {
    if (!transport) { setConnectionMessage("Backend connection pending. Demo responses are available in judge controls."); return; }
    const command: TripCommand = { kind, tripId: next.integration?.tripId ?? "trip-demo-2409", attemptId: next.attemptId, planId: next.selectedPlanId, revision: next.integration?.responseRevision ?? 0, ...(kind === "discover" && model.constraints ? { constraints: model.constraints } : {}) };
    const key = JSON.stringify(command);
    if (pendingCommands.current.has(key)) return;
    pendingCommands.current.add(key);
    const currentGeneration = generation.current;
    setConnectionMessage("Waiting for the provider response…");
    try {
      const value = await transport.request(command);
      if (currentGeneration === generation.current) { dispatch({ type: "APPLY_RESPONSE", value }); setConnectionMessage(""); }
    } catch { if (currentGeneration === generation.current) setConnectionMessage("Update unavailable. Your ride status has not changed. Try again."); }
    finally { pendingCommands.current.delete(key); }
  }
  function act(action: DemoAction) {
    if (!navigator.onLine && action.type !== "SIMULATE") return;
    const current = stateRef.current;
    if (action.type === "RESET_PROFILE") {
      generation.current++; clearProfile(); clearTrip(); setPanel(null); router.replace(demoControls ? "/onboarding/welcome?demo=1" : "/onboarding/welcome"); return;
    }
    if (action.type === "RETRY" && current.stage === "session-error" && !current.previousStage && current.profile) {
      dispatch({ type: "RESTORE_STATE", state: readTrip(current.profile).state }); return;
    }
    // ADVANCE is a fixture operation, never a student progress command.
    if (action.type === "ADVANCE" || action.type === "JUMP" || action.type === "CANCEL_PROVIDER") return;
    if (transport && ["CONFIRM_ARRIVAL", "WALK_LEG_COMPLETE", "BOARD_TRANSIT"].includes(action.type)) {
      void request(action.type === "CONFIRM_ARRIVAL" ? "arrive" : action.type === "BOARD_TRANSIT" ? "board" : "walk-complete", current);
      return;
    }
    if (action.type === "GO" || action.type === "CONFIRM_ARRIVAL") action = { ...action, now: Date.now() };
    let next = transitionDemo(current, action);
    // A transport correlation ID is not a provider booking reference. New searches
    // need distinct IDs so a late subscription event cannot revive an older trip.
    if (action.type === "START_TRIP" && next !== current && transport) next = { ...next, integration: { tripId: `client-request-${crypto.randomUUID()}`, responseRevision: 0 } };
    if (next === current && action.type !== "RETRY") return;
    stateRef.current = next;
    dispatch(action.type === "START_TRIP" && transport ? { type: "RESTORE_STATE", state: next } : action);
    if (action.type === "FINISH" || action.type === "START_TRIP") { generation.current++; setConnectionMessage(""); }
    const kind = action.type === "START_TRIP" ? "discover" : action.type === "GO" ? "confirm" : action.type === "REQUEST_CANCEL" && next.stage === "cancelling" ? "cancel" : action.type === "RETRY" ? "retry" : action.type === "RECONNECT" ? "refresh" : action.type === "WALK_LEG_COMPLETE" ? "walk-complete" : action.type === "CONFIRM_ARRIVAL" ? "arrive" : action.type === "BOARD_TRANSIT" ? "board" : undefined;
    if (kind) void request(kind, next);
  }
  function judgeAction(action: DemoAction) {
    if (!demoControls) return;
    if (action.type === "RESET_PROFILE") { act(action); return; }
    if (transport && stateRef.current.integration?.responseSource === "demo" && ["ADVANCE", "CANCEL_PROVIDER", "SIMULATE", "JUMP"].includes(action.type) && !(action.type === "SIMULATE" && action.scenario === "offline")) {
      const s = stateRef.current;
      void transport.request({ kind: "judge", tripId: s.integration!.tripId, revision: s.integration!.responseRevision, attemptId: s.attemptId, fixture: action }).then(value => dispatch({ type: "APPLY_RESPONSE", value })).catch(() => setConnectionMessage("Demo fixture unavailable."));
      setPanel(null); return;
    }
    if (action.type === "ADVANCE" || action.type === "CANCEL_PROVIDER") {
      dispatch({ type: "APPLY_RESPONSE", value: sampleResponse(stateRef.current, action), sample: true });
    } else dispatch(action); // Explicitly labeled snapshot/error controls, never scheduled.
    setConnectionMessage(""); setPanel(null);
  }
  function applyMobilitySample(name: MobilitySample) {
    if (!demoControls) return;
    dispatch({ type: "APPLY_RESPONSE", value: mobilitySample(stateRef.current, name), sample: true });
    setPanel(null); setConnectionMessage("");
  }
  function persistProfile(profile: SavedProfile) {
    const valid = validatedProfile(profile);
    if (!valid || !["home", "no-options"].includes(state.stage)) return;
    setSessionOnly(!saveProfile(valid));
    dispatch({ type: "SAVE_PROFILE", profile: valid });
  }
  function testLocation() {
    setLocationMessage("Checking location permission…");
    if (!navigator.geolocation) { setLocationMessage(""); act({ type: "SIMULATE", scenario: "location-error" }); return; }
    navigator.geolocation.getCurrentPosition(
      () => setLocationMessage("Location permission works. This demo still uses Downtown Blacksburg; your coordinates were not stored or sent."),
      () => { setLocationMessage(""); act({ type: "SIMULATE", scenario: "location-error" }); },
      { timeout: 8000, maximumAge: 0, enableHighAccuracy: false },
    );
  }
  const mobility = visibleMobility(state) ?? fallbackMobility(state);
  const open = (name: Panel) => (value: boolean) => setPanel(value ? name : null);

  if (!model.profile) return <BeaconFrame><p role="status" style={{ padding: 24, textAlign: "center" }}>Restoring Beacon…</p></BeaconFrame>;

  return <>
    <div data-testid={`screen-${state.stage}`} data-stage={state.stage} data-attempt={state.attemptId ?? ""}>
      {state.stage === "home" ? <BeaconHomeScreen model={model} campusLocations={CAMPUS_LOCATIONS} fromLocationId={DEFAULT_FROM_LOCATION_ID} toLocationId={DEFAULT_TO_LOCATION_ID} onFromLocationChange={() => undefined} onToLocationChange={() => undefined} onStart={() => act({ type: "START_TRIP" })} onEditProfile={() => setPanel("preferences")} />
      : state.stage === "recommendation" || state.stage === "replacement-selected" ? <RecommendationScreen model={model} onGo={() => act({ type: "GO" })} onBack={() => act({ type: "FINISH" })} onDetails={() => setPanel("details")} onSelectPlan={(planId) => act({ type: "SELECT_PLAN", planId, now: Date.now() })} />
      : ["discovering", "collecting-quotes", "evaluating", "replanning-discovery", "replanning-evaluation"].includes(state.stage) ? <FindingScreen model={model} onCancel={() => act({ type: "FINISH" })} />
      : mobility ? <MobilityScreen mobility={mobility} onWalkComplete={() => act({ type: "WALK_LEG_COMPLETE" })} onArrival={() => act({ type: "CONFIRM_ARRIVAL" })} onBoard={mobility.leg.purpose === "transit-stop" ? () => act({ type: "BOARD_TRANSIT" }) : undefined} onHelp={() => setPanel("help")} onDetails={() => setPanel("details")} onCancel={() => setPanel("cancel")} onRetryRoute={() => void request("refresh", state)} />
      : <JourneyScreen model={model} onAction={(action) => { if (state.stage === "no-options" && action.type === "FINISH") setPanel("preferences"); else act(action); }} onDetails={() => setPanel("details")} onHelp={() => setPanel("help")} />}
    </div>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">Beacon demo: {state.stage.replaceAll("-", " ")}</span>
    {locationMessage && state.stage === "home" && <p className="sc-integration-note" role="status">{locationMessage}</p>}
    {connectionMessage && <p className="sc-integration-note" role="status">{connectionMessage}</p>}
    <p className="sc-integration-note">{transport ? "Local fixture mode · no backend journey" : "Manual fixture mode · Judge responses only"}</p>
    {sessionOnly && <p className="sc-integration-note" role="status">Storage unavailable. This demo is saved only while this page stays open.</p>}
    <CancelTripDialog open={panel === "cancel"} onOpenChange={open("cancel")} model={model} onAction={act} />
    <EditHomeSheet open={panel === "home"} onOpenChange={open("home")} profile={model.profile} onSave={persistProfile} />
    <EditPreferencesSheet open={panel === "preferences"} onOpenChange={open("preferences")} profile={model.profile} onSave={persistProfile} />
    <TrustedContactSheet open={panel === "contact"} onOpenChange={open("contact")} profile={model.profile} onSave={persistProfile} />
    <TripContextSheet key={`${panel === "context"}-${state.tripContext.note ?? "none"}`} open={panel === "context"} onOpenChange={open("context")} current={state.tripContext} onApply={(context) => act({ type: "SET_CONTEXT", context })} onClear={() => act({ type: "CLEAR_CONTEXT" })} />
    <LocationSheet open={panel === "location"} onOpenChange={open("location")} onRetry={testLocation} />
    <HelpSheet open={panel === "help"} onOpenChange={open("help")} trustedContact={model.profile.trustedContact} />
    <TripDetailsSheet open={panel === "details"} onOpenChange={open("details")} model={model} />
    {demoControls && <><button className="beacon-judge-button" onClick={() => setPanel("technical")}>Judge controls</button><JourneySheet open={panel === "technical"} onOpenChange={open("technical")} title="Demo controls" description="Apply sample backend responses. No real ride is booked or tracked. These controls are outside the student app."><TechnicalPanel model={model} onAction={judgeAction} onMobilitySample={applyMobilitySample} canApplyMobility={!!state.userApproved} /></JourneySheet></>}
  </>;
}
