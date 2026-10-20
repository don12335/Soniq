import { api, toClientTrack } from "@/shared/api";
import { heardTrackIds, listHistory, topTracks } from "@/shared/api/localHistory";
import { toVideoId } from "@/shared/media/innertube";
import type { Track } from "@/shared/types";

export interface RecommendationRow {
  seed?: Track;
  tracks: Track[];
}

const CACHE_KEY = "soniq_home_recommendations_v4";
// New listening events trigger updates. This is only a fallback for a long
// session with no new plays, so the radio can still discover fresh songs.
export const MIX_STALE_MS = 30 * 60 * 1000;
const MAX_MIX_SEEDS = 4;
const TRACKS_PER_ROW = 15;
const MIN_TRACKS_PER_ROW = 5;

interface RecommendationCache {
  mix?: RecommendationRow;
  mixUpdatedAt?: number;
  historyVersion?: string;
  because?: RecommendationRow;
}

function readCache(): RecommendationCache {
  try {
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as RecommendationCache | null;
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

function writeCache(patch: RecommendationCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...readCache(), ...patch }));
    window.dispatchEvent(new Event("soniq:sync-local-change"));
  } catch {
    // Storage is optional; the current recommendations still render.
  }
}

export function readCachedRecommendations(): RecommendationRow[] | null {
  const cache = readCache();
  const rows = [cache.mix, cache.because].filter((row): row is RecommendationRow =>
    Boolean(row && Array.isArray(row.tracks) && row.tracks.length > 0));
  return rows.length ? rows : null;
}

export function recommendationHistoryVersion(): string {
  return listHistory(undefined, 1).items[0]?.id ?? "";
}

export function isMixRefreshDue(now = Date.now()): boolean {
  const cache = readCache();
  return !cache.mix || typeof cache.mixUpdatedAt !== "number" ||
    cache.historyVersion !== recommendationHistoryVersion() ||
    now - cache.mixUpdatedAt < 0 || now - cache.mixUpdatedAt >= MIX_STALE_MS;
}

export function clearRecommendationCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    window.dispatchEvent(new Event("soniq:sync-local-change"));
  } catch { /* storage unavailable */ }
}

