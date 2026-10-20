/// <reference types="vite/client" />
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_TARGET?: "desktop" | "ios" | "android";
}

interface Window {
  // Injected by the Capacitor native shell; absent on desktop and web.
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  };
}
