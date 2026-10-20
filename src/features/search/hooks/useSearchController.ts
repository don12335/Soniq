import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlbumFill, GridFill, Music2Fill, PlaylistFill, User2Fill } from "@mingcute/react";
import { mediaUrl, toClientTrack, toMaxQualityAvatarUrl } from "@/shared/api";
import { playerEngine } from "@/features/player";
import { useTranslation } from "@/languages";
import { useSearchHistoryStore } from "../store/searchHistoryStore";
import { useSearchAlbums } from "./useSearchAlbums";
import { useSearchAll } from "./useSearchAll";
import { useSearchArtists } from "./useSearchArtists";
import { useSearchPlaylists } from "./useSearchPlaylists";
import { useSearchTracks } from "./useSearchTracks";

export type SearchFilterKey = "all" | "tracks" | "artists" | "albums" | "playlists";

export const SEARCH_FILTER_KEYS: SearchFilterKey[] = ["all", "tracks", "artists", "albums", "playlists"];

export const SEARCH_FILTER_ICONS: Record<SearchFilterKey, typeof GridFill> = {
  all: GridFill,
  tracks: Music2Fill,
  artists: User2Fill,
  albums: AlbumFill,
  playlists: PlaylistFill,
};

export interface SearchControllerOptions {
  // searches only run while enabled (the desktop popup is open, the mobile search tab is shown)
  enabled: boolean;
  // called before navigating to an artist/album/playlist result, e.g. to close the popup
  onNavigate?: () => void;
}