function historyTracks(): Track[] {
  // topTracks scans the complete local history, not only the latest page.
  return topTracks(500).map((stat) => toClientTrack(stat.track));
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function stableUnit(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return ((hash >>> 0) + 1) / 4294967297;
}

// Stable weighted sampling covers the whole history. A new song adds one
// candidate; it cannot reshuffle every existing seed just by being recent.
export function pickSeeds(
  history: Track[], liked: Track[], playsById: ReadonlyMap<string, number> = new Map(),
): Track[] {
  const unique = new Map<string, Track>();
  for (const track of history) {
    if (toVideoId(track.id)) unique.set(track.id, track);
  }
  const sampled = [...unique.values()]
    .sort((a, b) => {
      const priority = (track: Track) =>
        -Math.log(stableUnit(track.id)) / Math.min(3, Math.sqrt(playsById.get(track.id) ?? 1));
      return priority(a) - priority(b) || a.id.localeCompare(b.id);
    })
    .slice(0, MAX_MIX_SEEDS);
  if (sampled.length < MAX_MIX_SEEDS) {
    const likedPool = liked.filter((track) => toVideoId(track.id) && !unique.has(track.id))
      .sort((a, b) => stableUnit(b.id) - stableUnit(a.id));
    sampled.push(...likedPool.slice(0, MAX_MIX_SEEDS - sampled.length));
  }
  return sampled;
}

async function loadLikedTracks(): Promise<Track[]> {
  try {
    const page = await api.listLikedTracks(100);
    return page.items.map((item) => toClientTrack(item.track));
  } catch {
    return [];
  }
}

function baseExclusions(seeds: Track[], liked: Track[]): Set<string> {
  const excluded = heardTrackIds();
  liked.forEach((track) => excluded.add(track.id));
  seeds.forEach((track) => excluded.add(track.id));
  return excluded;
}

function radioWeights(seeds: Track[]): number[] {
  const plays = new Map(topTracks(500).map((stat) => [stat.track.id, stat.plays]));
  // A single new listen gets one slot; repeated listens earn at most three.
  // The cap prevents one heavily repeated song from taking over the mix.
  return seeds.map((seed) => Math.min(3, Math.max(1, Math.ceil(Math.sqrt(plays.get(seed.id) ?? 1)))));
}

function interleave(radios: Track[][], excluded: Set<string>, weights: number[]): Track[] {
  const used = new Set(excluded);
  const tracks: Track[] = [];
  const positions = radios.map(() => 0);
  const order = radios.flatMap((_, index) => Array(weights[index] ?? 1).fill(index) as number[]);
  while (tracks.length < TRACKS_PER_ROW && radios.some((radio, index) => positions[index] < radio.length)) {
    for (const index of order) {
      const radio = radios[index];
      while (positions[index] < radio.length) {
        const track = radio[positions[index]++];
        if (!track?.id || used.has(track.id)) continue;
        used.add(track.id);
        tracks.push(track);
        break;
      }
      if (tracks.length >= TRACKS_PER_ROW) break;
    }
  }
  return tracks;
}

export async function buildMixedRecommendations(
  previousMix?: RecommendationRow, because?: RecommendationRow,
  onPartial?: (row: RecommendationRow) => void,
): Promise<RecommendationRow | null> {
  const versionAtStart = recommendationHistoryVersion();
  const stats = topTracks(500);
  const history = stats.map((stat) => toClientTrack(stat.track));
  const liked = await loadLikedTracks();
  const seeds = pickSeeds(history, liked, new Map(stats.map((stat) => [stat.track.id, stat.plays])));
  if (!seeds.length) return null;

  const excluded = baseExclusions(seeds, liked);
  because?.tracks.forEach((track) => excluded.add(track.id));
  const weights = radioWeights(seeds);
  const freshExclusions = new Set(excluded);
  previousMix?.tracks.forEach((track) => freshExclusions.add(track.id));
  const chooseTracks = (radios: Track[][]) => {
    const fresh = interleave(radios, freshExclusions, weights);
    return fresh.length >= MIN_TRACKS_PER_ROW ? fresh : interleave(radios, excluded, weights);
  };
  const available: Track[][] = seeds.map(() => []);
  let readySources = 0;
  const radios = await Promise.all(seeds.map((seed, index) =>
    api.getRadio(seed.id, { k: 40 })
      .then((response) => response.items.map((item) => toClientTrack(item)))
      .catch(() => [] as Track[])
      .then((tracks) => {
        available[index] = tracks;
        if (tracks.length) readySources++;
        // A first-load preview must represent more than one seed. Keep the
        // cached full mix visible during later background updates.
        if (!previousMix && onPartial && readySources >= 2) {
          const partial = chooseTracks(available);
          if (partial.length >= MIN_TRACKS_PER_ROW) onPartial({ tracks: partial });
        }
        return tracks;
      }),
  ));
  const tracks = chooseTracks(radios);
  if (tracks.length < MIN_TRACKS_PER_ROW) return null;

  const mix = { tracks };
  writeCache({ mix, mixUpdatedAt: Date.now(), historyVersion: versionAtStart });
  return mix;
}

export async function buildBecauseRecommendation(
  mix?: RecommendationRow, previous?: RecommendationRow, random: () => number = Math.random,
): Promise<RecommendationRow | null> {
  const history = historyTracks();
  const liked = await loadLikedTracks();
  const candidates = shuffle(
    [...new Map([...history, ...liked].filter((track) => toVideoId(track.id))
      .map((track) => [track.id, track])).values()], random,
  );
  const ordered = [
    ...candidates.filter((track) => track.id !== previous?.seed?.id),
    ...candidates.filter((track) => track.id === previous?.seed?.id),
  ].slice(0, 4);
  if (!ordered.length) return null;

  const baseExcluded = baseExclusions(ordered, liked);
  const excluded = new Set(baseExcluded);
  mix?.tracks.forEach((track) => excluded.add(track.id));
  const freshExclusions = new Set(excluded);
  previous?.tracks.forEach((track) => freshExclusions.add(track.id));

  const radios: Track[][] = [];
  for (const seed of ordered) {
    const radio = await api.getRadio(seed.id, { k: 40 })
      .then((response) => response.items.map((item) => toClientTrack(item)))
      .catch(() => [] as Track[]);
    radios.push(radio);
    const fresh = radio.filter((track) => track.id && !freshExclusions.has(track.id)).slice(0, TRACKS_PER_ROW);
    if (fresh.length >= MIN_TRACKS_PER_ROW) {
      const because = { seed, tracks: fresh };
      writeCache({ because });
      return because;
    }
  }

  for (const used of [excluded, baseExcluded]) {
    for (let i = 0; i < ordered.length; i++) {
      const tracks = radios[i].filter((track) => track.id && !used.has(track.id)).slice(0, TRACKS_PER_ROW);
      if (tracks.length < MIN_TRACKS_PER_ROW) continue;
      const because = { seed: ordered[i], tracks };
      writeCache({ because });
      return because;
    }
  }
  return null;
}
