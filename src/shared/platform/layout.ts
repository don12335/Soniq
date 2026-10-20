import { getPlatform, isNative } from "./platform";

export type LayoutMode = "desktop" | "mobile";

// Lets the mobile UI be built and previewed inside Electron dev on Windows.
export const LAYOUT_OVERRIDE_KEY = "soniq:layout";

function readOverride(): LayoutMode | null {
  try {
    const value = localStorage.getItem(LAYOUT_OVERRIDE_KEY);
    return value === "mobile" || value === "desktop" ? value : null;
  } catch {
    return null;
  }
}

function compute(): LayoutMode {
  if (isNative()) return "mobile";
  if (import.meta.env.DEV) return readOverride() ?? "desktop";
  return "desktop";
}

let cached: LayoutMode | null = null;

// Read once at boot; the layout does not switch on resize.
export function getLayoutMode(): LayoutMode {
  if (!cached) cached = compute();
  return cached;
}

export function isMobileLayout(): boolean {
  return getLayoutMode() === "mobile";
}

export function applyLayoutAttributes(root: HTMLElement = document.documentElement): void {
  root.dataset.layout = getLayoutMode();
  root.dataset.platform = getPlatform();
}

export function resetLayoutModeForTests(): void {
  cached = null;
}
