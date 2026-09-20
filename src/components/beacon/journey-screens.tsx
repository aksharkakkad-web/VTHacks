"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  BusFront,
  Check,
  CircleDollarSign,
  Clock3,
  Footprints,
  House,
  LocateFixed,
  MapPin,
  Radio,
  RefreshCw,
  Route,
  ShieldCheck,
  TicketCheck,
  WifiOff,
} from "lucide-react";
import type { DemoAction, DemoStage, DemoViewModel } from "@/components/safecircle/types";
import { BeaconFrame } from "./flow-screens";
import { CancelTripDialog, ResetDemoDialog } from "./journey-dialogs";
import styles from "./journey-screens.module.css";

type JourneyModel = DemoViewModel;

type JourneyScreenProps = {
  model: DemoViewModel;
  onAction: (action: DemoAction) => void;
  onDetails?: () => void;
  onHelp?: () => void;
  onStartOver?: () => void;
};

type Tone = "progress" | "success" | "warning" | "error" | "offline";

type ScreenCopy = {
  eyebrow: string;
  title: string;
  body: string;
  tone: Tone;
  icon: ReactNode;
};

function act(type: string, extras: Record<string, unknown> = {}) {
  return { type, ...extras } as DemoAction;
}

function money(value: number | undefined) {
  if (value === undefined) return "Unknown";
  if (value === 0) return "$0";
  return `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

function relativeAge(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const elapsed = Date.now() - value;
  if (!Number.isFinite(elapsed) || elapsed < -60_000) return undefined;
  if (elapsed < 60_000) return "just now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function tripUpdateNote(value: number | undefined, stage: DemoStage, stale: boolean) {
  const age = relativeAge(value);
  if (!age) return "Last update unavailable";
  if (stage === "offline") return `Last known update · connection paused · ${age}`;
  if (stale || stage === "overdue") return `Last known update · ${age}`;
  return `Updated ${age}`;
}

function stageIs(stage: DemoStage, fragment: string) {
  return String(stage).includes(fragment);
}

function copyFor(stage: DemoStage, model: JourneyModel): ScreenCopy {
  const plan = model.selectedPlan;
  const provider = plan?.providerName ?? "the selected operator";
  const replacement = model.isReplacement || stageIs(stage, "replacement");

  if (stageIs(stage, "verifying")) return {
    eyebrow: replacement ? "Replacement · identity check" : "Provider identity",
    title: `Checking ${provider}.`,
    body: "Beacon is checking who operates this service before any exact trip details are shared.",
    tone: "progress",
    icon: <ShieldCheck aria-hidden="true" />,
  };
  if (stageIs(stage, "authorizing")) return {
    eyebrow: model.paymentStatus === "pending" ? "Simulated payment" : "Trip access",
    title: model.paymentStatus === "pending" ? "Checking simulated payment." : "Approving only what’s needed.",
    body: model.paymentStatus === "pending"
      ? "Trip access is authorized. This demo is checking payment separately; no real card is charged and no booking is accepted yet."
      : model.providerVerified
        ? model.backendDetails?.operatorVerification === "local_demo" ? "Local demo identity is verified. Beacon is applying the trip access rules separately." : "Identity is verified. Beacon is now applying the trip access rules separately."
        : "Identity and trip access are separate checks. Exact location stays withheld until both pass.",
    tone: "progress",
    icon: <LocateFixed aria-hidden="true" />,
  };
  if (stageIs(stage, "coordinating")) return {
    eyebrow: "Booking pending",
    title: "Requesting your ride.",
    body: `Beacon sent this approved plan to ${provider}. Waiting for a confirmed booking result.`,
    tone: "progress",
    icon: <Radio aria-hidden="true" />,
  };
  if (stageIs(stage, "accepted")) return {
    eyebrow: "Provider response",
    title: plan?.mode === "transit" ? "Trip status updated." : "Demo request accepted.",
    body: plan?.mode === "transit"
      ? "The latest response reports this plan accepted. Boarding guidance appears only when supplied."
      : "The simulated provider reports this request accepted. Pickup details appear only when supplied.",
    tone: "success",
    icon: <TicketCheck aria-hidden="true" />,
  };
  if (stageIs(stage, "waiting")) return {
    eyebrow: plan?.mode === "transit" ? "Get to your stop" : "Waiting for pickup",
    title: plan?.mode === "transit" ? "Waiting for scheduled service." : "Waiting for a provider update.",
    body: plan?.mode === "transit"
      ? "This demo has scheduled guidance only. Check the service sign before boarding."
      : "Beacon has not received a provider-reported position. Use only the pickup facts supplied below.",
    tone: "progress",
    icon: plan?.mode === "transit" ? <BusFront aria-hidden="true" /> : <Clock3 aria-hidden="true" />,
  };
  if (stageIs(stage, "arriving")) return {
    eyebrow: "Pickup",
    title: "Checking pickup details.",
    body: "Beacon has not received pickup facts it can show yet. No driver position is being inferred.",
    tone: "progress",
    icon: <MapPin aria-hidden="true" />,
  };
  if (stageIs(stage, "in-trip")) return {
    eyebrow: plan?.mode === "walk" ? "Walking home" : "Travelling home",
    title: plan?.mode === "walk" ? `Walking to ${model.profile?.homeName ?? "home"}.` : "Trip status: in progress.",
    body: plan?.mode === "walk"
      ? "Beacon has no live walking route in this demo. Use familiar, supported guidance."
      : "The latest transport response reports this trip in progress. No live provider position is shown.",
    tone: "progress",
    icon: plan?.mode === "walk" ? <Footprints aria-hidden="true" /> : <Route aria-hidden="true" />,
  };
  if (stage === "arrival") return {
    eyebrow: "Trip complete",
    title: "You’re home.",
    body: model.sensitiveDataReleased ? "Arrival is confirmed. Provider cleanup is still pending; temporary access has not yet been confirmed ended." : plan?.mode === "walk" || plan?.mode === "transit" ? "This plan is complete. Beacon is ready for the next trip." : "Temporary provider access has ended. Beacon is ready for the next trip.",
    tone: "success",
    icon: <House aria-hidden="true" />,
  };
  if (stage === "provider-cancelled") return {
    eyebrow: "Plan interrupted",
    title: "Your provider cancelled.",
    body: "Beacon is checking the old booking and payment before looking for another option.",
    tone: "warning",
    icon: <AlertCircle aria-hidden="true" />,
  };
  if (stage === ("reconciling" as DemoStage)) return {
    eyebrow: "Checking the old attempt",
    title: "We won’t book twice.",
    body: "Beacon is confirming whether the old booking or simulated payment is still active.",
    tone: "progress",
    icon: <RefreshCw aria-hidden="true" />,
  };
  if (stageIs(stage, "replanning")) return {
    eyebrow: "Finding a replacement",
    title: "Checking fresh options.",
    body: "Only eligible plans within your current trip constraints are being compared.",
    tone: "progress",
    icon: <RefreshCw aria-hidden="true" />,
  };
  if (stage === "replacement-selected") return {
    eyebrow: "New offer · approval required",
    title: "A replacement is ready.",
    body: "Review the changed plan and confirm it before Beacon starts another booking attempt.",
    tone: "warning",
    icon: <Route aria-hidden="true" />,
  };
  if (stage === "no-options") return {
    eyebrow: "No suitable plan",
    title: "Nothing fits right now.",
    body: "Beacon could not find an available option within the current budget, walking, and transfer preferences.",
    tone: "error",
    icon: <AlertCircle aria-hidden="true" />,
  };
  if (stage === ("offer-changed" as DemoStage)) return {
    eyebrow: "Offer changed",
    title: "Review the new terms.",
    body: "The previous offer is no longer valid. Beacon will not approve changed terms silently.",
    tone: "warning",
    icon: <CircleDollarSign aria-hidden="true" />,
  };
  if (stage === "verification-failed") return {
    eyebrow: "Provider not approved",
    title: "We couldn’t approve this provider.",
    body: "Exact location remained withheld. Retry the check or look for another eligible plan.",
    tone: "error",
    icon: <ShieldCheck aria-hidden="true" />,
  };
  if (stage === ("payment-declined" as DemoStage)) return {
    eyebrow: "Simulated payment declined",
    title: "Payment was not approved.",
    body: "No accepted booking is being claimed. Retry only through the current attempt.",
    tone: "error",
    icon: <CircleDollarSign aria-hidden="true" />,
  };
  if (stage === ("payment-unknown" as DemoStage) || stage === ("booking-unknown" as DemoStage)) return {
    eyebrow: "Result unknown",
    title: "Still checking your request.",
    body: "Beacon is reconciling this same attempt. Starting another request could create a duplicate booking.",
    tone: "warning",
    icon: <RefreshCw aria-hidden="true" />,
  };
  if (stage === "offline" || stage === ("reconnecting" as DemoStage)) return {
    eyebrow: stage === "offline" ? "Updates paused" : "Reconnecting",
    title: stage === "offline" ? "You’re offline." : "Getting the latest trip state.",
    body: "Beacon will reload the authoritative trip state before allowing another booking or arrival update.",
    tone: "offline",
    icon: stage === "offline" ? <WifiOff aria-hidden="true" /> : <RefreshCw aria-hidden="true" />,
  };
  if (stage === ("session-error" as DemoStage)) return {
    eyebrow: "Trip unavailable",
    title: "We can’t access this trip.",
    body: "Try restoring this saved trip, or start over from Home. Beacon will not create a replacement silently.",
    tone: "error",
    icon: <AlertCircle aria-hidden="true" />,
  };
  if (stage === ("location-error" as DemoStage)) return {
    eyebrow: "Location unavailable",
    title: "Beacon needs a pickup point.",
    body: "Try location again or return home to use a supported manual pickup. No GPS position has been invented.",
    tone: "error",
    icon: <MapPin aria-hidden="true" />,
  };
  if (stage === ("slow-request" as DemoStage)) return {
    eyebrow: "Request taking longer",
    title: "Couldn’t load the latest update.",
    body: "Retry the same operation. Repeated taps will not start another booking attempt.",
    tone: "warning",
    icon: <Clock3 aria-hidden="true" />,
  };
  if (stage === "overdue") return {
    eyebrow: "Arrival check",
    title: "Are you home?",
    body: "The expected arrival time passed. Tell Beacon whether the trip is complete or still moving.",
    tone: "warning",
    icon: <Clock3 aria-hidden="true" />,
  };
  if (stage === ("cancelling" as DemoStage)) return {
    eyebrow: "Cancellation pending",
    title: model.bookingStatus === "not-required" ? "Ending this plan." : "Waiting for the provider.",
    body: model.bookingStatus === "not-required" ? "Stopping this plan. No provider booking or payment was requested." : "Keep this attempt open until the provider confirms the booking outcome and simulated payment settlement.",
    tone: "warning",
    icon: <RefreshCw aria-hidden="true" />,
  };
  if (stage === ("cancelled" as DemoStage)) return {
    eyebrow: "Cancellation confirmed",
    title: "This trip was cancelled.",
    body: model.backendDetails ? "This trip request has ended. Any reported payment settlement is shown in trip details. You can start a new search when ready." : plan?.mode === "walk" || plan?.mode === "transit" ? "This local demo plan ended. No provider booking or payment was requested." : "The provider reported the booking cancelled. You can start a new search when ready.",
    tone: "success",
    icon: <Check aria-hidden="true" />,
  };
  if (stage === "context-fallback") return {
    eyebrow: "Limited context",
    title: "Using the information we have.",
    body: "Some context is unavailable. Beacon is preserving unknowns instead of treating them as safe or zero.",
    tone: "warning",
    icon: <AlertCircle aria-hidden="true" />,
  };
  return {
    eyebrow: "Trip status",
    title: "Checking your trip.",
    body: "Beacon is waiting for the next confirmed update.",
    tone: "progress",
    icon: <RefreshCw aria-hidden="true" />,
  };
}

function StatusArtwork({ tone, icon }: { tone: Tone; icon: ReactNode }) {
  return (
    <div className={`${styles.artwork} ${styles[`tone_${tone}`]}`} aria-hidden="true">
      <Image className={styles.landscape} src="/beacon-welcome-landscape.webp" alt="" fill sizes="(max-width: 430px) 100vw, 430px" />
      <span className={styles.iconDisc}>{icon}</span>
    </div>
  );
}

function StatusLine({ state, title, detail }: { state: "done" | "current" | "next" | "failed"; title: string; detail?: string }) {
  return (
    <div className={`${styles.statusLine} ${styles[state]}`}>
      <span className={styles.statusDot}>{state === "done" ? <Check size={15} aria-hidden="true" /> : null}</span>
      <span><strong>{title}</strong>{detail ? <small>{detail}</small> : null}</span>
    </div>
  );
}

function JourneyProgress({ stage, model }: { stage: DemoStage; model: JourneyModel }) {
  const localDemoIdentity = model.backendDetails?.operatorVerification === "local_demo";
  const identityKnown = model.providerVerified || localDemoIdentity;
  const paymentState = model.paymentStatus === "approved" ? "done" : model.paymentStatus === "declined" ? "failed" : model.paymentStatus === "pending" || model.paymentStatus === "unknown" ? "current" : "next";
  const bookingState = model.bookingStatus === "accepted" ? "done" : model.bookingStatus === "pending" || model.bookingStatus === "unknown" ? "current" : "next";
  const steps: Array<{ title: string; detail: string; state: "done" | "current" | "next" | "failed" }> = [
    { title: "Provider identity", detail: localDemoIdentity ? "Local demo trust · not live ANS" : model.providerVerified ? "Verified" : "Checking", state: identityKnown ? "done" : "current" },
    { title: "Trip access", detail: model.sensitiveDataReleased ? "Authorized" : "Exact location withheld", state: model.sensitiveDataReleased ? "done" : stageIs(stage, "authorizing") ? "current" : "next" },
    { title: "Simulated payment", detail: model.paymentStatus.replaceAll("-", " "), state: paymentState },
    { title: "Booking", detail: model.bookingStatus.replaceAll("-", " "), state: bookingState },
    { title: "Travel", detail: "Not started", state: "next" },
  ];

  return (
    <section className={styles.progressCard} aria-label="Trip progress">
      {steps.map((step) => <StatusLine key={step.title} state={step.state} title={step.title} detail={step.detail} />)}
    </section>
  );
}

function CompactTripStatus({ model, stage }: { model: JourneyModel; stage: DemoStage }) {
  const walking = model.selectedPlan?.mode === "walk";
  const arrived = stage === "arrival";
  const title = arrived
    ? "Trip complete"
    : walking
      ? "Walking plan active"
      : model.bookingStatus === "accepted"
        ? "Booking accepted"
        : "Latest trip update";
  const detail = arrived
    ? (model.sensitiveDataReleased ? "Provider cleanup pending" : walking || model.selectedPlan?.mode === "transit" ? "No active provider booking" : "Provider access ended")
    : walking
      ? "No provider booking or payment required"
      : `${model.selectedPlan?.providerName ?? "Service"} · ${model.sensitiveDataReleased ? "trip access active" : "exact location withheld"}`;
  return <div className={styles.compactStatus}><span><Check size={16} aria-hidden="true" /></span><p><strong>{title}</strong><small>{detail}</small></p></div>;
}

function FactGrid({ model, stage }: { model: JourneyModel; stage: DemoStage }) {
  const plan = model.selectedPlan;
  const provider = plan?.providerName ?? "Unavailable";
  const providerTrip = plan && plan.mode !== "walk" && plan.mode !== "transit";
  const source = plan?.mode === "walk"
    ? model.backendDetails ? "Walking plan" : "Walking plan · Demo data"
    : plan?.mode === "transit"
      ? model.backendDetails ? "Scheduled transit" : "Scheduled transit · Demo data"
      : model.backendDetails?.simulated === false ? "Ride provider" : "Simulated rideshare · Demo data";
  const pickup = plan?.mode === "walk"
    ? "No pickup required"
    : plan?.mode === "transit"
      ? "Boarding details unavailable"
      : model.backendDetails?.pickupInstructions ?? "Pickup instructions unavailable";
  return (
    <dl className={styles.factGrid}>
      <div><dt>{plan?.mode === "walk" ? "Plan" : "Service"}</dt><dd>{provider}<small>{source}</small></dd></div>
      <div><dt>{stageIs(stage, "in-trip") || stage === "arrival" ? "To home" : "Estimate"}</dt><dd>{plan ? `${plan.totalMinutes} min` : "Unavailable"}<small>{plan?.mode === "transit" ? "Scheduled" : "Demo estimate"}</small></dd></div>
      {providerTrip ? <div><dt>Payment</dt><dd>{model.paymentStatus?.replaceAll("-", " ") ?? "not reported"}<small>Simulated status</small></dd></div> : null}
      <div><dt>{stage === "arrival" || stage === "cancelled" ? "Trip status" : "Pickup"}</dt><dd>{stage === "arrival" ? "Completed" : stage === "cancelled" ? "Cancelled" : pickup}</dd></div>
    </dl>
  );
}

function PrimaryButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button className={styles.primaryAction} type="button" onClick={onClick}><span>{children}</span><ArrowRight size={21} aria-hidden="true" /></button>;
}

function FooterActions({
  model,
  onAction,
  onDetails,
  onHelp,
  onStartOver,
  onCancel,
}: JourneyScreenProps & { model: JourneyModel; onCancel: () => void }) {
  const { stage } = model;
  const plan = model.selectedPlan;

  if (model.backendDetails && (stageIs(stage, "verifying") || stageIs(stage, "authorizing") || stageIs(stage, "coordinating"))) {
    return <><PrimaryButton onClick={() => onAction(act("RETRY"))}>Continue this request</PrimaryButton><button className={styles.cancelAction} type="button" onClick={onCancel}>Request cancellation</button></>;
  }
  if (stage === "arrival" || stage === ("cancelled" as DemoStage)) {
    return <><PrimaryButton onClick={() => onAction(act("FINISH"))}>Finish</PrimaryButton>{(stage === "arrival" || model.backendDetails) && onDetails ? <button className={styles.secondaryAction} type="button" onClick={onDetails}>View trip details</button> : null}</>;
  }
  if (stage === "overdue") {
    return <><PrimaryButton onClick={() => onAction(act("CONFIRM_ARRIVAL"))}>I’m home</PrimaryButton><button className={styles.secondaryAction} type="button" onClick={() => onAction(act("STILL_TRAVELLING"))}>Still travelling</button>{onHelp ? <button className={styles.secondaryAction} type="button" onClick={onHelp}>Get help</button> : null}<button className={styles.cancelAction} type="button" onClick={onCancel}>Request cancellation</button></>;
  }
  if (stage === "offline") {
    return <PrimaryButton onClick={() => onAction(act("RECONNECT"))}>Reconnect</PrimaryButton>;
  }
  if (stage === ("reconnecting" as DemoStage) || stage === ("reconciling" as DemoStage) || stage === ("cancelling" as DemoStage)) {
    return <p className={styles.waitingNote} role="status">Keep Beacon open while this attempt resolves.</p>;
  }
  if (stage === ("offer-changed" as DemoStage)) {
    return <><PrimaryButton onClick={() => onAction(act("RETRY"))}>Refresh offer</PrimaryButton>{onDetails ? <button className={styles.secondaryAction} type="button" onClick={onDetails}>Review changed terms</button> : null}</>;
  }
  if (stage === "replacement-selected") {
    return <><PrimaryButton onClick={() => onAction(act("GO"))}>Confirm this new offer</PrimaryButton>{onDetails ? <button className={styles.secondaryAction} type="button" onClick={onDetails}>Review details</button> : null}</>;
  }
  if (stage === "no-options") {
    return <><PrimaryButton onClick={() => onAction(act("RETRY"))}>Try again</PrimaryButton><button className={styles.secondaryAction} type="button" onClick={() => onAction(act("FINISH"))}>Change preferences</button></>;
  }
  if (stage === ("location-error" as DemoStage)) {
    return <><PrimaryButton onClick={() => onAction(act("FINISH"))}>Use Downtown Blacksburg demo pickup</PrimaryButton>{onHelp ? <button className={styles.secondaryAction} type="button" onClick={onHelp}>Get help</button> : null}</>;
  }
  if (stage === ("session-error" as DemoStage)) {
    return <><PrimaryButton onClick={() => onAction(act("RETRY"))}>Try again</PrimaryButton>{onStartOver ? <button className={styles.secondaryAction} type="button" onClick={onStartOver}>Start over</button> : null}{onHelp ? <button className={styles.secondaryAction} type="button" onClick={onHelp}>Get help</button> : null}</>;
  }
  if (["verification-failed", "context-fallback"].includes(stage) || stage === ("payment-declined" as DemoStage) || stage === ("slow-request" as DemoStage)) {
    return <><PrimaryButton onClick={() => onAction(act("RETRY"))}>Try again</PrimaryButton>{onHelp ? <button className={styles.secondaryAction} type="button" onClick={onHelp}>Get help</button> : null}</>;
  }
  if (stage === ("payment-unknown" as DemoStage) || stage === ("booking-unknown" as DemoStage)) {
    return <PrimaryButton onClick={() => onAction(act("RETRY"))}>Check this attempt</PrimaryButton>;
  }
  if (stageIs(stage, "accepted") && plan?.mode === "transit") {
    return <><PrimaryButton onClick={() => onAction(act("RETRY"))}>Refresh walking directions</PrimaryButton><button className={styles.cancelAction} type="button" onClick={onCancel}>Request cancellation</button></>;
  }
  if (stageIs(stage, "waiting") && plan?.mode === "transit") {
    return <><PrimaryButton onClick={() => onAction(act("BOARD_TRANSIT"))}>I’m on board</PrimaryButton><button className={styles.cancelAction} type="button" onClick={onCancel}>Request cancellation</button></>;
  }
  if (stageIs(stage, "in-trip")) {
    return <><PrimaryButton onClick={() => onAction(act("CONFIRM_ARRIVAL"))}>I’m home</PrimaryButton><div className={styles.journeyUtilityRow}>{onDetails ? <button className={styles.secondaryAction} type="button" onClick={onDetails}>View trip details</button> : null}{onHelp ? <button className={styles.secondaryAction} type="button" onClick={onHelp}>Get help</button> : null}</div><button className={styles.cancelAction} type="button" onClick={onCancel}>Request cancellation</button></>;
  }
  if (stage === "provider-cancelled" || stageIs(stage, "replanning")) {
    return <p className={styles.waitingNote} role="status">Beacon is keeping this recovery within your approved constraints.</p>;
  }

  return (
    <>
      <div className={styles.journeyUtilityRow}>
        {onDetails ? <button className={styles.secondaryAction} type="button" onClick={onDetails}>View trip details</button> : null}
        {onHelp ? <button className={styles.secondaryAction} type="button" onClick={onHelp}>Get help</button> : null}
      </div>
      <button className={styles.cancelAction} type="button" onClick={onCancel}>Request cancellation</button>
    </>
  );
}

function RecoveryFacts({ model }: { model: JourneyModel }) {
  const fee = model.backendDetails ? model.backendDetails.previousRetainedFee : model.cancellationFee;
  const remaining = model.backendDetails ? model.backendDetails.remainingBudget : model.constraints && fee !== undefined ? Math.max(0, model.constraints.maxBudget - fee) : undefined;
  return (
    <dl className={styles.recoveryFacts}>
      <div><dt>{model.backendDetails ? "Retained fee reported" : "Known cancellation fee"}</dt><dd>{money(fee)}</dd></div>
      <div><dt>Remaining budget</dt><dd>{money(remaining)}</dd></div>
      <div><dt>Old booking</dt><dd>{model.bookingStatus?.replaceAll("-", " ") ?? "unknown"}</dd></div>
      <div><dt>Simulated payment</dt><dd>{model.paymentStatus?.replaceAll("-", " ") ?? "unknown"}</dd></div>
    </dl>
  );
}

export function JourneyScreen({ model: baseModel, onAction, onDetails, onHelp, onStartOver }: JourneyScreenProps) {
  const model: JourneyModel = baseModel;
  const [cancelOpen, setCancelOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const copy = copyFor(model.stage, model);
  const isRecovery = model.stage === "provider-cancelled" || model.stage === ("reconciling" as DemoStage) || stageIs(model.stage, "replanning");
  const showJourneyProgress = stageIs(model.stage, "verifying") || stageIs(model.stage, "authorizing") || stageIs(model.stage, "coordinating");
  const showTripFacts = stageIs(model.stage, "accepted") || stageIs(model.stage, "waiting") || stageIs(model.stage, "arriving") || stageIs(model.stage, "in-trip") || model.stage === "arrival";

  return (
    <>
      <BeaconFrame>
        <div className={styles.screen} data-tone={copy.tone}>
          <div className={styles.intro} aria-live="polite">
            <p>{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <span>{copy.body}</span>
          </div>

          <StatusArtwork tone={copy.tone} icon={copy.icon} />

          <div className={styles.content}>
            {showJourneyProgress ? <JourneyProgress stage={model.stage} model={model} /> : null}
            {showTripFacts ? <CompactTripStatus model={model} stage={model.stage} /> : null}
            {isRecovery ? <RecoveryFacts model={model} /> : null}
            {!showJourneyProgress && !showTripFacts && !isRecovery && model.selectedPlan ? <FactGrid model={model} stage={model.stage} /> : null}
            {showTripFacts ? <FactGrid model={model} stage={model.stage} /> : null}

            {stageIs(model.stage, "verifying") || stageIs(model.stage, "authorizing") ? (
              <p className={styles.privacyNote}><ShieldCheck size={18} aria-hidden="true" />{model.sensitiveDataReleased ? "Exact trip details are authorized for this active trip." : "Exact pickup and home details are still withheld."}</p>
            ) : null}

            {model.stage === "offline" || model.stage === "overdue" || model.stage === ("reconnecting" as DemoStage) ? (
              <p className={styles.updateNote}>{tripUpdateNote(model.lastTripUpdateAt, model.stage, model.isStale)}</p>
            ) : null}
          </div>

          <footer className={styles.footer}>
            <FooterActions model={model} onAction={onAction} onDetails={onDetails} onHelp={onHelp} onStartOver={onStartOver} onCancel={() => setCancelOpen(true)} />
            {model.stage === "session-error" && !model.backendDetails ? <button className={styles.cancelAction} type="button" onClick={() => setResetOpen(true)}>Reset local demo</button> : null}
          </footer>
        </div>
      </BeaconFrame>
      <CancelTripDialog open={cancelOpen} onOpenChange={setCancelOpen} model={model} onAction={onAction} />
      <ResetDemoDialog open={resetOpen} onOpenChange={setResetOpen} onAction={onAction} />
    </>
  );
}
