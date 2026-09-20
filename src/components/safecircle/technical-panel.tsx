import { useRef } from "react";
import { AlertTriangle, ArrowDown, Check, Circle, Database, LockKeyhole, Play, RotateCcw } from "lucide-react";
import type { DemoAction, DemoStage, DemoViewModel } from "./types";
import type { MobilitySample } from "../../lib/client/beacon/sample-responses";
import { SecondaryButton } from "./primitives";

const jumpStages: Array<{ stage: DemoStage; label: string }> = [
  { stage: "home", label: "Home" },
  { stage: "verifying-initial", label: "Identity" },
  { stage: "authorizing-initial", label: "Access" },
  { stage: "coordinating-initial", label: "Booking" },
  { stage: "replacement-selected", label: "Replacement" },
  { stage: "recommendation", label: "Plan" },
  { stage: "waiting-initial", label: "Waiting" },
  { stage: "arriving-initial", label: "Arriving" },
  { stage: "in-trip-initial", label: "In trip" },
  { stage: "arrival", label: "Arrival" },
];

export function TechnicalPanel({ model, onAction, onMobilitySample, canApplyMobility = false }: { model: DemoViewModel; onAction: (action: DemoAction) => void; onMobilitySample?: (name: MobilitySample) => void; canApplyMobility?: boolean }) {
  const controls = useRef<HTMLElement>(null);
  const canCancel = !!model.selectedPlan?.requiresProviderVerification && /^(coordinating|accepted|waiting|arriving)-/.test(model.stage);
  return (
    <div className="sc-technical-body">
      <div className="sc-demo-actions">
        <SecondaryButton data-testid="demo-apply-response" onClick={() => onAction({ type: "ADVANCE", now: Date.now() })}><Play size={17} />Apply next sample response</SecondaryButton>
        <SecondaryButton onClick={() => controls.current?.scrollIntoView({ block: "start" })}>Demo controls <ArrowDown size={17} /></SecondaryButton>
      </div>
      <div className="sc-tech-callout"><LockKeyhole size={18} /><div><strong>Precise-location gate</strong><span>Exact pickup remains withheld until both provider identity and Beacon authorization pass.</span></div></div>
      <ol className="sc-tech-timeline" aria-label="Simulated coordination timeline">
        {model.timeline.map((step) => <li key={step.id} className={`is-${step.state}`}><span className="sc-tech-step-icon" aria-hidden="true">{step.state === "done" ? <Check size={14} /> : step.state === "failed" ? <AlertTriangle size={14} /> : <Circle size={9} fill="currentColor" />}</span><div><strong>{step.title}</strong><span>{step.detail}</span></div></li>)}
      </ol>

      <section className="sc-candidate-section" aria-labelledby="candidate-heading">
        <div className="sc-section-label"><Database size={15} /><h3 id="candidate-heading">Candidate evaluation</h3></div>
        <div className="sc-candidate-table-wrap"><table className="sc-candidate-table"><thead><tr><th>Provider</th><th>Wait</th><th>Walk</th><th>Cost</th></tr></thead><tbody>{model.trip.candidates.map((plan) => <tr key={plan.planId} className={model.selectedPlan?.planId === plan.planId ? "is-selected" : undefined}><th scope="row">{plan.providerName}</th><td>{plan.waitMinutes}m</td><td>{plan.walkingMinutes}m</td><td>${plan.cost.toFixed(2)}</td></tr>)}</tbody></table></div>
        {model.recommendation && <><p className="sc-tech-explanation">{model.recommendation.explanation}</p><div className="sc-tech-reason-codes" aria-label="Selection reason codes">{model.recommendation.reasonCodes.map((code) => <code key={code}>{code}</code>)}</div></>}
      </section>

      <section ref={controls} className="sc-demo-controls" aria-labelledby="demo-heading">
        <div className="sc-section-label"><RotateCcw size={15} /><h3 id="demo-heading">Demo controls</h3></div>
        <div className="sc-jump-grid">{jumpStages.map((item) => <button key={item.stage} data-testid={`demo-jump-${item.stage}`} aria-pressed={model.stage === item.stage} onClick={() => onAction({ type: "JUMP", stage: item.stage, now: Date.now() })}>{item.label}</button>)}</div>
        <SecondaryButton data-testid="demo-cancel-provider" disabled={!canCancel} title={canCancel ? "Simulate a cancelled pickup" : "Available during pickup coordination or waiting"} onClick={() => onAction({ type: "CANCEL_PROVIDER" })}>Cancel provider</SecondaryButton>
        <div className="sc-scenario-grid">
          {(["offer-changed", "payment-declined", "payment-unknown", "booking-unknown", "session-error", "location-error", "slow-request", "cancelling", "cancelled"] as DemoStage[]).map(stage => <button key={stage} data-testid={`demo-${stage}`} onClick={() => onAction({ type: "JUMP", stage, now: Date.now() })}>{stage.replaceAll("-", " ")}</button>)}
          <button data-testid="demo-cancel-unknown" onClick={() => onAction({ type: "SIMULATE", scenario: "booking-unknown" })}>Make current result unknown</button>
          <button data-testid="demo-no-options" onClick={() => onAction({ type: "JUMP", stage: "no-options", now: Date.now() })}>No suitable options</button>
          <button data-testid="demo-verification-failure" onClick={() => onAction({ type: "JUMP", stage: "verification-failed", now: Date.now() })}>Verification failure</button>
          <button data-testid="demo-context-fallback" onClick={() => onAction({ type: "JUMP", stage: "context-fallback", now: Date.now() })}>Context fallback</button>
          <button data-testid="demo-offline" onClick={() => onAction({ type: "SIMULATE", scenario: "offline" })}>Offline</button>
          <button data-testid="demo-overdue" onClick={() => onAction({ type: "JUMP", stage: "overdue", now: Date.now() })}>Overdue check-in</button>
          <button data-testid="demo-reset-profile" onClick={() => onAction({ type: "RESET_PROFILE" })}>Reset saved profile</button>
        </div>
      </section>
      {onMobilitySample && <section className="sc-demo-controls" aria-label="Mobility contract samples"><h3>Mobility sample responses</h3><p>Provisional adapter examples, pending Mahin’s agreed fixtures. The route is a decoder example, not campus navigation.</p><div className="sc-scenario-grid">{(["walking-pickup", "walking-stop", "walking-home", "route-loading", "route-unavailable", "route-stale", "ride-waiting", "ride-riding", "source-unknown"] as MobilitySample[]).map(name => <button key={name} data-testid={`demo-mobility-${name}`} disabled={!canApplyMobility || !/^(accepted|waiting|arriving|in-trip)-/.test(model.stage)} onClick={() => onMobilitySample(name)}>{name.replaceAll("-", " ")}</button>)}</div></section>}
      <p className="sc-demo-disclaimer">All trip events and provider responses shown here are deterministic demo fixtures. Beacon is not emergency dispatch.</p>
    </div>
  );
}
