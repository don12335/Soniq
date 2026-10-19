import { useCallback, useEffect, useRef, useState } from "react";
import type { Track } from "@/shared/types";
import { subscribeToHistory } from "@/shared/api/localHistory";
import type { PopularArtistItem } from "./usePopularTracks";
import {
  fetchChartsOverview,
  fetchChartTracks,
  pickTrendingPlaylist,
  type ChartPlaylist,
} from "../lib/charts";
import {
  buildBecauseRecommendation,
  buildMixedRecommendations,
  isMixRefreshDue,
  recommendationHistoryVersion,
  readCachedRecommendations,
  type RecommendationRow,
} from "../lib/recommendations";

// charts change daily: show the last copy instantly (also across restarts) and
// refresh it in the background once it is an hour old
interface ChartsState {
  playlist?: ChartPlaylist;
  tracks: Track[];
  artists: PopularArtistItem[];
}

const CHARTS_STORAGE_KEY = "liner_home_charts_v1";
const CHARTS_REFRESH_MS = 60 * 60 * 1000;

let chartsCache: { data: ChartsState; fetchedAt: number } | null = readStoredCharts();
let chartsRequest: Promise<ChartsState> | null = null;

function readStoredCharts(): { data: ChartsState; fetchedAt: number } | null {
  try {
    const stored = JSON.parse(localStorage.getItem(CHARTS_STORAGE_KEY) ?? "null");
    if (stored?.data && Array.isArray(stored.data.tracks) && typeof stored.fetchedAt === "number") return stored;
  } catch {
    // corrupted or unavailable storage: fetch fresh
  }
  return null;
}

function storeCharts(entry: { data: ChartsState; fetchedAt: number }): void {
  try {
    localStorage.setItem(CHARTS_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // storage full: charts still render from memory
  }
}

function fetchCharts(): Promise<ChartsState> {
  chartsRequest ??= (async () => {
    const overview = await fetchChartsOverview();
    const playlist = pickTrendingPlaylist(overview.playlists);
    const tracks = playlist ? await fetchChartTracks(playlist).catch(() => []) : [];
    const data: ChartsState = { playlist, tracks, artists: overview.artists.slice(0, 20) };
    chartsCache = { data, fetchedAt: Date.now() };
    storeCharts(chartsCache);
    return data;
  })().finally(() => {
    chartsRequest = null;
  });
  return chartsRequest;
}

export function useHomeCharts(enabled = true) {
  const [data, setData] = useState<ChartsState>(() => chartsCache?.data ?? { tracks: [], artists: [] });
  const [isLoading, setIsLoading] = useState(!chartsCache);

  useEffect(() => {
    if (!enabled) return;
    if (chartsCache && Date.now() - chartsCache.fetchedAt < CHARTS_REFRESH_MS) return;
    let active = true;
    fetchCharts()
      .then((charts) => active && setData(charts))
      .catch(() => {
        // charts are a nice-to-have: keep the stale copy or an empty section when offline
      })
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [enabled]);

  return { data, isLoading };
}

let mixRequest: Promise<RecommendationRow | null> | null = null;
let becauseRequest: Promise<RecommendationRow | null> | null = null;
let lastMixAttemptAt = 0;
let lastMixAttemptVersion = "";
let lastBecauseAttemptAt = 0;
let lastBecauseAttemptVersion = "";

export function useRecommendations() {
  const [rows, setRows] = useState<RecommendationRow[]>(() => readCachedRecommendations() ?? []);
  const rowsRef = useRef(rows);
  const [isRefreshingBecause, setIsRefreshingBecause] = useState(false);

  useEffect(() => {
    let active = true;

    const updateRows = (mix?: RecommendationRow, because?: RecommendationRow) => {
      if (!active) return;
      setRows((current) => {
        const next = [mix ?? current.find((row) => !row.seed),
          because ?? current.find((row) => row.seed)].filter((row): row is RecommendationRow => Boolean(row));
        rowsRef.current = next;
        return next;
      });
    };

    const loadBecause = (mix?: RecommendationRow) => {
      if (rowsRef.current.some((row) => row.seed)) return;
      const version = recommendationHistoryVersion();
      if (!becauseRequest && version === lastBecauseAttemptVersion && Date.now() - lastBecauseAttemptAt < 60_000) return;
      if (!becauseRequest) {
        lastBecauseAttemptAt = Date.now();
        lastBecauseAttemptVersion = version;
        becauseRequest = buildBecauseRecommendation(mix ?? rowsRef.current.find((row) => !row.seed))
          .finally(() => { becauseRequest = null; });
      }
      becauseRequest.then((next) => {
        if (next) updateRows(undefined, next);
        else if (recommendationHistoryVersion() !== version) window.setTimeout(() => loadBecause(), 800);
      }).catch(() => {});
    };

    const updateMix = () => {
      if (!isMixRefreshDue()) return;
      const version = recommendationHistoryVersion();
      if (!mixRequest && version === lastMixAttemptVersion && Date.now() - lastMixAttemptAt < 30_000) return;
      if (!mixRequest) {
        lastMixAttemptAt = Date.now();
        lastMixAttemptVersion = version;
        mixRequest = buildMixedRecommendations(
          rowsRef.current.find((row) => !row.seed), rowsRef.current.find((row) => row.seed),
          (partial) => updateRows(partial),
        ).finally(() => { mixRequest = null; });
      }
      mixRequest.then((next) => {
        if (next) updateRows(next);
        if (recommendationHistoryVersion() !== version) window.setTimeout(updateMix, 800);
      }).catch(() => {});
    };

    const tick = () => {
      if (isMixRefreshDue()) updateMix();
      loadBecause();
    };
    tick();
    let historyTimer: number | undefined;
    const unsubscribe = subscribeToHistory(() => {
      window.clearTimeout(historyTimer);
      historyTimer = window.setTimeout(tick, 800);
    });
    const timer = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    return () => {
      active = false;
      unsubscribe();
      window.clearTimeout(historyTimer);
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);

  const refreshBecause = useCallback(() => {
    if (becauseRequest) return;
    const mix = rowsRef.current.find((row) => !row.seed);
    const previous = rowsRef.current.find((row) => row.seed);
    setIsRefreshingBecause(true);
    becauseRequest = buildBecauseRecommendation(mix, previous).finally(() => {
      becauseRequest = null;
    });
    becauseRequest
      .then((next) => {
        if (!next) return;
        setRows((current) => {
          const updated = [current.find((row) => !row.seed), next]
            .filter((row): row is RecommendationRow => Boolean(row));
          rowsRef.current = updated;
          return updated;
        });
      })
      .catch(() => { /* keep the previous row when offline */ })
      .finally(() => setIsRefreshingBecause(false));
  }, []);

  return { rows, isRefreshingBecause, refreshBecause };
}
