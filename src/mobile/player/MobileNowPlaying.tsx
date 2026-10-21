import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useDragControls, type PanInfo } from "framer-motion";
import { DownLine, More2Fill, HeartFill, HeartLine } from "@mingcute/react";
import { MusicNote, Playlist, TextSquare, PlaybackSpeed } from "@solar-icons/react";
import { CoverImage, preloadCoverArt, useCoverSrc } from "@/features/covers";
import {
  BraccatoLyricsView,
  KawarpWrapper,
  PlaybackControls,
  SpeedPitchPicker,
  playerEngine,
  usePlayerState,
  useSongMenuItems,
} from "@/features/player";
import { TimelineSlider } from "@/features/player/ui/TimelineSlider";
import { CrossfadeButton, SleepTimerButton } from "@/features/player/ui/PlaybackExtras";
import { useLyricsStore, LyricsProviderIsland, hasSyncedLyricsSources } from "@/features/lyrics";
import { useIsTrackLiked, useLikeTrack, useUnlikeTrack } from "@/features/library/hooks";
import { ArtistLink } from "@/features/artist";
import RightDrawer from "@/features/navigation/ui/RightDrawer";
import { ActionSheet, BottomSheet, ExplicitBadge, ScrollableText } from "@/shared/ui";
import { tapHaptic } from "@/shared/platform/haptics";
import { setStatusBarTone } from "@/shared/platform/native/statusBarTone";
import { useTranslation } from "@/languages";

const DISMISS_OFFSET = 140;
const DISMISS_VELOCITY = 700;
const font = { fontFamily: "var(--font-inter), sans-serif" } as const;

interface MobileNowPlayingProps {
  onClose: () => void;
}

