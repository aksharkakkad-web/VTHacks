"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import styles from "./splash.module.css";
import { readProfile } from "@/components/beacon/profile-storage";

export default function BeaconSplashPage() {
  const router = useRouter();
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("gallery")) return;
    router.prefetch("/onboarding/welcome");
    queueMicrotask(() => router.replace(readProfile() ? "/app" : "/onboarding/welcome"));
  }, [router]);
  return (
    <main className={styles.stage} aria-label="Opening Beacon">
      <div className={styles.content}>
        <Image className={styles.logo} src="/beacon-welcome-logo.webp" alt="Beacon" width={1254} height={1254} priority />
        <p role="status">Checking Beacon…</p>
      </div>
    </main>
  );
}
