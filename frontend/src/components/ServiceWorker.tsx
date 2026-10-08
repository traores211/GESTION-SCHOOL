"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (public/sw.js) that makes the app installable and keeps visited
 * pages available offline. Production only: in development it would serve stale bundles.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installation is a comfort, never a blocker.
    });
  }, []);
  return null;
}
