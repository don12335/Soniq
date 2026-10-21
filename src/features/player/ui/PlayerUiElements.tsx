import { useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { MusicNote } from "@solar-icons/react";
import { HeartFill, HeartLine } from "@mingcute/react";
import { usePlayerState } from "../hooks/usePlayerState";
import { playerEngine } from "../engine/playerEngine";
import { useIsTrackLiked, useLikeTrack, useUnlikeTrack } from "@/features/library/hooks";
import { AnimatePresence, motion } from "framer-motion";
import { ArtistLink } from "@/features/artist";
import { useCoverReady, CoverImage } from "@/features/covers";
import ExplicitBadge from "@/shared/ui/ExplicitBadge";
import { VolumePicker } from "./VolumePicker";
import { TimelineSlider } from "./TimelineSlider";
import { PlaybackControls } from "./PlaybackControls";
import { CrossfadeButton, SleepTimerButton } from "./PlaybackExtras";
import { getCapabilities } from "@/shared/platform";

import { useTranslation } from "@/languages";

interface PlayerUiElementsProps {
  onDuration?: (duration: number) => void;
  onClose?: () => void;
}

export function PlayerUiElements({
  onDuration: _onDuration,
  onClose,
}: PlayerUiElementsProps) {
  const player = usePlayerState();

  const track = player.currentTrack;
  const coverUrl = track?.coverUrl || "";
  const trackTitle = track?.title || "";
  const trackArtists = track?.artists || "";

  const isLiked = useIsTrackLiked(track?.id);
  const likeMutation = useLikeTrack();
  const unlikeMutation = useUnlikeTrack();
  const togglingRef = useRef(false);

  const handleLikeToggle = useCallback(() => {
    if (!track || togglingRef.current) return;
    togglingRef.current = true;
    const onSettled = () => {
      togglingRef.current = false;
    };
    if (isLiked) {
      unlikeMutation.mutate(track.id, { onSettled });
    } else {
      likeMutation.mutate(track.id, { onSettled });
    }
  }, [track, isLiked, likeMutation, unlikeMutation]);

  const isCoverLoaded = useCoverReady(coverUrl);

  const { t } = useTranslation();

  return (
    <>
      {/* Artwork (Compact, flat, no drop shadows) */}
      <div
        className={`relative shrink-0 overflow-hidden rounded-xl w-[280px] h-[280px] bg-black/20 ${
          coverUrl && !isCoverLoaded ? "animate-pulse" : ""
        }`}
      >
        <AnimatePresence>
          <motion.div
            key={track?.id || coverUrl || "empty"}
            initial={{ opacity: 0, filter: "blur(8px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-0"
          >
            {coverUrl ? (
              <CoverImage
                key={coverUrl}
                src={coverUrl}
                alt={trackTitle}
                fill
                sizes="280px"
                priority
                unoptimized
                className="rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-white/5 text-white/40">
                <MusicNote size={64} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        {/* like button on the cover corner (no tooltip; aria-label names it) */}
        <button
          type="button"
          aria-label={isLiked ? t("common.unlike") : t("common.like")}
          className={`absolute bottom-2.5 left-2.5 z-20 inline-flex h-[30px] w-[30px] items-center justify-center rounded-full transition-colors duration-200 ease-out active:scale-[0.92] bg-black/40 backdrop-blur-md border-none hover:bg-black/60 ${
            isLiked ? "text-white" : "text-white/70 hover:text-white"
          }`}
          onClick={handleLikeToggle}
          style={{ cursor: "pointer" }}
        >
          {/* subtle crossfade: outline heart out, filled heart in with a slight scale */}
          <motion.div
            initial={false}
            animate={{ scale: isLiked ? 0.85 : 1, opacity: isLiked ? 0 : 1 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <HeartLine size={16} />
          </motion.div>
          <motion.div
            initial={false}
            animate={{ scale: isLiked ? 1 : 0.75, opacity: isLiked ? 1 : 0 }}
            transition={
              isLiked
                ? { type: "spring", stiffness: 500, damping: 30, mass: 0.6 }
                : { duration: 0.16, ease: "easeOut" }
            }
            className="absolute inset-0 flex items-center justify-center"
          >
            <HeartFill size={16} />
          </motion.div>
        </button>
      </div>

      {/* Track info */}
      <div className="w-[280px] flex items-start justify-center min-w-0">
        <div className="flex flex-col gap-[2px] min-w-0 text-center">
          <p
            className="m-0 text-[15px] font-[600] text-white flex items-center justify-center gap-[6px] max-w-[280px]"
            style={{ letterSpacing: "-0.03em" }}
          >
            <span className="min-w-0 truncate">{trackTitle}</span>
          </p>
          <p className="m-0 flex items-center justify-center gap-[5px] text-[12px] text-white/60 leading-snug max-w-[320px] overflow-hidden">
            {track?.explicit && (
              <ExplicitBadge className="!bg-white/60 !text-black !pb-0 !leading-none shrink-0" />
            )}
            <ArtistLink
              name={trackArtists}
              artistId={track?.artistId}
              artistList={track?.artistList}
              onNavigate={() => {
                if (location.pathname !== "/player") {
                  onClose?.();
                }
              }}
              className="text-white/60"
            />
          </p>
        </div>
      </div>

      {/* Timeline (Compact, with smooth spring pill, no thumb) */}
      <TimelineSlider
        positionMs={player.positionMs}
        durationMs={player.durationMs}
        onSeek={(pos) => playerEngine.seek(pos)}
        showTime
        size="md"
        className="w-[320px]"
      />

      {/* Primary Playback Controls */}
      <PlaybackControls />

      <div className="flex items-center gap-2">
        <SleepTimerButton />
        <CrossfadeButton />
      </div>

      {/* Volume (Compact smooth slider, size sm); iOS uses the hardware buttons */}
      {getCapabilities().volumeControl && <VolumePicker className="w-[180px]" size="sm" />}
    </>
  );
}

export default PlayerUiElements;
