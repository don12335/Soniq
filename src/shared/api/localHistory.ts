import type {
  PlaybackHistoryItem,
  PlaybackHistoryResponse,
  RecordPlaybackEventRequest,
  Track,
} from "../contracts";

// Listening history kept on this device. It replaces the server history that
// fed "Jump back in" and is the seed for home recommendations.

const STORAGE_KEY = "liner_local_history_v1";
const HISTORY_CHANGED_EVENT = "soniq:local-history-changed";
const MAX_ENTRIES = 500;
// short previews and quick skips are noise, not listening
const MIN_PLAYED_MS = 10_000;

function read(): PlaybackHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: PlaybackHistoryItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ENTRIES)));
    window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT));
  } catch {
    // storage full: history is a convenience, never block playback on it
  }
}

export function hasListeningHistory(): boolean {
  return read().some((item) => Boolean(item.track?.id));
}

export function subscribeToHistory(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(HISTORY_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(HISTORY_CHANGED_EVENT, onChange);
}

export function recordPlayback(event: RecordPlaybackEventRequest): void {
  if (!event.trackSnapshot) return;
  if (!event.completed && event.playedDurationMs < MIN_PLAYED_MS) return;

  const item: PlaybackHistoryItem = {
    id: event.playbackSessionId || `${event.trackId}-${Date.now()}`,
    playbackSessionId: event.playbackSessionId,
    listeningSessionId: event.listeningSessionId,
    track: event.trackSnapshot,
    playedDurationMs: event.playedDurationMs,
    completionRate: event.completionRate,
    completed: Boolean(event.completed),
    skipped: Boolean(event.skipped),
    loopCount: event.loopCount ?? 0,
    hasSeekBackward: Boolean(event.hasSeekBackward),
    ...(event.context ? { context: event.context } : {}),
    listenedAt: new Date().toISOString(),
  };
  // A playing track is recorded once it reaches ten seconds, then updated
  // when it ends. Keep one entry and one recommendation seed per play.
  write([item, ...read().filter((existing) => existing.id !== item.id)]);
}

// newest first; the cursor is the index to continue from
export function listHistory(cursor?: string, limit = 30): PlaybackHistoryResponse {
  const items = read();
  const start = cursor ? Math.max(0, Number.parseInt(cursor, 10) || 0) : 0;
  const page = items.slice(start, start + limit);
  const next = start + page.length;
  return { items: page, nextCursor: next < items.length ? String(next) : null };
}

export interface HistoryStat {
  track: Track;
  plays: number;
  lastPlayedAt: string;
}

// tracks ranked by how much they were actually listened to, recent first on ties
export function topTracks(limit = 10): HistoryStat[] {
  const stats = new Map<string, HistoryStat & { weight: number }>();
  for (const item of read()) {
    if (!item.track?.id) continue;
    // a finished play counts more than a partial one; skips barely count
    const weight = item.completed ? 1 : item.skipped ? 0.1 : Math.max(0.3, item.completionRate);
    const existing = stats.get(item.track.id);
    if (existing) {
      existing.plays += 1;
      existing.weight += weight;
    } else {
      stats.set(item.track.id, { track: item.track, plays: 1, lastPlayedAt: item.listenedAt, weight });
    }
  }
  return [...stats.values()]
    .sort((a, b) => b.weight - a.weight || b.lastPlayedAt.localeCompare(a.lastPlayedAt))
    .slice(0, limit)
    .map(({ weight: _weight, ...stat }) => stat);
}

export function heardTrackIds(): Set<string> {
  return new Set(read().map((item) => item.track?.id).filter(Boolean));
}

export function clearHistory(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT));
  }
}
