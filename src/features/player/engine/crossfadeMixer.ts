/** A short-lived Web Audio graph for iOS, where HTMLMediaElement.volume is ignored. */
export class CrossfadeMixer {
  private context: AudioContext | null = null;
  private nodes = new Map<HTMLAudioElement, { source: MediaElementAudioSourceNode; gain: GainNode }>();

  prime(): void {
    try {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = "playback";
    } catch {}
    try {
      this.context ??= new AudioContext();
      if (this.context.state !== "running") void this.context.resume().catch(() => {});
    } catch {
      // Normal sequential playback remains available when Web Audio is unavailable.
    }
  }

  get ready(): boolean {
    return this.context?.state === "running";
  }

  has(audio: HTMLAudioElement): boolean {
    return this.nodes.has(audio);
  }

  attach(audio: HTMLAudioElement, level: number): boolean {
    const context = this.context;
    if (!context || context.state !== "running") return false;
    try {
      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();
      gain.gain.value = level;
      source.connect(gain).connect(context.destination);
      this.nodes.set(audio, { source, gain });
      return true;
    } catch {
      return false;
    }
  }

  setLevel(audio: HTMLAudioElement, level: number): void {
    const gain = this.nodes.get(audio)?.gain.gain;
    if (!gain || !this.context) return;
    gain.cancelScheduledValues(this.context.currentTime);
    gain.setValueAtTime(Math.max(0, Math.min(1, level)), this.context.currentTime);
  }

  blend(outgoing: HTMLAudioElement, incoming: HTMLAudioElement, durationMs: number): boolean {
    const oldGain = this.nodes.get(outgoing)?.gain.gain;
    const newGain = this.nodes.get(incoming)?.gain.gain;
    const context = this.context;
    if (!oldGain || !newGain || !context || context.state !== "running") return false;
    const oldCurve = new Float32Array(64);
    const newCurve = new Float32Array(64);
    for (let i = 0; i < 64; i++) {
      const angle = (i / 63) * Math.PI / 2;
      oldCurve[i] = Math.cos(angle);
      newCurve[i] = Math.sin(angle);
    }
    const start = context.currentTime;
    oldGain.cancelScheduledValues(start);
    newGain.cancelScheduledValues(start);
    oldGain.setValueCurveAtTime(oldCurve, start, durationMs / 1_000);
    newGain.setValueCurveAtTime(newCurve, start, durationMs / 1_000);
    return true;
  }

  release(audio: HTMLAudioElement): void {
    const node = this.nodes.get(audio);
    if (!node) return;
    node.source.disconnect();
    node.gain.disconnect();
    this.nodes.delete(audio);
  }
}
