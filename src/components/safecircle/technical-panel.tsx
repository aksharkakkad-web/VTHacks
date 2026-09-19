import { AlertTriangle, Check, Circle, Database, LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";
import { campusRide, demoScreens, getTechnicalSteps, rideshare, transit, walk } from "./mock-data";
import { SecondaryButton } from "./primitives";
import type { DemoScreen } from "./types";

export function TechnicalPanel({
  screen,
  onJump,
  onCancel,
  onArrive,
  onReset,
}: {
  screen: DemoScreen;
  onJump: (screen: DemoScreen) => void;
  onCancel: () => void;
  onArrive: () => void;
  onReset: () => void;
}) {
  const steps = getTechnicalSteps(screen);
  const plans = [campusRide, rideshare, transit, walk];
  const isReplacement = ["replacement", "replacement-active", "arrival"].includes(
    screen,
  );
  const selectedPlanId = isReplacement ? rideshare.planId : campusRide.planId;
  const reasonCodes = isReplacement
    ? "FASTEST_AVAILABLE · WITHIN_BUDGET · LOW_WALKING"
    : "LOW_WALKING · WITHIN_BUDGET · HIGH_RELIABILITY";

  return (
    <div className="sc-technical-body">
      <div className="sc-tech-callout">
        <LockKeyhole size={17} />
        <div><strong>Precise-location gate</strong><span>Exact pickup stays withheld until identity verification and authorization both pass.</span></div>
      </div>

      <ol className="sc-tech-timeline">
        {steps.map((step) => (
          <li key={step.id} className={`is-${step.state}`}>
            <span className="sc-tech-step-icon" aria-hidden="true">
              {step.state === "complete" ? <Check size={13} /> : step.state === "blocked" ? <AlertTriangle size={13} /> : <Circle size={10} fill="currentColor" />}
            </span>
            <div><strong>{step.title}</strong><span>{step.detail}</span></div>
          </li>
        ))}
      </ol>

      <section className="sc-candidate-section" aria-labelledby="candidate-heading">
        <div className="sc-section-label"><Database size={14} /><h3 id="candidate-heading">Candidate evaluation</h3></div>
        <div className="sc-candidate-table" role="table" aria-label="Candidate plan metrics">
          {plans.map((plan) => (
            <div className={`sc-candidate-row${plan.planId === selectedPlanId ? " is-selected" : ""}`} role="row" key={plan.planId}>
              <strong role="cell">{plan.providerName}</strong>
              <span role="cell">{plan.waitMinutes}m wait</span>
              <span role="cell">{plan.walkingMinutes}m walk</span>
              <span role="cell">${plan.cost.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <p className="sc-reason-codes">{reasonCodes}</p>
      </section>

      <section className="sc-demo-controls" aria-labelledby="demo-heading">
        <div className="sc-section-label"><ShieldCheck size={14} /><h3 id="demo-heading">Demo controls</h3></div>
        <div className="sc-jump-grid">
          {demoScreens.map((item) => (
            <button key={item.id} className={screen === item.id ? "is-current" : ""} onClick={() => onJump(item.id)} aria-pressed={screen === item.id}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="sc-demo-actions">
          <SecondaryButton onClick={onCancel} disabled={!new Set(["active", "replacement-active"]).has(screen)}>Cancel provider</SecondaryButton>
          <SecondaryButton onClick={onArrive} disabled={!new Set(["active", "replacement", "replacement-active"]).has(screen)}>Simulate arrival</SecondaryButton>
        </div>
        <button className="sc-reset-button" onClick={onReset}><RotateCcw size={14} /> Reset demo</button>
      </section>

      <p className="sc-demo-disclaimer">Demo values are simulated. SafeCircle coordinates mobility; it is not emergency dispatch and does not guarantee personal safety.</p>
    </div>
  );
}
