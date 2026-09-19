import { useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BusFront,
  CarFront,
  Check,
  CheckCircle2,
  CircleDot,
  Footprints,
  House,
  LockKeyhole,
  MapPin,
  Navigation,
  Pencil,
  Phone,
  Radio,
  Route,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  WifiOff,
  XCircle,
} from "lucide-react";
import { demoCandidates } from "./mock-data";
import { BottomSheet } from "./bottom-sheet";
import { AlternativeRow, ProviderCard } from "./provider-card";
import { PrimaryButton, SecondaryButton, StatusMark, TextButton, VerificationBadge } from "./primitives";
import type { DemoAction, DemoStage, DemoViewModel, SavedProfile } from "./types";

type ScreenProps = {
  model: DemoViewModel;
  onboardingDraft: SavedProfile;
  hasTripContext: boolean;
  onSetupHome: (homeName: string, homeAddress: string) => void;
  onSaveProfile: (profile: SavedProfile) => void;
  onAction: (action: DemoAction) => void;
  onEditProfile: () => void;
  onOpenContext: () => void;
  onOpenDetails: () => void;
  onOpenHelp: () => void;
  onOpenTechnical: () => void;
};

function isValidOptionalPhone(value: string) {
  if (!value) return true;
  const digits = value.replace(/\D/g, "");
  return /^\+?[\d().\s-]+$/.test(value) && digits.length >= 7 && digits.length <= 15;
}

export function ConsumerScreen(props: ScreenProps) {
  const { stage } = props.model;
  if (stage === "bootstrap") return <BootstrapScreen />;
  if (stage === "setup-home") return <HomeSetupScreen draft={props.onboardingDraft} onContinue={props.onSetupHome} />;
  if (stage === "setup-preferences") return <PreferencesSetupScreen draft={props.onboardingDraft} onSave={props.onSaveProfile} onBack={() => props.onAction({ type: "JUMP", stage: "setup-home" })} />;
  if (stage === "home") return <HomeScreen {...props} />;
  if (["discovering", "collecting-quotes", "evaluating"].includes(stage)) return <SearchScreen model={props.model} onTechnical={props.onOpenTechnical} />;
  if (stage === "recommendation") return <RecommendationScreen model={props.model} onGo={() => props.onAction({ type: "GO" })} />;
  if (stage.includes("verifying") || stage.includes("authorizing") || stage.includes("coordinating") || stage.includes("accepted")) {
    return <CoordinationScreen model={props.model} onDetails={props.onOpenDetails} />;
  }
  if (stage.startsWith("waiting") || stage.startsWith("arriving") || stage.startsWith("in-trip")) {
    return <ActiveTripScreen model={props.model} onDetails={props.onOpenDetails} onHelp={props.onOpenHelp} />;
  }
  if (stage === "provider-cancelled" || stage === "replanning-discovery" || stage === "replanning-evaluation" || stage === "replacement-selected") {
    return <RecoveryScreen model={props.model} onDetails={props.onOpenDetails} />;
  }
  if (stage === "arrival") return <ArrivalScreen model={props.model} onFinish={() => props.onAction({ type: "FINISH" })} onDetails={props.onOpenDetails} />;
  return <SupportingStateScreen {...props} />;
}

function BootstrapScreen() {
  return (
    <div className="sc-bootstrap" data-testid="screen-bootstrap" role="status">
      <span className="sc-loader" />
      <p>Loading your saved home…</p>
    </div>
  );
}

function HomeSetupScreen({ draft, onContinue }: { draft: SavedProfile; onContinue: (name: string, address: string) => void }) {
  const [name, setName] = useState(draft.homeName);
  const [address, setAddress] = useState(draft.homeAddress);
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2 || address.trim().length < 5) {
      setError("Add a home name and a complete address.");
      return;
    }
    onContinue(name.trim(), address.trim());
  }

  return (
    <BottomSheet className="is-setup" labelledBy="setup-home-title" testId="screen-setup-home">
      <p className="sc-step-label">Setup · 1 of 2</p>
      <h1 id="setup-home-title">Where is home?</h1>
      <p className="sc-screen-subtitle">Save this now so it is ready when you need it.</p>
      <form className="sc-form" onSubmit={submit} noValidate>
        <label><span>Place name</span><input maxLength={60} value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" placeholder="Home" /></label>
        <label><span>Campus address</span><input maxLength={160} value={address} onChange={(event) => setAddress(event.target.value)} autoComplete="street-address" placeholder="Pritchard Hall" /></label>
        <p className="sc-field-note">The map is an illustrative campus demo, not address geocoding.</p>
        {error && <p className="sc-form-error" role="alert">{error}</p>}
        <PrimaryButton type="submit">CONTINUE</PrimaryButton>
      </form>
    </BottomSheet>
  );
}

