import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, Root } from "react-dom/client";
import { useThemeCustomizationSync } from "./useThemeCustomizationSync";
import { useCustomizationStore } from "../store/customizationStore";

let mockResolvedTheme = "light";

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: mockResolvedTheme,
  }),
}));

function Harness() {
  useThemeCustomizationSync();
  return null;
}

describe("useThemeCustomizationSync", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    useCustomizationStore.getState().resetAll();
    useCustomizationStore.getState().setGradientThemeEnabled(false);
    mockResolvedTheme = "light";
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount();
      });
      document.body.removeChild(container);
    }
    root = null;
    container = null;
    document.body.innerHTML = "";
  });

  function mount() {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(<Harness />);
    });
  }

  it("enables the gradient layer only when selected in dark mode", () => {
    mockResolvedTheme = "dark";
    useCustomizationStore.getState().setGradientThemeEnabled(true);
    mount();
    expect(document.documentElement.getAttribute("data-soniq-style")).toBe("gradient");
  });

  it("leaves the ordinary dark theme unchanged", () => {
    mockResolvedTheme = "dark";
    mount();
    expect(document.documentElement.hasAttribute("data-soniq-style")).toBe(false);
  });

  it("does not show the gradient layer when the resolved theme is light", () => {
    useCustomizationStore.getState().setGradientThemeEnabled(true);
    mount();
    expect(document.documentElement.hasAttribute("data-soniq-style")).toBe(false);
  });
});
