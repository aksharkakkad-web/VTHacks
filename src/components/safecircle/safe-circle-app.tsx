"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AppShell } from "./app-shell";
import {
  createDemoState,
  deriveViewModel,
  getAutomaticAdvanceDelay,
  transitionDemo,
  validatedProfile,
} from "./demo-controller";
import { defaultProfile } from "./mock-data";
import { MapSurface } from "./map-surface";
import { ConsumerScreen } from "./screens";
import {
  ContextDialog,
  DetailsDialog,
  HelpDialog,
  ProfileDialog,
  TechnicalDialog,
} from "./dialogs";
import type { DemoAction, SavedProfile } from "./types";

export const PROFILE_STORAGE_KEY = "safecircle.profile.v1";

type Panel = "profile" | "context" | "details" | "help" | "technical" | null;

function haptic() {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try { navigator.vibrate(10); } catch { /* Unsupported haptics are a silent no-op. */ }
}

export function SafeCircleApp() {
  const [state, dispatch] = useReducer(transitionDemo, null, () => createDemoState(null));
  const [panel, setPanel] = useState<Panel>(null);
  const [onboardingDraft, setOnboardingDraft] = useState<SavedProfile>(defaultProfile);
  const [sessionOnly, setSessionOnly] = useState(false);
  const previousStage = useRef(state.stage);
  const model = useMemo(() => deriveViewModel(state), [state]);

  useEffect(() => {
    let active = true;
    let restored: SavedProfile | null = null;
    let storageFailed = false;
    try {
      const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      restored = raw ? validatedProfile(JSON.parse(raw)) : null;
      if (raw && !restored) {
        try { window.localStorage.removeItem(PROFILE_STORAGE_KEY); } catch { storageFailed = true; }
      }
    } catch {
      try { window.localStorage.removeItem(PROFILE_STORAGE_KEY); } catch { /* Storage is unavailable. */ }
      storageFailed = true;
    }
    queueMicrotask(() => {
      if (!active) return;
      if (restored) setOnboardingDraft(restored);
      if (storageFailed) setSessionOnly(true);
      dispatch({ type: "RESTORE_PROFILE", profile: restored });
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const stage = state.stage;
    const meaningful = stage === "accepted-initial" || stage === "accepted-replacement" || stage === "provider-cancelled" || stage === "replacement-selected" || stage === "arrival" || stage.startsWith("verifying");
    if (stage !== previousStage.current && meaningful) haptic();
    previousStage.current = stage;
  }, [state.stage]);

  useEffect(() => {
    if (state.paused || state.stage === "offline") return;
    const delay = getAutomaticAdvanceDelay(state.stage);
    if (delay === null) return;
    const timer = window.setTimeout(() => dispatch({ type: "ADVANCE", now: Date.now() }), delay);
    return () => window.clearTimeout(timer);
  }, [state.paused, state.stage, state.statusRevision]);

  useEffect(() => {
    const offline = () => dispatch({ type: "SIMULATE", scenario: "offline" });
    const online = () => dispatch({ type: "RECONNECT" });
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

  function act(action: DemoAction, withHaptic = true) {
    if (action.type === "RECONNECT" && !navigator.onLine) return;
    if (withHaptic) haptic();
    if (action.type === "RESET_PROFILE") {
      try { window.localStorage.removeItem(PROFILE_STORAGE_KEY); } catch { setSessionOnly(true); }
      setOnboardingDraft(defaultProfile);
      setPanel(null);
    }
    dispatch(action);
  }

  function persistProfile(profile: SavedProfile) {
    const valid = validatedProfile(profile);
    if (!valid) return;
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(valid));
      setSessionOnly(false);
    } catch {
      setSessionOnly(true);
    }
    setOnboardingDraft(valid);
    act({ type: "SAVE_PROFILE", profile: valid });
  }

  function setupHome(homeName: string, homeAddress: string) {
    setOnboardingDraft((current) => ({ ...current, homeName, homeAddress }));
    act({ type: "JUMP", stage: "setup-preferences" });
  }

  const showMap = !["bootstrap", "arrival"].includes(model.stage);

  return (
    <AppShell onTechnicalOpen={() => setPanel("technical")}>
      {showMap && <MapSurface model={model} />}
      <div className="sc-live-region" aria-live="polite" aria-atomic="true">
        <span className="sr-only">SafeCircle status: {model.trip.statusMessage}</span>
      </div>
      <ConsumerScreen
        model={model}
        onboardingDraft={onboardingDraft}
        hasTripContext={Object.keys(state.tripContext).length > 0}
        onSetupHome={setupHome}
        onSaveProfile={persistProfile}
        onAction={act}
        onEditProfile={() => setPanel("profile")}
        onOpenContext={() => setPanel("context")}
        onOpenDetails={() => setPanel("details")}
        onOpenHelp={() => setPanel("help")}
        onOpenTechnical={() => setPanel("technical")}
      />
      {sessionOnly && <p className="sc-session-note" role="status">Preferences are saved for this session only.</p>}

      {model.profile && <ProfileDialog open={panel === "profile"} onOpenChange={(open) => setPanel(open ? "profile" : null)} profile={model.profile} onSave={persistProfile} />}
      <ContextDialog open={panel === "context"} onOpenChange={(open) => setPanel(open ? "context" : null)} current={state.tripContext} onApply={(context) => act({ type: "SET_CONTEXT", context })} onClear={() => act({ type: "CLEAR_CONTEXT" })} />
      <HelpDialog open={panel === "help"} onOpenChange={(open) => setPanel(open ? "help" : null)} trustedContact={model.profile?.trustedContact} />
      <DetailsDialog open={panel === "details"} onOpenChange={(open) => setPanel(open ? "details" : null)} model={model} />
      <TechnicalDialog open={panel === "technical"} onOpenChange={(open) => setPanel(open ? "technical" : null)} model={model} onAction={act} />
    </AppShell>
  );
}
