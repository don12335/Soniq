import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useTheme } from "next-themes";
import { debouncedStorage } from "@/shared/utils/storage";
import ambientImage from "@/assets/ambient/soniq-ambient.webp";

export interface BlockCustomization {
  opacity: number;
  blur: number;
  dim: number;
}

export interface CustomizationState {
  backgroundImage: string | null;
  backgroundBlur: number;
  backgroundDim: number;
  sidebar: BlockCustomization;
  contentView: BlockCustomization;
  miniplayer: BlockCustomization;
  // Soniq's built-in fog background, used in Gradient mode without a wallpaper
  ambientEnabled: boolean;
  gradientThemeEnabled: boolean;

  setAmbientEnabled: (enabled: boolean) => void;
  setGradientThemeEnabled: (enabled: boolean) => void;
  // a Blob (uploaded file) or a legacy data URL string; state keeps a displayable URL
  setBackgroundImage: (image: WallpaperSource | null) => void;
  setBackgroundBlur: (blur: number) => void;
  setBackgroundDim: (dim: number) => void;
  setBlockConfig: (
    block: "sidebar" | "contentView" | "miniplayer",
    patch: Partial<BlockCustomization>,
  ) => void;
  applyToAllBlocks: (sourceBlock: "sidebar" | "contentView" | "miniplayer") => void;
  resetBlock: (block: "sidebar" | "contentView" | "miniplayer") => void;
  resetAll: () => void;
}

export const MIN_OPACITY = 25;
export const MAX_OPACITY = 100;
export const MIN_BLUR = 10;
export const MAX_BLUR = 40;
export const MIN_DIM = 8;
export const MAX_DIM = 85;

export const DEFAULT_BLOCK_CONFIG: BlockCustomization = {
  opacity: 100,
  blur: 0,
  dim: 0,
};

export const DEFAULT_GLASS_CONFIG: BlockCustomization = {
  opacity: 60,
  blur: 20,
  dim: 15,
};

const DB_NAME = "liner_customization_db";
const STORE_NAME = "wallpapers";
const BG_KEY = "active_wallpaper";

// opens simple indexeddb instance for wallpaper storage
function openWallpaperDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// wallpapers are stored as Blobs (large files would bloat into huge base64
// strings); older versions stored data URL strings, which are still accepted
export type WallpaperSource = Blob | string;