function PreferencesSetupScreen({ draft, onSave, onBack }: { draft: SavedProfile; onSave: (profile: SavedProfile) => void; onBack: () => void }) {
  const [budget, setBudget] = useState(String(draft.maxBudget));
  const [walking, setWalking] = useState(draft.walkingPreference);
  const [avoidTransfers, setAvoidTransfers] = useState(draft.avoidTransfers);
  const [showOptional, setShowOptional] = useState(false);
  const [contact, setContact] = useState(draft.trustedContact ?? "");
  const numericBudget = Number(budget);
  const valid = budget.trim() !== "" && Number.isFinite(numericBudget) && numericBudget >= 0 && numericBudget <= 100;
  const contactValid = isValidOptionalPhone(contact);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !contactValid) return;
    onSave({ ...draft, maxBudget: numericBudget, walkingPreference: walking, avoidTransfers, trustedContact: contact.trim() });
  }

  return (
    <BottomSheet className="is-setup" labelledBy="setup-preferences-title" testId="screen-setup-preferences">
      <p className="sc-step-label">Setup · 2 of 2</p>
      <h1 id="setup-preferences-title">Keep the plan simple.</h1>
      <p className="sc-screen-subtitle">SafeCircle uses these limits for every recommendation.</p>
      <form className="sc-form" onSubmit={submit}>
        <label><span>Maximum trip cost</span><div className="sc-money-input"><span>$</span><input type="number" min="0" max="100" step="1" inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} aria-invalid={!valid} /></div></label>
        {!valid && <p className="sc-form-error" role="alert">Enter a budget from $0 to $100.</p>}
        <fieldset className="sc-choice-field"><legend>Walking preference</legend><div className="sc-choice-row">
          <label><input type="radio" name="walking" value="minimal" checked={walking === "minimal"} onChange={() => setWalking("minimal")} /><span>Minimal walking</span></label>
          <label><input type="radio" name="walking" value="normal" checked={walking === "normal"} onChange={() => setWalking("normal")} /><span>Normal walking</span></label>
        </div></fieldset>
        <label className="sc-check-row"><input type="checkbox" checked={avoidTransfers} onChange={(event) => setAvoidTransfers(event.target.checked)} /><span><strong>Avoid transfers</strong><small>Prefer one continuous ride</small></span></label>
        <button className="sc-disclosure-button" type="button" aria-expanded={showOptional} onClick={() => setShowOptional((value) => !value)}>Optional trusted contact <span>{showOptional ? "Hide ↑" : "Add ↓"}</span></button>
        {showOptional && <label><span>Trusted contact phone (optional)</span><input type="tel" inputMode="tel" autoComplete="tel" value={contact} onChange={(event) => setContact(event.target.value)} placeholder="(540) 555-0142" aria-invalid={!contactValid} />{!contactValid && <small className="sc-inline-error">Enter a valid phone number.</small>}</label>}
        <PrimaryButton type="submit" disabled={!valid || !contactValid}>SAVE AND CONTINUE</PrimaryButton>
        <button className="sc-dialog-text-action" type="button" onClick={onBack}>Back to home address</button>
      </form>
    </BottomSheet>
  );
}