// Search state and actions shared by the desktop search popup (AppFrame) and the mobile search page.
export function useSearchController({ enabled, onNavigate }: SearchControllerOptions) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<SearchFilterKey>("all");

  const filterLabels: Record<SearchFilterKey, string> = {
    all: t("common.all"),
    tracks: t("common.songs"),
    artists: t("common.artists"),
    albums: t("common.albums"),
    playlists: t("common.playlists"),
  };

  const isAllSearchFilter = activeFilter === "all";
  const isTrackSearchFilter = activeFilter === "tracks";
  const isArtistSearchFilter = activeFilter === "artists";
  const isAlbumSearchFilter = activeFilter === "albums";
  const isPlaylistSearchFilter = activeFilter === "playlists";
  const hasSearchQuery = searchQuery.trim().length > 0;

  const addHistoryItem = useSearchHistoryStore((state) => state.addItem);
  const historyItems = useSearchHistoryStore((state) => state.items);

  const {
    items: allResults,
    loading: allLoading,
    hasLoaded: allHasLoaded,
    runNow: runAllSearchNow,
    partialWarning,
  } = useSearchAll(searchQuery, {
    enabled: enabled && isAllSearchFilter,
    limit: 20,
    debounceMs: 320,
  });

  const {
    tracks: trackResults,
    loading: trackLoading,
    hasLoaded: trackHasLoaded,
    runNow: runTrackSearchNow,
  } = useSearchTracks(searchQuery, {
    enabled: enabled && isTrackSearchFilter,
    limit: 20,
    debounceMs: 320,
  });

  const {
    artists: artistResults,
    loading: artistLoading,
    hasLoaded: artistHasLoaded,
    runNow: runArtistSearchNow,
  } = useSearchArtists(searchQuery, {
    enabled: enabled && isArtistSearchFilter,
    limit: 20,
    debounceMs: 320,
  });

  const {
    albums: albumResults,
    loading: albumLoading,
    hasLoaded: albumHasLoaded,
    runNow: runAlbumSearchNow,
  } = useSearchAlbums(searchQuery, {
    enabled: enabled && isAlbumSearchFilter,
    limit: 20,
    debounceMs: 320,
  });

  const {
    playlists: playlistResults,
    loading: playlistLoading,
    hasLoaded: playlistHasLoaded,
    runNow: runPlaylistSearchNow,
  } = useSearchPlaylists(searchQuery, {
    enabled: enabled && isPlaylistSearchFilter,
    limit: 20,
    debounceMs: 320,
  });

  const searchResults = useMemo(() => {
    if (isAllSearchFilter) {
      return allResults.map((item: any) => {
        const coverUrl = item.cover
          ? mediaUrl(item.cover.url)
          : (item.coverUrl ?? "");
        if (item.type === "track") {
          const clientTrack = toClientTrack(item);
          return {
            ...clientTrack,
            ...item,
            _type: "track",
            coverUrl: clientTrack.coverUrl || coverUrl,
            artists: clientTrack.artists,
            artistId: clientTrack.artistId,
            artistList: clientTrack.artistList,
          };
        }
        if (item.type === "artist") {
          return {
            ...item,
            _type: "artist",
            title: item.name,
            coverUrl: toMaxQualityAvatarUrl(coverUrl),
            artists: "",
          };
        }
        if (item.type === "album") {
          return {
            ...item,
            _type: "album",
            coverUrl,
            artists: Array.isArray(item.artists)
              ? item.artists.map((a: any) => a.name).join(", ")
              : (item.artists ?? ""),
            artistId: item.artists?.[0]?.id,
            artistList: Array.isArray(item.artists)
              ? item.artists.map((a: any) => ({ id: a.id, name: a.name }))
              : undefined,
          };
        }
        return {
          ...item,
          _type: item.type,
          coverUrl,
          artists: item.author ?? item.artists ?? "",
          artistId: item.artists?.[0]?.id,
          artistList: Array.isArray(item.artists)
            ? item.artists.map((a: any) => ({ id: a.id, name: a.name }))
            : undefined,
        };
      });
    }
    if (isTrackSearchFilter)
      return trackResults.map((t: any) => {
        const clientTrack = toClientTrack(t);
        return {
          ...clientTrack,
          ...t,
          _type: "track",
          coverUrl:
            clientTrack.coverUrl ||
            (t.cover ? mediaUrl(t.cover.url) : (t.coverUrl ?? "")),
          artists: clientTrack.artists,
          artistId: clientTrack.artistId,
          artistList: clientTrack.artistList,
        };
      });
    if (isArtistSearchFilter)
      return artistResults.map((a: any) => ({
        ...a,
        _type: "artist",
        title: a.name,
        coverUrl: toMaxQualityAvatarUrl(a.cover ? mediaUrl(a.cover.url) : (a.coverUrl ?? "")),
      }));
    if (isAlbumSearchFilter)
      return albumResults.map((a: any) => ({
        ...a,
        _type: "album",
        coverUrl: a.cover ? mediaUrl(a.cover.url) : (a.coverUrl ?? ""),
        artists: Array.isArray(a.artists)
          ? a.artists.map((ar: any) => ar.name).join(", ")
          : (a.artists ?? ""),
        artistId: a.artists?.[0]?.id,
        artistList: Array.isArray(a.artists)
          ? a.artists.map((ar: any) => ({ id: ar.id, name: ar.name }))
          : undefined,
      }));
    if (isPlaylistSearchFilter)
      return playlistResults.map((p: any) => ({
        ...p,
        _type: "playlist",
        coverUrl: p.cover ? mediaUrl(p.cover.url) : (p.coverUrl ?? ""),
      }));
    return [];
  }, [
    isAllSearchFilter,
    isTrackSearchFilter,
    isArtistSearchFilter,
    isAlbumSearchFilter,
    isPlaylistSearchFilter,
    allResults,
    trackResults,
    artistResults,
    albumResults,
    playlistResults,
  ]);

  const searchLoading = isAllSearchFilter
    ? allLoading
    : isTrackSearchFilter
      ? trackLoading
      : isArtistSearchFilter
        ? artistLoading
        : isAlbumSearchFilter
          ? albumLoading
          : playlistLoading;

  const searchHasLoaded = isAllSearchFilter
    ? allHasLoaded
    : isTrackSearchFilter
      ? trackHasLoaded
      : isArtistSearchFilter
        ? artistHasLoaded
        : isAlbumSearchFilter
          ? albumHasLoaded
          : playlistHasLoaded;

  const isSearchEmpty =
    searchQuery.trim().length >= 2 &&
    !searchLoading &&
    searchHasLoaded &&
    searchResults.length === 0;

  const runSearchNow = () => {
    if (isAllSearchFilter) {
      runAllSearchNow();
      return;
    }
    if (isTrackSearchFilter) runTrackSearchNow();
    if (isArtistSearchFilter) runArtistSearchNow();
    if (isAlbumSearchFilter) runAlbumSearchNow();
    if (isPlaylistSearchFilter) runPlaylistSearchNow();
  };

  const handlePlayFromSearch = useCallback(
    (track: any) => {
      playerEngine.primeUserGesture();
      if (!track) {
        return;
      }
      const durationMs = track.durationMs ?? track.duration_ms;
      const durationStr = durationMs
        ? `${Math.floor(durationMs / 60000)}:${Math.floor(
            (durationMs % 60000) / 1000,
          )
            .toString()
            .padStart(2, "0")}`
        : "";
      addHistoryItem({
        id: track.id,
        type: "track",
        title: track.title,
        subtitle: track.artists,
        coverUrl: track.coverUrl,
        explicit: track.explicit,
        duration: durationStr,
        durationMs,
        itemData: track,
      });
      void playerEngine.playTrack(
        track,
        [track],
        `${track.title} Radio`,
        track.coverUrl,
      );
    },
    [addHistoryItem],
  );

  const handleNavigateItem = useCallback(
    (it: any) => {
      onNavigate?.();
      if (
        it._type === "artist" ||
        it.followers !== undefined ||
        activeFilter === "artists"
      ) {
        addHistoryItem({
          id: it.id,
          type: "artist",
          title: it.name || it.title,
          subtitle: t("common.artists"),
          coverUrl: it.coverUrl,
          itemData: it,
        });
        navigate(`/artist?id=${encodeURIComponent(it.id)}`);
      } else if (
        it._type === "playlist" ||
        it.owner !== undefined ||
        activeFilter === "playlists"
      ) {
        addHistoryItem({
          id: it.id,
          type: "playlist",
          title: it.name || it.title,
          subtitle: it.author || it.owner || t("common.playlists"),
          coverUrl: it.coverUrl,
          itemData: it,
        });
        navigate(`/collection?type=playlist&id=${encodeURIComponent(it.id)}`);
      } else if (
        it._type === "album" ||
        it.totalTracks !== undefined ||
        it.total_tracks !== undefined ||
        activeFilter === "albums"
      ) {
        addHistoryItem({
          id: it.id,
          type: "album",
          title: it.name || it.title,
          subtitle: it.artists || it.artist || t("common.albums"),
          coverUrl: it.coverUrl,
          itemData: it,
        });
        navigate(`/collection?type=album&id=${encodeURIComponent(it.id)}`);
      }
    },
    [activeFilter, onNavigate, navigate, addHistoryItem, t],
  );

  const submitSearchQuery = useCallback(
    (queryToSubmit: string) => {
      const trimmed = queryToSubmit.trim();
      if (!trimmed) return;
      addHistoryItem({
        id: `query:${trimmed.toLowerCase()}`,
        type: "query",
        title: trimmed,
      });
    },
    [addHistoryItem],
  );

  const selectHistoryQuery = useCallback(
    (queryText: string) => {
      setSearchQuery(queryText);
      submitSearchQuery(queryText);
    },
    [submitSearchQuery],
  );

  return {
    searchQuery,
    setSearchQuery,
    hasSearchQuery,
    activeFilter,
    setActiveFilter,
    filterLabels,
    isArtistSearchFilter,
    isPlaylistSearchFilter,
    historyItems,
    searchResults,
    searchLoading,
    searchHasLoaded,
    isSearchEmpty,
    partialWarning,
    runSearchNow,
    handlePlayFromSearch,
    handleNavigateItem,
    submitSearchQuery,
    selectHistoryQuery,
  };
}

export type SearchController = ReturnType<typeof useSearchController>;
