// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearHistory, hasListeningHistory, heardTrackIds, listHistory, recordPlayback, subscribeToHistory, topTracks } from "./localHistory";
import type { RecordPlaybackEventRequest } from "../contracts";

const play = (id: string, patch: Partial<RecordPlaybackEventRequest> = {}): RecordPlaybackEventRequest => ({
  playbackSessionId: `s-${id}`,
  listeningSessionId: "l",
  trackId: id,
  trackSnapshot: { id, title: `Song ${id}`, artists: [{ id: "a", name: "A" }], durationMs: 200_000 },
  playedDurationMs: 200_000,
  completionRate: 1,
  completed: true,
  ...patch,
});

describe("localHistory", () => {
  beforeEach(() => localStorage.clear());

  it("records real listens newest first and ignores quick skips", () => {
    recordPlayback(play("a"));
    recordPlayback(play("b"));
    recordPlayback(play("skip", { completed: false, skipped: true, playedDurationMs: 4_000, completionRate: 0.02 }));
    recordPlayback(play("nosnap", { trackSnapshot: undefined }));
    expect(listHistory().items.map((i) => i.track.id)).toEqual(["b", "a"]);
  });

  it("paginates with a cursor", () => {
    for (const id of ["1", "2", "3"]) recordPlayback(play(id));
    const first = listHistory(undefined, 2);
    expect(first.items.map((i) => i.track.id)).toEqual(["3", "2"]);
    expect(first.nextCursor).toBe("2");
    expect(listHistory(first.nextCursor!, 2)).toMatchObject({ nextCursor: null });
  });

  it("ranks tracks by how much they were listened to", () => {
    recordPlayback(play("once"));
    recordPlayback(play("often"));
    recordPlayback(play("often"));
    recordPlayback(play("partial", { completed: false, playedDurationMs: 60_000, completionRate: 0.3 }));
    expect(topTracks(2).map((s) => s.track.id)).toEqual(["often", "once"]);
    expect(topTracks()[0].plays).toBe(2);
    expect(heardTrackIds()).toEqual(new Set(["once", "often", "partial"]));
  });

  it("updates subscribers after the first real listen and after clearing history", () => {
    const states: boolean[] = [];
    const unsubscribe = subscribeToHistory(() => states.push(hasListeningHistory()));
    recordPlayback(play("preview", { completed: false, playedDurationMs: 4_000 }));
    expect(states).toEqual([]);
    recordPlayback(play("song"));
    clearHistory();
    unsubscribe();
    expect(states).toEqual([true, false]);
  });
});
