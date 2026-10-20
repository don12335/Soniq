// Three-way merge: the last successful cloud state is the common ancestor.
// Absence relative to that ancestor is a deletion, including playlist items.
export type CloudData = Record<string, string>;
export const CLOUD_KEYS = [
  "liner_guest_library_v1", "liner_local_history_v1", "soniq_home_recommendations_v4",
  "liner_search_history", "liner_customization_v1", "liner_lyrics_session_v1",
  "liner_locale", "theme", "liner_library_view_mode",
] as const;

type Row = Record<string, any>;
const obj = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const parse = (value?: string): unknown => { try { return JSON.parse(value ?? "null"); } catch { return null; } };
const array = (value: unknown): Row[] => Array.isArray(value) ? value.filter(x => x && typeof x === "object") : [];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const pick = <T>(base: T | undefined, local: T | undefined, remote: T | undefined): T | undefined => {
  if (same(local, remote)) return local;
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;
  // Concurrent edits: prefer the newer timestamp when available; otherwise keep cloud.
  const a = obj(local).updatedAt ?? obj(local).likedAt ?? obj(local).savedAt ?? 0;
  const b = obj(remote).updatedAt ?? obj(remote).likedAt ?? obj(remote).savedAt ?? 0;
  return a > b ? local : remote;
};

function mergeRows(base: Row[], local: Row[], remote: Row[], key: (row: Row) => string): Row[] {
  const make = (rows: Row[]) => new Map<string, Row>(rows.map(row => [key(row), row] as const).filter(([id]) => Boolean(id)));
  const [a, b, c] = [make(base), make(local), make(remote)];
  const keys = new Set([...b.keys(), ...c.keys(), ...a.keys()]);
  return [...keys].map(id => pick(a.get(id), b.get(id), c.get(id))).filter((row): row is Row => Boolean(row));
}

function mergeLibrary(base: unknown, local: unknown, remote: unknown): string {
  const [a, b, c] = [obj(base), obj(local), obj(remote)];
  const likes = mergeRows(array(a.likes), array(b.likes), array(c.likes), row => String(obj(row.track).id ?? ""));
  const collections: Row = {};
  for (const kind of ["albums", "artists", "playlists"] as const) {
    const field = kind.slice(0, -1);
    collections[kind] = mergeRows(array(obj(a.collections)[kind]), array(obj(b.collections)[kind]),
      array(obj(c.collections)[kind]), row => String(obj(row[field]).id ?? ""));
  }
  const playlists = mergeRows(array(a.playlists), array(b.playlists), array(c.playlists),
    row => String(obj(row.playlist).id ?? ""));
  const find = (rows: Row[], id: string) => rows.find(row => obj(row.playlist).id === id);
  for (const entry of playlists) {
    const id = String(obj(entry.playlist).id);
    const pa = find(array(a.playlists), id);
    const pb = find(array(b.playlists), id);
    const pc = find(array(c.playlists), id);
    if (pb && pc) {
      const items = mergeRows(array(pa?.items), array(pb.items), array(pc.items),
        row => String(obj(row.track).id ?? row.id ?? ""));
      entry.items = items.sort((x, y) => Number(x.position ?? 0) - Number(y.position ?? 0))
        .map((item, position) => ({ ...item, position }));
    }
  }
  return JSON.stringify({ likes, collections, playlists });
}

function mergeHistory(base: unknown, local: unknown, remote: unknown): string {
  const rows = mergeRows(array(base), array(local), array(remote),
    row => String(row.playbackSessionId ?? row.id ?? ""));
  return JSON.stringify(rows.sort((a, b) => String(b.listenedAt ?? "").localeCompare(String(a.listenedAt ?? ""))).slice(0, 5000));
}

export function mergeCloudData(base: CloudData, local: CloudData, remote: CloudData): CloudData {
  const result: CloudData = {};
  for (const key of CLOUD_KEYS) {
    const [a, b, c] = [base[key], local[key], remote[key]];
    if (key === "liner_guest_library_v1" && (b || c)) result[key] = mergeLibrary(parse(a), parse(b), parse(c));
    else if (key === "liner_local_history_v1" && (b || c)) result[key] = mergeHistory(parse(a), parse(b), parse(c));
    else {
      const selected = pick(a, b, c);
      if (selected !== undefined) result[key] = selected;
    }
  }
  return result;
}
