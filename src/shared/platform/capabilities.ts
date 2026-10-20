import { isElectron, isIOS, isNative } from "./platform";

export interface Capabilities {
  windowControls: boolean;
  overlay: boolean;
  discord: boolean;
  touchBar: boolean;
  globalShortcuts: boolean;
  autoUpdate: boolean;
  openFolders: boolean;
  nativeCacheStats: boolean;
  // WEB_REMIX streams need a PoToken minted in a hidden youtube.com window; native shells have none
  poToken: boolean;
  // iOS ignores writes to audio.volume
  volumeControl: boolean;
  // pitch/reverb route audio through WebAudio, which iOS suspends in the background
  audioEffects: boolean;
  crossOriginMedia: boolean;
  // <audio> streams remote URLs through the shell's soniq-media:// proxy (iOS)
  mediaProxy: boolean;
  preferredCodec: "aac" | undefined;
}

function compute(): Capabilities {
  const electron = isElectron();
  const ios = isIOS();
  return {
    windowControls: electron,
    overlay: electron,
    discord: electron,
    touchBar: electron,
    globalShortcuts: electron,
    autoUpdate: electron,
    openFolders: electron,
    nativeCacheStats: electron,
    poToken: !isNative(),
    volumeControl: !ios,
    audioEffects: !isNative(),
    crossOriginMedia: !isNative(),
    mediaProxy: ios,
    preferredCodec: ios ? "aac" : undefined,
  };
}

let cached: Capabilities | null = null;

export function getCapabilities(): Capabilities {
  if (!cached) cached = Object.freeze(compute());
  return cached;
}

export function resetCapabilitiesForTests(): void {
  cached = null;
}
