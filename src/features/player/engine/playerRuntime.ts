import { usePlayerStore } from "../store/playerStore";
import { ApiError } from "@/shared/api";
import { log } from "@/shared/utils/logger";
import { telemetry } from "@/shared/telemetry";
import { linerDb, audioCache } from "@/shared/storage";
import { isStandaloneAudioFile } from "@/shared/storage/audioFormat";
import type { Track } from "@/shared/types";
import { pitchShifter } from "./pitchShifter";
import { getCapabilities, toPlayableMediaUrl } from "@/shared/platform";
import { resolvePlaybackStream, type PlaybackStream } from "./streamResolver";
import { downloadAudioBytes } from "@/shared/media/innertube";
import { consumeSleepAfterTrack, getSleepTimer } from "./sleepTimer";

export class PlayerRuntime {
  private audio: HTMLAudioElement;
  private currentTrackId: string | null = null;
  private currentTrackDurationMs = 0;
  private completedCurrentTrack = false;
  private loggedDurationMismatch = false;
  private loadEpoch = 0;
  private loadAbortController: AbortController | null = null;
  private isResetting = false;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private outgoingAudio: HTMLAudioElement | null = null;
  private outgoingBlobUrl: string | null = null;
  private outgoingFadeTimer: ReturnType<typeof setTimeout> | null = null;
  private deviceSyncListener: (() => void) | null = null;
  private crossfadeRequested = false;
  private stallStartTime: number | null = null;
  private loadStartTime = 0;
  private ttfbMs = 0;
  private activePlayPromise: Promise<void> | null = null;
  private activeBlobUrl: string | null = null;
  private preloadingTrackId: string | null = null;
  private preloadingPromise: Promise<void> | null = null;
  private preloadAbortController: AbortController | null = null;
  private backgroundCacheAbortController: AbortController | null = null;
  private currentSessionExpiresAt: number | null = null;
  private recoveryAttempts = 0;
  public onEnded?: () => void;
  public onCrossfadeRequested?: () => boolean;
  public onError?: (info: { trackId: string; message: string }) => void;

