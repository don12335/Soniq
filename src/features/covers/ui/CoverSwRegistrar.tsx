import { useEffect } from "react";
import { isNative } from "@/shared/platform";

export function CoverSwRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // service workers don't run on Electron's file: pages or Capacitor's capacitor:// scheme
    const isElectron =
      window.location.protocol === "file:" ||
      typeof (window as any).linerElectron !== "undefined";

    if (isElectron || isNative()) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) {
          void reg.unregister();
        }
      });
      return;
    }

    navigator.serviceWorker
      .register("/cover-sw.js", { scope: "/" })
      .catch(() => {
        // SW registration failure is non-fatal — images still load, just uncached.
      });
  }, []);

  return null;
}
