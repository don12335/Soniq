import { App } from "@capacitor/app";
import { Keyboard } from "@capacitor/keyboard";
import { StatusBar, Style } from "@capacitor/status-bar";
import { applyWindowVisibility } from "@/shared/utils/windowVisibility";

export type StatusBarTone = "light" | "dark";

// tone is the background behind the status bar: dark backgrounds need light text
export async function applyStatusBarTone(tone: StatusBarTone): Promise<void> {
  try {
    await StatusBar.setStyle({ style: tone === "dark" ? Style.Dark : Style.Light });
  } catch {
    // not available on this platform
  }
}

export async function initNativeChrome(): Promise<void> {
  const root = document.documentElement;

  void App.addListener("appStateChange", ({ isActive }) => {
    applyWindowVisibility(isActive);
  });

  // The web view isn't resized for the keyboard (Keyboard.resize "none"), so bottom-anchored
  // sheets lift themselves by --keyboard-h. iOS also scrolls the page to reveal the focused
  // field and doesn't scroll it back, which leaves the fixed layout shifted after the keyboard closes.
  try {
    void Keyboard.addListener("keyboardWillShow", ({ keyboardHeight }) => {
      root.dataset.keyboard = "open";
      root.style.setProperty("--keyboard-h", `${keyboardHeight}px`);
    });
    void Keyboard.addListener("keyboardWillHide", () => {
      delete root.dataset.keyboard;
      root.style.setProperty("--keyboard-h", "0px");
    });
    void Keyboard.addListener("keyboardDidHide", () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  } catch {
    // keyboard plugin unavailable
  }
}
