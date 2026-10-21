import { motion, type PanInfo } from "framer-motion";
import { SkipNext, MusicNote } from "@solar-icons/react";
import { CoverImage } from "@/features/covers";
import { playerEngine, usePlayerState, PlayPauseIcon } from "@/features/player";
import { ScrollableText } from "@/shared/ui";
import { tapHaptic } from "@/shared/platform/haptics";

interface MobileMiniPlayerProps {
  onOpen: () => void;
}

const font = { fontFamily: "var(--font-inter), sans-serif" } as const;

export default function MobileMiniPlayer({ onOpen }: MobileMiniPlayerProps) {
  const player = usePlayerState();
  const track = player.currentTrack;
  if (!track) return null;

  const progress = player.durationMs > 0 ? Math.min(1, player.positionMs / player.durationMs) : 0;

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y < -40 || info.velocity.y < -400) onOpen();
  };

  return (
    <motion.div
      className="soniq-mobile-miniplayer relative mx-[8px] flex items-center gap-[10px] overflow-hidden rounded-[14px] bg-bg-elevated/95 pl-[8px] pr-[4px] backdrop-blur-xl cursor-pointer select-none"
      style={{ height: "var(--m-mini-h)" }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.25, bottom: 0 }}
      onDragEnd={handleDragEnd}
      onClick={onOpen}
      role="button"
      aria-label={track.title}
    >
      <div className="relative h-[48px] w-[48px] shrink-0 overflow-hidden rounded-[8px] bg-black/20">
        {track.coverUrl ? (
          <CoverImage src={track.coverUrl} alt={track.title} fill sizes="48px" unoptimized className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-tertiary">
            <MusicNote size={22} />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <ScrollableText text={track.title} className="text-[15px] font-[600] text-text-primary" style={font} />
        <p className="m-0 truncate text-[13px] text-text-secondary" style={font}>
          {track.artists}
        </p>
      </div>

      <button
        type="button"
        aria-label={player.status === "playing" ? "Pause" : "Play"}
        onClick={(e) => {
          e.stopPropagation();
          tapHaptic();
          void playerEngine.togglePlayPause();
        }}
        className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center border-none bg-transparent text-text-primary cursor-pointer active:scale-[0.92] transition-transform"
      >
        <PlayPauseIcon status={player.status} size={24} spinnerSize={20} />
      </button>
      <button
        type="button"
        aria-label="Next track"
        onClick={(e) => {
          e.stopPropagation();
          tapHaptic();
          void playerEngine.skipNext();
        }}
        className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center border-none bg-transparent text-text-primary cursor-pointer active:scale-[0.92] transition-transform"
      >
        <SkipNext size={24} weight="Bold" />
      </button>

      <div className="pointer-events-none absolute inset-x-[10px] bottom-0 h-[2px] overflow-hidden rounded-full bg-border-alpha-14">
        <div className="soniq-fill h-full bg-text-primary/80" style={{ width: `${progress * 100}%` }} />
      </div>
    </motion.div>
  );
}
