"use client";

import { useMemo, useState } from "react";
import type { DemoStage, DemoViewModel } from "@/components/safecircle/types";
import { createDemoState, deriveViewModel, snapshotForStage, transitionDemo } from "@/components/safecircle/demo-controller";
import { defaultProfile } from "@/components/safecircle/mock-data";
import { BeaconHomeScreen, FindingScreen, PreferencesScreen, RecommendationScreen } from "@/components/beacon/flow-screens";
import { MobilityScreen } from "@/components/beacon/mobility-screens";
import { fallbackMobility } from "@/lib/client/beacon/sample-responses";
import { JourneyScreen } from "@/components/beacon/journey-screens";
import {
  CancelTripDialog,
  EditHomeSheet,
  EditPreferencesSheet,
  HelpSheet,
  LocationSheet,
  TripContextSheet,
  TripDetailsSheet,
  TrustedContactSheet,
} from "@/components/beacon/journey-dialogs";
import styles from "./specimen.module.css";
import { CAMPUS_LOCATIONS, DEFAULT_FROM_LOCATION_ID, DEFAULT_TO_LOCATION_ID } from "@/lib/client/beacon/campus-locations";

type GalleryGroup = "Journey" | "Modes" | "Recovery" | "Errors" | "Sheets";
type Variant = "walk-recommendation" | "walk-active" | "transit-recommendation" | "transit-boarding" | "transit-active";
type Sheet = "home" | "preferences" | "location" | "context" | "options" | "details" | "help" | "contact" | "cancel";

type GalleryItem = {
  id: string;
  label: string;
  group: GalleryGroup;
  stage?: DemoStage;
  route?: string;
  component?: "home" | "preferences" | "finding" | "recommendation" | "journey" | "sheet";
  variant?: Variant;
  sheet?: Sheet;
};

const items: GalleryItem[] = [
  { id: "01", label: "Splash / loading", group: "Journey", route: "/onboarding/splash?gallery=1" },
  { id: "02", label: "Welcome", group: "Journey", route: "/onboarding/welcome" },
  { id: "03", label: "Set your home", group: "Journey", route: "/onboarding/home?gallery=1" },
  { id: "04", label: "Your preferences", group: "Journey", component: "preferences" },
  { id: "05", label: "Home / Get me home", group: "Journey", stage: "home", component: "home" },
  { id: "06", label: "Checking providers", group: "Journey", stage: "discovering", component: "finding" },
  { id: "07", label: "Comparing routes", group: "Journey", stage: "evaluating", component: "finding" },
  { id: "08", label: "Recommended plan", group: "Journey", stage: "recommendation", component: "recommendation" },
  { id: "09", label: "Checking identity", group: "Journey", stage: "verifying-initial", component: "journey" },
  { id: "10", label: "Authorizing trip", group: "Journey", stage: "authorizing-initial", component: "journey" },
  { id: "11", label: "Booking pending", group: "Journey", stage: "coordinating-initial", component: "journey" },
  { id: "12", label: "Pickup / boarding", group: "Journey", stage: "waiting-initial", component: "journey" },
  { id: "13", label: "Travelling home", group: "Journey", stage: "in-trip-initial", component: "journey" },
  { id: "14", label: "You’re home", group: "Journey", stage: "arrival", component: "journey" },
  { id: "W1", label: "Walking recommendation", group: "Modes", component: "recommendation", variant: "walk-recommendation" },
  { id: "W2", label: "Walking active", group: "Modes", component: "journey", variant: "walk-active" },
  { id: "T1", label: "Transit recommendation", group: "Modes", component: "recommendation", variant: "transit-recommendation" },
  { id: "T2", label: "Transit boarding", group: "Modes", component: "journey", variant: "transit-boarding" },
  { id: "T3", label: "Transit active", group: "Modes", component: "journey", variant: "transit-active" },
  { id: "R1", label: "Provider cancelled", group: "Recovery", stage: "provider-cancelled", component: "journey" },
  { id: "R2", label: "Reconcile old attempt", group: "Recovery", stage: "reconciling", component: "journey" },
  { id: "R3", label: "Find replacement", group: "Recovery", stage: "replanning-discovery", component: "finding" },
  { id: "R4", label: "Approve replacement", group: "Recovery", stage: "replacement-selected", component: "recommendation" },
  { id: "E1", label: "No suitable plan", group: "Errors", stage: "no-options", component: "journey" },
  { id: "E2", label: "Offer changed", group: "Errors", stage: "offer-changed", component: "journey" },
  { id: "E3", label: "Provider check failed", group: "Errors", stage: "verification-failed", component: "journey" },
  { id: "E4", label: "Payment declined", group: "Errors", stage: "payment-declined", component: "journey" },
  { id: "E5a", label: "Payment unknown", group: "Errors", stage: "payment-unknown", component: "journey" },
  { id: "E5b", label: "Booking unknown", group: "Errors", stage: "booking-unknown", component: "journey" },
  { id: "E6a", label: "Offline", group: "Errors", stage: "offline", component: "journey" },
  { id: "E6b", label: "Reconnecting", group: "Errors", stage: "reconnecting", component: "journey" },
  { id: "E7", label: "Session error", group: "Errors", stage: "session-error", component: "journey" },
  { id: "E8", label: "Location unavailable", group: "Errors", stage: "location-error", component: "journey" },
  { id: "E9", label: "Slow request", group: "Errors", stage: "slow-request", component: "journey" },
  { id: "E10", label: "Trip overdue", group: "Errors", stage: "overdue", component: "journey" },
  { id: "E11a", label: "Cancellation pending", group: "Errors", stage: "cancelling", component: "journey" },
  { id: "E11b", label: "Cancellation confirmed", group: "Errors", stage: "cancelled", component: "journey" },
  { id: "S1", label: "Edit home", group: "Sheets", component: "sheet", sheet: "home" },
  { id: "S2", label: "Edit preferences", group: "Sheets", component: "sheet", sheet: "preferences" },
  { id: "S3", label: "Location explanation", group: "Sheets", component: "sheet", sheet: "location" },
  { id: "S4", label: "Trip context", group: "Sheets", component: "sheet", sheet: "context" },
  { id: "S5", label: "Other options", group: "Sheets", component: "sheet", sheet: "options" },
  { id: "S6", label: "Trip details", group: "Sheets", component: "sheet", sheet: "details" },
  { id: "S7", label: "Help", group: "Sheets", component: "sheet", sheet: "help" },
  { id: "S8", label: "Trusted contact", group: "Sheets", component: "sheet", sheet: "contact" },
  { id: "S9", label: "Cancel confirmation", group: "Sheets", component: "sheet", sheet: "cancel" },
];