function HomeScreen({ model, hasTripContext, onAction, onEditProfile, onOpenContext }: ScreenProps) {
  const profile = model.profile!;
  return (
    <BottomSheet className="is-home" labelledBy="home-title" testId="screen-home">
      <p className="sc-eyebrow">Ready when you are</p>
      <h1 id="home-title">Let’s get you home.</h1>
      <button className="sc-destination" type="button" onClick={onEditProfile} aria-label={`Edit saved destination ${profile.homeName}, ${profile.homeAddress}`}>
        <span className="sc-destination-icon"><House size={21} /></span>
        <span><strong>{profile.homeName}</strong><small>{profile.homeAddress}</small></span>
        <Pencil size={18} aria-hidden="true" />
      </button>
      <div className="sc-preference-line" aria-label="Saved preferences">
        <span><Footprints size={16} /> {model.constraints?.walkingPreference === "minimal" ? "Minimal walking" : "Normal walking"}</span>
        <span>Up to ${model.constraints?.maxBudget.toFixed(0)}</span>
      </div>
      <button className={`sc-context-button${hasTripContext ? " is-active" : ""}`} type="button" onClick={onOpenContext}>
        <SlidersHorizontal size={17} /><span>{hasTripContext ? "Trip context applied" : "Add context for this trip"}</span><ArrowRight size={17} />
      </button>
      <PrimaryButton onClick={() => onAction({ type: "START_TRIP" })}>GET ME HOME</PrimaryButton>
      <p className="sc-boundary-copy"><ShieldCheck size={15} /> Mobility coordination, not emergency service.</p>
    </BottomSheet>
  );
}

function SearchScreen({ model, onTechnical }: { model: DemoViewModel; onTechnical: () => void }) {
  const current = model.stage;
  const status = (stage: DemoStage) => {
    const order = ["discovering", "collecting-quotes", "evaluating"];
    const row = order.indexOf(stage);
    const active = order.indexOf(current);
    return row < active ? "done" : row === active ? "active" : "pending";
  };
  return (
    <BottomSheet className="is-searching" labelledBy="search-title" testId={`screen-${model.stage}`}>
      <div className="sc-state-symbol"><Search size={23} /></div>
      <p className="sc-eyebrow">Using your saved preferences</p>
      <h1 id="search-title">Finding the best way home…</h1>
      <p className="sc-screen-subtitle">We’re checking four demo options against your budget and walking preference.</p>
      <div className="sc-status-list" aria-live="polite">
        <StatusRow icon={<Radio size={19} />} title="Checking nearby options" detail="Looking at available ways to travel" state={status("discovering")} />
        <StatusRow icon={<BusFront size={19} />} title="Checking availability" detail="Your exact pickup is not shared yet" state={status("collecting-quotes")} />
        <StatusRow icon={<Route size={19} />} title="Comparing routes" detail="Using your price, walking, and time preferences" state={status("evaluating")} />
      </div>
      <TextButton onClick={onTechnical}>See what SafeCircle is doing <ArrowRight size={16} /></TextButton>
    </BottomSheet>
  );
}

function RecommendationScreen({ model, onGo }: { model: DemoViewModel; onGo: () => void }) {
  const plan = model.selectedPlan!;
  const alternatives = demoCandidates.filter((candidate) => {
    if (candidate.planId === plan.planId || !candidate.available || !model.constraints) return false;
    if (candidate.cost > model.constraints.maxBudget) return false;
    if (model.constraints.walkingPreference === "minimal" && candidate.walkingMinutes > 5) return false;
    if (model.constraints.avoidTransfers && (candidate.transfers ?? 0) > 0) return false;
    return true;
  }).slice(0, 2);
  return (
    <BottomSheet className="is-recommendation" labelledBy="recommendation-title" testId="screen-recommendation" footer={<PrimaryButton onClick={onGo}>GO WITH THIS PLAN</PrimaryButton>}>
      <p className="sc-eyebrow">One clear recommendation</p>
      <div className="sc-time-hero"><strong>{plan.totalMinutes} min</strong><span>to {model.profile?.homeName.toLowerCase()}</span></div>
      <h1 id="recommendation-title">Your plan is ready.</h1>
      <ProviderCard plan={plan} recommendation={model.recommendation} verified={model.providerVerified} />
      {alternatives.length > 0 && <details className="sc-alternatives"><summary>Other options <span>{alternatives.length} shown</span></summary>{alternatives.map((item) => <AlternativeRow key={item.planId} plan={item} />)}</details>}
    </BottomSheet>
  );
}

