import type { ReactNode } from "react";
import { ShieldCheck, X } from "lucide-react";
import { BrandMark, IconButton } from "./primitives";

export function AppShell({
  children,
  technicalOpen,
  onTechnicalOpen,
  onTechnicalClose,
  technicalPanel,
}: {
  children: ReactNode;
  technicalOpen: boolean;
  onTechnicalOpen: () => void;
  onTechnicalClose: () => void;
  technicalPanel: ReactNode;
}) {
  return (
    <main className="sc-stage">
      <div className="sc-desktop-context" aria-hidden="true">
        <BrandMark />
        <p>SafeCircle</p>
        <span>Get me home. We handle the rest.</span>
      </div>
      <section className="sc-phone" aria-label="SafeCircle trip coordinator">
        <header className="sc-header">
          <div className="sc-wordmark" aria-label="SafeCircle">
            <BrandMark small />
            <span>SafeCircle</span>
          </div>
          <IconButton
            aria-label="Open technical trip details"
            aria-expanded={technicalOpen}
            onClick={onTechnicalOpen}
          >
            <ShieldCheck size={18} strokeWidth={2} />
          </IconButton>
        </header>
        {children}
        <div className="sc-home-indicator" aria-hidden="true" />
      </section>

      <div
        className={`sc-technical-scrim${technicalOpen ? " is-open" : ""}`}
        onClick={onTechnicalClose}
        aria-hidden="true"
      />
      <aside
        className={`sc-technical-panel${technicalOpen ? " is-open" : ""}`}
        aria-hidden={!technicalOpen}
        inert={!technicalOpen}
        aria-label="Technical trip details"
      >
        <div className="sc-technical-header">
          <div>
            <p className="sc-eyebrow">Judge view</p>
            <h2>What SafeCircle did</h2>
          </div>
          <IconButton aria-label="Close technical trip details" onClick={onTechnicalClose}>
            <X size={19} />
          </IconButton>
        </div>
        {technicalPanel}
      </aside>
    </main>
  );
}
