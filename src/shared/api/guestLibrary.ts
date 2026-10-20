import type {
  AlbumDetails,
  ApiTrack,
  ArtistDetails,
  CatalogPlaylistDetails,
  LikedTracksPage,
  UserPlaylist,
  UserPlaylistItem,
} from "../contracts";

// Local library used in guest mode and as the offline copy for cloud accounts.
// Its response shapes mirror the older library API used by the rest of the app.

export type CollectionType = "albums" | "artists" | "playlists";

type SavedCollectionEntry = Record<string, unknown> & { savedAt: string };

type GuestPlaylist = {
  playlist: UserPlaylist;
  items: UserPlaylistItem[];
};

type GuestLibraryData = {
  likes: { track: ApiTrack; likedAt: string }[];
  collections: Record<CollectionType, SavedCollectionEntry[]>;
  playlists: GuestPlaylist[];
};

const STORAGE_KEY = "liner_guest_library_v1";

function emptyLibrary(): GuestLibraryData {
  return {
    likes: [],
    collections: { albums: [], artists: [], playlists: [] },
    playlists: [],
  };
}

function read(): GuestLibraryData {
  if (typeof window === "undefined") return emptyLibrary();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyLibrary();
    const parsed = JSON.parse(raw) as Partial<GuestLibraryData>;
    const base = emptyLibrary();
    return {
      likes: parsed.likes ?? base.likes,
      collections: { ...base.collections, ...parsed.collections },
      playlists: parsed.playlists ?? base.playlists,
    };
  } catch {
    return emptyLibrary();
  }
}

function write(data: GuestLibraryData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new Event("soniq:sync-local-change"));
}

function update<T>(fn: (data: GuestLibraryData) => T): T {
  const data = read();
  const result = fn(data);
  write(data);
  return result;
}

function newId(prefix: string): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
}

function now(): string {
  return new Date().toISOString();
}

// strip per-viewer state from catalog snapshots before storing them
function snapshotTrack(track: ApiTrack): ApiTrack {
  const { viewer: _viewer, ...rest } = track as ApiTrack & { relatedTracks?: unknown };
  delete (rest as { relatedTracks?: unknown }).relatedTracks;
  return rest;
}

function renumber(items: UserPlaylistItem[]): void {
  items.forEach((item, index) => {
    item.position = index;
  });
}

function touch(entry: GuestPlaylist): void {
  entry.playlist.updatedAt = now();
  entry.playlist.revision += 1;
}

// ---- Likes -------------------------------------------------------------------

export function listLikedTracks(): LikedTracksPage {
  return { items: read().likes, nextCursor: null };
}

export function likeTrack(track: ApiTrack): void {
  update((data) => {
    if (data.likes.some((like) => like.track.id === track.id)) return;
    data.likes.unshift({ track: snapshotTrack(track), likedAt: now() });
  });
}

export function unlikeTrack(trackId: string): void {
  update((data) => {
    data.likes = data.likes.filter((like) => like.track.id !== trackId);
  });
}

// ---- Saved albums / artists / catalog playlists -----------------------------

export function listSavedCollections(type: CollectionType): { items: unknown[] } {
  return { items: read().collections[type] };
}

export function isCollectionSaved(type: CollectionType, id: string): boolean {
  const key = type.slice(0, -1);
  return read().collections[type].some(
    (entry) => (entry[key] as { id?: string } | undefined)?.id === id,
  );
}

export function saveAlbum(album: AlbumDetails): void {
  saveEntry("albums", {
    album: {
      id: album.id,
      title: album.title,
      artists: album.artists,
      year: album.year,
      cover: album.cover,
      trackCount: album.trackCount ?? album.tracks.length,
    },
  });
}

export function saveArtist(artist: ArtistDetails): void {
  saveEntry("artists", {
    artist: { id: artist.id, name: artist.name, cover: artist.cover },
  });
}

export function saveCatalogPlaylist(playlist: CatalogPlaylistDetails): void {
  saveEntry("playlists", {
    playlist: {
      id: playlist.id,
      title: playlist.title,
      author: playlist.author,
      cover: playlist.cover,
      trackCount: playlist.trackCount ?? playlist.tracks.length,
    },
  });
}

