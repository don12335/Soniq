import { debouncedStorage } from "@/shared/utils/storage";

export const BACKUP_FORMAT = "soniq-portable-backup";
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

const LIBRARY = "liner_guest_library_v1";
const HISTORY = "liner_local_history_v1";
const RECOMMENDATIONS = "soniq_home_recommendations_v4";
const SEARCH = "liner_search_history";

const DATA_KEYS = [LIBRARY, HISTORY, RECOMMENDATIONS, SEARCH] as const;
const PREFERENCE_KEYS = [
  "liner_player_session_v2", "liner_customization_v1", "liner_lyrics_session_v1",
  "liner_shortcuts_settings_v1", "liner_overlay_settings_v1", "liner_discord_settings_v1",
  "liner_locale", "theme", "liner_audio_cache_limit_bytes", "liner_library_view_mode",
] as const;
const ALLOWED_KEYS: readonly string[] = [...DATA_KEYS, ...PREFERENCE_KEYS];

type JsonObject = Record<string, unknown>;
type Backup = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  data: Record<string, string>;
};

const object = (value: unknown): JsonObject | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;

function parseObject(value: string | null): JsonObject {
  try { return object(JSON.parse(value ?? "null")) ?? {}; } catch { return {}; }
}

function parseArray(value: string | null): unknown[] {
  try { const parsed = JSON.parse(value ?? "null"); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

function uniqueBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function entryId(value: unknown, field: string): string {
  const entry = object(value);
  return String(object(entry?.[field])?.id ?? "");
}

function mergeLibrary(local: string | null, incoming: string): string {
  const a = parseObject(local);
  const b = parseObject(incoming);
  const likes = uniqueBy(
    [...(Array.isArray(a.likes) ? a.likes : []), ...(Array.isArray(b.likes) ? b.likes : [])],
    (item) => entryId(item, "track"),
  );
  const aCollections = object(a.collections) ?? {};
  const bCollections = object(b.collections) ?? {};
  const collections: JsonObject = {};
  for (const kind of ["albums", "artists", "playlists"] as const) {
    const idField = kind.slice(0, -1);
    collections[kind] = uniqueBy(
      [...(Array.isArray(aCollections[kind]) ? aCollections[kind] : []),
        ...(Array.isArray(bCollections[kind]) ? bCollections[kind] : [])],
      (item) => entryId(item, idField),
    );
  }
  const playlists = new Map<string, JsonObject>();
  for (const item of [...(Array.isArray(a.playlists) ? a.playlists : []),
    ...(Array.isArray(b.playlists) ? b.playlists : [])]) {
    const entry = object(item);
    const id = String(object(entry?.playlist)?.id ?? "");
    if (!entry || !id) continue;
    const existing = playlists.get(id);
    if (!existing) { playlists.set(id, entry); continue; }
    const items = uniqueBy(
      [...(Array.isArray(existing.items) ? existing.items : []),
        ...(Array.isArray(entry.items) ? entry.items : [])],
      (track) => entryId(track, "track"),
    ).map((track, position) => ({ ...object(track), position }));
    playlists.set(id, { ...existing, items });
  }
  return JSON.stringify({ likes, collections, playlists: [...playlists.values()] });
}

function mergeHistory(local: string | null, incoming: string): string {
  const items = uniqueBy(
    [...parseArray(local), ...parseArray(incoming)].filter((item) => object(item)?.track),
    (item) => String(object(item)?.playbackSessionId ?? object(item)?.id ?? ""),
  );
  items.sort((a, b) => String(object(b)?.listenedAt ?? "").localeCompare(String(object(a)?.listenedAt ?? "")));
  return JSON.stringify(items.slice(0, 5000));
}

function recommendationTracks(value: unknown): unknown[] {
  return Array.isArray(object(value)?.tracks) ? object(value)!.tracks as unknown[] : [];
}

function mergeRecommendations(local: string | null, incoming: string, history: string): string {
  const a = parseObject(local);
  const b = parseObject(incoming);
  const mixed = uniqueBy(
    [...recommendationTracks(a.mix), ...recommendationTracks(b.mix)],
    (track) => String(object(track)?.id ?? ""),
  ).slice(0, 15);
  const because = recommendationTracks(a.because).length ? a.because : b.because;
  const firstHistory = object(parseArray(history)[0]);
  return JSON.stringify({
    ...(mixed.length ? { mix: { tracks: mixed }, mixUpdatedAt: Date.now(),
      historyVersion: String(firstHistory?.id ?? "") } : {}),
    ...(recommendationTracks(because).length ? { because } : {}),
  });
}

function mergeSearch(local: string | null, incoming: string): string {
  const a = parseObject(local);
  const b = parseObject(incoming);
  const aState = object(a.state) ?? {};
  const bState = object(b.state) ?? {};
  const items = uniqueBy(
    [...(Array.isArray(aState.items) ? aState.items : []),
      ...(Array.isArray(bState.items) ? bState.items : [])]
      .sort((x, y) => Number(object(y)?.timestamp ?? 0) - Number(object(x)?.timestamp ?? 0)),
    (item) => {
      const row = object(item);
      return row?.type === "query" ? `query:${String(row.title ?? "").trim().toLowerCase()}`
        : `${String(row?.type ?? "")}:${String(row?.id ?? "")}`;
    },
  ).slice(0, 30);
  return JSON.stringify({ state: { items }, version: Math.max(Number(a.version ?? 0), Number(b.version ?? 0)) });
}

export function createPortableBackup(): string {
  debouncedStorage.flush();
  const data: Record<string, string> = {};
  for (const key of ALLOWED_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) data[key] = value;
  }
  const backup = JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(), data } satisfies Backup);
  if (new TextEncoder().encode(backup).byteLength > MAX_BACKUP_BYTES) {
    throw new Error("Backup file is too large.");
  }
  return backup;
}

