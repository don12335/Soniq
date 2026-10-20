import { isNative } from "../platform";
import type { StatusBarTone } from "./chrome";

let themeTone: StatusBarTone = "light";
let overrideTone: StatusBarTone | null = null;

function apply(): void {
  if (!isNative()) return;
  const tone = overrideTone ?? themeTone;
  void import("./chrome").then(({ applyStatusBarTone }) => applyStatusBarTone(tone));
}

// follows the app theme (light/dark background behind the status bar)
export function setThemeStatusBarTone(tone: StatusBarTone): void {
  themeTone = tone;
  apply();
}

// screens with their own background (the dark now-playing sheet) override it; null restores the theme
export function setStatusBarTone(tone: StatusBarTone | null): void {
  overrideTone = tone;
  apply();
}