const FIXTURE_TIME = new Date("2026-09-19T22:15:00-04:00").getTime();

function modelFor(item: GalleryItem, longContent: boolean): DemoViewModel | null {
  let state = createDemoState(defaultProfile);
  if (item.variant) {
    const modeProfile = { ...defaultProfile, walkingPreference: "normal" as const, avoidTransfers: false };
    state = snapshotForStage(createDemoState(modeProfile), "recommendation", FIXTURE_TIME);
    const planId = item.variant.startsWith("walk") ? "walk-008" : "transit-017";
    state = transitionDemo(state, { type: "SELECT_PLAN", planId, now: FIXTURE_TIME });
    if (item.variant.endsWith("active") || item.variant === "transit-boarding") state = transitionDemo(state, { type: "GO", now: FIXTURE_TIME });
    if (item.variant === "transit-active") state = transitionDemo(state, { type: "ADVANCE", now: FIXTURE_TIME });
  } else if (item.stage === "offline" || item.stage === "reconnecting") {
    state = snapshotForStage(state, "waiting-initial", FIXTURE_TIME);
    state = transitionDemo(state, { type: "SIMULATE", scenario: "offline" });
    if (item.stage === "reconnecting") state = transitionDemo(state, { type: "RECONNECT" });
  } else if (item.stage) {
    state = snapshotForStage(state, item.stage, FIXTURE_TIME);
  } else if (item.component === "sheet") {
    state = snapshotForStage(state, item.sheet === "cancel" ? "waiting-initial" : "recommendation", FIXTURE_TIME);
  } else {
    return null;
  }
  const model = deriveViewModel({ ...state, paused: true });
  if (!longContent) return model;
  return {
    ...model,
    profile: model.profile ? { ...model.profile, homeName: "Pritchard Hall — east residential entrance", homeAddress: "630 Washington Street SW, Blacksburg, Virginia 24061" } : null,
    recommendation: model.recommendation ? { ...model.recommendation, explanation: "This option stays within the saved budget, minimizes avoidable walking and transfers, and keeps unsupported live conditions clearly marked as unknown." } : undefined,
    trip: { ...model.trip, statusMessage: "Long-content fixture: the latest provider update is intentionally verbose to check wrapping, footer visibility, and small-screen reading order." },
  };
}

