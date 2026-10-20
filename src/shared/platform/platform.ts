export type Platform = "electron" | "ios" | "android" | "web";
export type BuildTarget = "desktop" | "ios" | "android";

// Read the Capacitor global instead of importing @capacitor/core so desktop never loads it.
function nativePlatform(): "ios" | "android" | null {
  if (typeof window === "undefined") return null;
  const capacitor = window.Capacitor;
  if (!capacitor?.isNativePlatform?.()) return null;
  const name = capacitor.getPlatform?.();
  return name === "ios" || name === "android" ? name : null;
}

export function getBuildTarget(): BuildTarget {
  const target = import.meta.env.VITE_TARGET;
  return target === "ios" || target === "android" ? target : "desktop";
}

export function getPlatform(): Platform {
  if (typeof window !== "undefined" && window.linerElectron) return "electron";
  return nativePlatform() ?? "web";
}

export function isElectron(): boolean {
  return getPlatform() === "electron";
}

export function isNative(): boolean {
  return nativePlatform() !== null;
}

export function isIOS(): boolean {
  return nativePlatform() === "ios";
}
