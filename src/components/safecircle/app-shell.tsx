import type { ReactNode } from "react";
import { ListTree } from "lucide-react";
import { BrandMark, IconButton } from "./primitives";

export function AppShell({ children, onTechnicalOpen }: { children: ReactNode; onTechnicalOpen: () => void }) {
  return (
    <main className="sc-stage">
      <div className="sc-desktop-context" aria-hidden="true">
        <BrandMark />
        <p>Beacon</p>
        <span>Get me home. We handle the rest.</span>
        <small>Interactive demo · simulated trip events</small>
      </div>
      <section className="sc-phone" aria-label="Beacon interactive demo">
        <header className="sc-header">
          <div className="sc-wordmark" aria-label="Beacon">
            <BrandMark small />
            <span>Beacon</span>
          </div>
          <div className="sc-header-actions">
            <span className="sc-demo-label">Interactive demo</span>
            <IconButton aria-label="Open technical demo details" onClick={onTechnicalOpen}>
              <ListTree size={19} />
            </IconButton>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}
