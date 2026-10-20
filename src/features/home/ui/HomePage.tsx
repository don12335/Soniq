import { useMemo, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import PopularTracksSection from "./PopularTracksSection";
import { SectionSkeleton } from "./HomePageSkeleton";
import type { PopularItem } from "../hooks/usePopularTracks";
import { useRecentlyPlayed } from "../hooks/useRecentlyPlayed";
import { useHomeCharts, useRecommendations } from "../hooks/useHomeFeed";
import { useLikedTracks } from "@/features/library/hooks/useLikedTracks";
import { playerEngine } from "@/features/player";
import SongCard from "@/features/player/ui/SongCard";
import SongCardWithMenu from "@/features/player/ui/SongCardWithMenu";
import { useTranslation } from "@/languages";
import { useIsContentTransparent } from "@/features/settings/store/customizationStore";
import { hasListeningHistory, subscribeToHistory } from "@/shared/api/localHistory";
import {
  FireFill,
  TimeFill,
  HeartFill,
  FlashCircleFill,
  SparklesFill,
  MicFill,
} from "@mingcute/react";

const asTrackItems = (tracks: { id: string }[]): PopularItem[] =>
  tracks.map((item) => ({ type: "track", item, playCount: 0 }) as PopularItem);

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hasCustomBg = useIsContentTransparent();
  const { data: likedData } = useLikedTracks();

  const { data: recentlyPlayed } = useRecentlyPlayed(20);
  const hasPlayedTrack = useSyncExternalStore(subscribeToHistory, hasListeningHistory, () => false);
  const { rows: recommendations, isRefreshingBecause, refreshBecause } = useRecommendations();
  const forYou = recommendations.find((row) => !row.seed);
  const becauseYouListened = recommendations.find((row) => row.seed);
  const { data: charts, isLoading: chartsLoading } = useHomeCharts(!hasPlayedTrack);

  const chartTracks = useMemo(() => asTrackItems(charts.tracks), [charts.tracks]);
  const chartArtists = useMemo(
    () => charts.artists.map((item) => ({ type: "artist", item, playCount: 0 }) as PopularItem),
    [charts.artists],
  );

  // Ambient time-of-day colored glow
  const glowClass = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return "from-amber-500/20 via-orange-500/10 to-transparent";
    } else if (hour >= 12 && hour < 17) {
      return "from-amber-400/20 via-sky-500/10 to-transparent";
    } else if (hour >= 17 && hour < 22) {
      return "from-rose-500/20 via-purple-500/10 to-transparent";
    }
    return "from-indigo-600/25 via-violet-600/15 to-transparent";
  }, []);

  // Quick mix items: up to 5 recently played items (tracks or albums)
  const quickRecentItems = useMemo(() => {
    return (recentlyPlayed || []).slice(0, 5);
  }, [recentlyPlayed]);

  const hasEnoughQuickData = quickRecentItems.length >= 5;

  const quickCardClass = hasCustomBg
    ? "apple-glass-action"
    : "bg-bg-elevated hover:bg-[#dedee3] dark:hover:bg-border-alpha-14 transition-colors duration-150 ease-out";

  return (
    <div className="relative h-full w-full overflow-y-auto overflow-x-hidden bg-transparent">

      <div
        data-window-drag
        className="sticky top-0 z-20 h-[32px] w-full shrink-0 select-none pointer-events-auto mobile:hidden"
        style={{ marginBottom: "-32px" }}
        aria-hidden="true"
      />
      {!hasCustomBg && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -top-8 -left-8 w-[380px] h-[200px] bg-gradient-to-br ${glowClass} blur-3xl opacity-60`}
        />
      )}

      <div className="relative z-1 w-full pb-[16px]">
            {hasEnoughQuickData && (
              <div className="flex flex-col">
              <div className="mt-[20px] px-8 mobile:px-[16px] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center shrink-0">
                    <FlashCircleFill className="w-5 h-5 text-amber-400" />
                    </div>
                    <h2
                      className="text-text-primary text-[21px] font-semibold m-0 leading-tight tracking-tight"
                      style={{ fontFamily: "var(--font-inter), sans-serif" }}
                    >
                      {t("home.speedDial") || "Speed dial"}
                    </h2>
                  </div>
                </div>

                <div className="px-8 mobile:px-[16px] mt-[12px] relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  <SongCard
                    title={t("library.liked_songs")}
                    artists={`${likedData.total} ${likedData.total === 1 ? t("library.song") : t("library.songs")}`}
                    artistsClickable={false}
                    coverUrl=""
                    icon={<HeartFill size={22} className={hasCustomBg ? "text-white/80" : "text-zinc-400 dark:text-zinc-500"} />}
                    onPlay={() => navigate("/library/playlist?id=likes")}
                    compact
                    className={quickCardClass}
                  />

                  {/* Recently Played Quick Cards */}
                  {quickRecentItems.map((entry, idx) => {
                    if (entry.type === "album") {
                      const album = entry.item;
                      return (
                        <SongCardWithMenu
                          key={`quick-album-${album.id}-${idx}`}
                          id={album.id}
                          title={album.title}
                          artists={album.artist}
                          coverUrl={album.coverUrl ?? ""}
                          onPlay={() =>
                            navigate(
                              `/collection?type=album&id=${encodeURIComponent(album.id)}`,
                            )
                          }
                          searchType="album"
                          compact
                          className={quickCardClass}
                        />
                      );
                    }
                    if (entry.type === "track") {
                      const track = entry.item;
                      return (
                        <SongCardWithMenu
                          key={`quick-track-${track.id}-${idx}`}
                          id={track.id}
                          title={track.title}
                          artists={track.artists}
                          coverUrl={track.coverUrl ?? ""}
                          durationMs={track.durationMs}
                          explicit={track.explicit}
                          onPlay={() => {
                            void playerEngine.playTrack(
                              track,
                              [track],
                              `${track.title} Radio`,
                              track.coverUrl,
                            );
                          }}
                          searchType="track"
                          compact
                          className={quickCardClass}
                        />
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            )}

            {forYou && (
              <PopularTracksSection
                title={t("home.recommendedForYou")}
                subtitle={t("home.basedOnYourListening")}
                icon={<SparklesFill className="w-5 h-5 text-violet-400" />}
                items={asTrackItems(forYou.tracks)}
                headingMarginTop="mt-[22px]"
              />
            )}
            {hasPlayedTrack && !forYou && (
              <SectionSkeleton titleWidth="w-[180px]" />
            )}

            {becauseYouListened?.seed && (
              <PopularTracksSection
                title={t("home.becauseYouListened", { title: becauseYouListened.seed.title })}
                headerAction={
                  <button
                    type="button"
                    onClick={refreshBecause}
                    disabled={isRefreshingBecause}
                    className="shrink-0 rounded-full px-3 py-1 text-[13px] text-text-secondary hover:text-text-primary hover:bg-border-alpha-14 disabled:opacity-50"
                  >
                    {t("home.refreshRecommendations")}
                  </button>
                }
                icon={<SparklesFill className="w-5 h-5 text-violet-400" />}
                items={asTrackItems(becauseYouListened.tracks)}
                headingMarginTop="mt-[22px]"
              />
            )}
            {hasPlayedTrack && !becauseYouListened && (
              <SectionSkeleton titleWidth="w-[190px]" />
            )}

          {/* Jump Back In (local listening history) */}
          {recentlyPlayed && recentlyPlayed.length > 0 && (
            <PopularTracksSection
              title={t("home.jumpBackIn")}
              icon={<TimeFill className="w-5 h-5 text-sky-400" />}
              items={recentlyPlayed}
              headingMarginTop="mt-[22px]"
            />
          )}

          {/* Trending in Taiwan (YouTube Music daily chart) */}
          {!hasPlayedTrack && chartsLoading && chartTracks.length === 0 && (
            <SectionSkeleton titleWidth="w-[190px]" />
          )}
          {!hasPlayedTrack && chartTracks.length > 0 && (
            <PopularTracksSection
              title={t("home.trendingInTaiwan")}
              subtitle={charts.playlist?.title}
              icon={<FireFill className="w-5 h-5 text-amber-500" />}
              items={chartTracks}
              showRanks
              headingMarginTop="mt-[22px]"
            />
          )}

          {/* Top artists in Taiwan */}
          {!hasPlayedTrack && chartArtists.length > 0 && (
            <PopularTracksSection
              title={t("home.topArtists")}
              icon={<MicFill className="w-5 h-5 text-rose-400" />}
              items={chartArtists}
              showRanks
              headingMarginTop="mt-[22px]"
            />
          )}
      </div>
    </div>
  );
}
