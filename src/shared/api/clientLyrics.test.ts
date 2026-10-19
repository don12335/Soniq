import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/media/innertube", () => ({
  toVideoId: (id: string) => (/^[\w-]{11}$/.test(id) ? id : null),
  postInnertube: vi.fn(async (endpoint: string) =>
    endpoint === "next"
      ? { tabs: [{ tabRenderer: { endpoint: { browseEndpoint: { browseId: "MPLYt_abc" } } } }] }
      : { contents: [{ musicDescriptionShelfRenderer: { description: { runs: [{ text: "line one\r\nline two" }] } } }] },
  ),
}));

import { pickKugouRecord, pickLrclibRecord, streamClientLyrics } from "./clientLyrics";
import type { LyricsStreamEvent } from "@/shared/contracts";

const hint = { title: "At My Worst", artist: "Pink Sweat$", durationMs: 170_000 };

async function collect(gen: AsyncGenerator<LyricsStreamEvent>) {
  const events: LyricsStreamEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

function mockFetch(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const key = Object.keys(routes).find((k) => url.includes(k));
      if (!key) return new Response("", { status: 404 });
      return Response.json(routes[key]);
    }),
  );
}

describe("pickLrclibRecord", () => {
  it("prefers a matching title, artist and duration", () => {
    const records = [
      { trackName: "At My Worst (Remix)", artistName: "Someone", duration: 200, syncedLyrics: "[00:01.00] x" },
      { trackName: "At My Worst", artistName: "Pink Sweat$", duration: 170, syncedLyrics: "[00:01.00] y" },
    ];
    expect(pickLrclibRecord(records, hint)?.syncedLyrics).toBe("[00:01.00] y");
  });

  it("rejects other songs and far-off durations", () => {
    expect(pickLrclibRecord([{ trackName: "Other", artistName: "Pink Sweat$", duration: 170, plainLyrics: "x" }], hint)).toBeUndefined();
    expect(pickLrclibRecord([{ trackName: "At My Worst", artistName: "Pink Sweat$", duration: 260, plainLyrics: "x" }], hint)).toBeUndefined();
  });
});

describe("pickKugouRecord", () => {
  it("rejects a cover artist and a different recording length", () => {
    const records = [
      { id: 1, accesskey: "a", song: "At My Worst", singer: "Cover Band", duration: 170_000 },
      { id: 2, accesskey: "b", song: "At My Worst", singer: "Pink Sweat$", duration: 210_000 },
      { id: 3, accesskey: "c", song: "At My Worst", singer: "Pink Sweat$", duration: 171_000 },
    ];
    expect(pickKugouRecord(records, hint)?.id).toBe(3);
  });
});

describe("streamClientLyrics", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("returns LRCLIB synced lyrics and skips the plain fallback", async () => {
    mockFetch({ "/api/get?": { trackName: "At My Worst", artistName: "Pink Sweat$", duration: 170, syncedLyrics: "[00:10.81] Can I call you baby?" } });
    const events = await collect(streamClientLyrics("fHI8X4OXluQ", undefined, hint));
    const found = events.filter((e) => e.type === "provider" && e.status === "found");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ provider: "lrclib", syncLevel: "line_level" });
    expect(events.at(-1)).toMatchObject({ type: "done", best: { provider: "lrclib", syncLevel: "line_level" } });
  });

  it("falls back to YouTube Music plain lyrics", async () => {
    mockFetch({ "/api/search?": [], "lyrics.kugou.com/search?": { status: 200, candidates: [] } });
    const events = await collect(streamClientLyrics("fHI8X4OXluQ", undefined, hint));
    const yt = events.find((e) => e.type === "provider" && e.status === "found");
    expect(yt).toMatchObject({ provider: "youtube_music", syncLevel: "plain" });
    if (yt?.type === "provider" && yt.status === "found") {
      expect(yt.candidate.lyrics.content).toBe("line one\nline two");
    }
  });

  it("uses KuGou synced lyrics after LRCLIB plain lyrics and before YouTube Music", async () => {
    mockFetch({
      "/api/get?": { trackName: "At My Worst", artistName: "Pink Sweat$", duration: 170, plainLyrics: "plain lyrics" },
      "lyrics.kugou.com/search?": {
        status: 200,
        candidates: [{ id: 42, accesskey: "key", song: "At My Worst", singer: "Pink Sweat$", duration: 170_500 }],
      },
      "lyrics.kugou.com/download?": { status: 200, content: btoa("[00:01.00] synced line") },
    });
    const events = await collect(streamClientLyrics("fHI8X4OXluQ", undefined, hint));
    const found = events.filter((e) => e.type === "provider" && e.status === "found");
    expect(found.map((e) => e.type === "provider" && e.provider)).toEqual(["lrclib", "kugou"]);
    expect(events.at(-1)).toMatchObject({ type: "done", best: { provider: "kugou", syncLevel: "line_level" } });
    expect(events.some((e) => e.type === "provider" && e.provider === "youtube_music")).toBe(false);
  });

  it("reports not_found when nothing has lyrics", async () => {
    mockFetch({ "/api/search?": [] });
    const events = await collect(streamClientLyrics("sc:123456", undefined, hint));
    expect(events.at(-1)).toEqual({ type: "done", cached: false, status: "not_found" });
  });
});
