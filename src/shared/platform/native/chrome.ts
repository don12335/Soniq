import { App } from "@capacitor/app";
import { Keyboard } from "@capacitor/keyboard";
import { StatusBar, Style } from "@capacitor/status-bar";
import { applyWindowVisibility } from "@/shared/utils/windowVisibility";

export type StatusBarTone = "light" | "dark";

// tone is the background behind the status bar: dark backgrounds need light text
export async function setStatusBarTone(tone: StatusBarTone): Promise<void> {
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

  try {
    void Keyboard.addListener("keyboardWillShow", () => {
      root.dataset.keyboard = "open";
    });
    void Keyboard.addListener("keyboardWillHide", () => {
      delete root.dataset.keyboard;
    });
  } catch {
    // keyboard plugin unavailable
  }
}
