"use client";

import { useEffect, useState } from "react";
import { AppShell } from "./app-shell";
import { MapSurface } from "./map-surface";
import { ConsumerScreen } from "./screens";
import { TechnicalPanel } from "./technical-panel";
import type { DemoScreen } from "./types";

const timedTransitions: Partial<Record<DemoScreen, { next: DemoScreen; delay: number }>> = {
  searching: { next: "recommendation", delay: 2700 },
  verifying: { next: "active", delay: 1900 },
  cancelled: { next: "replanning", delay: 1450 },
  replanning: { next: "replacement", delay: 2450 },
  replacement: { next: "replacement-active", delay: 2700 },
};

export function SafeCircleApp() {
  const [screen, setScreen] = useState<DemoScreen>("home");
  const [technicalOpen, setTechnicalOpen] = useState(false);

  useEffect(() => {
    const transition = timedTransitions[screen];
    if (!transition || technicalOpen) return;
    const timer = window.setTimeout(() => setScreen(transition.next), transition.delay);
    return () => window.clearTimeout(timer);
  }, [screen, technicalOpen]);

  function handlePrimary() {
    if (screen === "home") setScreen("searching");
    else if (screen === "recommendation") setScreen("verifying");
    else if (screen === "arrival") setScreen("home");
  }

  function jumpTo(next: DemoScreen) {
    setScreen(next);
    setTechnicalOpen(false);
  }

  function handleHelp() {
    window.alert("If you are in immediate danger, call 911. You can also call Virginia Tech Police or your trusted contact, Maya.");
  }

  return (
    <AppShell
      technicalOpen={technicalOpen}
      onTechnicalOpen={() => setTechnicalOpen(true)}
      onTechnicalClose={() => setTechnicalOpen(false)}
      technicalPanel={
        <TechnicalPanel
          screen={screen}
          onJump={jumpTo}
          onCancel={() => jumpTo("cancelled")}
          onArrive={() => jumpTo("arrival")}
          onReset={() => jumpTo("home")}
        />
      }
    >
      {screen !== "arrival" && <MapSurface screen={screen} />}
      <ConsumerScreen
        screen={screen}
        onPrimary={handlePrimary}
        onDetails={() => setTechnicalOpen(true)}
        onHelp={handleHelp}
      />
    </AppShell>
  );
}