function SheetPreview({ sheet, model }: { sheet: Sheet; model: DemoViewModel }) {
  const ignore = () => undefined;
  const ignoreAction = () => undefined;
  const ignoreProfile = () => undefined;
  const [open, setOpen] = useState(true);
  if (sheet === "options") return <RecommendationScreen model={model} onGo={ignore} onBack={ignore} onDetails={ignore} onSelectPlan={ignore} defaultShowAlternatives />;
  return (
    <>
      <BeaconHomeScreen model={model} campusLocations={CAMPUS_LOCATIONS} fromLocationId={DEFAULT_FROM_LOCATION_ID} toLocationId={DEFAULT_TO_LOCATION_ID} onFromLocationChange={ignore} onToLocationChange={ignore} onStart={ignore} onEditProfile={ignore} />
      {!open ? <button className={styles.reopenSheet} type="button" onClick={() => setOpen(true)}>Reopen {sheet} sheet</button> : null}
      {sheet === "home" && model.profile ? <EditHomeSheet open={open} onOpenChange={setOpen} profile={model.profile} onSave={ignoreProfile} /> : null}
      {sheet === "preferences" && model.profile ? <EditPreferencesSheet open={open} onOpenChange={setOpen} profile={model.profile} onSave={ignoreProfile} /> : null}
      {sheet === "location" ? <LocationSheet open={open} onOpenChange={setOpen} onRetry={ignore} /> : null}
      {sheet === "context" ? <TripContextSheet open={open} onOpenChange={setOpen} current={{ note: "tired" }} onApply={ignore} onClear={ignore} /> : null}
      {sheet === "details" ? <TripDetailsSheet open={open} onOpenChange={setOpen} model={model} /> : null}
      {sheet === "help" ? <HelpSheet open={open} onOpenChange={setOpen} trustedContact="540-555-0142" /> : null}
      {sheet === "contact" && model.profile ? <TrustedContactSheet open={open} onOpenChange={setOpen} profile={model.profile} onSave={ignoreProfile} /> : null}
      {sheet === "cancel" ? <CancelTripDialog open={open} onOpenChange={setOpen} model={model} onAction={ignoreAction} /> : null}
    </>
  );
}

function Preview({ item, longContent }: { item: GalleryItem; longContent: boolean }) {
  const model = useMemo(() => modelFor(item, longContent), [item, longContent]);
  const ignoreAction = () => undefined;
  const ignore = () => undefined;
  const ignorePlan = () => undefined;
  const ignoreProfile = () => undefined;

  if (item.route) return <iframe className={styles.routeFrame} title={`${item.id} ${item.label}`} src={item.route} />;
  if (item.component === "preferences") return <PreferencesScreen profile={defaultProfile} onChange={ignoreProfile} onSave={ignore} onBack={ignore} />;
  if (!model) return null;
  if (item.component === "sheet" && item.sheet) return <SheetPreview key={item.id} sheet={item.sheet} model={model} />;
  if (item.component === "home") return <BeaconHomeScreen model={model} campusLocations={CAMPUS_LOCATIONS} fromLocationId={DEFAULT_FROM_LOCATION_ID} toLocationId={DEFAULT_TO_LOCATION_ID} onFromLocationChange={ignore} onToLocationChange={ignore} onStart={ignore} onEditProfile={ignore} />;
  if (item.component === "finding") return <FindingScreen model={model} onCancel={ignore} />;
  if (item.component === "recommendation") return <RecommendationScreen model={model} onGo={ignore} onBack={ignore} onDetails={ignore} onSelectPlan={ignorePlan} />;
  const mobility = fallbackMobility({ ...createDemoState(model.profile), stage: model.stage, selectedPlanId: model.selectedPlan?.planId });
  if (mobility) return <MobilityScreen mobility={mobility} onWalkComplete={ignore} onArrival={ignore} onHelp={ignore} onDetails={ignore} onCancel={ignore} onRetryRoute={ignore} onBoard={ignore} />;
  return <JourneyScreen model={model} onAction={ignoreAction} onDetails={ignore} onHelp={ignore} />;
}

export function BeaconGallery() {
  const [selectedId, setSelectedId] = useState("09");
  const [longContent, setLongContent] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const groups: GalleryGroup[] = ["Journey", "Modes", "Recovery", "Errors", "Sheets"];

  return (
    <section className={`${styles.gallery} ${reducedMotion ? styles.reducedMotion : ""}`} aria-labelledby="gallery-title">
      <header className={styles.galleryHeader}>
        <div><p>Beacon development gallery</p><h1 id="gallery-title">Every student-facing state, in one place.</h1><span>Local simulated fixtures. This route does not book, pay, send location, or contact anyone.</span></div>
        <div className={styles.galleryToggles}>
          <label><input type="checkbox" checked={longContent} onChange={(event) => setLongContent(event.target.checked)} /> Long content</label>
          <label><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} /> Reduced motion</label>
        </div>
      </header>
      <nav className={styles.galleryNav} aria-label="Beacon screen inventory">
        {groups.map((group) => (
          <div key={group}>
            <h2>{group}</h2>
            {items.filter((item) => item.group === group).map((item) => (
              <button key={item.id} type="button" aria-pressed={item.id === selected.id} onClick={() => setSelectedId(item.id)}>
                <strong>{item.id}</strong><span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className={styles.galleryPreview}>
        <div className={styles.galleryCaption}><span>{selected.id}</span><strong>{selected.label}</strong><small>{selected.stage ?? selected.variant ?? selected.sheet ?? selected.route}</small></div>
        <div className={styles.previewViewport}><Preview item={selected} longContent={longContent} /></div>
      </div>
    </section>
  );
}
