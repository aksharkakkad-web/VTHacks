"use client";

import Image from "next/image";
import { useMemo, useState, type CSSProperties, type ChangeEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BusFront,
  Check,
  ChevronDown,
  Clock3,
  Footprints,
  House,
  Info,
  LifeBuoy,
  MapPin,
  Pencil,
  Phone,
  Settings,
  SlidersHorizontal,
  WalletCards,
} from "lucide-react";
import type { DemoStage, DemoViewModel, SavedProfile } from "@/components/safecircle/types";
import type { CandidatePlan } from "@/types/provider";
import styles from "./flow-screens.module.css";

type VoidCallback = () => void;

function clampBudget(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function formatCost(cost: number) {
  if (cost === 0) return "$0";
  return `$${cost.toFixed(cost % 1 === 0 ? 0 : 2)}`;
}

function BeaconBrand() {
  return (
    <span className={styles.brand} aria-label="Beacon demo">
      <span className={styles.brandMark} aria-hidden="true">
        <Image
          className={styles.brandImage}
          src="/beacon-welcome-logo.webp"
          alt=""
          width={1254}
          height={1254}
          priority
        />
      </span>
      <span className={styles.brandName}>Beacon</span>
      <span className={styles.demoLabel}>Demo</span>
    </span>
  );
}

export function BeaconFrame({
  children,
  onBack,
  onSettings,
}: {
  children: ReactNode;
  onBack?: VoidCallback;
  onSettings?: VoidCallback;
}) {
  return (
    <main className={styles.stage}>
      <section className={styles.phone} aria-label="Beacon campus mobility demo">
        <header className={styles.header}>
          <span className={styles.headerSide}>
            {onBack ? (
              <button className={styles.iconButton} type="button" onClick={onBack} aria-label="Go back">
                <ArrowLeft size={24} aria-hidden="true" />
              </button>
            ) : null}
          </span>
          <BeaconBrand />
          <span className={`${styles.headerSide} ${styles.headerTrailing}`}>
            {onSettings ? (
              <button className={styles.iconButton} type="button" onClick={onSettings} aria-label="Open preferences">
                <Settings size={23} aria-hidden="true" />
              </button>
            ) : null}
          </span>
        </header>
        <div className={styles.viewport}>{children}</div>
      </section>
    </main>
  );
}

function ScenicArtwork({ variant }: { variant: "home" | "ride" }) {
  if (variant === "home") {
    return (
      <div className={`${styles.artwork} ${styles.mapArtwork}`} aria-hidden="true">
        <Image src="/beacon-preferences/campus.png" alt="" fill sizes="(max-width: 430px) 100vw, 430px" priority />
        
      </div>
    );
  }

  return (
    <div className={`${styles.artwork} ${styles.rideArtwork}`} aria-hidden="true">
      <Image
        className={styles.landscapeImage}
        src="/beacon-welcome-landscape.webp"
        alt=""
        fill
        sizes="(max-width: 430px) 100vw, 430px"
        priority
      />
      <span className={styles.busBadge}>
        <BusFront size={47} strokeWidth={1.7} />
      </span>
    </div>
  );
}

function PrimaryAction({ children, onClick, disabled }: { children: ReactNode; onClick: VoidCallback; disabled?: boolean }) {
  return (
    <button className={styles.primaryAction} type="button" onClick={onClick} disabled={disabled}>
      <span>{children}</span>
      <ArrowRight size={23} aria-hidden="true" />
    </button>
  );
}

function PreferenceSwitch({
  label,
  checked,
  onChange,
  artworkSrc,
  artworkClassName,
}: {
  label: string;
  checked: boolean;
  onChange: VoidCallback;
  artworkSrc: string;
  artworkClassName?: string;
}) {
  return (
    <div className={styles.preferenceRow}>
      <span className={styles.preferenceLabel}>{label}</span>
      <button
        className={styles.switch}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
      >
        <span className={styles.switchThumb} />
      </button>
      <span className={`${styles.preferenceArtwork} ${artworkClassName ?? ""}`} aria-hidden="true">
        <Image src={artworkSrc} alt="" fill sizes="110px" />
      </span>
    </div>
  );
}

export function PreferencesScreen({
  profile,
  onChange,
  onSave,
  onBack,
}: {
  profile: SavedProfile;
  onChange: (profile: SavedProfile) => void;
  onSave: VoidCallback;
  onBack: VoidCallback;
}) {
  const [budgetDraft, setBudgetDraft] = useState(() => ({
    sourceValue: profile.maxBudget,
    text: String(profile.maxBudget),
  }));

  if (budgetDraft.sourceValue !== profile.maxBudget) {
    setBudgetDraft({ sourceValue: profile.maxBudget, text: String(profile.maxBudget) });
  }

  const parsedBudget = Number(budgetDraft.text);
  const budgetIsValid =
    budgetDraft.text.trim() !== "" &&
    Number.isInteger(parsedBudget) &&
    parsedBudget >= 0 &&
    parsedBudget <= 100;

  function updateBudgetInput(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setBudgetDraft({ sourceValue: profile.maxBudget, text: value });
    const parsed = Number(value);
    if (value.trim() !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= 100) {
      setBudgetDraft({ sourceValue: parsed, text: value });
      onChange({ ...profile, maxBudget: parsed });
    }
  }

  function updateBudgetSlider(event: ChangeEvent<HTMLInputElement>) {
    const value = clampBudget(Number(event.target.value));
    setBudgetDraft({ sourceValue: value, text: String(value) });
    onChange({ ...profile, maxBudget: value });
  }

  return (
    <BeaconFrame onBack={onBack}>
      <div className={`${styles.screen} ${styles.preferencesScreen}`}>
        <div className={styles.stepIndicator} aria-label="Step 2 of 2">
          <span />
          <span />
          <strong>Step 2 of 2</strong>
        </div>

        <div className={styles.centeredIntro}>
          <h1>Your way home.</h1>
          <p>Set once. Change anytime.</p>
        </div>

        <section className={`${styles.card} ${styles.budgetCard}`} aria-labelledby="budget-title">
          <div className={styles.budgetTopline}>
            <div>
              <h2 id="budget-title">Maximum budget</h2>
              <label className={styles.budgetInputLabel} htmlFor="beacon-budget-input">
                <span aria-hidden="true">$</span>
                <span className={styles.visuallyHidden}>Exact budget in dollars</span>
                <input
                  id="beacon-budget-input"
                  className={styles.budgetInput}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  inputMode="numeric"
                  value={budgetDraft.text}
                  onChange={updateBudgetInput}
                  aria-invalid={!budgetIsValid}
                  aria-describedby={!budgetIsValid ? "beacon-budget-error" : undefined}
                />
                <Pencil className={styles.editBudgetIcon} size={25} strokeWidth={2} aria-hidden="true" />
              </label>
            </div>
            <div className={styles.budgetArtwork} aria-hidden="true">
              <Image
                src="/beacon-preferences/wallet.png"
                alt=""
                fill
                sizes="120px"
                priority
              />
            </div>
          </div>
          <label className={styles.visuallyHidden} htmlFor="beacon-budget-slider">Maximum budget slider</label>
          <input
            id="beacon-budget-slider"
            className={styles.range}
            type="range"
            min={0}
            max={100}
            step={1}
            value={budgetIsValid ? parsedBudget : clampBudget(profile.maxBudget)}
            onChange={updateBudgetSlider}
            style={{ "--budget-progress": `${budgetIsValid ? parsedBudget : clampBudget(profile.maxBudget)}%` } as CSSProperties}
          />
          <div className={styles.rangeLabels} aria-hidden="true">
            <span>Under $5</span>
            <span>$20+</span>
          </div>
          {!budgetIsValid ? (
            <p className={styles.fieldError} id="beacon-budget-error" role="alert">Enter a whole dollar amount from 0 to 100.</p>
          ) : null}
        </section>

        <div className={styles.preferenceCards}>
          <PreferenceSwitch
            label="Less walking"
            checked={profile.walkingPreference === "minimal"}
            onChange={() => onChange({
              ...profile,
              walkingPreference: profile.walkingPreference === "minimal" ? "normal" : "minimal",
            })}
            artworkSrc="/beacon-preferences/shoe.png"
          />
          <PreferenceSwitch
            label="Fewer transfers"
            checked={profile.avoidTransfers}
            onChange={() => onChange({ ...profile, avoidTransfers: !profile.avoidTransfers })}
            artworkSrc="/beacon-preferences/shuttle.png"
            artworkClassName={styles.shuttleArtwork}
          />
        </div>

        <div className={styles.preferencesLandscape} aria-hidden="true">
          <Image src="/beacon-preferences/campus.png" alt="" fill sizes="(max-width: 430px) 100vw, 430px" />
        </div>

        <div className={styles.bottomActions}>
          <PrimaryAction onClick={onSave} disabled={!budgetIsValid}>Save and continue</PrimaryAction>
          <p>You can change these anytime.</p>
        </div>
      </div>
    </BeaconFrame>
  );
}

export function BeaconHomeScreen({
  model,
  onStart,
  onEditProfile,
  onEditHome,
  onContext,
  onHelp,
  onLocation,
  onTrustedContact,
}: {
  model: DemoViewModel;
  onStart: VoidCallback;
  onEditProfile: VoidCallback;
  onEditHome: VoidCallback;
  onContext: VoidCallback;
  onHelp?: VoidCallback;
  onLocation?: VoidCallback;
  onTrustedContact?: VoidCallback;
}) {
  const profile = model.profile;
  const budget = model.constraints?.maxBudget ?? profile?.maxBudget ?? 0;
  const prefersLessWalking = (model.constraints?.walkingPreference ?? profile?.walkingPreference) === "minimal";

  return (
    <BeaconFrame onSettings={onEditProfile}>
      <div className={`${styles.screen} ${styles.homeScreen}`}>
        <div className={styles.centeredIntro}>
          <h1>Let&apos;s get you home.</h1>
          <p>One tap. We&apos;ll find a way.</p>
        </div>

        <ScenicArtwork variant="home" />

        <section className={`${styles.card} ${styles.routeCard}`} aria-label="Saved trip details">
          <div className={styles.routeRow}>
            <span className={styles.routeIcon}><MapPin size={21} aria-hidden="true" /></span>
            <div>
              <span className={styles.rowLabel}>From</span>
              <strong>Demo pickup: Downtown Blacksburg</strong>
            </div>
            <button type="button" onClick={onContext}>Trip needs</button>
          </div>
          <div className={styles.routeRow}>
            <span className={styles.routeIcon}><House size={21} aria-hidden="true" /></span>
            <div>
              <span className={styles.rowLabel}>Home</span>
              <strong>{profile?.homeName ?? "Add your home"}</strong>
              {profile?.homeAddress && profile.homeAddress !== profile.homeName ? <span className={styles.rowSubtext}>{profile.homeAddress}</span> : null}
            </div>
            <button type="button" onClick={onEditHome}>Edit</button>
          </div>
          <button className={styles.preferenceSummary} type="button" onClick={onEditProfile}>
            <WalletCards size={20} aria-hidden="true" />
            <span>${budget} max</span>
            <span aria-hidden="true">·</span>
            <Footprints size={20} aria-hidden="true" />
            <span>{prefersLessWalking ? "Less walking" : "Standard walking"}</span>
          </button>
          {onHelp || onLocation || onTrustedContact ? (
            <div className={styles.homeUtilityActions}>
              {onLocation ? <button type="button" onClick={onLocation}><Info size={18} aria-hidden="true" /> How location works</button> : null}
              {onTrustedContact ? <button type="button" onClick={onTrustedContact}><Phone size={18} aria-hidden="true" /> Trusted contact</button> : null}
              {onHelp ? <button type="button" onClick={onHelp}><LifeBuoy size={18} aria-hidden="true" /> Get help</button> : null}
            </div>
          ) : null}
        </section>

        <div className={styles.bottomActions}>
          <PrimaryAction onClick={onStart}>Get me home</PrimaryAction>
          <p>Beacon coordinates options. Not an emergency service.</p>
        </div>
      </div>
    </BeaconFrame>
  );
}

type ProgressState = "done" | "active" | "pending";

function searchState(stage: DemoStage, item: 0 | 1 | 2): ProgressState {
  const stageIndex = stage === "discovering" || stage === "replanning-discovery"
    ? 0
    : stage === "collecting-quotes"
      ? 1
      : stage === "evaluating" || stage === "replanning-evaluation"
        ? 2
        : 3;
  if (item < stageIndex) return "done";
  if (item === stageIndex) return "active";
  return "pending";
}

function ProgressRow({ state, children }: { state: ProgressState; children: ReactNode }) {
  return (
    <div className={`${styles.progressRow} ${styles[state]}`}>
      <span className={styles.progressMark} aria-hidden="true">
        {state === "done" ? <Check size={21} strokeWidth={2.5} /> : null}
      </span>
      <strong>{children}</strong>
      <span className={styles.visuallyHidden}>{state === "done" ? "Complete" : state === "active" ? "In progress" : "Pending"}</span>
    </div>
  );
}

export function FindingScreen({ model, onCancel }: { model: DemoViewModel; onCancel: VoidCallback }) {
  const replacement = model.stage.startsWith("replanning");
  const heading = model.stage === "discovering" || model.stage === "replanning-discovery"
    ? replacement ? "Checking replacement providers." : "Checking available providers."
    : model.stage === "collecting-quotes"
      ? "Collecting current offers."
      : replacement ? "Comparing replacement routes." : "Comparing your routes.";
  const subheading = model.stage === "discovering" || model.stage === "replanning-discovery"
    ? replacement ? "Looking only after the old attempt is settled." : "Finding compatible services for this trip."
    : model.stage === "collecting-quotes"
      ? "Keeping unavailable and unknown results visible."
      : "Using your budget, walking, and transfer preferences.";
  return (
    <BeaconFrame>
      <div className={`${styles.screen} ${styles.findingScreen}`}>
        <div className={styles.centeredIntro}>
          <h1>{heading}</h1>
          <p>{subheading}</p>
        </div>

        <ScenicArtwork variant="ride" />

        <section className={`${styles.card} ${styles.progressCard}`} aria-label="Ride search progress" aria-live="polite">
          <ProgressRow state={searchState(model.stage, 0)}>Finding nearby rides</ProgressRow>
          <ProgressRow state={searchState(model.stage, 1)}>Checking prices</ProgressRow>
          <ProgressRow state={searchState(model.stage, 2)}>Choosing your best option</ProgressRow>
        </section>

        <p className={styles.destinationNote}>Home: <strong>{model.profile?.homeName ?? "Saved destination"}</strong></p>
        <div className={styles.findingFooter}>
          <button className={styles.textAction} type="button" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </BeaconFrame>
  );
}

function planIsEligible(plan: CandidatePlan, model: DemoViewModel) {
  const constraints = model.constraints;
  if (!plan.available || !constraints) return false;
  if (plan.cost > constraints.maxBudget) return false;
  if (constraints.walkingPreference === "minimal" && plan.walkingMinutes > 5) return false;
  if (constraints.avoidTransfers && (plan.transfers ?? 0) > 0) return false;
  return true;
}

function AlternativePlan({ plan, onSelect }: { plan: CandidatePlan; onSelect?: (planId: string) => void }) {
  return (
    <button className={styles.alternativeRow} type="button" onClick={() => onSelect?.(plan.planId)} disabled={!onSelect}>
      <div>
        <strong>{plan.providerName}</strong>
        <span>{plan.totalMinutes} min total · {plan.walkingMinutes} min walking</span>
      </div>
      <span className={styles.alternativePrice}>{formatCost(plan.cost)}</span>
    </button>
  );
}

export function RecommendationScreen({
  model,
  onGo,
  onBack,
  onDetails,
  onSelectPlan,
  defaultShowAlternatives = false,
}: {
  model: DemoViewModel;
  onGo: VoidCallback;
  onBack: VoidCallback;
  onDetails: VoidCallback;
  onSelectPlan?: (planId: string) => void;
  defaultShowAlternatives?: boolean;
}) {
  const [showAlternatives, setShowAlternatives] = useState(defaultShowAlternatives);
  const plan = model.selectedPlan;
  const backend = model.backendDetails;
  const cancellationFee = backend ? backend.cancellationFee : model.cancellationFee;
  const alternatives = useMemo(
    () => model.trip.candidates.filter((candidate) => candidate.planId !== plan?.planId && (backend ? candidate.available : planIsEligible(candidate, model))),
    [model, plan?.planId, backend],
  );

  if (!plan) {
    return (
      <BeaconFrame onBack={onBack}>
        <div className={`${styles.screen} ${styles.emptyRecommendation}`}>
          <SlidersHorizontal size={38} aria-hidden="true" />
          <h1>No recommendation yet.</h1>
          <p>Go back and let Beacon finish checking your options.</p>
          <button className={styles.textAction} type="button" onClick={onBack}>Back to search</button>
        </div>
      </BeaconFrame>
    );
  }

  const freeLabel = plan.cost === 0
    ? plan.mode === "campus_ride" ? "Free campus ride" : "No fare"
    : backend?.quoteId ? "Quoted fare · simulated payment" : "Estimated fare";
  const offerExpiresAt = model.offerExpiresAt
    ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(model.offerExpiresAt))
    : null;

  function toggleDetails() {
    if (alternatives.length > 0) {
      setShowAlternatives((current) => !current);
      return;
    }
    onDetails();
  }

  return (
    <BeaconFrame onBack={onBack}>
      <div className={`${styles.screen} ${styles.recommendationScreen} ${model.isReplacement ? styles.replacementRecommendation : ""}`}>
        <div className={styles.centeredIntro}>
          <h1>{plan.mode === "walk" ? "Your walking plan is ready." : plan.mode === "transit" ? "Your transit plan is ready." : "Your plan is ready."}</h1>
          <p>{plan.mode === "walk" ? "Walking is your best option." : `${plan.providerName} is your best option.`}</p>
        </div>

        {model.isReplacement ? (
          <section className={styles.changedTerms} aria-label="Changed replacement terms">
            <h2>New offer — review what changed</h2>
            <div><span>Previous offer</span><strong>{backend ? backend.previousOfferCost === undefined ? "Not reported" : formatCost(backend.previousOfferCost) : "$2"}</strong></div>
            <div><span>Replacement offer</span><strong>{formatCost(plan.cost)}</strong></div>
            <div><span>Previous retained fee</span><strong>{backend ? backend.previousRetainedFee === undefined ? "Not reported" : formatCost(backend.previousRetainedFee) : formatCost(model.cancellationFee)}</strong></div>
            <div><span>Remaining budget</span><strong>{backend ? backend.remainingBudget === undefined ? "Not reported" : formatCost(backend.remainingBudget) : formatCost(Math.max(0, (model.constraints?.maxBudget ?? 0) - model.cancellationFee))}</strong></div>
          </section>
        ) : null}

        <ScenicArtwork variant={plan.mode === "walk" ? "home" : "ride"} />

        <section className={`${styles.card} ${styles.planCard}`} aria-labelledby="selected-plan-title">
          <div className={styles.operatorLine}>
            <h2 id="selected-plan-title">{plan.providerName}</h2>
            <span>{plan.mode === "walk" ? backend ? "Walking plan" : "Walking plan · Demo data" : plan.mode === "transit" ? backend ? "Scheduled transit" : "Scheduled transit · Demo data" : backend?.simulated === false ? "Ride provider" : "Simulated rideshare · Demo data"}</span>
          </div>
          <div className={styles.costBlock}>
            <strong>{formatCost(plan.cost)}</strong>
            <span>{freeLabel}</span>
          </div>
          <div className={`${styles.planMetrics} ${plan.mode === "walk" ? styles.singleMetric : ""}`}>
            {plan.mode !== "walk" ? (
              <div>
                <span className={styles.metricIcon}><Clock3 size={22} aria-hidden="true" /></span>
                <p><strong>{plan.waitMinutes} min</strong><span>{plan.mode === "transit" ? "Scheduled departure" : "Pickup"}</span></p>
              </div>
            ) : null}
            <div>
              <span className={styles.metricIcon}><Clock3 size={22} aria-hidden="true" /></span>
              <p><strong>{plan.totalMinutes} min</strong><span>To home</span></p>
            </div>
          </div>
          <div className={styles.planDetailRow}>
            <Footprints size={21} aria-hidden="true" />
            <span>{plan.walkingMinutes} min walking</span>
          </div>
          <div className={styles.planDetailRow}>
            <MapPin size={21} aria-hidden="true" />
            <span><strong>Home</strong>{backend ? backend.destinationName ?? "Backend destination" : model.profile?.homeName ?? "Saved destination"}</span>
          </div>
          <div className={styles.offerTerms}>
            {!backend ? <span><strong>Demo service fee</strong>$0</span> : null}
            <span><strong>Offer valid until</strong>{offerExpiresAt ?? "Validity unavailable"}</span>
            <span><strong>Cancellation</strong>{cancellationFee === undefined ? "Fee not reported" : `${formatCost(cancellationFee)}${backend ? " quoted fee" : " demo fee"}`}</span>
            {backend?.quoteId ? <span><strong>Quote</strong>Bound to this offer</span> : null}
          </div>
        </section>

        <p className={styles.reasonLine}>{model.recommendation?.explanation ?? "Within your saved budget and travel preferences."}</p>
        <p className={styles.approvalNote}>{plan.mode === "walk" ? "Confirms this walking plan. No booking or payment." : plan.mode === "transit" ? "Scheduled estimates, not live arrivals. No booking or payment in this demo." : "Confirming approves this offer only. Provider identity, trip access, simulated payment, and booking are checked separately."}</p>

        {showAlternatives ? (
          <section className={styles.alternatives} id="beacon-alternatives" aria-label="Other eligible options">
            <h2>Other options</h2>
            {backend ? <p>For comparison. Confirm the recommended plan, or change your preferences for a new search.</p> : null}
            {alternatives.map((alternative) => <AlternativePlan key={alternative.planId} plan={alternative} onSelect={onSelectPlan} />)}
          </section>
        ) : null}

        <div className={styles.bottomActions}>
          <PrimaryAction onClick={onGo}>{plan.mode === "walk" ? "Confirm walking plan" : plan.mode === "transit" ? "Confirm transit plan" : "Confirm this plan"}</PrimaryAction>
          <button
            className={styles.detailsAction}
            type="button"
            onClick={toggleDetails}
            aria-expanded={alternatives.length > 0 ? showAlternatives : undefined}
            aria-controls={alternatives.length > 0 ? "beacon-alternatives" : undefined}
          >
            {alternatives.length > 0 ? "See other options" : "Trip details"}
            {alternatives.length > 0 ? <ChevronDown className={showAlternatives ? styles.rotated : undefined} size={18} aria-hidden="true" /> : null}
          </button>
        </div>
      </div>
    </BeaconFrame>
  );
}
