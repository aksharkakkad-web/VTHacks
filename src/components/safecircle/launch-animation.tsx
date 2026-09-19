"use client";

import { useEffect, useState } from "react";
import styles from "./launch-animation.module.css";

const LAUNCH_DURATION_MS = 2300;

export function LaunchAnimation() {
  const [visible, setVisible] = useState(true);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (motionPreference.matches) {
      const frame = window.requestAnimationFrame(() => setVisible(false));
      return () => window.cancelAnimationFrame(frame);
    }

    let timer: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      setStarted(true);
      timer = window.setTimeout(() => setVisible(false), LAUNCH_DURATION_MS);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`${styles.launch}${started ? ` ${styles.isAnimating}` : ""}`}
      data-testid="launch-animation"
      aria-hidden="true"
    >
      <div className={styles.lockup}>
        <svg
          className={styles.routeGraphic}
          viewBox="0 0 280 224"
          role="presentation"
          focusable="false"
        >
          <path
            className={`${styles.geometry} ${styles.geometryOne}`}
            pathLength="1"
            d="M14 170C43 170 47 140 79 140H94"
          />
          <path
            className={`${styles.geometry} ${styles.geometryTwo}`}
            pathLength="1"
            d="M191 79H213C238 79 238 53 266 53"
          />
          <path
            className={`${styles.geometry} ${styles.geometryThree}`}
            pathLength="1"
            d="M189 161H222C239 161 245 180 266 180"
          />
          <path
            className={`${styles.geometry} ${styles.geometryFour}`}
            pathLength="1"
            d="M58 47H78C91 47 96 61 96 76"
          />

          <circle className={styles.routeNode} cx="14" cy="170" r="4" />
          <circle className={styles.routeNode} cx="266" cy="53" r="4" />
          <circle className={styles.routeNode} cx="266" cy="180" r="4" />
          <circle className={styles.routeNode} cx="58" cy="47" r="4" />

          <circle className={styles.logoField} cx="140" cy="112" r="66" />
          <circle className={styles.orbit} cx="140" cy="112" r="62" />

          <g className={styles.signalOrbit}>
            <circle className={styles.signalHalo} cx="184" cy="68" r="10" />
            <circle className={styles.signal} cx="184" cy="68" r="6" />
          </g>

          <circle className={styles.core} cx="145" cy="124" r="34" />
        </svg>

        <div className={styles.typeLockup}>
          <p className={styles.wordmark}>SafeCircle</p>
          <p className={styles.tagline}>Get home. We handle the rest.</p>
        </div>
      </div>
    </div>
  );
}
