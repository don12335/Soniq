import { useCallback, useEffect, createElement, useRef } from "react";
import { usePlayerState } from "../hooks/usePlayerState";
import { playerEngine } from "../engine/playerEngine";
import { useLyricsStore, braccatoThemeCss } from "@/features/lyrics";
import "@braccato/core/element";
import "@braccato/core/styles/variables.css";
import "@braccato/core/styles/lyrics.css";
import "@braccato/core/styles/instrumental.css";

const BRACCATO_TAG = "braccato-lyrics";

export interface BraccatoLyricsViewProps {
  lyrics: any[];
}

export function BraccatoLyricsView({ lyrics }: BraccatoLyricsViewProps) {
  const player = usePlayerState();
  const elementRef = useRef<any>(null);
  const latestLyricsRef = useRef(lyrics);
  const freeScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWheelTimeRef = useRef(0);
  const isInFreeSearchRef = useRef(false);
  const waitingForAudioAfterClickRef = useRef(false);

  const scrollToActiveLine = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const el = elementRef.current;
      if (!el) return false;

      const activeEls = (el as HTMLElement).querySelectorAll<HTMLElement>(
        ".blyrics--active",
      );
      if (activeEls.length === 0) return false;
      const activeEl = activeEls[activeEls.length - 1];

      const containerRect = el.getBoundingClientRect();
      const elRect = activeEl.getBoundingClientRect();
      if (containerRect.height === 0 || elRect.height === 0) return false;

      const offset = elRect.top - containerRect.top + el.scrollTop;
      const targetScrollTop =
        offset - containerRect.height / 2 + elRect.height / 2;

      if (behavior === "auto") {
        el.scrollTop = Math.max(0, targetScrollTop);
      } else {
        el.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior,
        });
      }
      return true;
    },
    [],
  );

  const returnToFollowingMode = useCallback(() => {
    if (freeScrollTimerRef.current) {
      clearTimeout(freeScrollTimerRef.current);
      freeScrollTimerRef.current = null;
    }
    isInFreeSearchRef.current = false;
    lastWheelTimeRef.current = 0;

    const el = elementRef.current;
    if (!el) return;

    if (el.renderer) {
      el.renderer.resumeAutoscroll?.();
      const engine = (el.renderer as any)?.engine;
      if (engine) {
        engine.scrollResumeTime = 0;
        engine.nextScrollAllowedTime = 0;
        engine.queuedScroll = true;
      }
    }

    scrollToActiveLine("smooth");
  }, [scrollToActiveLine]);

  const returnToFollowingModeRef = useRef(returnToFollowingMode);
  returnToFollowingModeRef.current = returnToFollowingMode;

  const handleUserInteraction = useCallback(() => {
    lastWheelTimeRef.current = Date.now();
    isInFreeSearchRef.current = true;

    const el = elementRef.current;
    if (el?.renderer) {
      el.renderer.noteUserScroll?.();
      el.renderer.noteUserScroll?.();
      el.renderer.noteUserScroll?.();
    }

    if (freeScrollTimerRef.current) {
      clearTimeout(freeScrollTimerRef.current);
      freeScrollTimerRef.current = null;
    }

    freeScrollTimerRef.current = setTimeout(() => {
      const elapsed = Date.now() - lastWheelTimeRef.current;
      if (elapsed < 5900) return;

      returnToFollowingMode();
    }, 6000);
  }, [returnToFollowingMode]);

  const handleUserInteractionRef = useRef(handleUserInteraction);
  handleUserInteractionRef.current = handleUserInteraction;

  const setElement = useCallback((el: any) => {
    elementRef.current = el;
    if (!el) return;
    el.theme = braccatoThemeCss;
    el.lyrics = latestLyricsRef.current;
    el.source = "#liner-audio";

    const handleBraccatoLineClick = (e: Event) => {
      const isAudioLoading = playerEngine.getSnapshot().status === "loading";
      if (isAudioLoading) {
        waitingForAudioAfterClickRef.current = true;
        isInFreeSearchRef.current = true;
        if (freeScrollTimerRef.current) {
          clearTimeout(freeScrollTimerRef.current);
          freeScrollTimerRef.current = null;
        }
        if (el.renderer) {
          el.renderer.noteUserScroll?.();
          el.renderer.noteUserScroll?.();
          el.renderer.noteUserScroll?.();
        }
      } else {
        returnToFollowingModeRef.current();
      }

      const detail = (e as CustomEvent).detail as
        | { timeS?: number; time?: number }
        | undefined;
      const timeMs =
        detail?.timeS !== undefined
          ? Math.round(detail.timeS * 1000)
          : detail?.time !== undefined
            ? detail.time > 1000
              ? Math.round(detail.time)
              : Math.round(detail.time * 1000)
            : null;
      if (timeMs !== null) {
        playerEngine.seek(timeMs, true);
      }
    };

    const onUserScroll = () => {
      handleUserInteractionRef.current();
    };

    const onLyricsLoaded = () => {
      if (waitingForAudioAfterClickRef.current) return;
      requestAnimationFrame(() => {
        if (!waitingForAudioAfterClickRef.current) {
          scrollToActiveLine("auto");
        }
      });
    };

    let syncRafId: number;
    let lastReportedIndex = -1;

    const checkActiveLine = () => {
      const audioEl = document.getElementById("liner-audio") as HTMLAudioElement | null;
      if (audioEl && !Number.isNaN(audioEl.currentTime)) {
        const currentMs = audioEl.currentTime * 1000;
        const lines = useLyricsStore.getState().syncedLines;
        let idx = -1;
        for (let i = 0; i < lines.length; i++) {
          const prevEnd =
            i > 0 && lines[i - 1].words && lines[i - 1].words!.length > 0
              ? lines[i - 1].words![lines[i - 1].words!.length - 1].endMs
              : i > 0
                ? lines[i - 1].timeMs
                : 0;
          const targetEarlyMs = Math.max(prevEnd, lines[i].timeMs - 600);
          if (targetEarlyMs <= currentMs) {
            idx = i;
          } else {
            break;
          }
        }
        if (idx !== lastReportedIndex) {
          lastReportedIndex = idx;
          useLyricsStore.getState().setActiveLineIndex(idx >= 0 ? idx : null);
        }
      }
      syncRafId = requestAnimationFrame(checkActiveLine);
    };

    syncRafId = requestAnimationFrame(checkActiveLine);

    el.addEventListener("braccato:lyrics-loaded", onLyricsLoaded);
    el.addEventListener("braccato:line-click", handleBraccatoLineClick);
    el.addEventListener("wheel", onUserScroll, { passive: true, capture: true });
    el.addEventListener("touchmove", onUserScroll, { passive: true, capture: true });

    return () => {
      cancelAnimationFrame(syncRafId);
      useLyricsStore.getState().setActiveLineIndex(null);
      el.removeEventListener("braccato:lyrics-loaded", onLyricsLoaded);
      el.removeEventListener("braccato:line-click", handleBraccatoLineClick);
      el.removeEventListener("wheel", onUserScroll, { capture: true });
      el.removeEventListener("touchmove", onUserScroll, { capture: true });
      if (freeScrollTimerRef.current) {
        clearTimeout(freeScrollTimerRef.current);
        freeScrollTimerRef.current = null;
      }
      elementRef.current = null;
    };
  }, [scrollToActiveLine]);

  useEffect(() => {
    latestLyricsRef.current = lyrics;
    const element = elementRef.current;
    if (element) element.lyrics = lyrics;
  }, [lyrics]);

  useEffect(() => {
    if (
      (player.status === "playing" || player.status === "paused") &&
      waitingForAudioAfterClickRef.current
    ) {
      waitingForAudioAfterClickRef.current = false;
      returnToFollowingMode();
    }
  }, [player.status, returnToFollowingMode]);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const checkAndScroll = () => {
      if (cancelled || waitingForAudioAfterClickRef.current) return;
      attempts++;
      const success = scrollToActiveLine("auto");
      if (!success && attempts < 30) {
        requestAnimationFrame(checkAndScroll);
      }
    };

    const rafId = requestAnimationFrame(checkAndScroll);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [lyrics, scrollToActiveLine]);

  return (
    <div className="relative flex flex-col flex-1 w-full h-full min-h-0">
      {createElement(BRACCATO_TAG, {
        ref: setElement,
        source: "#liner-audio",
        className: "block flex-1 w-full h-full px-6",
        style: {
          overflowY: "auto",
          overflowX: "hidden",
          position: "relative",
          scrollbarWidth: "none",
        },
      })}
    </div>
  );
}