export interface ImportPlan {
  exportedAt: string;
  writes: Record<string, string>;
  counts: { likes: number; playlists: number; history: number; recommendations: number };
}

export function preparePortableImport(raw: string): ImportPlan {
  if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) throw new Error("Backup file is too large.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Invalid backup file."); }
  const archive = object(parsed);
  const data = object(archive?.data);
  if (archive?.format !== BACKUP_FORMAT || archive.version !== BACKUP_VERSION || !data) {
    throw new Error("This is not a supported Soniq backup.");
  }
  const writes: Record<string, string> = {};
  for (const key of ALLOWED_KEYS) {
    const incoming = data[key];
    if (incoming !== undefined && typeof incoming !== "string") throw new Error("Invalid backup data.");
    if (typeof incoming !== "string") continue;
    const local = debouncedStorage.getItem(key);
    if (key === LIBRARY) writes[key] = mergeLibrary(local, incoming);
    else if (key === HISTORY) writes[key] = mergeHistory(local, incoming);
    else if (key === SEARCH) writes[key] = mergeSearch(local, incoming);
    else if (key === RECOMMENDATIONS) continue;
    else if (local === null) writes[key] = incoming;
  }
  if (typeof data[RECOMMENDATIONS] === "string") {
    writes[RECOMMENDATIONS] = mergeRecommendations(
      debouncedStorage.getItem(RECOMMENDATIONS), data[RECOMMENDATIONS] as string,
      writes[HISTORY] ?? debouncedStorage.getItem(HISTORY) ?? "[]",
    );
  }
  const library = parseObject(writes[LIBRARY] ?? debouncedStorage.getItem(LIBRARY));
  const recs = parseObject(writes[RECOMMENDATIONS] ?? debouncedStorage.getItem(RECOMMENDATIONS));
  return {
    exportedAt: String(archive.exportedAt ?? ""), writes,
    counts: {
      likes: Array.isArray(library.likes) ? library.likes.length : 0,
      playlists: Array.isArray(library.playlists) ? library.playlists.length : 0,
      history: parseArray(writes[HISTORY] ?? debouncedStorage.getItem(HISTORY)).length,
      recommendations: Number(recommendationTracks(recs.mix).length > 0) +
        Number(recommendationTracks(recs.because).length > 0),
    },
  };
}

export function applyPortableImport(plan: ImportPlan): void {
  debouncedStorage.flush();
  const before = new Map<string, string | null>();
  try {
    for (const [key, value] of Object.entries(plan.writes)) {
      if (!ALLOWED_KEYS.includes(key)) throw new Error("Unexpected backup field.");
      before.set(key, localStorage.getItem(key));
      localStorage.setItem(key, value);
    }
  } catch (error) {
    for (const key of before.keys()) localStorage.removeItem(key);
    for (const [key, value] of before) {
      if (value !== null) localStorage.setItem(key, value);
    }
    throw error;
  }
  window.location.reload();
}