function saveEntry(type: CollectionType, value: Record<string, unknown>): void {
  const key = type.slice(0, -1);
  const id = (value[key] as { id: string }).id;
  update((data) => {
    const list = data.collections[type];
    if (list.some((entry) => (entry[key] as { id?: string } | undefined)?.id === id)) return;
    list.unshift({ ...value, savedAt: now() });
  });
}

export function removeCollection(type: CollectionType, id: string): void {
  const key = type.slice(0, -1);
  update((data) => {
    data.collections[type] = data.collections[type].filter(
      (entry) => (entry[key] as { id?: string } | undefined)?.id !== id,
    );
  });
}

// ---- Own playlists -----------------------------------------------------------

export function isGuestPlaylistId(id: string): boolean {
  return id.startsWith("guest-");
}

export function listPlaylists(): { items: UserPlaylist[] } {
  return { items: read().playlists.map((entry) => entry.playlist) };
}

export function getPlaylist(id: string): GuestPlaylist | null {
  return read().playlists.find((entry) => entry.playlist.id === id) ?? null;
}

export function createPlaylist(input: {
  title: string;
  description?: string;
  isPublic?: boolean;
}): UserPlaylist {
  const timestamp = now();
  const playlist: UserPlaylist = {
    id: newId("guest"),
    title: input.title,
    description: input.description,
    isPublic: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
  };
  update((data) => {
    data.playlists.unshift({ playlist, items: [] });
  });
  return playlist;
}

export function updatePlaylist(
  id: string,
  input: { title?: string; description?: string | null; isPublic?: boolean },
): UserPlaylist | null {
  return update((data) => {
    const entry = data.playlists.find((p) => p.playlist.id === id);
    if (!entry) return null;
    if (input.title !== undefined) entry.playlist.title = input.title;
    if (input.description !== undefined) {
      entry.playlist.description = input.description ?? undefined;
    }
    touch(entry);
    return entry.playlist;
  });
}

export function deletePlaylist(id: string): boolean {
  return update((data) => {
    const before = data.playlists.length;
    data.playlists = data.playlists.filter((p) => p.playlist.id !== id);
    return data.playlists.length !== before;
  });
}

export type AddTrackResult =
  | { status: "added"; item: UserPlaylistItem }
  | { status: "duplicate" }
  | { status: "not_found" };

export function playlistHasTrack(playlistId: string, trackId: string): boolean {
  const entry = getPlaylist(playlistId);
  return Boolean(entry?.items.some((item) => item.track.id === trackId));
}

export function addPlaylistTrack(playlistId: string, track: ApiTrack): AddTrackResult {
  return update((data): AddTrackResult => {
    const entry = data.playlists.find((p) => p.playlist.id === playlistId);
    if (!entry) return { status: "not_found" };
    if (entry.items.some((item) => item.track.id === track.id)) {
      return { status: "duplicate" };
    }
    const item: UserPlaylistItem = {
      id: newId("item"),
      track: snapshotTrack(track),
      position: entry.items.length,
      addedAt: now(),
    };
    entry.items.push(item);
    touch(entry);
    return { status: "added", item };
  });
}

export function removePlaylistItem(playlistId: string, itemId: string): boolean {
  return update((data) => {
    const entry = data.playlists.find((p) => p.playlist.id === playlistId);
    if (!entry) return false;
    const before = entry.items.length;
    entry.items = entry.items.filter((item) => item.id !== itemId);
    if (entry.items.length === before) return false;
    renumber(entry.items);
    touch(entry);
    return true;
  });
}

export function movePlaylistItem(
  playlistId: string,
  itemId: string,
  beforeItemId: string | null,
): GuestPlaylist | null {
  return update((data) => {
    const entry = data.playlists.find((p) => p.playlist.id === playlistId);
    if (!entry) return null;
    const from = entry.items.findIndex((item) => item.id === itemId);
    if (from === -1) return null;
    const [moved] = entry.items.splice(from, 1);
    const to =
      beforeItemId === null
        ? entry.items.length
        : entry.items.findIndex((item) => item.id === beforeItemId);
    entry.items.splice(to === -1 ? entry.items.length : to, 0, moved);
    renumber(entry.items);
    touch(entry);
    return { playlist: entry.playlist, items: entry.items };
  });
}
