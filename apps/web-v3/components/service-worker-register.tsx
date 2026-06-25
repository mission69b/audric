"use client";

import { useEffect } from "react";

// Registers the minimal PWA service worker (public/sw.js) so the app is
// installable on Android / desktop Chrome. iOS "Add to Home Screen" works
// without it. Progressive enhancement only — no-op when unsupported, and any
// failure is swallowed so it can never block the app.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // PWA install is optional — ignore registration failures.
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
