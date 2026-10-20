import { useMemo } from "react";
import { useTheme } from "next-themes";
import {
  selectEffectiveBackground,
  selectBackgroundBlur,
  selectBackgroundDim,
  selectBlockConfig,
  selectUsesAmbient,
} from "@/features/settings/store/customizationStore";
import { useCustomizationStore, getBlockStyle } from "@/features/settings";

// Wallpaper / gradient-theme background shared by the desktop (AppFrame) and phone (MobileShell) shells.
export function useShellBackground() {
  const { resolvedTheme } = useTheme();
  const isDark =
    resolvedTheme
      ? resolvedTheme === "dark"
      : typeof document !== "undefined" &&
        (document.documentElement.getAttribute("data-theme") === "dark" ||
          (!document.documentElement.getAttribute("data-theme") &&
            window.matchMedia?.("(prefers-color-scheme: dark)")?.matches));
  const backgroundImage = useCustomizationStore(selectEffectiveBackground);
  const gradientThemeEnabled = useCustomizationStore((state) => state.gradientThemeEnabled);
  const backgroundBlur = useCustomizationStore(selectBackgroundBlur);
  const backgroundDim = useCustomizationStore(selectBackgroundDim);
  const contentViewConfig = useCustomizationStore(selectBlockConfig("contentView"));

  const hasCustomBg = Boolean(backgroundImage && isDark);
  const usesAmbient = useCustomizationStore(selectUsesAmbient) && hasCustomBg;

  const mainStyle = useMemo(
    () => getBlockStyle(contentViewConfig, isDark, hasCustomBg),
    [contentViewConfig, isDark, hasCustomBg],
  );

  return {
    isDark: Boolean(isDark),
    backgroundImage,
    gradientThemeEnabled,
    backgroundBlur,
    backgroundDim,
    hasCustomBg,
    usesAmbient,
    mainStyle,
  };
}

export type ShellBackgroundState = ReturnType<typeof useShellBackground>;

export function ShellBackground({
  background,
  className = "",
}: {
  background: ShellBackgroundState;
  className?: string;
}) {
  const { hasCustomBg, backgroundImage, backgroundBlur, backgroundDim, gradientThemeEnabled, usesAmbient } = background;
  if (!hasCustomBg || !backgroundImage) return null;

  return (
    <div
      className={`absolute inset-0 z-0 pointer-events-none overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <img
        src={backgroundImage}
        alt=""
        className="w-full h-full object-cover select-none"
        style={{
          filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined,
          transform: backgroundBlur > 0 ? "scale(1.05)" : undefined,
        }}
      />
      {backgroundDim > 0 && (
        <div
          className="absolute inset-0 bg-black"
          style={{ opacity: backgroundDim / 100 }}
        />
      )}
      {/* tint the user's wallpaper toward the Soniq palette; the built-in fog already is */}
      {gradientThemeEnabled && !usesAmbient && <div className="soniq-fog" aria-hidden="true" />}
    </div>
  );
}