function LyricsPane() {
  const { t } = useTranslation();
  const player = usePlayerState();
  const {
    braccatoLyrics,
    rawFormat,
    lyricsLoading,
    lyricsError,
    plainLyrics,
    availableProviders,
    currentLyricsTrackId,
  } = useLyricsStore();

  const currentTrackId = player.currentTrack?.id;
  const isMatchingTrack = Boolean(currentTrackId && currentLyricsTrackId === currentTrackId);
  const hasLyrics = isMatchingTrack && braccatoLyrics.length > 0;
  const showProviderIsland =
    hasLyrics && (hasSyncedLyricsSources(availableProviders, braccatoLyrics, rawFormat) || availableProviders.length > 1);
  const isInstrumental =
    isMatchingTrack && !lyricsLoading && !hasLyrics && !lyricsError && plainLyrics === "[INSTRUMENTAL]";

  if (hasLyrics) {
    return (
      <div className="relative flex h-full min-h-0 w-full flex-col">
        {showProviderIsland && (
          <div className="pointer-events-none absolute left-1/2 top-[4px] z-30 flex -translate-x-1/2 justify-center">
            <LyricsProviderIsland />
          </div>
        )}
        <BraccatoLyricsView key={currentTrackId} lyrics={braccatoLyrics} />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center px-[24px] text-center text-white/60" style={font}>
      {lyricsLoading ? (
        <span className="inline-block h-[22px] w-[22px] animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
      ) : isInstrumental ? (
        t("player.instrumental")
      ) : (
        lyricsError || t("player.no_lyrics_found")
      )}
    </div>
  );
}

export default function MobileNowPlaying({ onClose }: MobileNowPlayingProps) {
  const { t } = useTranslation();
  const player = usePlayerState();
  const track = player.currentTrack;
  const coverUrl = track?.coverUrl || "";
  const kawarpSrc = useCoverSrc(coverUrl || undefined);
  const dragControls = useDragControls();

  const [effectsReady, setEffectsReady] = useState(false);
  const [view, setView] = useState<"cover" | "lyrics">("cover");
  const [queueOpen, setQueueOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"queue" | "lyrics">("queue");
  const [speedOpen, setSpeedOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    void setStatusBarTone("dark");
    return () => {
      void setStatusBarTone(null);
    };
  }, []);

  const nextCoverUrl = player.queue[player.currentIndex + 1]?.coverUrl;
  useEffect(() => {
    void preloadCoverArt(coverUrl || undefined);
    void preloadCoverArt(nextCoverUrl);
  }, [coverUrl, nextCoverUrl]);

  const isLiked = useIsTrackLiked(track?.id);
  const likeMutation = useLikeTrack();
  const unlikeMutation = useUnlikeTrack();
  const togglingRef = useRef(false);
  const handleLikeToggle = useCallback(() => {
    if (!track || togglingRef.current) return;
    togglingRef.current = true;
    tapHaptic();
    const onSettled = () => {
      togglingRef.current = false;
    };
    if (isLiked) unlikeMutation.mutate(track.id, { onSettled });
    else likeMutation.mutate(track.id, { onSettled });
  }, [track, isLiked, likeMutation, unlikeMutation]);

  const menuItems = useSongMenuItems({
    id: track?.id,
    title: track?.title || "",
    artists: track?.artists || "",
    coverUrl,
    durationMs: player.durationMs,
  });

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) onClose();
  };

  const startDrag = (e: React.PointerEvent) => {
    // lyrics scroll vertically, so only the cover view drags the whole sheet
    if (view === "lyrics" && !(e.target as HTMLElement).closest("[data-sheet-header]")) return;
    dragControls.start(e);
  };

  const bottomButton =
    "inline-flex h-[44px] w-[44px] items-center justify-center rounded-full border-none bg-transparent text-white/70 cursor-pointer active:scale-[0.92] transition-transform";

  return (
    <motion.div
      key="mobile-now-playing"
      data-theme="dark"
      className="dark fixed inset-0 z-[70] overflow-hidden bg-black text-white will-change-transform"
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      onAnimationComplete={() => setEffectsReady(true)}
      drag="y"
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.7 }}
      onDragEnd={handleDragEnd}
    >
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        {kawarpSrc && (
          <div
            className="absolute inset-0 scale-125 bg-cover bg-center opacity-70 blur-3xl"
            style={{ backgroundImage: `url(${kawarpSrc})` }}
          />
        )}
        {effectsReady && <KawarpWrapper src={kawarpSrc} />}
        <div className="absolute inset-0 bg-black/45" />
      </div>

      <div
        className="relative z-10 flex h-full flex-col px-[22px]"
        style={{ paddingTop: "var(--safe-top)", paddingBottom: "calc(var(--safe-bottom) + 8px)" }}
        onPointerDown={startDrag}
      >
        <div data-sheet-header className="flex h-[52px] shrink-0 items-center justify-between">
          <button
            type="button"
            aria-label={t("player.close_fullscreen")}
            onClick={onClose}
            className="-ml-[10px] inline-flex h-[44px] w-[44px] items-center justify-center border-none bg-transparent text-white/80 cursor-pointer"
          >
            <DownLine size={26} />
          </button>
          <div className="mx-auto h-[5px] w-[38px] rounded-full bg-white/30" />
          <button
            type="button"
            aria-label={t("common.more_options")}
            onClick={() => setMenuOpen(true)}
            disabled={menuItems.length === 0}
            className="-mr-[10px] inline-flex h-[44px] w-[44px] items-center justify-center border-none bg-transparent text-white/80 cursor-pointer disabled:opacity-30"
          >
            <More2Fill size={24} />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          <AnimatePresence mode="wait" initial={false}>
            {view === "cover" ? (
              <motion.div
                key="cover"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: player.status === "playing" ? 1 : 0.9 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="relative aspect-square overflow-hidden rounded-[14px] bg-white/5 shadow-2xl"
                style={{ width: "min(86vw, 420px, 46dvh)" }}
              >
                {coverUrl ? (
                  <CoverImage key={coverUrl} src={coverUrl} alt={track?.title || ""} fill sizes="420px" priority unoptimized className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-white/40">
                    <MusicNote size={72} />
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="lyrics"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 -mx-[22px]"
              >
                <LyricsPane />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex shrink-0 items-center gap-[12px] pt-[18px]">
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <ScrollableText text={track?.title || ""} className="text-[21px] font-[700] tracking-[-0.02em] text-white" style={font} />
            <div className="flex min-w-0 items-center gap-[6px] text-[16px] text-white/65" style={font}>
              {track?.explicit && <ExplicitBadge className="!bg-white/60 !text-black shrink-0" />}
              <ArtistLink
                name={track?.artists || ""}
                artistId={track?.artistId}
                artistList={track?.artistList}
                onNavigate={onClose}
                className="truncate text-white/65"
              />
            </div>
          </div>
          <button
            type="button"
            aria-label={isLiked ? t("common.unlike") : t("common.like")}
            onClick={handleLikeToggle}
            className={`inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center border-none bg-transparent cursor-pointer active:scale-[0.9] transition-transform ${
              isLiked ? "text-white" : "text-white/60"
            }`}
          >
            {isLiked ? <HeartFill size={26} /> : <HeartLine size={26} />}
          </button>
        </div>

        <div className="shrink-0 pt-[14px]">
          <TimelineSlider
            positionMs={player.positionMs}
            durationMs={player.durationMs}
            onSeek={(pos) => playerEngine.seek(pos)}
            showTime
            size="md"
            className="w-full"
          />
        </div>

        <div className="flex shrink-0 justify-center pt-[10px]">
          <PlaybackControls size="lg" />
        </div>

        <div className="flex shrink-0 items-center justify-between px-[6px] pt-[14px]">
          <SleepTimerButton compact />
          <button type="button" aria-label={t("player.speed")} onClick={() => setSpeedOpen(true)} className={bottomButton}>
            <PlaybackSpeed size={22} />
          </button>
          <button
            type="button"
            aria-label={t("player.lyrics") || "Lyrics"}
            aria-pressed={view === "lyrics"}
            onClick={() => {
              tapHaptic();
              setView((v) => (v === "lyrics" ? "cover" : "lyrics"));
            }}
            className={`${bottomButton} ${view === "lyrics" ? "!bg-white/15 !text-white" : ""}`}
          >
            <TextSquare size={22} />
          </button>
          <button type="button" aria-label={t("player.queue") || "Queue"} onClick={() => setQueueOpen(true)} className={bottomButton}>
            <Playlist size={22} />
          </button>
          <CrossfadeButton compact />
        </div>
      </div>

      <BottomSheet open={queueOpen} onClose={() => setQueueOpen(false)} height="85dvh" theme="dark">
        <div className="h-full">
          <RightDrawer activeTab={drawerTab} onTabChange={setDrawerTab} />
        </div>
      </BottomSheet>

      <BottomSheet open={speedOpen} onClose={() => setSpeedOpen(false)} title={t("player.speed")} theme="dark">
        <div className="px-[20px] pb-[16px] pt-[6px]">
          <SpeedPitchPicker onClose={() => setSpeedOpen(false)} />
        </div>
      </BottomSheet>

      <ActionSheet open={menuOpen} onClose={() => setMenuOpen(false)} items={menuItems} title={track?.title} theme="dark" />
    </motion.div>
  );
}
