"use client";

import { useState } from "react";
import { Cable, FlaskConical } from "lucide-react";
import { AppShell } from "./app-shell";
import { ConnectedJourney } from "./connected-journey";
import { SafeCircleApp } from "./safe-circle-app";

type Mode = "choose" | "connected" | "fixture";

export function BeaconApp() {
  const [mode, setMode] = useState<Mode>("choose");
  if (mode === "connected") return <ConnectedJourney onFixtureMode={() => setMode("fixture")} />;
  if (mode === "fixture") return <SafeCircleApp onConnectedMode={() => setMode("connected")} />;
  return <AppShell modeLabel="Choose experience" onTechnicalOpen={() => setMode("connected")} technicalLabel="Open connected demo">
    <div className="sc-mode-chooser">
      <p className="sc-eyebrow">Beacon PWA</p><h1>Get home with fewer handoffs.</h1><p>Connect to the real local planner, or preview the deterministic UI fixture.</p>
      <button type="button" className="sc-mode-card is-primary" onClick={() => setMode("connected")}><Cable size={25} /><span><strong>Connected demo</strong><small>Pair this app and show only server-reported trip and agent activity.</small></span></button>
      <button type="button" className="sc-mode-card" onClick={() => setMode("fixture")}><FlaskConical size={25} /><span><strong>Fixture preview</strong><small>Timer-driven sample data for rehearsing the interface. Nothing here is live.</small></span></button>
      <p className="sc-mode-boundary">Simulated transportation is always labeled. Beacon is not emergency dispatch.</p>
    </div>
  </AppShell>;
}
