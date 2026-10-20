import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import HomePage from "@/features/home/ui/HomePage";
import PageTransition from "@/features/navigation/ui/PageTransition";
import { ShellBackground, useShellBackground } from "@/features/navigation/ui/ShellBackground";
import { playerEngine, usePlayerStore } from "@/features/player";
import {
  AddToPlaylistModal,
  AddToLibraryModal,
  RemoveFromPlaylistModal,
  RemoveFromLibraryModal,
  ImportLikesModal,
  ImportReviewModal,
  CreatePlaylistModal,
} from "@/features/library";
import { setThemeStatusBarTone } from "@/shared/platform/native/statusBarTone";
import { useTouchScrollClickGuard } from "@/shared/hooks/useTouchScrollClickGuard";
import MobileTabBar from "./navigation/MobileTabBar";
import MobileMiniPlayer from "./player/MobileMiniPlayer";
import MobileNowPlaying from "./player/MobileNowPlaying";
import MobileSearchPage from "./search/MobileSearchPage";
import { MobileSettingsPage, MobileSettingsTabPage } from "./settings/MobileSettingsPage";

const LibraryPage = lazy(() => import("@/features/library/ui/LibraryPage"));
const PlaylistPage = lazy(() => import("@/features/library/ui/PlaylistPage"));
const ArtistPage = lazy(() => import("@/features/artist/ui/ArtistPage"));
const CollectionPage = lazy(() => import("@/features/collection/ui/CollectionPage"));

// /player is a sheet on phones, not a page
function OpenNowPlaying() {
  const setFullscreen = usePlayerStore((state) => state.setFullscreen);
  useEffect(() => {
    setFullscreen(true);
  }, [setFullscreen]);
  return <Navigate to="/" replace />;
}

function MobileRoutes() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        {/* the search page stays mounted in MobileShell so the query survives navigation */}
        <Route path="/search" element={null} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/library/playlist" element={<PlaylistPage />} />
        <Route path="/artist" element={<ArtistPage />} />
        <Route path="/collection" element={<CollectionPage />} />
        <Route path="/settings" element={<MobileSettingsPage />} />
        <Route path="/settings/:tab" element={<MobileSettingsTabPage />} />
        <Route path="/player" element={<OpenNowPlaying />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

// Phone layout: page content, a mini player above a bottom tab bar, and a full-screen
// now-playing sheet. Desktop uses AppFrame instead (see AuthLock).
export default function MobileShell() {
  useTouchScrollClickGuard();
  const { pathname, search } = useLocation();
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const isSearch = pathname === "/search";

  const fullscreenOpen = usePlayerStore((state) => state.fullscreen);
  const setFullscreen = usePlayerStore((state) => state.setFullscreen);

  const shouldShowMiniPlayer = useSyncExternalStore(
    playerEngine.subscribe,
    () => {
      const state = playerEngine.getSnapshot();
      return state.currentTrack !== null && state.status !== "idle";
    },
    () => false,
  );
  const hasCurrentTrack = useSyncExternalStore(
    playerEngine.subscribe,
    () => playerEngine.getSnapshot().currentTrack !== null,
    () => false,
  );

  const { resolvedTheme } = useTheme();
  // wallpaper / gradient theme (ambient background), same as the desktop shell
  const shellBackground = useShellBackground();
  const { hasCustomBg, usesAmbient, mainStyle } = shellBackground;
  useEffect(() => {
    setThemeStatusBarTone(resolvedTheme === "dark" ? "dark" : "light");
  }, [resolvedTheme]);

  const openNowPlaying = useCallback(() => setFullscreen(true), [setFullscreen]);
  const closeNowPlaying = useCallback(() => setFullscreen(false), [setFullscreen]);

  useEffect(() => {
    if (fullscreenOpen && !hasCurrentTrack) setFullscreen(false);
  }, [fullscreenOpen, hasCurrentTrack, setFullscreen]);

  // navigating from inside the sheet (artist link, song menu) should reveal the page
  const prevLocationRef = useRef(pathname + search);
  useEffect(() => {
    if (prevLocationRef.current === pathname + search) return;
    prevLocationRef.current = pathname + search;
    if (pathname !== "/player") setFullscreen(false);
  }, [pathname, search, setFullscreen]);

  useLayoutEffect(() => {
    const main = mainScrollRef.current;
    if (!main) return;
    main.scrollTop = 0;
    main.querySelectorAll(".overflow-y-auto").forEach((el) => {
      el.scrollTop = 0;
    });
  }, [pathname, search]);

  const bottomReserve = shouldShowMiniPlayer
    ? "calc(var(--m-tab-h) + var(--m-mini-h) + 12px + var(--safe-bottom))"
    : "calc(var(--m-tab-h) + var(--safe-bottom))";

  return (
    <div
      data-custom-bg={hasCustomBg ? "true" : undefined}
      data-ambient={usesAmbient ? "true" : undefined}
      className="relative flex h-full w-full flex-col overflow-hidden bg-bg-primary"
    >
      <ShellBackground background={shellBackground} />
      <div className={`relative shrink-0 ${hasCustomBg ? "" : "bg-bg-primary"}`} style={{ height: "var(--safe-top)" }} />

      <main
        data-custom-bg={hasCustomBg ? "true" : undefined}
        className="relative min-h-0 flex-1"
        style={{ ...(hasCustomBg ? { ...mainStyle, boxShadow: undefined } : {}), paddingBottom: bottomReserve }}
      >
        <div ref={mainScrollRef} className={`h-full overflow-x-hidden overflow-y-auto ${isSearch ? "hidden" : ""}`}>
          <PageTransition>
            <MobileRoutes />
          </PageTransition>
        </div>
        <div className={`h-full ${isSearch ? "" : "hidden"}`}>
          <MobileSearchPage />
        </div>
      </main>

      {shouldShowMiniPlayer && (
        <div
          className="absolute inset-x-0 z-[41] in-data-[keyboard=open]:hidden"
          style={{ bottom: "calc(var(--m-tab-h) + var(--safe-bottom) + 6px)" }}
        >
          <MobileMiniPlayer onOpen={openNowPlaying} />
        </div>
      )}

      <MobileTabBar translucent={hasCustomBg} />

      <AnimatePresence>
        {fullscreenOpen && hasCurrentTrack && <MobileNowPlaying key="now-playing" onClose={closeNowPlaying} />}
      </AnimatePresence>

      <AddToPlaylistModal />
      <AddToLibraryModal />
      <RemoveFromPlaylistModal />
      <RemoveFromLibraryModal />
      <ImportLikesModal />
      <CreatePlaylistModal />
      <ImportReviewModal />
    </div>
  );
}
