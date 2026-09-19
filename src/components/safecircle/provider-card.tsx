import { BusFront, CarFront, Footprints, Route } from "lucide-react";
import type { CandidatePlan } from "@/types/provider";
import type { Recommendation } from "@/types/recommendation";
import { VerificationBadge } from "./primitives";

function ModeIcon({ plan }: { plan: CandidatePlan }) {
  if (plan.mode === "walk") return <Footprints size={22} />;
  return plan.mode === "campus_ride" || plan.mode === "transit"
    ? <BusFront size={22} />
    : <CarFront size={22} />;
}

export function ProviderCard({
  plan,
  recommendation,
  verified,
  replacement = false,
}: {
  plan: CandidatePlan;
  recommendation?: Recommendation;
  verified: boolean;
  replacement?: boolean;
}) {
  return (
    <article className="sc-provider-card">
      <div className="sc-provider-heading">
        <span className="sc-provider-icon" aria-hidden="true"><ModeIcon plan={plan} /></span>
        <div>
          <div className="sc-provider-title-line">
            <h3>{plan.providerName}</h3>
            {verified && <VerificationBadge label="Verified" />}
          </div>
          <p>{replacement ? "Replacement option" : "Recommended plan"}</p>
        </div>
      </div>
      <div className="sc-provider-stats">
        <div><span>Pickup</span><strong>{plan.waitMinutes} min</strong></div>
        <div><span>Price</span><strong>${plan.cost.toFixed(2)}</strong></div>
      </div>
      {recommendation && <p className="sc-plan-explanation">{recommendation.explanation}</p>}
      <ul className="sc-reasons" aria-label="Why this plan">
        <li><Footprints size={16} /> {plan.walkingMinutes} minute walk</li>
        <li><Route size={16} /> {(plan.transfers ?? 0) === 0 ? "No transfers" : `${plan.transfers} transfer`}</li>
      </ul>
    </article>
  );
}

export function AlternativeRow({ plan }: { plan: CandidatePlan }) {
  return (
    <div className="sc-alternative-row">
      <span className="sc-alt-icon" aria-hidden="true"><ModeIcon plan={plan} /></span>
      <div><strong>{plan.providerName}</strong><span>{plan.totalMinutes} min · {plan.cost === 0 ? "Free" : `$${plan.cost.toFixed(2)}`}</span></div>
    </div>
  );
}
