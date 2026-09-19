import { AlertTriangle, Check, Circle, Database, LockKeyhole, Pause, Play, RotateCcw } from "lucide-react";
import type { DemoAction, DemoStage, DemoViewModel } from "./types";
import { SecondaryButton } from "./primitives";

const jumpStages: Array<{ stage: DemoStage; label: string }> = [
  { stage: "home", label: "Home" },
  { stage: "recommendation", label: "Plan" },
  { stage: "waiting-initial", label: "Waiting" },
  { stage: "arriving-initial", label: "Arriving" },
  { stage: "in-trip-initial", label: "In trip" },
  { stage: "arrival", label: "Arrival" },
];

export function TechnicalPanel({ model, onAction }: { model: DemoViewModel; onAction: (action: DemoAction) => void }) {
  return (
    <div className="sc-technical-body">
      <div className="sc-tech-callout"><LockKeyhole size={18} /><div><strong>Precise-location gate</strong><span>Exact pickup remains withheld until both provider identity and SafeCircle authorization pass.</span></div></div>
      <ol className="sc-tech-timeline" aria-label="Simulated coordination timeline">
        {model.timeline.map((step) => <li key={step.id} className={`is-${step.state}`}><span className="sc-tech-step-icon" aria-hidden="true">{step.state === "done" ? <Check size={14} /> : step.state === "failed" ? <AlertTriangle size={14} /> : <Circle size={9} fill="currentColor" />}</span><div><strong>{step.title}</strong><span>{step.detail}</span></div></li>)}
      </ol>

      <section className="sc-candidate-section" aria-labelledby="candidate-heading">
        <div className="sc-section-label"><Database size={15} /><h3 id="candidate-heading">Candidate evaluation</h3></div>
        <div className="sc-candidate-table-wrap"><table className="sc-candidate-table"><thead><tr><th>Provider</th><th>Wait</th><th>Walk</th><th>Cost</th></tr></thead><tbody>{model.trip.candidates.map((plan) => <tr key={plan.planId} className={model.selectedPlan?.planId === plan.planId ? "is-selected" : undefined}><th scope="row">{plan.providerName}</th><td>{plan.waitMinutes}m</td><td>{plan.walkingMinutes}m</td><td>${plan.cost.toFixed(2)}</td></tr>)}</tbody></table></div>
        {model.recommendation && <><p className="sc-tech-explanation">{model.recommendation.explanation}</p><div className="sc-tech-reason-codes" aria-label="Selection reason codes">{model.recommendation.reasonCodes.map((code) => <code key={code}>{code}</code>)}</div></>}
      </section>

      <section className="sc-demo-controls" aria-labelledby="demo-heading">
        <div className="sc-section-label"><RotateCcw size={15} /><h3 id="demo-heading">Demo controls</h3></div>
        <div className="sc-jump-grid">{jumpStages.map((item) => <button key={item.stage} data-testid={`demo-jump-${item.stage}`} aria-pressed={model.stage === item.stage} onClick={() => onAction({ type: "JUMP", stage: item.stage, now: Date.now() })}>{item.label}</button>)}</div>
        <div className="sc-demo-actions">
          <SecondaryButton data-testid="demo-toggle-pause" onClick={() => onAction({ type: "TOGGLE_PAUSE" })}>{model.paused ? <Play size={17} /> : <Pause size={17} />}{model.paused ? "Resume demo" : "Pause demo"}</SecondaryButton>
          <SecondaryButton data-testid="demo-cancel-provider" onClick={() => onAction({ type: "CANCEL_PROVIDER" })}>Cancel provider</SecondaryButton>
        </div>
        <div className="sc-scenario-grid">
          <button data-testid="demo-no-options" onClick={() => onAction({ type: "JUMP", stage: "no-options", now: Date.now() })}>No suitable options</button>
          <button data-testid="demo-verification-failure" onClick={() => onAction({ type: "JUMP", stage: "verification-failed", now: Date.now() })}>Verification failure</button>
          <button data-testid="demo-context-fallback" onClick={() => onAction({ type: "JUMP", stage: "context-fallback", now: Date.now() })}>Context fallback</button>
          <button data-testid="demo-offline" onClick={() => onAction({ type: "SIMULATE", scenario: "offline" })}>Offline</button>
          <button data-testid="demo-overdue" onClick={() => onAction({ type: "JUMP", stage: "overdue", now: Date.now() })}>Overdue check-in</button>
          <button data-testid="demo-reset-profile" onClick={() => onAction({ type: "RESET_PROFILE" })}>Reset saved profile</button>
        </div>
      </section>
      <p className="sc-demo-disclaimer">All trip events and provider responses shown here are deterministic demo fixtures. SafeCircle is not emergency dispatch.</p>
    </div>
  );
}
