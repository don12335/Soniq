import { HashRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { ToastProvider, AppleEmojiProvider, RootErrorBoundary, GlobalTooltip, WindowAnimationContainer } from "@/shared/ui";
import { useWindowDrag } from "@/shared/hooks";
import { useAppIconSync } from "@/features/player";
import { I18nProvider, getStoredLocale } from "@/languages";
import { AuthLock } from "@/features/auth";
import { CoverSwRegistrar } from "@/features/covers";
import { useThemeCustomizationSync } from "@/features/settings";
import { useTouchBarSync } from "@/features/touchbar";
import { OverlayPlayer, useOverlaySync } from "@/features/overlay";
import { useDiscordSync } from "@/features/discord";
import { AppRoutes } from "./routes";
import DeeplinkHandler from "./DeeplinkHandler";
import EnvironmentWarning from "./EnvironmentWarning";
import { ConnectivityWall } from "@/features/connectivity";
import "./globals.css";
import "./soniq-liquid.css";

function AppIconSync() {
  useAppIconSync();
  return null;
}

function ThemeSync() {
  useThemeCustomizationSync();
  return null;
}

function TouchBarSync() {
  useTouchBarSync();
  return null;
}

function OverlaySync() {
  useOverlaySync();
  return null;
}

function DiscordSync() {
  useDiscordSync();
  return null;
}

export default function App() {
  const isOverlay = window.location.hash.startsWith("#/overlay");

  if (isOverlay) {
    // signing in is optional, so the overlay works for guests too.
    // it renders outside I18nProvider, so set <html lang> here
    document.documentElement.lang = getStoredLocale();

    return (
      <ThemeProvider
        attribute="data-theme"
        defaultTheme="dark"
        enableSystem={false}
        forcedTheme="dark"
      >
        <GlobalTooltip />
        <OverlayPlayer />
      </ThemeProvider>
    );
  }

  useWindowDrag();

  return (
    <HashRouter>
      <CoverSwRegistrar />
      <ThemeProvider
        attribute="data-theme"
        defaultTheme="system"
        enableSystem={true}
        disableTransitionOnChange
      >
        <GlobalTooltip />
        <ThemeSync />
        <AppIconSync />
        <TouchBarSync />
        <OverlaySync />
        <DiscordSync />
        <AppleEmojiProvider>
          <I18nProvider>
            <ToastProvider>
              <RootErrorBoundary>
                <WindowAnimationContainer>
                  <DeeplinkHandler />
                  <EnvironmentWarning />
                  <ConnectivityWall />
                  <AuthLock>
                    <AppRoutes />
                  </AuthLock>
                </WindowAnimationContainer>
              </RootErrorBoundary>
            </ToastProvider>
          </I18nProvider>
        </AppleEmojiProvider>
      </ThemeProvider>
    </HashRouter>
  );
}
