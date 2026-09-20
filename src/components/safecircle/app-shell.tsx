import type { ReactNode } from "react";
import { ListTree } from "lucide-react";
import { BrandMark, IconButton } from "./primitives";

export function AppShell({ children, onTechnicalOpen, modeLabel = "Fixture preview", technicalLabel = "Open fixture technical details" }: { children: ReactNode; onTechnicalOpen: () => void; modeLabel?: string; technicalLabel?: string }) {
  return (
    <main className="sc-stage">
      <div className="sc-desktop-context" aria-hidden="true">
        <BrandMark />
        <p>SafeCircle</p>
        <span>Get me home. We handle the rest.</span>
        <small>{modeLabel}</small>
      </div>
      <section className="sc-phone" aria-label="SafeCircle interactive demo">
        <header className="sc-header">
          <div className="sc-wordmark" aria-label="SafeCircle">
            <BrandMark small />
            <span>SafeCircle</span>
          </div>
          <div className="sc-header-actions">
            <span className="sc-demo-label">{modeLabel}</span>
            <IconButton aria-label={technicalLabel} onClick={onTechnicalOpen}>
              <ListTree size={19} />
            </IconButton>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}
