"use client";

import { useEffect } from "react";

/** Cache only the public offline document, never a trip or provider response. */
export function PwaRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Installation is an enhancement; the online app remains usable.
    });
  }, []);
  return null;
}