function CoordinationScreen({ model, onDetails }: { model: DemoViewModel; onDetails: () => void }) {
  const stage = model.stage;
  const replacement = stage.includes("replacement");
  const content = stage.startsWith("verifying")
    ? { eyebrow: replacement ? "Confirming your new ride" : "Confirming your ride", title: "Confirming your ride…", body: "Your exact pickup stays private until the provider is confirmed.", icon: <ShieldCheck size={25} /> }
    : stage.startsWith("authorizing")
      ? { eyebrow: "Provider confirmed", title: "Keeping details limited.", body: "Only the pickup details needed for this trip will be shared.", icon: <LockKeyhole size={25} /> }
      : stage.startsWith("coordinating")
        ? { eyebrow: "Provider confirmed", title: "Requesting your pickup.", body: "Your verified provider now has the details needed to meet you.", icon: <Navigation size={25} /> }
        : { eyebrow: "Pickup confirmed", title: replacement ? "New ride confirmed." : "Your ride is confirmed.", body: replacement ? "Still within your preferences. Your pickup is on the way." : "Your pickup is on the way.", icon: <CheckCircle2 size={25} /> };
  return (
    <BottomSheet className="is-centered" labelledBy="coordination-title" testId={`screen-${stage}`}>
      <div className="sc-state-symbol is-large">{content.icon}</div>
      <p className="sc-eyebrow">{content.eyebrow}</p>
      <h1 id="coordination-title">{content.title}</h1>
      <p className="sc-screen-subtitle">{content.body}</p>
      <TrustGate model={model} />
      <TextButton onClick={onDetails}>View coordination details <ArrowRight size={16} /></TextButton>
    </BottomSheet>
  );
}

function TrustGate({ model }: { model: DemoViewModel }) {
  const verifying = model.stage.startsWith("verifying");
  const coordinating = model.stage.startsWith("coordinating") || model.stage.startsWith("accepted");
  return (
    <div className="sc-trust-gate">
      <StatusRow icon={<ShieldCheck size={18} />} title={model.providerVerified ? "Verified provider" : "Confirming provider"} detail={coordinating ? "Pickup details shared for this trip" : "Pickup details remain private"} state={model.providerVerified ? "done" : verifying ? "active" : "pending"} />
    </div>
  );
}

function ActiveTripScreen({ model, onDetails, onHelp }: { model: DemoViewModel; onDetails: () => void; onHelp: () => void }) {
  const plan = model.selectedPlan!;
  const isWalking = plan.mode === "walk";
  const isWaiting = model.progressStep === "waiting";
  const isArriving = model.progressStep === "arriving";
  const primary = isWaiting ? `${plan.waitMinutes} min` : isArriving ? "1 min" : `${plan.travelMinutes} min`;
  const label = isWaiting ? "Pickup in" : isArriving ? "Arriving now" : "Home in";
  return (
    <BottomSheet className="is-active" labelledBy="active-title" testId={`screen-${model.stage}`}>
      <div className="sc-active-heading"><div><p className="sc-eyebrow">{label}</p><h1 id="active-title">{primary}</h1></div>{!isWalking && model.providerVerified && <VerificationBadge />}</div>
      <p className="sc-active-destination"><MapPin size={17} /> {model.profile?.homeName} · {model.profile?.homeAddress}</p>
      <div className="sc-provider-strip"><span className="sc-provider-icon">{isWalking ? <Footprints size={22} /> : plan.mode === "independent_ride" ? <CarFront size={22} /> : <BusFront size={22} />}</span><div><strong>{isWalking ? "Walk home" : plan.providerName}</strong><small>{isWalking ? "Direct walking route" : plan.mode === "independent_ride" ? "Rideshare pickup" : plan.mode === "campus_ride" ? "Campus shuttle" : "Transit ride"}</small></div><span>{isWalking ? `${plan.walkingMinutes} min` : `$${plan.cost.toFixed(2)}`}</span></div>
      <TripTimeline step={model.progressStep} walking={isWalking} />
      <div className="sc-active-actions"><SecondaryButton onClick={onDetails}>Trip details</SecondaryButton><SecondaryButton onClick={onHelp}><Phone size={18} /> Help</SecondaryButton></div>
      <p className="sc-auto-note">This simulated trip advances automatically.</p>
    </BottomSheet>
  );
}