  constructor() {
    const win = typeof window !== "undefined" ? (window as any) : null;
    let audio = (win?.__liner_audio || (typeof document !== "undefined" && document.getElementById("liner-audio"))) as HTMLAudioElement | null;
    if (!audio) {
      audio = new Audio();
      audio.id = "liner-audio";
      // native WebViews would need CORS headers from googlevideo, which it doesn't send for the app origin
      if (getCapabilities().crossOriginMedia) audio.crossOrigin = "anonymous";
      audio.preload = "auto";
      if (typeof document !== "undefined") {
        document.body.appendChild(audio);
      }
    }
    if (win) {
      win.__liner_audio = audio;
    }
    this.audio = audio;
    this.setupAudioListeners(this.audio);

    const initialVolume = usePlayerStore.getState().volume;
    this.audio.volume = initialVolume;
    this.applyPlaybackRateAndPitch();
    log("cyan", "boot", `volume ${initialVolume}`);

    usePlayerStore.subscribe((state, prevState) => {
      if (state.volume !== prevState.volume) {
        this.cancelFade();
        if (!this.audio.paused) {
          this.audio.volume = state.volume;
        }
      }
      if (
        state.playbackRate !== prevState.playbackRate ||
        state.isPitchLinked !== prevState.isPitchLinked ||
        state.pitchSemitones !== prevState.pitchSemitones ||
        state.isReverbEnabled !== prevState.isReverbEnabled ||
        state.reverbLevel !== prevState.reverbLevel
      ) {
        const rate = state.playbackRate ?? 1;
        const preservesPitch = !state.isPitchLinked;
        this.applyPlaybackRateAndPitch(rate, preservesPitch);
      }
    });

    this.setupDeviceChangeListener();
    this.setupMediaSession();
    if (getCapabilities().mediaProxy) {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") this.stopOutgoingAudio();
      });
    }
    log("green", "boot", "player runtime initialized");
  }

  private setupDeviceChangeListener() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;

    const onDeviceChange = () => {
      if (!usePlayerStore.getState().pauseOnDeviceChange) return;
      if (!this.audio.paused && usePlayerStore.getState().status === "playing") {
        this.pause();
      }
    };

    try {
      // Chromium starts a capture utility for this listener. Keep it active
      // only during playback and while the option is enabled.
      let listening = false;
      const syncListener = () => {
        const shouldListen = !this.audio.paused && usePlayerStore.getState().pauseOnDeviceChange;
        if (shouldListen === listening) return;
        if (shouldListen) navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
        else navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
        listening = shouldListen;
      };
      this.deviceSyncListener = syncListener;
      this.audio.addEventListener("playing", syncListener);
      this.audio.addEventListener("pause", syncListener);
      this.audio.addEventListener("ended", syncListener);
      usePlayerStore.subscribe((state, previous) => {
        if (state.pauseOnDeviceChange !== previous.pauseOnDeviceChange) syncListener();
      });
      syncListener();
    } catch {
      // ignore unsupported environments
    }
  }

  private setupMediaSession() {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler("play", () => {
        usePlayerStore.getState().dispatch({ type: "RESUME_REQUESTED" });
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        usePlayerStore.getState().dispatch({ type: "PAUSE_REQUESTED" });
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        usePlayerStore.getState().dispatch({ type: "SKIP_PREVIOUS" });
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        usePlayerStore.getState().dispatch({ type: "SKIP_NEXT" });
      });
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined && !Number.isNaN(details.seekTime)) {
          usePlayerStore.getState().dispatch({
            type: "SEEK_COMMITTED",
            positionMs: Math.round(details.seekTime * 1000),
          });
        }
      });
    } catch {
      // ignore unsupported media session actions
    }
  }

  public updateMediaSessionMetadata(track: Track | null) {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!track) {
      navigator.mediaSession.metadata = null;
      return;
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artists,
        album: (track as { albumTitle?: string }).albumTitle || "Soniq",
        artwork: track.coverUrl
          ? [
              { src: track.coverUrl, sizes: "96x96", type: "image/jpeg" },
              { src: track.coverUrl, sizes: "256x256", type: "image/jpeg" },
              { src: track.coverUrl, sizes: "512x512", type: "image/jpeg" },
            ]
          : [],
      });
    } catch {
      // ignore metadata assignment failures
    }
  }

  private setupAudioListeners(audioEl: HTMLAudioElement) {
    audioEl.addEventListener("timeupdate", () => {
      if (this.isResetting || audioEl !== this.audio) return;
      if (!this.currentTrackId) return;
      if (Number.isNaN(audioEl.currentTime)) return;

      const posMs = Math.round(audioEl.currentTime * 1000);
      const correctedDurationMs = this.iosCorrectedDurationMs(audioEl);
      const state = usePlayerStore.getState();
      const crossfadeSeconds = getCapabilities().mediaProxy ? Math.min(state.crossfadeSeconds, 1.5) : state.crossfadeSeconds;
      const durationMs = correctedDurationMs ?? (Number.isFinite(audioEl.duration) ? audioEl.duration * 1000 : this.currentTrackDurationMs);
      if (!this.crossfadeRequested && !getSleepTimer().afterTrack && state.status === "playing" && crossfadeSeconds > 0 &&
          durationMs > crossfadeSeconds * 2_000 && posMs > 0 &&
          durationMs - posMs <= crossfadeSeconds * 1_000 * Math.max(1, audioEl.playbackRate)) {
        this.crossfadeRequested = true;
        if (this.onCrossfadeRequested?.()) return;
        this.crossfadeRequested = false;
      }
      if (correctedDurationMs !== null && posMs >= correctedDurationMs + 750) {
        this.finishTrack(audioEl, "iOS catalog duration reached");
        return;
      }
      if (usePlayerStore.getState().status === "loading") return;
      usePlayerStore.getState().setPosition(correctedDurationMs === null ? posMs : Math.min(posMs, correctedDurationMs));
    });

    audioEl.addEventListener("durationchange", () => {
      if (this.isResetting || audioEl !== this.audio) return;
      if (!this.currentTrackId) return;
      const correctedDurationMs = this.iosCorrectedDurationMs(audioEl);
      if (correctedDurationMs !== null) {
        if (!this.loggedDurationMismatch) {
          log("yellow", "audio", `iOS duration mismatch: media ${Math.round(audioEl.duration)}s, catalog ${Math.round(correctedDurationMs / 1000)}s`);
          this.loggedDurationMismatch = true;
        }
        usePlayerStore.getState().setDuration(correctedDurationMs);
        return;
      }
      if (!Number.isFinite(audioEl.duration) || audioEl.duration <= 0) return;
      usePlayerStore.getState().setDuration(Math.round(audioEl.duration * 1000));
    });

    audioEl.addEventListener("waiting", () => {
      if (this.isResetting || audioEl !== this.audio) return;
      const correctedDurationMs = this.iosCorrectedDurationMs(audioEl);
      if (correctedDurationMs !== null && audioEl.currentTime * 1000 >= correctedDurationMs - 500) {
        this.finishTrack(audioEl, "iOS stream stopped at catalog end");
        return;
      }
      log("yellow", "audio", "buffering (waiting)");
      this.stallStartTime = performance.now();
      if (usePlayerStore.getState().status === "playing") {
        usePlayerStore.getState().setStatus("loading");
      }
    });

    audioEl.addEventListener("ended", () => {
      if (this.isResetting || audioEl !== this.audio) return;
      if (!this.currentTrackId) return;

      // Ensure the track truly finished playing (not an empty media load or teardown artefact)
      const durationMs = this.iosCorrectedDurationMs(audioEl) ?? audioEl.duration * 1000;
      const positionMs = audioEl.currentTime * 1000;
      if (Number.isFinite(durationMs) && durationMs > 0 && positionMs >= Math.max(0, durationMs - 1500)) {
        this.finishTrack(audioEl, "ended");
      }
    });

    audioEl.addEventListener("playing", () => {
      if (this.isResetting || audioEl !== this.audio) return;
      log("green", "audio", "playing");
      this.recoveryAttempts = 0;
      this.applyPlaybackRateAndPitch();

      if (this.stallStartTime !== null) {
        const stallDurationMs = Math.round(performance.now() - this.stallStartTime);
        if (stallDurationMs > 400) {
          telemetry.trackPlaybackHealth("STALL_BUFFERING", {
            trackId: this.currentTrackId || undefined,
            stallDurationMs,
          });
        }
        this.stallStartTime = null;
      }

      if (!this.currentTrackId || audioEl.paused) return;
      const currentStatus = usePlayerStore.getState().status;
      if (currentStatus !== "paused") {
        usePlayerStore.getState().setStatus("playing");
      }
    });

    audioEl.addEventListener("pause", () => {
      if (this.isResetting || audioEl !== this.audio) return;
      log("cyan", "audio", "paused");
      const st = usePlayerStore.getState().status;
      if (st === "playing") {
        usePlayerStore.getState().setStatus("paused");
      }
    });

    audioEl.addEventListener("error", () => {
      if (this.isResetting || audioEl !== this.audio) return;
      if (!this.currentTrackId || !audioEl.src || audioEl.src === window.location.href) return;

      const message = audioEl.error?.message || "Audio playback error";
      const code = audioEl.error?.code;
      console.error("[AudioElementError]", this.currentTrackId, code, message, audioEl.src);
      log("red", "audio", `error (code ${code}): ${message}`);

      const isDecode =
        code === (typeof MediaError !== "undefined" ? MediaError.MEDIA_ERR_DECODE : 3) ||
        code === (typeof MediaError !== "undefined" ? MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED : 4);

      if (isDecode) {
        telemetry.trackPlaybackHealth("MEDIA_DECODE_ERROR", {
          trackId: this.currentTrackId || undefined,
          errorMessage: message,
          details: { mediaErrorCode: code },
        });
      }

      if (this.activeBlobUrl) {
        URL.revokeObjectURL(this.activeBlobUrl);
        this.activeBlobUrl = null;
        void linerDb.deleteAudio(this.currentTrackId);
        audioCache.deleteAudio(this.currentTrackId);
      }

      const store = usePlayerStore.getState();
      const currentTrack = store.currentTrack;
      if (
        currentTrack &&
        currentTrack.id === this.currentTrackId &&
        this.recoveryAttempts < 1
      ) {
        this.recoveryAttempts++;
        const posMs = store.positionMs;
        log("yellow", "playback", `audio error encountered — recovering via cache/stream at ${posMs}ms`);
        void this.loadAndPlay(currentTrack, posMs, true);
        return;
      }

      usePlayerStore.getState().setStatus("error", message);
      this.onError?.({ trackId: this.currentTrackId, message });
    });
  }

  private iosCorrectedDurationMs(audioEl: HTMLAudioElement): number | null {
    if (!getCapabilities().mediaProxy || this.currentTrackDurationMs <= 0) return null;
    const mediaDurationMs = audioEl.duration * 1000;
    if (Number.isNaN(mediaDurationMs) || mediaDurationMs <= 0) return null;
    const excessMs = Math.max(10_000, this.currentTrackDurationMs * 0.2);
    return !Number.isFinite(mediaDurationMs) || mediaDurationMs > this.currentTrackDurationMs + excessMs
      ? this.currentTrackDurationMs
      : null;
  }

  private finishTrack(audioEl: HTMLAudioElement, reason: string): void {
    if (this.completedCurrentTrack) return;
    this.completedCurrentTrack = true;
    log("cyan", "audio", `${reason} — skipping to next`);
    if (!audioEl.paused) audioEl.pause();
    this.onEnded?.();
    if (consumeSleepAfterTrack()) {
      usePlayerStore.getState().dispatch({ type: "PAUSE_REQUESTED" });
      return;
    }
    usePlayerStore.getState().dispatch({ type: "SKIP_NEXT", isAutoEnd: true });
  }

  public getCurrentTrackId(): string | null {
    return this.currentTrackId;
  }

  public hasLoadedSourceFor(trackId: string): boolean {
    const isExpired =
      this.currentSessionExpiresAt !== null &&
      Date.now() >= this.currentSessionExpiresAt - 15_000;
    return (
      this.currentTrackId === trackId &&
      Boolean(this.audio.currentSrc || this.audio.src) &&
      this.audio.src !== window.location.href &&
      !this.audio.error &&
      !isExpired
    );
  }

  public applyPlaybackRateAndPitch(rate?: number, preservesPitch?: boolean): void {
    if (!this.audio) return;
    const store = usePlayerStore.getState();
    const targetRate = rate ?? store.playbackRate ?? 1;
    const targetPreserves =
      preservesPitch ?? (store.isPitchLinked !== undefined ? !store.isPitchLinked : true);

    try {
      this.audio.playbackRate = targetRate;
      this.audio.defaultPlaybackRate = targetRate;
      this.audio.preservesPitch = targetPreserves;
      (this.audio as any).mozPreservesPitch = targetPreserves;
      (this.audio as any).webkitPreservesPitch = targetPreserves;
    } catch {
      // Audio element not initialized or properties unsupported
    }

    try {
      const isPitchLinked = store.isPitchLinked ?? true;
      const pitchSemitones = store.pitchSemitones ?? 0;
      const isReverbEnabled = store.isReverbEnabled ?? false;
      const reverbLevel = store.reverbLevel ?? 0.35;
      const needsEffects = isReverbEnabled || (!isPitchLinked && Math.abs(pitchSemitones) >= 0.05);
      if (!needsEffects && !pitchShifter.isAttached()) return;
      // WebAudio is suspended in the background on iOS, which would stop playback
      if (!getCapabilities().audioEffects) return;
      pitchShifter.attach(this.audio);
      pitchShifter.update({
        pitchSemitones,
        isPitchLinked,
        isReverbEnabled,
        reverbLevel,
      });
    } catch (err) {
      console.error("[PlayerRuntime] applyPlaybackRateAndPitch error:", err);
    }
  }

  private cancelFade(): void {
    if (this.fadeTimer !== null) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  public canCrossfade(): boolean {
    const state = usePlayerStore.getState();
    return state.crossfadeSeconds > 0 && this.currentTrackId !== null && !this.audio.paused &&
      !this.outgoingAudio && !pitchShifter.isAttached() &&
      (!getCapabilities().mediaProxy || document.visibilityState === "visible");
  }

  private stopOutgoingAudio(): void {
    if (this.outgoingFadeTimer !== null) clearTimeout(this.outgoingFadeTimer);
    this.outgoingFadeTimer = null;
    const outgoing = this.outgoingAudio;
    this.outgoingAudio = null;
    if (outgoing) {
      outgoing.pause();
      outgoing.removeAttribute("src");
      outgoing.load();
      outgoing.remove();
    }
    if (this.outgoingBlobUrl) URL.revokeObjectURL(this.outgoingBlobUrl);
    this.outgoingBlobUrl = null;
  }

  private prepareCrossfade(): void {
    const outgoing = this.audio;
    const incoming = new Audio();
    outgoing.id = "liner-audio-outgoing";
    incoming.id = "liner-audio";
    incoming.preload = "auto";
    if (getCapabilities().crossOriginMedia) incoming.crossOrigin = "anonymous";
    document.body.appendChild(incoming);
    this.outgoingAudio = outgoing;
    this.outgoingBlobUrl = this.activeBlobUrl;
    this.activeBlobUrl = null;
    this.audio = incoming;
    (window as any).__liner_audio = incoming;
    this.setupAudioListeners(incoming);
    if (this.deviceSyncListener) {
      for (const event of ["playing", "pause", "ended"]) incoming.addEventListener(event, this.deviceSyncListener);
      this.deviceSyncListener();
    }
  }

  private fadeOutgoingAudio(durationMs: number): void {
    const outgoing = this.outgoingAudio;
    if (!outgoing) return;
    // iOS ignores HTMLMediaElement.volume. Keep a short overlap there, then stop the old stream.
    const effectiveMs = getCapabilities().volumeControl ? durationMs : Math.min(durationMs, 1_500);
    const start = performance.now();
    const initialVolume = outgoing.volume;
    const tick = () => {
      if (outgoing !== this.outgoingAudio) return;
      const progress = Math.min((performance.now() - start) / effectiveMs, 1);
      if (getCapabilities().volumeControl) outgoing.volume = initialVolume * Math.cos(progress * Math.PI / 2);
      if (progress < 1) this.outgoingFadeTimer = setTimeout(tick, 16);
      else this.stopOutgoingAudio();
    };
    tick();
  }

  private finishTransition(mixing: boolean, crossfadeMs: number): void {
    const outgoing = this.outgoingAudio;
    const remainingMs = outgoing && Number.isFinite(outgoing.duration)
      ? Math.max(0, (outgoing.duration - outgoing.currentTime) * 1_000)
      : crossfadeMs;
    const fadeMs = mixing && outgoing && !outgoing.paused && !outgoing.ended
      ? Math.min(crossfadeMs, remainingMs) : 0;
    this.fadeVolume(
      usePlayerStore.getState().volume,
      fadeMs > 0 && getCapabilities().volumeControl ? fadeMs : 180,
    );
    if (fadeMs > 0) this.fadeOutgoingAudio(fadeMs);
    else this.stopOutgoingAudio();
  }

  private fadeVolume(
    targetVolume: number,
    durationMs: number = 180,
    onComplete?: () => void,
  ): void {
    this.cancelFade();
    const startVolume = this.audio.volume;
    const diff = targetVolume - startVolume;
    if (Math.abs(diff) < 0.001 || durationMs <= 0) {
      this.audio.volume = Math.max(0, Math.min(1, targetVolume));
      onComplete?.();
      return;
    }

    const startTime = performance.now();

    const tick = () => {
      const now = performance.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 0.5 - 0.5 * Math.cos(progress * Math.PI);
      const current = startVolume + diff * eased;
      this.audio.volume = Math.max(0, Math.min(1, current));

      if (progress < 1) {
        // audio fade ticks independently of display vsync in background
        this.fadeTimer = setTimeout(tick, 16);
      } else {
        this.fadeTimer = null;
        this.audio.volume = Math.max(0, Math.min(1, targetVolume));
        onComplete?.();
      }
    };

    this.fadeTimer = setTimeout(tick, 16);
  }

  private safeResetAudioElement() {
    this.isResetting = true;
    this.currentSessionExpiresAt = null;
    try {
      this.cancelFade();
      this.audio.pause();
      if (this.activeBlobUrl) {
        URL.revokeObjectURL(this.activeBlobUrl);
        this.activeBlobUrl = null;
      }
      this.audio.removeAttribute("src");
      this.audio.load();
    } catch {
    } finally {
      this.isResetting = false;
    }
  }

  public cancelPendingLoad(): void {
    this.stopOutgoingAudio();
    this.loadEpoch += 1;
    this.loadAbortController?.abort();
    this.loadAbortController = null;
    this.backgroundCacheAbortController?.abort();
    this.backgroundCacheAbortController = null;
    this.currentTrackId = null;
    this.currentTrackDurationMs = 0;
    this.completedCurrentTrack = false;
    this.crossfadeRequested = false;
    this.currentSessionExpiresAt = null;
    this.recoveryAttempts = 0;
    this.safeResetAudioElement();
    usePlayerStore.getState().setStatus("paused");
    log("cyan", "playback", "pending load cancelled");
  }

  public async preloadTrack(track: Track): Promise<void> {
    if (this.currentTrackId === track.id) return;
    if (this.preloadingTrackId === track.id) return;

    const cached = await linerDb.getAudio(track.id);
    if (cached) return;

    this.preloadAbortController?.abort();
    const controller = new AbortController();
    this.preloadAbortController = controller;
    this.preloadingTrackId = track.id;

    const promise = (async () => {
      try {
        const stream = await resolvePlaybackStream(track, controller.signal);
        if (controller.signal.aborted) return;

        const blob = await this.downloadAudioBlob(stream, controller.signal);
        if (!blob || controller.signal.aborted) return;
        await linerDb.putAudio(track.id, blob, blob.type);
        await linerDb.putTrack(track);
        log(
          "green",
          "preload",
          `preloaded audio: "${track.title}" (${Math.round(blob.size / 1024)} KB)`,
        );
      } catch {
      } finally {
        if (this.preloadingTrackId === track.id) {
          this.preloadingTrackId = null;
          this.preloadingPromise = null;
          this.preloadAbortController = null;
        }
      }
    })();

    this.preloadingPromise = promise;
    await promise;
  }

  private pendingStartPositionMs = 0;

  public setPendingSeek(positionMs: number): void {
    this.pendingStartPositionMs = positionMs;
    usePlayerStore.getState().setPosition(positionMs);
    if (this.audio.src && this.audio.src !== window.location.href) {
      try {
        if (this.audio.readyState >= 1) {
          this.audio.currentTime = positionMs / 1000;
        } else {
          this.audio.addEventListener(
            "loadedmetadata",
            () => {
              try {
                this.audio.currentTime = positionMs / 1000;
              } catch {}
            },
            { once: true },
          );
        }
      } catch {}
    }
  }

  public async loadAndPlay(
    track: Track,
    startPositionMs: number = 0,
    bypassCache: boolean = false,
    crossfadeMs: number = 0,
  ) {
    this.cancelFade();
    const mixing = crossfadeMs > 0 && this.canCrossfade();
    if (mixing) this.prepareCrossfade();
    else this.stopOutgoingAudio();
    this.pendingStartPositionMs = startPositionMs;
    const epoch = ++this.loadEpoch;

    if (this.currentTrackId !== track.id) {
      this.recoveryAttempts = 0;
    }

    if (mixing && this.preloadingTrackId === track.id) {
      this.preloadAbortController?.abort();
      this.preloadingTrackId = null;
      this.preloadingPromise = null;
      this.preloadAbortController = null;
    } else if (this.preloadingTrackId === track.id && this.preloadingPromise) {
      await this.preloadingPromise;
    } else if (this.preloadingTrackId && this.preloadingTrackId !== track.id) {
      this.preloadAbortController?.abort();
      this.preloadAbortController = null;
      this.preloadingTrackId = null;
      this.preloadingPromise = null;
    }

    this.loadAbortController?.abort();
    const controller = new AbortController();
    this.loadAbortController = controller;

    this.backgroundCacheAbortController?.abort();
    const bgCacheController = new AbortController();
    this.backgroundCacheAbortController = bgCacheController;

    const store = usePlayerStore.getState();
    if (!store.keepSpeedAcrossTracks && this.currentTrackId !== track.id) {
      store.resetSpeedAndPitch();
    }
    this.currentTrackId = track.id;
    this.currentTrackDurationMs = track.durationMs ?? 0;
    this.completedCurrentTrack = false;
    this.crossfadeRequested = false;
    this.loggedDurationMismatch = false;
    this.loadStartTime = performance.now();
    this.updateMediaSessionMetadata(track);

    store.setStatus("loading", null);
    store.setPosition(startPositionMs > 0 ? startPositionMs : 0);

    this.safeResetAudioElement();

    try {
      const cachedAudio = bypassCache ? null : await linerDb.getAudio(track.id);
      if (epoch !== this.loadEpoch || controller.signal.aborted) {
        return;
      }

      const isValidCachedBlob =
        Boolean(cachedAudio?.blob) &&
        cachedAudio!.blob.size > 0 &&
        (!cachedAudio!.blob.type || cachedAudio!.blob.type.startsWith("audio/"));

      if (cachedAudio && !isValidCachedBlob) {
        void linerDb.deleteAudio(track.id);
        audioCache.deleteAudio(track.id);
      }

      if (cachedAudio && isValidCachedBlob) {
        this.currentSessionExpiresAt = null;
        void linerDb.putTrack(track);
        const blobUrl = URL.createObjectURL(cachedAudio.blob);
        this.activeBlobUrl = blobUrl;
        this.audio.src = blobUrl;
        this.audio.volume = 0;
        this.audio.load();
        this.applyPlaybackRateAndPitch();

        const targetPosition =
          this.pendingStartPositionMs > 0
            ? this.pendingStartPositionMs
            : startPositionMs;
        this.seekWhenReady(epoch, targetPosition);
        log(
          "cyan",
          "playback",
          `audio cache hit for "${track.title}" (${Math.round(cachedAudio.byteSize / 1024)} KB)`,
        );

        if (this.audio.readyState < 3) {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 3000);
            const onCanPlay = () => {
              clearTimeout(timeout);
              this.audio.removeEventListener("canplay", onCanPlay);
              this.audio.removeEventListener("error", onCanPlay);
              resolve();
            };
            this.audio.addEventListener("canplay", onCanPlay, { once: true });
            this.audio.addEventListener("error", onCanPlay, { once: true });
          });
        }

        if (epoch !== this.loadEpoch || controller.signal.aborted) return;

        const playPromise = this.audio.play();
        this.activePlayPromise = playPromise;
        await playPromise;

        const audioStartLatencyMs = Math.round(
          performance.now() - this.loadStartTime,
        );

        if (epoch === this.loadEpoch) {
          usePlayerStore.getState().setStatus("playing");
          this.finishTransition(mixing, crossfadeMs);
        }
        log(
          "green",
          "playback",
          `started (cached): ${track.title} in ${audioStartLatencyMs}ms`,
        );
        return;
      }

      const stream = await resolvePlaybackStream(track, controller.signal);
      this.ttfbMs = Math.round(performance.now() - this.loadStartTime);

      if (epoch !== this.loadEpoch || controller.signal.aborted) {
        log("yellow", "playback", `superseded before stream ready (${track.title})`);
        return;
      }

      const streamCodec = stream.codec;
      const streamBitrate = stream.bitrate;
      this.currentSessionExpiresAt = stream.expiresAtMs;
      log("cyan", "playback", `resolved stream for ${track.title}`);
      if (this.activeBlobUrl) {
        URL.revokeObjectURL(this.activeBlobUrl);
        this.activeBlobUrl = null;
      }
      const url = stream.blob ? URL.createObjectURL(stream.blob) : toPlayableMediaUrl(stream.url);
      if (stream.blob) this.activeBlobUrl = url;
      this.audio.src = url;
      this.audio.volume = 0;
      this.audio.load();
      this.applyPlaybackRateAndPitch();

      const targetPosition =
        this.pendingStartPositionMs > 0
          ? this.pendingStartPositionMs
          : startPositionMs;
      this.seekWhenReady(epoch, targetPosition);
      log(
        "green",
        "playback",
        `stream attached: ${streamCodec} ${streamBitrate} bps (${track.title})`,
      );

      if (this.audio.readyState < 3) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 3000);
          const onCanPlay = () => {
            clearTimeout(timeout);
            this.audio.removeEventListener("canplay", onCanPlay);
            this.audio.removeEventListener("error", onCanPlay);
            resolve();
          };
          this.audio.addEventListener("canplay", onCanPlay, { once: true });
          this.audio.addEventListener("error", onCanPlay, { once: true });
        });
      }

      if (epoch !== this.loadEpoch || controller.signal.aborted) return;

      const playPromise = this.audio.play();
      this.activePlayPromise = playPromise;
      await playPromise;

      const audioStartLatencyMs = Math.round(
        performance.now() - this.loadStartTime,
      );

      if (epoch === this.loadEpoch) {
        usePlayerStore.getState().setStatus("playing");
        this.finishTransition(mixing, crossfadeMs);
        this.cacheAudioInBackground(track, stream, bgCacheController.signal);
      }
      log(
        "green",
        "playback",
        `started: ${track.title} in ${audioStartLatencyMs}ms`,
      );

      telemetry.trackPlaybackHealth("INIT_LATENCY", {
        trackId: track.id,
        codec: streamCodec,
        bitrate: streamBitrate,
        timeToFirstByteMs: this.ttfbMs,
        audioStartLatencyMs,
      });
    } catch (error) {
      if (epoch !== this.loadEpoch || controller.signal.aborted) {
        return;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      if (error instanceof DOMException && error.name === "NotAllowedError") {
        this.stopOutgoingAudio();
        log("yellow", "playback", "autoplay blocked — waiting for user gesture");
        usePlayerStore.getState().setStatus("paused");
        return;
      }

      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Playback failed to start.";
      console.error("[LoadAndPlayError]", track.id, error);
      this.stopOutgoingAudio();
      log("red", "playback", `failed: ${message}`);
      usePlayerStore.getState().setStatus("error", message);

      telemetry
        .reportError(error, {
          action: "playback_failed",
          trackId: track.id,
          title: track.title,
        })
        .catch(() => {});

      this.onError?.({ trackId: track.id, message });
    } finally {
      if (epoch === this.loadEpoch) {
        this.activePlayPromise = null;
      }
    }
  }

  private seekWhenReady(epoch: number, positionMs: number) {
    if (positionMs <= 0) return;
    const apply = () => {
      if (epoch !== this.loadEpoch) return;
      try {
        this.audio.currentTime = positionMs / 1000;
      } catch {
        // Media not seekable yet — ignore
      }
    };
    if (this.audio.readyState >= 1) {
      apply();
    } else {
      this.audio.addEventListener("loadedmetadata", apply, { once: true });
    }
  }

  public pause() {
    this.stopOutgoingAudio();
    const epoch = ++this.loadEpoch;
    this.loadAbortController?.abort();
    this.loadAbortController = null;
    usePlayerStore.getState().setStatus("paused");
    log("cyan", "audio", "pause requested (fading out)");

    this.fadeVolume(0, 180, () => {
      if (epoch !== this.loadEpoch) return;
      this.audio.pause();
    });
  }

  public resume() {
    const epoch = ++this.loadEpoch;
    this.loadAbortController?.abort();
    this.loadAbortController = null;

    const targetVolume = usePlayerStore.getState().volume;
    usePlayerStore.getState().setStatus("playing");
    pitchShifter.resumeContext();
    this.applyPlaybackRateAndPitch();
    log("cyan", "audio", "resume requested (fading in)");

    const currentTrack = usePlayerStore.getState().currentTrack;
    const isExpired =
      this.currentSessionExpiresAt !== null &&
      Date.now() >= this.currentSessionExpiresAt - 15_000;
    const hasMediaError = Boolean(this.audio.error);
    const hasValidSource =
      Boolean(this.audio.src) &&
      this.audio.src !== window.location.href &&
      !isExpired &&
      !hasMediaError;

    if (!hasValidSource && currentTrack) {
      void this.loadAndPlay(
        currentTrack,
        usePlayerStore.getState().positionMs,
      );
      return;
    }

    if (this.audio.paused) {
      this.audio.volume = 0;
      const playPromise = this.audio.play();
      this.activePlayPromise = playPromise;
      playPromise
        .then(() => {
          if (epoch !== this.loadEpoch) return;
          this.fadeVolume(targetVolume, 180);
        })
        .catch((error) => {
          if (epoch !== this.loadEpoch) return;
          if (error.name === "NotAllowedError") {
            log("yellow", "audio", "play blocked — waiting for user gesture");
            usePlayerStore.getState().setStatus("paused");
          } else if (error.name !== "AbortError") {
            log("red", "audio", `play failed: ${String(error)}`);
            if (currentTrack && this.recoveryAttempts < 1) {
              this.recoveryAttempts++;
              log("yellow", "playback", "resume failed — attempting cache/stream recovery");
              void this.loadAndPlay(currentTrack, usePlayerStore.getState().positionMs, true);
              return;
            }
            usePlayerStore.getState().setStatus("paused");
          }
        })
        .finally(() => {
          if (epoch === this.loadEpoch) this.activePlayPromise = null;
        });
    } else {
      this.fadeVolume(targetVolume, 180);
    }
  }

  public seek(positionMs: number) {
    this.stopOutgoingAudio();
    if (!this.audio.src || this.audio.src === window.location.href) return;
    try {
      if (this.audio.readyState >= 1) {
        this.audio.currentTime = positionMs / 1000;
      } else {
        this.audio.addEventListener(
          "loadedmetadata",
          () => {
            try {
              this.audio.currentTime = positionMs / 1000;
            } catch {}
          },
          { once: true },
        );
      }
    } catch {
      // Ignore seek error if media not yet ready
    }
  }

  private async downloadAudioBlob(stream: PlaybackStream, signal: AbortSignal): Promise<Blob | null> {
    if (stream.blob) return stream.blob;
    const startedAt = performance.now();
    const bytes = await downloadAudioBytes(stream.url, {
      contentLength: stream.contentLength,
      signal,
    });
    if (!bytes || signal.aborted) return null;
    const mimeType = stream.mimeType || "audio/webm";
    if (!mimeType.startsWith("audio/") && !mimeType.startsWith("video/")) return null;
    if (!isStandaloneAudioFile(bytes.subarray(0, 16))) {
      log("yellow", "download", `not caching: stream is not a standalone audio file`);
      return null;
    }
    log(
      "cyan",
      "download",
      `${Math.round(bytes.byteLength / 1024)} KB in ${Math.round(performance.now() - startedAt)}ms (${stream.contentLength ? "chunked" : "single request"})`,
    );
    return new Blob([bytes], { type: mimeType });
  }

  private cacheAudioInBackground(track: Track, stream: PlaybackStream, signal: AbortSignal) {
    if (track.durationMs && track.durationMs > 20 * 60 * 1000) return;
    void (async () => {
      try {
        const blob = await this.downloadAudioBlob(stream, signal);
        if (!blob || signal.aborted) return;
        await linerDb.putAudio(track.id, blob, blob.type);
        await linerDb.putTrack(track);
        log("green", "playback", `background cached: ${track.title} (${Math.round(blob.size / 1024)} KB)`);
      } catch {}
    })();
  }
}

export const playerRuntime =
  typeof window !== "undefined" ? new PlayerRuntime() : null;
