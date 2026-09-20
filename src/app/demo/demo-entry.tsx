"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BeaconFrame } from "@/components/beacon/flow-screens";
import { readProfile } from "@/components/beacon/profile-storage";
import { SafeCircleApp } from "@/components/safecircle/safe-circle-app";

export function DemoEntry({ walkthrough, manual = false, fixture = false, presenter = false }: { walkthrough: boolean; manual?: boolean; fixture?: boolean; presenter?: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (walkthrough || fixture) return;
    router.replace(readProfile() ? `/demo?walkthrough=1${presenter ? "&presenter=1" : ""}` : `/onboarding/welcome?demo=1${presenter ? "&presenter=1" : ""}`);
  }, [fixture, presenter, router, walkthrough]);

  if (fixture) return <SafeCircleApp demoControls localDemo fixture transport={null} />;

  if (walkthrough) return <SafeCircleApp presenter={presenter} demoControls={presenter} fixture={fixture} {...(manual ? { transport: null } : {})} />;

  return (
    <BeaconFrame>
      <p role="status" style={{ padding: 24, textAlign: "center" }}>
        Starting the complete Beacon walkthrough…
      </p>
    </BeaconFrame>
  );
}
