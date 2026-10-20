import { SkipNext, SkipPrevious, Repeat, RepeatOne, Shuffle } from "@solar-icons/react";
import { PlayerMorphIcon, ICON_PLAY, ICON_PAUSE } from "./morphPlayerIcons";
import { usePlayerState } from "../hooks/usePlayerState";
import { playerEngine } from "../engine/playerEngine";
import { isRadioContext, nextRepeatMode } from "../engine/radioMode";
import { useTranslation } from "@/languages";

const SIZES = {
  // fullscreen player on desktop
  md: { gap: 14, button: 28, side: 18, skip: 20, play: 36, playIcon: 22, spinner: 18 },
  // mobile now-playing sheet: 44px+ tap targets
  lg: { gap: 18, button: 48, side: 24, skip: 34, play: 72, playIcon: 40, spinner: 30 },
} as const;

export type PlaybackControlsSize = keyof typeof SIZES;

const iconButtonClass =
  "inline-flex items-center justify-center text-white opacity-70 transition-all duration-150 ease-out hover:opacity-100 active:scale-[0.94] shrink-0 border-none bg-transparent cursor-pointer";

export function PlayPauseIcon({ status, size = 22, spinnerSize = 18 }: { status: string; size?: number; spinnerSize?: number }) {
  const loading = status === "loading";
  const playing = status === "playing";
  // keep the morph icon mounted through the loading state (spinner overlays
  // it) — unmounting the icon on "loading" would remount MorphIcon when the
  // track starts, which skips the play -> pause morph animation.
  return (
    <span className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <span
        className={`absolute inset-0 flex items-center justify-center ${
          loading ? "opacity-0" : ""
        } transition-transform ${playing ? "" : "translate-x-[1px]"}`}
      >
        <PlayerMorphIcon
          icon={playing ? ICON_PAUSE : ICON_PLAY}
          size={size}
        />
      </span>
      {loading && (
        <span
          className="absolute animate-spin rounded-full border-[2px] border-current border-t-transparent"
          style={{ width: spinnerSize, height: spinnerSize }}
          aria-label="Loading playback"
        />
      )}
    </span>
  );
}

export function PlaybackControls({ size = "md" }: { size?: PlaybackControlsSize }) {
  const player = usePlayerState();
  const { t } = useTranslation();
  const dims = SIZES[size];
  const buttonStyle = { width: dims.button, height: dims.button };

  return (
    <div className="flex items-center" style={{ gap: dims.gap }}>
      <button
        type="button"
        aria-label={player.shuffle ? t("player.shuffle_on") : t("player.shuffle_off")}
        onClick={() => playerEngine.setShuffle(!player.shuffle)}
        className={`${iconButtonClass} ${
          player.shuffle ? "!text-white !opacity-100" : "!text-white/40"
        }`}
        style={buttonStyle}
      >
        <Shuffle size={dims.side} weight="Outline" />
      </button>

      <button
        type="button"
        aria-label="Previous track"
        onClick={() => void playerEngine.skipPrevious()}
        className={iconButtonClass}
        style={buttonStyle}
      >
        <SkipPrevious size={dims.skip} weight="Bold" />
      </button>

      <button
        type="button"
        aria-label={player.status === "playing" ? "Pause" : "Play"}
        onClick={() => void playerEngine.togglePlayPause()}
        className="inline-flex items-center justify-center text-white opacity-85 transition-all duration-150 ease-out hover:opacity-100 active:scale-[0.94] shrink-0 border-none bg-transparent cursor-pointer"
        style={{ width: dims.play, height: dims.play }}
      >
        <PlayPauseIcon status={player.status} size={dims.playIcon} spinnerSize={dims.spinner} />
      </button>

      <button
        type="button"
        aria-label="Next track"
        onClick={() => void playerEngine.skipNext()}
        className={iconButtonClass}
        style={buttonStyle}
      >
        <SkipNext size={dims.skip} weight="Bold" />
      </button>

      <button
        type="button"
        aria-label="Repeat"
        onClick={() =>
          playerEngine.setRepeat(
            // radio has no repeat-all: it refills instead of looping
            nextRepeatMode(player.repeat, isRadioContext(player.playbackContext)),
          )
        }
        className={`${iconButtonClass} ${
          player.repeat !== "off" ? "!text-white !opacity-100" : "!text-white/40"
        }`}
        style={buttonStyle}
      >
        {player.repeat === "one" ? (
          <RepeatOne size={dims.side} />
        ) : (
          <Repeat size={dims.side} />
        )}
      </button>
    </div>
  );
}