async function loadPersistedWallpaperSource(): Promise<WallpaperSource | null> {
  const db = await openWallpaperDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(BG_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// saves wallpaper payload to indexeddb
async function savePersistedWallpaper(data: WallpaperSource | null): Promise<void> {
  const db = await openWallpaperDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = data ? store.put(data, BG_KEY) : store.delete(BG_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export const clampBlockConfig = (cfg: Partial<BlockCustomization>): BlockCustomization => {
  const opacity = typeof cfg.opacity === "number"
    ? Math.max(MIN_OPACITY, Math.min(MAX_OPACITY, Math.round(cfg.opacity)))
    : DEFAULT_BLOCK_CONFIG.opacity;

  const blur = typeof cfg.blur === "number"
    ? Math.max(MIN_BLUR, Math.min(MAX_BLUR, Math.round(cfg.blur)))
    : DEFAULT_BLOCK_CONFIG.blur;

  const dim = typeof cfg.dim === "number"
    ? Math.max(MIN_DIM, Math.min(MAX_DIM, Math.round(cfg.dim)))
    : DEFAULT_BLOCK_CONFIG.dim;

  return { opacity, blur, dim };
};

export const wallpaperBroadcast =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("liner_wallpaper_sync")
    : null;

// object URL currently shown by this window, revoked once replaced
let currentObjectUrl: string | null = null;

function applyWallpaper(source: WallpaperSource | null): void {
  const previousUrl = currentObjectUrl;
  currentObjectUrl = null;
  let url: string | null = null;
  if (typeof source === "string") {
    url = source;
  } else if (source) {
    url = URL.createObjectURL(source);
    currentObjectUrl = url;
  }
  useCustomizationStore.setState({ backgroundImage: url });
  if (previousUrl) URL.revokeObjectURL(previousUrl);
}

// each window (main app, overlay) reads the wallpaper from indexeddb itself
export async function reloadPersistedWallpaper(): Promise<void> {
  applyWallpaper(await loadPersistedWallpaperSource());
}

// only a change signal is broadcast; receivers reload from indexeddb, so a
// large image is never copied between windows
function persistAndBroadcast(source: WallpaperSource | null): void {
  void savePersistedWallpaper(source).then(() => {
    wallpaperBroadcast?.postMessage({ type: "wallpaper_changed" });
  });
}

if (wallpaperBroadcast) {
  wallpaperBroadcast.onmessage = (e) => {
    if (e.data?.type === "wallpaper_changed") {
      void reloadPersistedWallpaper();
    }
  };
}

export const useCustomizationStore = create<CustomizationState>()(
  persist(
    (set, get) => ({
      backgroundImage: null,
      backgroundBlur: 0,
      backgroundDim: 0,
      sidebar: { ...DEFAULT_BLOCK_CONFIG },
      contentView: { ...DEFAULT_BLOCK_CONFIG },
      miniplayer: { ...DEFAULT_BLOCK_CONFIG },
      ambientEnabled: true,
      gradientThemeEnabled: false,

      setAmbientEnabled: (ambientEnabled) => set({ ambientEnabled }),
      setGradientThemeEnabled: (gradientThemeEnabled) => set({ gradientThemeEnabled }),

      setBackgroundImage: (image) => {
        const prev = get().backgroundImage;
        applyWallpaper(image);
        persistAndBroadcast(image);

        // if user just added first background and blocks are fully opaque, apply balanced glass preset
        if (image && !prev) {
          const currentSidebar = get().sidebar;
          const currentContent = get().contentView;
          const currentMiniplayer = get().miniplayer;
          const allDefault =
            currentSidebar.opacity === 100 &&
            currentContent.opacity === 100 &&
            currentMiniplayer.opacity === 100 &&
            currentSidebar.blur === 0 &&
            currentContent.blur === 0 &&
            currentMiniplayer.blur === 0;

          if (allDefault) {
            set({
              sidebar: { ...DEFAULT_GLASS_CONFIG },
              contentView: { ...DEFAULT_GLASS_CONFIG },
              miniplayer: { ...DEFAULT_GLASS_CONFIG },
            });
          }
        } else if (!image) {
          set({
            backgroundBlur: 0,
            backgroundDim: 0,
            sidebar: { ...DEFAULT_BLOCK_CONFIG },
            contentView: { ...DEFAULT_BLOCK_CONFIG },
            miniplayer: { ...DEFAULT_BLOCK_CONFIG },
          });
        }
      },

      setBackgroundBlur: (blur) => {
        const clamped = Math.max(0, Math.min(40, Math.round(blur)));
        set({ backgroundBlur: clamped });
      },

      setBackgroundDim: (dim) => {
        const clamped = Math.max(0, Math.min(85, Math.round(dim)));
        set({ backgroundDim: clamped });
      },

      setBlockConfig: (block, patch) => {
        set((state) => ({
          [block]: {
            ...state[block],
            ...clampBlockConfig({
              ...state[block],
              ...patch,
            }),
          },
        }));
      },

      applyToAllBlocks: (sourceBlock) => {
        const src = get()[sourceBlock];
        const cloned = { ...src };
        set({
          sidebar: { ...cloned },
          contentView: { ...cloned },
          miniplayer: { ...cloned },
        });
      },

      resetBlock: (block) => {
        set((state) => ({
          [block]: state.backgroundImage
            ? { ...DEFAULT_GLASS_CONFIG }
            : { ...DEFAULT_BLOCK_CONFIG },
        }));
      },

      resetAll: () => {
        applyWallpaper(null);
        persistAndBroadcast(null);
        set({
          backgroundBlur: 0,
          backgroundDim: 0,
          sidebar: { ...DEFAULT_BLOCK_CONFIG },
          contentView: { ...DEFAULT_BLOCK_CONFIG },
          miniplayer: { ...DEFAULT_BLOCK_CONFIG },
        });
      },
    }),
    {
      name: "liner_customization_v1",
      storage: createJSONStorage(() => debouncedStorage),
      partialize: (state) => ({
        backgroundBlur: state.backgroundBlur,
        backgroundDim: state.backgroundDim,
        sidebar: state.sidebar,
        contentView: state.contentView,
        miniplayer: state.miniplayer,
        ambientEnabled: state.ambientEnabled,
        gradientThemeEnabled: state.gradientThemeEnabled,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.sidebar = clampBlockConfig(state.sidebar || {});
        state.contentView = clampBlockConfig(state.contentView || {});
        state.miniplayer = clampBlockConfig(state.miniplayer || {});
        void reloadPersistedWallpaper();
      },
    },
  ),
);

function getIsDarkTheme(): boolean {
  if (typeof document === "undefined") return false;
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark") return true;
  if (attr === "light") return false;
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") return true;
    if (saved === "light") return false;
  } catch {}
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
}

export function useIsContentTransparent(): boolean {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme ? resolvedTheme === "dark" : getIsDarkTheme();
  const backgroundImage = useCustomizationStore(selectEffectiveBackground);
  const opacity = useCustomizationStore(selectBlockConfig("contentView")).opacity;
  return Boolean(isDark && backgroundImage && opacity < 100);
}

// --- effective background ------------------------------------------------------
// A wallpaper the user picked always wins. In Gradient mode, the built-in ambient
// fog is shown with its own glass preset. The fog is already soft, so the panels
// skip live blur entirely: translucency alone gives the look without the cost.

export const AMBIENT_BLOCK_CONFIG: BlockCustomization = { opacity: 64, blur: 0, dim: 0 };

type BackgroundState = Pick<CustomizationState, "backgroundImage" | "ambientEnabled" | "gradientThemeEnabled">;

export const selectUsesAmbient = (state: BackgroundState): boolean =>
  !state.backgroundImage && state.ambientEnabled && state.gradientThemeEnabled;

export const selectEffectiveBackground = (state: BackgroundState): string | null =>
  state.backgroundImage ?? (selectUsesAmbient(state) ? ambientImage : null);

export const selectBackgroundBlur = (state: CustomizationState): number =>
  selectUsesAmbient(state) ? 0 : state.backgroundBlur;

export const selectBackgroundDim = (state: CustomizationState): number =>
  selectUsesAmbient(state) ? 0 : state.backgroundDim;

export const selectBlockConfig =
  (block: "sidebar" | "contentView" | "miniplayer") =>
  (state: CustomizationState): BlockCustomization =>
    selectUsesAmbient(state) ? AMBIENT_BLOCK_CONFIG : state[block];

export function getBlockStyle(
  config: BlockCustomization,
  isDark: boolean,
  hasCustomBg: boolean,
): React.CSSProperties {
  if (!hasCustomBg || !isDark) {
    return {};
  }

  if (config.opacity === 100) {
    return {
      background: "var(--color-bg-primary, #0a0a0a)",
      ["--glass-pill-border" as any]: "none",
    };
  }

  const alpha = config.opacity / 100;
  const dimAlpha = config.dim / 100;
  const baseRgb = "10, 10, 10";

  let bg: string;
  if (dimAlpha > 0) {
    bg = `linear-gradient(rgba(0, 0, 0, ${dimAlpha}), rgba(0, 0, 0, ${dimAlpha})), rgba(${baseRgb}, ${alpha})`;
  } else {
    bg = `rgba(${baseRgb}, ${alpha})`;
  }

  const t = (100 - config.opacity) / 75;

  const glassPillBg = `linear-gradient(135deg, rgba(0, 0, 0, ${(0.55 - 0.35 * t).toFixed(3)}) 0%, rgba(0, 0, 0, ${(0.45 - 0.30 * t).toFixed(3)}) 100%)`;
  const glassPillBgHover = `linear-gradient(135deg, rgba(0, 0, 0, ${(0.70 - 0.35 * t).toFixed(3)}) 0%, rgba(0, 0, 0, ${(0.58 - 0.32 * t).toFixed(3)}) 100%)`;
  const glassPillBorder = "none";

  const glassBlur = `${Math.round(8 + 16 * t)}px`;
  const glassProminentBg = `rgba(255, 255, 255, ${(1 - 0.18 * t).toFixed(2)})`;

  return {
    background: bg,
    boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.07), inset 0 0 0 1px rgba(255, 255, 255, 0.045)",
    backdropFilter: config.blur > 0 ? `blur(${config.blur}px)` : undefined,
    WebkitBackdropFilter: config.blur > 0 ? `blur(${config.blur}px)` : undefined,
    ["--glass-pill-bg" as any]: glassPillBg,
    ["--glass-pill-bg-hover" as any]: glassPillBgHover,
    ["--glass-pill-border" as any]: glassPillBorder,
    ["--glass-blur" as any]: glassBlur,
    ["--glass-prominent-bg" as any]: glassProminentBg,
  };
}

// checks if custom wallpaper is set and at least one interface block has transparent blur
export function isGlassThemeActive(state: {
  backgroundImage: string | null;
  sidebar: BlockCustomization;
  contentView: BlockCustomization;
  miniplayer: BlockCustomization;
}): boolean {
  if (!state.backgroundImage) return false;
  return [state.sidebar, state.contentView, state.miniplayer].some(
    (b) => b.opacity < 100 && b.blur > 0,
  );
}

export const selectIsGlassThemeActive = (state: CustomizationState): boolean =>
  isGlassThemeActive(state);
