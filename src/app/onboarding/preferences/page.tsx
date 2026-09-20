"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PreferencesScreen } from "@/components/beacon/flow-screens";
import { readHomeDraft, readProfile, saveProfile } from "@/components/beacon/profile-storage";
import { defaultProfile } from "@/components/safecircle/mock-data";
import { validatedProfile } from "@/components/safecircle/demo-controller";

export default function PreferencesPage() {
  return (
    <Suspense fallback={<p role="status">Loading preferences…</p>}>
      <PreferencesContent />
    </Suspense>
  );
}

function PreferencesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const demoMode = searchParams.get("demo") === "1";
  const presenterMode = searchParams.get("presenter") === "1";
  const demoQuery = `?demo=1${presenterMode ? "&presenter=1" : ""}`;
  const [profile, setProfile] = useState(defaultProfile);
  useEffect(() => {
    const home = readHomeDraft();
    if (!home) { router.replace(demoMode ? `/onboarding/home${demoQuery}` : "/onboarding/home"); return; }
    queueMicrotask(() => setProfile({ ...(readProfile() ?? defaultProfile), homeName: home.homeName, homeAddress: home.homeAddress }));
  }, [demoMode, demoQuery, router]);
  return <PreferencesScreen profile={profile} onChange={setProfile} onBack={() => router.push(demoMode ? `/onboarding/home${demoQuery}` : "/onboarding/home")} onSave={() => {
    if (!validatedProfile(profile)) return;
    saveProfile(profile);
    router.replace(demoMode ? `/demo?walkthrough=1${presenterMode ? "&presenter=1" : ""}` : "/app");
  }} />;
}
