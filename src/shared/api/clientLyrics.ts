import type {
  LyricsCandidate,
  LyricsContentKind,
  LyricsFormat,
  LyricsStreamEvent,
  LyricsSyncLevel,
} from "@/shared/contracts";
import { postInnertube, toVideoId } from "@/shared/media/innertube";
import { asArray, asRecord, stringValue, walkRecords } from "@/shared/utils/json";
import { isAbortError } from "@/shared/utils/abort";

// Lyrics resolved on the device, without the Liner server:
//  1. LRCLIB (free, line-synced LRC for most popular songs)
//  2. KuGou (line-synced LRC when LRCLIB has no synced lyrics)
//  3. YouTube Music's lyrics tab (plain text, no timing) as the last fallback
// Emits the same event stream the server used, so the player and the lyrics
// cache consume it unchanged.

export interface LyricsHint {
  title: string;
  artist: string;
  durationMs?: number;
}

const LRCLIB_BASE = "https://lrclib.net/api";
const KUGOU_BASE = "https://lyrics.kugou.com";
// LRCLIB durations are whole seconds; allow a little drift between releases
const DURATION_TOLERANCE_S = 3;

interface LrclibRecord {
  trackName?: string;
  artistName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function candidate(
  provider: string,
  format: LyricsFormat,
  content: string,
  contentKind: LyricsContentKind,
  syncLevel: LyricsSyncLevel,
  total: number,
  matchedTrack?: { title?: string; artists?: string[]; durationMs?: number },
): LyricsCandidate {
  return {
    provider,
    lyrics: { format, content },
    contentKind,
    syncLevel,
    ...(matchedTrack ? { matchedTrack } : {}),
    quality: { total, match: total, content: total, sync: syncLevel === "plain" ? 0 : total, source: total, reasons: [] },
  };
}

function lrclibCandidate(record: LrclibRecord): LyricsCandidate | null {
  const matchedTrack = {
    title: record.trackName,
    artists: record.artistName ? [record.artistName] : undefined,
    durationMs: record.duration ? Math.round(record.duration * 1000) : undefined,
  };
  if (record.syncedLyrics?.trim()) {
    return candidate("lrclib", "lrc", record.syncedLyrics, "line_synced", "line_level", 80, matchedTrack);
  }
  if (record.plainLyrics?.trim()) {
    return candidate("lrclib", "plain", record.plainLyrics, "plain", "plain", 60, matchedTrack);
  }
  return null;
}

// picks the search result that best matches the requested track
export function pickLrclibRecord(records: LrclibRecord[], hint: LyricsHint): LrclibRecord | undefined {
  const title = normalize(hint.title);
  const artist = normalize(hint.artist);
  const durationS = hint.durationMs ? hint.durationMs / 1000 : undefined;
  const scored = records
    .filter((r) => !r.instrumental && (r.syncedLyrics || r.plainLyrics))
    .map((r) => {
      let score = 0;
      const rTitle = normalize(r.trackName ?? "");
      if (rTitle === title) score += 3;
      else if (rTitle.includes(title) || title.includes(rTitle)) score += 1;
      else return { r, score: -1 };
      const rArtist = normalize(r.artistName ?? "");
      if (artist && (rArtist.includes(artist) || artist.includes(rArtist))) score += 2;
      if (durationS !== undefined && r.duration !== undefined) {
        const diff = Math.abs(r.duration - durationS);
        if (diff > DURATION_TOLERANCE_S * 3) return { r, score: -1 };
        if (diff <= DURATION_TOLERANCE_S) score += 2;
      }
      if (r.syncedLyrics) score += 1;
      return { r, score };
    })
    .filter((s) => s.score >= 3)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.r;
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown | undefined> {
  const res = await fetch(url, { signal });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`Lyrics HTTP ${res.status}`);
  return res.json();
}

export async function fetchLrclib(hint: LyricsHint, signal?: AbortSignal): Promise<LyricsCandidate | null> {
  const params = new URLSearchParams({ track_name: hint.title, artist_name: hint.artist });
  if (hint.durationMs && hint.durationMs > 0) params.set("duration", String(Math.round(hint.durationMs / 1000)));

  // exact lookup first; it only hits when title, artist and duration all line up
  const exact = asRecord(await getJson(`${LRCLIB_BASE}/get?${params}`, signal)) as LrclibRecord | undefined;
  if (exact && !exact.instrumental) {
    const found = lrclibCandidate(exact);
    if (found) return found;
  }

  const search = new URLSearchParams({ track_name: hint.title, artist_name: hint.artist });
  const results = asArray(await getJson(`${LRCLIB_BASE}/search?${search}`, signal)) as LrclibRecord[];
  const best = pickLrclibRecord(results, hint);
  return best ? lrclibCandidate(best) : null;
}

interface KugouRecord {
  id?: string | number;
  accesskey?: string;
  singer?: string;
  song?: string;
  duration?: number;
}

// KuGou can return covers and alternate recordings with the same title. Require
// an artist match and reject recordings whose duration differs materially.
export function pickKugouRecord(records: KugouRecord[], hint: LyricsHint): KugouRecord | undefined {
  const title = normalize(hint.title);
  const artist = normalize(hint.artist);
  if (!title || !artist) return undefined;

  return records
    .filter((record) => {
      const recordArtist = normalize(record.singer ?? "");
      const durationDiff = hint.durationMs
        ? record.duration ? Math.abs(hint.durationMs - record.duration) : Infinity
        : 0;
      return Boolean(record.id && record.accesskey) &&
        normalize(record.song ?? "") === title &&
        Boolean(recordArtist) &&
        (recordArtist === artist || recordArtist.includes(artist) || artist.includes(recordArtist)) &&
        durationDiff <= 10_000;
    })
    .sort((a, b) =>
      hint.durationMs
        ? Math.abs((a.duration ?? hint.durationMs) - hint.durationMs) -
          Math.abs((b.duration ?? hint.durationMs) - hint.durationMs)
        : 0,
    )[0];
}

export async function fetchKugou(hint: LyricsHint, signal?: AbortSignal): Promise<LyricsCandidate | null> {
  // Keep this fallback bounded so an unresponsive provider does not delay YouTube Music.
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(5_000)])
    : AbortSignal.timeout(5_000);
  const search = new URLSearchParams({
    ver: "1",
    client: "pc",
    keyword: `${hint.artist} - ${hint.title}`,
    duration: String(Math.round(hint.durationMs ?? 0)),
    man: "yes",
  });
  const response = await getJson(`${KUGOU_BASE}/search?${search}`, requestSignal);
  const record = pickKugouRecord(
    asArray(asRecord(response)?.candidates) as KugouRecord[],
    hint,
  );
  if (!record) return null;

  const download = new URLSearchParams({
    ver: "1",
    client: "pc",
    id: String(record.id),
    accesskey: record.accesskey!,
    fmt: "lrc",
    charset: "utf8",
  });
  const payload = asRecord(await getJson(`${KUGOU_BASE}/download?${download}`, requestSignal));
  const encoded = stringValue(payload?.content);
  if (!encoded || payload?.status !== 200) return null;

  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  const content = new TextDecoder("utf-8").decode(bytes).trim();
  if (!/^\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/m.test(content)) return null;
  return candidate("kugou", "lrc", content, "line_synced", "line_level", 72, {
    title: record.song,
    artists: record.singer ? [record.singer] : undefined,
    durationMs: record.duration,
  });
}

