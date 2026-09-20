"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import styles from "./launch-animation.module.css";

const INTRO_ANIMATION_DURATION_MS = 1_650;

export function LaunchAnimation() {
  const router = useRouter();
  const transitionTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (transitionTimer.current !== null) {
        window.clearTimeout(transitionTimer.current);
      }
    };
  }, []);

  function startTransitionTimer() {
    if (transitionTimer.current !== null) return;

    transitionTimer.current = window.setTimeout(() => {
      router.replace("/");
    }, INTRO_ANIMATION_DURATION_MS);
  }

  return (
    <main className={styles.launch} data-testid="launch-animation">
      <Image
        className={styles.heroAnimation}
        src="/beacon_logo_animation_clean_upward_pop.webp"
        alt="Beacon"
        width={1035}
        height={990}
        priority
        unoptimized
        onLoad={startTransitionTimer}
        onError={() => router.replace("/")}
      />
    </main>
  );
}