function TripTimeline({ step, walking }: { step: DemoViewModel["progressStep"]; walking: boolean }) {
  if (walking) return <ol className="sc-trip-timeline is-walking" aria-label="Walking progress"><li className={step === "arrived" ? "is-done" : "is-current"} aria-current={step !== "arrived" ? "step" : undefined}><span><Footprints size={16} /></span><strong>Walking</strong></li><li className={step === "arrived" ? "is-current" : ""} aria-current={step === "arrived" ? "step" : undefined}><span><House size={16} /></span><strong>Home</strong></li></ol>;
  const order = ["waiting", "arriving", "in-trip", "arrived"] as const;
  return <ol className="sc-trip-timeline" aria-label="Trip progress">{order.map((item) => <li key={item} className={item === step ? "is-current" : order.indexOf(item) < order.indexOf(step as typeof item) ? "is-done" : ""} aria-current={item === step ? "step" : undefined}><span>{item === "waiting" ? <CircleDot size={16} /> : item === "arriving" ? <MapPin size={16} /> : item === "in-trip" ? <Navigation size={16} /> : <House size={16} />}</span><strong>{item === "in-trip" ? "On trip" : item[0].toUpperCase() + item.slice(1)}</strong></li>)}</ol>;
}

function RecoveryScreen({ model, onDetails }: { model: DemoViewModel; onDetails: () => void }) {
  const cancelled = model.stage === "provider-cancelled";
  const selected = model.stage === "replacement-selected";
  return (
    <BottomSheet className="is-recovery" labelledBy="recovery-title" testId={`screen-${model.stage}`}>
      <div className={`sc-state-symbol${cancelled ? " is-amber" : ""}`}>{cancelled ? <XCircle size={23} /> : selected ? <CheckCircle2 size={23} /> : <Route size={23} />}</div>
      <p className={`sc-eyebrow${cancelled ? " is-amber" : ""}`}>{cancelled ? "Provider update" : selected ? "Replacement selected" : "Automatic recovery"}</p>
      <h1 id="recovery-title">{cancelled ? "Your ride cancelled." : selected ? "Another option fits." : "We’re handling it."}</h1>
      <p className="sc-screen-subtitle">{cancelled ? "You don’t need to retry. SafeCircle will find another way home." : selected ? `${model.selectedPlan?.providerName} stays within your approved budget and walking preference.` : "The same approved constraints are being used for your replacement."}</p>
      {selected && model.selectedPlan ? <><ProviderCard plan={model.selectedPlan} recommendation={model.recommendation} verified={false} replacement /><p className="sc-inline-progress" role="status"><span className="sc-loader is-small" /> Confirming this option…</p></> : <div className="sc-status-list"><StatusRow icon={<Check size={18} />} title="Previous provider removed" detail="Temporary access revoked" state="done" /><StatusRow icon={<Search size={18} />} title="Finding suitable replacements" detail="No price above your budget" state={cancelled ? "pending" : "active"} /><StatusRow icon={<ShieldCheck size={18} />} title="Replacement verification" detail="Starts after selection" state="pending" /></div>}
      {selected && model.selectedPlan && <TextButton onClick={onDetails}>View replacement details <ArrowRight size={16} /></TextButton>}
    </BottomSheet>
  );
}

function ArrivalScreen({ model, onFinish, onDetails }: { model: DemoViewModel; onFinish: () => void; onDetails: () => void }) {
  const walking = model.selectedPlan?.mode === "walk";
  const completed = model.completedAt ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(model.completedAt) : "Just now";
  return (
    <div className="sc-arrival" data-testid="screen-arrival" aria-labelledby="arrival-title">
      <div className="sc-arrival-symbol"><Check size={34} /></div><p className="sc-eyebrow">Trip complete</p><h1 id="arrival-title">You’re home.</h1><p>{model.selectedPlan?.mode === "walk" ? "You made it home." : `${model.selectedPlan?.providerName} got you home.`}</p>
      <div className="sc-arrival-details"><ArrivalRow icon={<CheckCircle2 size={19} />} label="Trip completed" value={completed} /><ArrivalRow icon={<Navigation size={19} />} label="Location sharing" value={walking ? "Not shared" : "Ended"} />{!walking && <ArrivalRow icon={<LockKeyhole size={19} />} label="Provider access" value="Expired" />}</div>
      <TextButton onClick={onDetails}>View trip record <ArrowRight size={16} /></TextButton><SecondaryButton className="sc-finish-button" onClick={onFinish}>FINISH</SecondaryButton>
    </div>
  );
}

