import { BusFront, CarFront, Check, Clock3, Footprints, ShieldCheck, Sparkles } from "lucide-react";
import type { CandidatePlan } from "@/types/provider";
import { VerificationBadge } from "./primitives";

export function ProviderCard({
  plan,
  replacement = false,
}: {
  plan: CandidatePlan;
  replacement?: boolean;
}) {
  return (
    <article className="sc-provider-card">
      <div className="sc-provider-heading">
        <span className="sc-provider-icon" aria-hidden="true">
          {plan.mode === "campus_ride" ? <BusFront size={22} /> : <CarFront size={22} />}
        </span>
        <div>
          <div className="sc-provider-title-line">
            <h3>{plan.providerName}</h3>
            <VerificationBadge compact />
          </div>
          <p>{replacement ? "Replacement confirmed" : "Recommended for you"}</p>
        </div>
        <span className="sc-provider-selected" aria-label="Selected plan"><Check size={15} /></span>
      </div>
      <div className="sc-provider-stats">
        <div><span>Arrives</span><strong>{plan.waitMinutes} min</strong></div>
        <div><span>Price</span><strong>${plan.cost.toFixed(2)}</strong></div>
        <div><span>Home in</span><strong>{plan.totalMinutes} min</strong></div>
      </div>
      <ul className="sc-reasons" aria-label="Why this plan">
        <li><Footprints size={15} /> {plan.walkingMinutes} minute walk</li>
        <li><Sparkles size={15} /> {replacement ? "Fastest option available" : "Best fit for your preferences"}</li>
        <li><ShieldCheck size={15} /> Provider identity can be verified</li>
      </ul>
    </article>
  );
}

export function AlternativeRow({ plan }: { plan: CandidatePlan }) {
  return (
    <div className="sc-alternative-row">
      <span className="sc-alt-icon" aria-hidden="true">
        {plan.mode === "walk" ? <Footprints size={18} /> : <CarFront size={18} />}
      </span>
      <div>
        <strong>{plan.providerName}</strong>
        <span>{plan.totalMinutes} min · {plan.cost === 0 ? "Free" : `$${plan.cost.toFixed(2)}`}</span>
      </div>
      <Clock3 size={16} aria-hidden="true" />
    </div>
  );
}
