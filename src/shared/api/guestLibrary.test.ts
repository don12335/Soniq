// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import * as guestLibrary from "./guestLibrary";
import type { ApiTrack } from "../contracts";

const track = (id: string): ApiTrack => ({
  id,
  title: `Song ${id}`,
  artists: [{ id: "a1", name: "Artist" }],
  durationMs: 1000,
  viewer: { liked: false },
});

describe("guestLibrary", () => {
  beforeEach(() => localStorage.clear());

  it("likes and unlikes tracks, newest first, without duplicates", () => {
    guestLibrary.likeTrack(track("t1"));
    guestLibrary.likeTrack(track("t2"));
    guestLibrary.likeTrack(track("t1"));
    const ids = guestLibrary.listLikedTracks().items.map((i) => i.track.id);
    expect(ids).toEqual(["t2", "t1"]);
    expect(guestLibrary.listLikedTracks().items[0].track.viewer).toBeUndefined();

    guestLibrary.unlikeTrack("t2");
    expect(guestLibrary.listLikedTracks().items.map((i) => i.track.id)).toEqual(["t1"]);
  });

  it("saves collections in the server response shape", () => {
    guestLibrary.saveArtist({
      type: "artist",
      id: "ar1",
      name: "Someone",
      verified: false,
      tracks: [],
      albums: [],
      singles: [],
    });
    expect(guestLibrary.isCollectionSaved("artists", "ar1")).toBe(true);
    const [entry] = guestLibrary.listSavedCollections("artists").items as any[];
    expect(entry.artist).toEqual({ id: "ar1", name: "Someone", cover: undefined });
    expect(typeof entry.savedAt).toBe("string");

    guestLibrary.removeCollection("artists", "ar1");
    expect(guestLibrary.listSavedCollections("artists").items).toHaveLength(0);
  });

  it("manages playlist items, duplicates and ordering", () => {
    const playlist = guestLibrary.createPlaylist({ title: "Mine" });
    expect(guestLibrary.isGuestPlaylistId(playlist.id)).toBe(true);

    const a = guestLibrary.addPlaylistTrack(playlist.id, track("a"));
    const b = guestLibrary.addPlaylistTrack(playlist.id, track("b"));
    const c = guestLibrary.addPlaylistTrack(playlist.id, track("c"));
    expect(guestLibrary.addPlaylistTrack(playlist.id, track("a")).status).toBe("duplicate");
    expect(guestLibrary.addPlaylistTrack("missing", track("a")).status).toBe("not_found");
    if (a.status !== "added" || b.status !== "added" || c.status !== "added") throw new Error();

    // move c before a, then a to the end
    guestLibrary.movePlaylistItem(playlist.id, c.item.id, a.item.id);
    const moved = guestLibrary.movePlaylistItem(playlist.id, a.item.id, null);
    expect(moved?.items.map((i) => i.track.id)).toEqual(["c", "b", "a"]);
    expect(moved?.items.map((i) => i.position)).toEqual([0, 1, 2]);

    expect(guestLibrary.removePlaylistItem(playlist.id, b.item.id)).toBe(true);
    const entry = guestLibrary.getPlaylist(playlist.id);
    expect(entry?.items.map((i) => i.track.id)).toEqual(["c", "a"]);
    expect(entry!.playlist.revision).toBeGreaterThan(playlist.revision);

    guestLibrary.updatePlaylist(playlist.id, { title: "Renamed", description: null });
    expect(guestLibrary.listPlaylists().items[0].title).toBe("Renamed");

    expect(guestLibrary.deletePlaylist(playlist.id)).toBe(true);
    expect(guestLibrary.listPlaylists().items).toHaveLength(0);
  });

  it("survives corrupted storage", () => {
    localStorage.setItem("liner_guest_library_v1", "{not json");
    expect(guestLibrary.listLikedTracks().items).toEqual([]);
    guestLibrary.likeTrack(track("x"));
    expect(guestLibrary.listLikedTracks().items).toHaveLength(1);
  });
});
