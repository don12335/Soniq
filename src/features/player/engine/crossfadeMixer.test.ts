import { afterEach, describe, expect, it, vi } from "vitest";
import { CrossfadeMixer } from "./crossfadeMixer";

afterEach(() => vi.unstubAllGlobals());

describe("CrossfadeMixer", () => {
  it("ramps the old track down and the new track up", () => {
    const gains: Array<{ gain: { value: number; cancelScheduledValues: ReturnType<typeof vi.fn>; setValueAtTime: ReturnType<typeof vi.fn>; setValueCurveAtTime: ReturnType<typeof vi.fn> }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
    class MockAudioContext {
      state = "running";
      currentTime = 10;
      destination = {};
      createMediaElementSource() { return { connect: vi.fn((node: unknown) => node), disconnect: vi.fn() }; }
      createGain() {
        const node = {
          gain: { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), setValueCurveAtTime: vi.fn() },
          connect: vi.fn((destination: unknown) => destination), disconnect: vi.fn(),
        };
        gains.push(node);
        return node;
      }
    }
    vi.stubGlobal("AudioContext", MockAudioContext);
    const mixer = new CrossfadeMixer();
    mixer.prime();
    const old = new Audio();
    const next = new Audio();
    expect(mixer.attach(old, 1)).toBe(true);
    expect(mixer.attach(next, 0)).toBe(true);
    expect(mixer.blend(old, next, 5_000)).toBe(true);
    const oldCurve = gains[0].gain.setValueCurveAtTime.mock.calls[0][0] as Float32Array;
    const newCurve = gains[1].gain.setValueCurveAtTime.mock.calls[0][0] as Float32Array;
    expect(oldCurve[0]).toBeCloseTo(1);
    expect(oldCurve[63]).toBeCloseTo(0);
    expect(newCurve[0]).toBeCloseTo(0);
    expect(newCurve[63]).toBeCloseTo(1);
    expect(gains[0].gain.setValueCurveAtTime).toHaveBeenCalledWith(oldCurve, 10, 5);
  });
});
