import {
  ArrowRight,
  BusFront,
  CarFront,
  Check,
  CheckCircle2,
  Clock3,
  Footprints,
  House,
  LockKeyhole,
  MapPin,
  Navigation,
  Phone,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { AlternativeRow, ProviderCard } from "./provider-card";
import { BottomSheet } from "./bottom-sheet";
import { campusRide, rideshare, walk } from "./mock-data";
import { PrimaryButton, SecondaryButton, StatusCheck, VerificationBadge } from "./primitives";
import type { DemoScreen } from "./types";

export function ConsumerScreen({
  screen,
  onPrimary,
  onDetails,
  onHelp,
}: {
  screen: DemoScreen;
  onPrimary: () => void;
  onDetails: () => void;
  onHelp: () => void;
}) {
  if (screen === "home") return <HomeScreen onPrimary={onPrimary} />;
  if (screen === "searching") return <SearchingScreen onDetails={onDetails} />;
  if (screen === "recommendation") return <RecommendationScreen onPrimary={onPrimary} />;
  if (screen === "verifying") return <VerifyingScreen onDetails={onDetails} />;
  if (screen === "active" || screen === "replacement-active") {
    return <ActiveTripScreen replacement={screen === "replacement-active"} onDetails={onDetails} onHelp={onHelp} />;
  }
  if (screen === "cancelled" || screen === "replanning") {
    return <ReplanningScreen cancelled={screen === "cancelled"} onDetails={onDetails} />;
  }
  if (screen === "replacement") return <ReplacementScreen onDetails={onDetails} />;
  return <ArrivalScreen onPrimary={onPrimary} onDetails={onDetails} />;
}

function HomeScreen({ onPrimary }: { onPrimary: () => void }) {
  return (
    <BottomSheet className="is-home" labelledBy="home-title">
      <p className="sc-eyebrow">Your saved destination</p>
      <h1 id="home-title">Where are you<br />getting home?</h1>
      <button className="sc-destination" type="button" aria-label="Saved destination: Home, Pritchard Hall">
        <span className="sc-destination-icon"><House size={19} /></span>
        <span><strong>Home</strong><small>Pritchard Hall</small></span>
        <ArrowRight size={18} aria-hidden="true" />
      </button>
      <div className="sc-preference-line">
        <span><Footprints size={14} /> Minimize walking</span>
        <span>Under $10</span>
      </div>
      <PrimaryButton onClick={onPrimary}>GET ME HOME</PrimaryButton>
      <p className="sc-boundary-copy"><ShieldCheck size={14} /> Mobility coordination, not emergency service.</p>
    </BottomSheet>
  );
}

function SearchingScreen({ onDetails }: { onDetails: () => void }) {
  return (
    <BottomSheet className="is-searching" labelledBy="search-title">
      <span className="sc-live-dot" aria-hidden="true"><span /></span>
      <h1 id="search-title">Finding the best<br />way home…</h1>
      <p className="sc-screen-subtitle">We’re checking every option against your preferences.</p>
      <div className="sc-status-list" aria-live="polite">
        <StatusRow icon={<Search size={18} />} title="Finding providers" detail="Campus and local services" state="complete" />
        <StatusRow icon={<BusFront size={18} />} title="Checking live availability" detail="3 providers responded" state="complete" />
        <StatusRow icon={<Sparkles size={18} />} title="Evaluating the best fit" detail="Cost, wait, walking, reliability" state="active" />
        <StatusRow icon={<ShieldCheck size={18} />} title="Preparing verification" detail="Exact location is still withheld" state="waiting" />
      </div>
      <button className="sc-text-button" onClick={onDetails}>See what SafeCircle is doing <ArrowRight size={15} /></button>
    </BottomSheet>
  );
}

function RecommendationScreen({ onPrimary }: { onPrimary: () => void }) {
  return (
    <BottomSheet className="is-recommendation" labelledBy="recommendation-title">
      <p className="sc-eyebrow">One clear recommendation</p>
      <h1 id="recommendation-title">Your plan is ready.</h1>
      <p className="sc-screen-subtitle">Best fit for your budget and minimal walking.</p>
      <ProviderCard plan={campusRide} />
      <PrimaryButton onClick={onPrimary}>GO WITH THIS PLAN</PrimaryButton>
      <details className="sc-alternatives">
        <summary>Other options <span>2 available</span></summary>
        <AlternativeRow plan={rideshare} />
        <AlternativeRow plan={walk} />
      </details>
    </BottomSheet>
  );
}

function VerifyingScreen({ onDetails }: { onDetails: () => void }) {
  return (
    <BottomSheet className="is-centered" labelledBy="verify-title">
      <div className="sc-verifying-ring" aria-hidden="true"><ShieldCheck size={28} /></div>
      <p className="sc-eyebrow">Securing your trip</p>
      <h1 id="verify-title">Verifying your provider.</h1>
      <p className="sc-screen-subtitle">SafeCircle is confirming who operates Campus Shuttle before sharing your exact pickup.</p>
      <div className="sc-gate-row">
        <LockKeyhole size={18} />
        <span><strong>Precise location withheld</strong><small>Released only after identity and authorization checks</small></span>
      </div>
      <button className="sc-text-button" onClick={onDetails}>View verification details <ArrowRight size={15} /></button>
    </BottomSheet>
  );
}

function ActiveTripScreen({ replacement, onDetails, onHelp }: { replacement: boolean; onDetails: () => void; onHelp: () => void }) {
  const plan = replacement ? rideshare : campusRide;
  return (
    <BottomSheet className="is-active" labelledBy="active-title">
      <div className="sc-active-heading">
        <div>
          <p className="sc-eyebrow">Ride on the way</p>
          <h1 id="active-title">{plan.waitMinutes} min</h1>
        </div>
        <VerificationBadge />
      </div>
      <div className="sc-provider-strip">
        <span className="sc-provider-icon">
          {replacement ? <CarFront size={21} /> : <BusFront size={21} />}
        </span>
        <div><strong>{plan.providerName}</strong><small>{replacement ? "Silver sedan · V8H 214" : "VT Transit · Shuttle 18"}</small></div>
        <span className="sc-eta-price">${plan.cost.toFixed(2)}</span>
      </div>
      <TripTimeline />
      <div className="sc-active-actions">
        <SecondaryButton onClick={onDetails}>View trip details</SecondaryButton>
        <button className="sc-help-button" onClick={onHelp} aria-label="Open help options"><Phone size={18} /><span>Need help?</span></button>
      </div>
    </BottomSheet>
  );
}

function ReplanningScreen({ cancelled, onDetails }: { cancelled: boolean; onDetails: () => void }) {
  return (
    <BottomSheet className="is-replanning" labelledBy="replan-title">
      {cancelled ? (
        <>
          <span className="sc-state-icon is-amber"><XCircle size={24} /></span>
          <p className="sc-eyebrow is-amber">Provider update</p>
          <h1 id="replan-title">Your ride cancelled.</h1>
          <p className="sc-screen-subtitle">You don’t need to do anything. We’re already finding another way home.</p>
        </>
      ) : (
        <>
          <span className="sc-state-icon"><Route size={24} /></span>
          <p className="sc-eyebrow">Automatic recovery</p>
          <h1 id="replan-title">We’re handling it.</h1>
          <p className="sc-screen-subtitle">Rechecking live options inside your approved budget.</p>
        </>
      )}
      <div className="sc-replan-progress" aria-live="polite">
        <StatusRow icon={<Check size={17} />} title="Cancelled provider removed" detail="Campus Shuttle will not be retried" state="complete" />
        <StatusRow icon={<Sparkles size={17} />} title="New plans being evaluated" detail="Walking and cost preferences preserved" state={cancelled ? "waiting" : "active"} />
        <StatusRow icon={<ShieldCheck size={17} />} title="Replacement verification" detail="Exact location remains protected" state="waiting" />
      </div>
      <button className="sc-text-button" onClick={onDetails}>View recovery details <ArrowRight size={15} /></button>
    </BottomSheet>
  );
}

function ReplacementScreen({ onDetails }: { onDetails: () => void }) {
  return (
    <BottomSheet className="is-replacement" labelledBy="replacement-title">
      <span className="sc-state-icon is-success"><CheckCircle2 size={24} /></span>
      <p className="sc-eyebrow">Recovered automatically</p>
      <h1 id="replacement-title">New ride confirmed.</h1>
      <p className="sc-screen-subtitle">Your new provider is on the way. No approval was needed.</p>
      <ProviderCard plan={rideshare} replacement />
      <div className="sc-auto-continue"><span /><p>Opening live trip</p></div>
      <button className="sc-text-button" onClick={onDetails}>See why the plan changed <ArrowRight size={15} /></button>
    </BottomSheet>
  );
}

function ArrivalScreen({ onPrimary, onDetails }: { onPrimary: () => void; onDetails: () => void }) {
  return (
    <div className="sc-arrival" aria-labelledby="arrival-title">
      <div className="sc-arrival-symbol" aria-hidden="true"><Check size={34} strokeWidth={2.4} /></div>
      <p className="sc-eyebrow">Trip complete</p>
      <h1 id="arrival-title">You’re home.</h1>
      <p>SafeCircle stayed with the trip until you arrived.</p>
      <div className="sc-arrival-details">
        <ArrivalRow icon={<Clock3 size={18} />} label="Trip completed" value="9:58 PM" />
        <ArrivalRow icon={<Navigation size={18} />} label="Location sharing" value="Ended" />
        <ArrivalRow icon={<LockKeyhole size={18} />} label="Provider access" value="Expired" />
      </div>
      <button className="sc-text-button" onClick={onDetails}>View trip record <ArrowRight size={15} /></button>
      <PrimaryButton onClick={onPrimary}>FINISH</PrimaryButton>
    </div>
  );
}

function StatusRow({ icon, title, detail, state }: { icon: ReactNode; title: string; detail: string; state: "complete" | "active" | "waiting" }) {
  return (
    <div className={`sc-status-row is-${state}`}>
      <span className="sc-status-icon">{icon}</span>
      <div><strong>{title}</strong><small>{detail}</small></div>
      {state === "complete" ? <StatusCheck /> : state === "active" ? <span className="sc-mini-spinner" aria-label="In progress" /> : <span className="sc-wait-dot" aria-label="Waiting" />}
    </div>
  );
}

function TripTimeline() {
  return (
    <ol className="sc-trip-timeline" aria-label="Trip progress">
      <li className="is-active"><span><Navigation size={15} /></span><strong>En route</strong></li>
      <li><span><MapPin size={15} /></span><strong>Arriving</strong></li>
      <li><span><BusFront size={15} /></span><strong>On trip</strong></li>
      <li><span><House size={15} /></span><strong>Home</strong></li>
    </ol>
  );
}

function ArrivalRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="sc-arrival-row"><span>{icon}</span><strong>{label}</strong><small>{value}</small></div>;
}