export async function fetchYoutubeMusicLyrics(trackId: string, signal?: AbortSignal): Promise<LyricsCandidate | null> {
  const videoId = toVideoId(trackId);
  if (!videoId) return null;
  const next = await postInnertube("next", { videoId }, { signal });
  let browseId: string | undefined;
  walkRecords(next, (record) => {
    const id = stringValue(asRecord(record.browseEndpoint)?.browseId);
    if (id?.startsWith("MPLYt")) {
      browseId = id;
      return true;
    }
    return false;
  });
  if (!browseId) return null;

  const page = await postInnertube("browse", { browseId }, { signal });
  let text = "";
  walkRecords(page, (record) => {
    const shelf = asRecord(record.musicDescriptionShelfRenderer);
    if (!shelf) return false;
    text = asArray(asRecord(shelf.description)?.runs)
      .map((run) => stringValue(asRecord(run)?.text) ?? "")
      .join("");
    return true;
  });
  const content = text.replace(/\r\n/g, "\n").trim();
  return content ? candidate("youtube_music", "plain", content, "plain", "plain", 50) : null;
}

type Provider = { name: string; run: () => Promise<LyricsCandidate | null> };

export async function* streamClientLyrics(
  trackId: string,
  signal?: AbortSignal,
  hint?: LyricsHint,
): AsyncGenerator<LyricsStreamEvent> {
  const providers: Provider[] = [];
  if (hint?.title.trim() && hint.artist.trim()) {
    providers.push({ name: "lrclib", run: () => fetchLrclib(hint, signal) });
    providers.push({ name: "kugou", run: () => fetchKugou(hint, signal) });
  }
  providers.push({ name: "youtube_music", run: () => fetchYoutubeMusicLyrics(trackId, signal) });

  let best: LyricsCandidate | null = null;
  for (const provider of providers) {
    const startedAt = Date.now();
    try {
      const found = await provider.run();
      const durationMs = Date.now() - startedAt;
      if (found) {
        yield { type: "provider", provider: provider.name, status: "found", syncLevel: found.syncLevel, candidate: found, durationMs };
        if (!best || found.quality.total > best.quality.total) best = found;
        // synced lyrics can't be beaten by the plain-text fallback
        if (found.syncLevel !== "plain") break;
      } else {
        yield { type: "provider", provider: provider.name, status: "not_found", durationMs };
      }
    } catch (error) {
      if (isAbortError(error, signal)) throw error;
      yield { type: "provider", provider: provider.name, status: "error", message: String((error as Error)?.message ?? error) };
    }
  }

  yield best
    ? { type: "done", cached: false, best: { provider: best.provider, quality: best.quality.total, syncLevel: best.syncLevel } }
    : { type: "done", cached: false, status: "not_found" };
}
