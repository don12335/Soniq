import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import HomePage from "@/features/home/ui/HomePage";

// home is the landing page and stays in the main bundle; the rest load on first visit
const LibraryPage = lazy(() => import("@/features/library/ui/LibraryPage"));
const PlaylistPage = lazy(() => import("@/features/library/ui/PlaylistPage"));
const ArtistPage = lazy(() => import("@/features/artist/ui/ArtistPage"));
const CollectionPage = lazy(() => import("@/features/collection/ui/CollectionPage"));
const PlayerPage = lazy(() => import("@/features/player/ui/FullscreenPlayer"));

export function AppRoutes() {
  return (
    // chunks load from local disk in a few ms, so render nothing instead of flashing a spinner
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/library/playlist" element={<PlaylistPage />} />
        <Route path="/artist" element={<ArtistPage />} />
        <Route path="/collection" element={<CollectionPage />} />
        <Route path="/settings" element={<Navigate to="/" replace />} />
        <Route path="/player" element={<PlayerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
