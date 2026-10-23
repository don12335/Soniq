// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/shared/api";
import { recordPlayback } from "@/shared/api/localHistory";
import type { Track } from "@/shared/types";
import {
  buildBecauseRecommendation, buildMixedRecommendations, isBecauseRefreshDue, isMixRefreshDue,
  RECOMMENDATION_REFRESH_MS, pickSeeds, readCachedRecommendations,
} from "./recommendations";

const vid = (n: number) => `video${String(n).padStart(6, "0")}`;
const track = (id: string): Track => ({ id, title: id, artists: "A", coverUrl: "", durationMs: 1, playCount: 0 });
const fixed = () => 0;
let playbackCount = 0;
const listen = (id: string) => recordPlayback({
  playbackSessionId: `${id}-${++playbackCount}`, listeningSessionId: "l", trackId: id,
  trackSnapshot: { id, title: id, artists: [{ id: "a", name: "A" }], durationMs: 100_000 },
  playedDurationMs: 100_000, completionRate: 1, completed: true,
});

describe("recommendations", () => {
  beforeEach(() => {
    playbackCount = 0;
    localStorage.clear();
    vi.spyOn(api, "listLikedTracks").mockResolvedValue({ items: [], nextCursor: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it("samples the full history stably when one new song is added", () => {
    const history = Array.from({ length: 50 }, (_, i) => track(vid(i + 1)));
    const before = pickSeeds(history, []).map((seed) => seed.id);
    const after = pickSeeds([track(vid(99)), ...history], []).map((seed) => seed.id);
    expect(pickSeeds([...history].reverse(), []).map((seed) => seed.id)).toEqual(before);
    expect(after.filter((id) => before.includes(id)).length).toBeGreaterThanOrEqual(3);
    expect(pickSeeds([], [track(vid(7))]).map((seed) => seed.id)).toEqual([vid(7)]);
    expect(pickSeeds([track("sc:invalid")], [])).toEqual([]);
  });

  it("keeps the mix for three hours even when new songs are played", async () => {
    listen(vid(9));
    const radio = vi.spyOn(api, "getRadio").mockImplementation(async (id) => ({
      items: Array.from({ length: 20 }, (_, i) => ({
        id: vid(Number(id.slice(-6)) * 100 + i + 1), title: id,
        artists: [{ id: "a", name: "A" }], durationMs: 100_000,
      })),
    }));
    const first = await buildMixedRecommendations();
    expect(first?.tracks).toHaveLength(15);
    const updatedAt = JSON.parse(localStorage.getItem("soniq_home_recommendations_v4")!).mixUpdatedAt as number;
    expect(isMixRefreshDue(updatedAt + RECOMMENDATION_REFRESH_MS - 1)).toBe(false);
    expect(isMixRefreshDue(updatedAt + RECOMMENDATION_REFRESH_MS)).toBe(true);

    listen(vid(1));
    listen(vid(2));
    listen(vid(3));
    expect(isMixRefreshDue(updatedAt + 60_000)).toBe(false);
    radio.mockClear();
    const next = await buildMixedRecommendations(first ?? undefined);
    expect(new Set(radio.mock.calls.map(([id]) => id))).toEqual(new Set([vid(3), vid(2), vid(1), vid(9)]));
    for (const seed of [vid(3), vid(2), vid(1), vid(9)]) {
      expect(next?.tracks.filter((item) => item.title === seed).length).toBeLessThanOrEqual(4);
    }
    expect(readCachedRecommendations()?.[0].tracks).toEqual(next?.tracks);
  });

  it("keeps established listening types after one unrelated play", async () => {
    for (let i = 0; i < 8; i++) listen(vid(1));
    listen(vid(2));
    vi.spyOn(api, "getRadio").mockImplementation(async (id) => ({
      items: Array.from({ length: 30 }, (_, i) => ({
        id: vid(Number(id.slice(-6)) * 100 + i + 1), title: id,
        artists: [{ id: "a", name: "A" }], durationMs: 100_000,
      })),
    }));
    const mix = await buildMixedRecommendations();
    const established = mix?.tracks.filter((item) => item.title === vid(1)).length ?? 0;
    const newType = mix?.tracks.filter((item) => item.title === vid(2)).length ?? 0;
    expect(established).toBeGreaterThan(newType);
    expect(newType).toBeGreaterThan(0);
  });

  it("shows a multi-seed preview before the slowest radio finishes", async () => {
    for (let i = 1; i <= 4; i++) listen(vid(i));
    let releaseSlow!: (response: Awaited<ReturnType<typeof api.getRadio>>) => void;
    const slow = new Promise<Awaited<ReturnType<typeof api.getRadio>>>((resolve) => {
      releaseSlow = resolve;
    });
    const radioFor = (id: string) => ({
      items: Array.from({ length: 20 }, (_, i) => ({
        id: vid(Number(id.slice(-6)) * 100 + i + 1), title: id,
        artists: [{ id: "a", name: "A" }], durationMs: 100_000,
      })),
    });
    vi.spyOn(api, "getRadio").mockImplementation((id) =>
      id === vid(4) ? slow : Promise.resolve(radioFor(id)),
    );
    const previews: Track[][] = [];
    const pending = buildMixedRecommendations(undefined, undefined, (row) => previews.push(row.tracks));
    await vi.waitFor(() => expect(previews.length).toBeGreaterThan(0));
    expect(new Set(previews[0].map((item) => item.title)).size).toBeGreaterThanOrEqual(2);
    releaseSlow(radioFor(vid(4)));
    expect((await pending)?.tracks).toHaveLength(15);
  });

  it("refreshes only the single because-you-listened row", async () => {
    listen(vid(1));
    listen(vid(2));
    vi.spyOn(api, "getRadio").mockImplementation(async (id) => ({
      items: Array.from({ length: 30 }, (_, i) => ({
        id: vid(Number(id.slice(-6)) * 100 + i + 1), title: `${id}-${i}`,
        artists: [{ id: "a", name: "A" }], durationMs: 100_000,
      })),
    }));
    const mix = await buildMixedRecommendations();
    expect(mix).not.toBeNull();
    const firstBecause = await buildBecauseRecommendation(mix ?? undefined, undefined, fixed);
    expect(firstBecause?.seed).toBeDefined();
    const updatedAt = JSON.parse(localStorage.getItem("soniq_home_recommendations_v4")!).becauseUpdatedAt as number;
    listen(vid(3));
    expect(isBecauseRefreshDue(updatedAt + 60_000)).toBe(false);
    expect(isBecauseRefreshDue(updatedAt + RECOMMENDATION_REFRESH_MS - 1)).toBe(false);
    expect(isBecauseRefreshDue(updatedAt + RECOMMENDATION_REFRESH_MS)).toBe(true);
    const refreshed = await buildBecauseRecommendation(mix ?? undefined, firstBecause ?? undefined, fixed);
    expect(refreshed?.seed?.id).not.toBe(firstBecause?.seed?.id);
    const cached = readCachedRecommendations();
    expect(cached).toHaveLength(2);
    expect(cached?.[0].tracks).toEqual(mix?.tracks);
    expect(cached?.[1].seed?.id).toBe(refreshed?.seed?.id);
  });

  it("refreshes an older cached because row without a timestamp once", async () => {
    localStorage.setItem("soniq_home_recommendations_v4", JSON.stringify({
      because: { seed: track(vid(1)), tracks: [track(vid(2))] },
    }));
    expect(readCachedRecommendations()).toHaveLength(1);
    expect(isBecauseRefreshDue()).toBe(true);
  });

  it("keeps one because-you-listened row even with a small radio catalog", async () => {
    listen(vid(1));
    const radio = vi.spyOn(api, "getRadio").mockResolvedValue({
      items: Array.from({ length: 8 }, (_, i) => ({
        id: vid(100 + i), title: vid(100 + i),
        artists: [{ id: "a", name: "A" }], durationMs: 100_000,
      })),
    });
    const mix = await buildMixedRecommendations();
    radio.mockClear();
    const because = await buildBecauseRecommendation(mix ?? undefined);
    expect(because?.tracks).toHaveLength(8);
    expect(radio).toHaveBeenCalledTimes(1);
    expect(readCachedRecommendations()).toHaveLength(2);
  });

  it("does not create recommendations without listening data or likes", async () => {
    expect(await buildMixedRecommendations()).toBeNull();
    expect(await buildBecauseRecommendation()).toBeNull();
    expect(readCachedRecommendations()).toBeNull();
  });
});
