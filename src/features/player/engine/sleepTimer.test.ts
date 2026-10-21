import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "../store/playerStore";
import {
  cancelSleepTimer, consumeSleepAfterTrack, getSleepTimer, setSleepAfterTrack, setSleepMinutes,
} from "./sleepTimer";

const originalDispatch = usePlayerStore.getState().dispatch;
afterEach(() => {
  cancelSleepTimer();
  usePlayerStore.setState({ dispatch: originalDispatch });
  vi.useRealTimers();
});

describe("sleep timer", () => {
  it("pauses once when the chosen time expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const dispatch = vi.fn();
    usePlayerStore.setState({ dispatch });
    setSleepMinutes(15);
    vi.advanceTimersByTime(14 * 60_000);
    expect(dispatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "PAUSE_REQUESTED" });
    expect(getSleepTimer().deadline).toBeNull();
  });

  it("uses the end-of-track option once", () => {
    setSleepAfterTrack();
    expect(consumeSleepAfterTrack()).toBe(true);
    expect(consumeSleepAfterTrack()).toBe(false);
  });
});