function SupportingStateScreen(props: ScreenProps) {
  const { model, onAction, onEditProfile, onOpenHelp } = props;
  const stage = model.stage;
  if (stage === "context-fallback") return <MessageSheet stage={stage} icon={<AlertTriangle size={24} />} eyebrow="Limited context" title="Using your saved preferences." body="Advanced campus context is unavailable in this demo. Basic budget and walking checks still work." primary="CONTINUE" onPrimary={() => onAction({ type: "ADVANCE" })} />;
  if (stage === "offline") return <MessageSheet stage={stage} icon={<WifiOff size={24} />} eyebrow="Updates paused" title="You’re offline." body="SafeCircle is holding the last known trip state. No new provider updates are being simulated." primary="TRY TO RECONNECT" onPrimary={() => onAction({ type: "RECONNECT" })} />;
  if (stage === "verification-failed") return <MessageSheet stage={stage} icon={<XCircle size={24} />} eyebrow="Verification stopped" title="We couldn’t verify this provider." body="Precise pickup was not shared. You can retry the identity check or return home." primary="RETRY VERIFICATION" onPrimary={() => onAction({ type: "RETRY" })} secondary="RETURN HOME" onSecondary={() => onAction({ type: "FINISH" })} />;
  if (stage === "no-options") return <MessageSheet stage={stage} icon={<Search size={24} />} eyebrow="No suitable option" title="Nothing fits your limits right now." body={`No remaining option stays within your $${model.constraints?.maxBudget.toFixed(0)} budget and walking preference.`} primary="EDIT PREFERENCES" onPrimary={onEditProfile} secondary="TRY AGAIN" onSecondary={() => onAction({ type: "RETRY" })} />;
  const updated = model.lastTripUpdateAt ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(model.lastTripUpdateAt) : "Time unavailable";
  return <MessageSheet stage={stage} icon={<AlertTriangle size={24} />} eyebrow="Trip check-in" title="Are you home?" body="This simulated trip is overdue. SafeCircle has not contacted anyone automatically." detail={<div className="sc-last-known"><strong>Last known: on the way home</strong><p>{model.selectedPlan?.providerName ?? "Trip"} · {model.profile?.homeAddress}</p><small>Updated {updated}. Precise location is unavailable in this demo.</small></div>} primary="YES, I’M HOME" onPrimary={() => onAction({ type: "CONFIRM_ARRIVAL", now: Date.now() })} secondary="STILL TRAVELLING" onSecondary={() => onAction({ type: "STILL_TRAVELLING" })} tertiary="Get help" onTertiary={onOpenHelp} />;
}

function MessageSheet({ stage, icon, eyebrow, title, body, detail, primary, secondary, tertiary, onPrimary, onSecondary, onTertiary }: { stage: DemoStage; icon: ReactNode; eyebrow: string; title: string; body: string; detail?: ReactNode; primary: string; secondary?: string; tertiary?: string; onPrimary: () => void; onSecondary?: () => void; onTertiary?: () => void }) {
  return <BottomSheet className="is-message" labelledBy="message-title" testId={`screen-${stage}`}><div className="sc-state-symbol">{icon}</div><p className="sc-eyebrow">{eyebrow}</p><h1 id="message-title">{title}</h1><p className="sc-screen-subtitle">{body}</p>{detail}<div className="sc-message-actions"><PrimaryButton onClick={onPrimary}>{primary}</PrimaryButton>{secondary && <SecondaryButton onClick={onSecondary}>{secondary}</SecondaryButton>}{tertiary && <TextButton onClick={onTertiary}>{tertiary}</TextButton>}</div></BottomSheet>;
}

function StatusRow({ icon, title, detail, state }: { icon: ReactNode; title: string; detail: string; state: "done" | "active" | "pending" | "failed" }) {
  return <div className={`sc-status-row is-${state}`}><span className="sc-status-icon">{icon}</span><div><strong>{title}</strong><small>{detail}</small></div><StatusMark state={state} /></div>;
}

function ArrivalRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="sc-arrival-row"><span>{icon}</span><strong>{label}</strong><small>{value}</small></div>;
}
