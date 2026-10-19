import { useLayoutEffect } from "react";
import { useTheme } from "next-themes";
import { useCustomizationStore } from "../store/customizationStore";

// The gradient palette is an optional layer over the ordinary dark theme.
export function useThemeCustomizationSync() {
  const { resolvedTheme } = useTheme();
  const gradientThemeEnabled = useCustomizationStore((state) => state.gradientThemeEnabled);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (gradientThemeEnabled && resolvedTheme === "dark") {
      root.setAttribute("data-soniq-style", "gradient");
    } else {
      root.removeAttribute("data-soniq-style");
    }
    return () => root.removeAttribute("data-soniq-style");
  }, [gradientThemeEnabled, resolvedTheme]);
}
