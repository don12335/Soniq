// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createPortableBackup, preparePortableImport } from "./portableBackup";

const library = (song: string, playlist: string) => ({
  likes: [{ track: { id: song }, likedAt: "2026-10-20" }],
  collections: { albums: [], artists: [], playlists: [] },
  playlists: [{ playlist: { id: playlist, title: playlist },
    items: [{ id: `${playlist}-item`, track: { id: song }, position: 0 }] }],
});
const play = (session: string, song: string, time: string) => ({
  id: session, playbackSessionId: session, track: { id: song }, listenedAt: time,
});

describe("portable backup", () => {
  beforeEach(() => localStorage.clear());

  it("keeps both devices' likes, playlists, plays and recommendations", () => {
    localStorage.setItem("liner_guest_library_v1", JSON.stringify(library("phone-song", "phone-list")));
    localStorage.setItem("liner_local_history_v1", JSON.stringify([
      play("phone-play", "phone-song", "2026-10-20T10:00:00Z"),
    ]));
    localStorage.setItem("soniq_home_recommendations_v4", JSON.stringify({
      mix: { tracks: [{ id: "phone-rec" }] },
    }));
    const before = localStorage.getItem("liner_guest_library_v1");
    const imported = JSON.stringify({
      format: "soniq-portable-backup", version: 1, exportedAt: "2026-10-20T12:00:00Z",
      data: {
        liner_guest_library_v1: JSON.stringify(library("pc-song", "pc-list")),
        liner_local_history_v1: JSON.stringify([
          play("pc-play", "pc-song", "2026-10-20T11:00:00Z"),
          play("phone-play", "phone-song", "2026-10-20T10:00:00Z"),
        ]),
        soniq_home_recommendations_v4: JSON.stringify({
          mix: { tracks: [{ id: "pc-rec" }] },
        }),
      },
    });

    const plan = preparePortableImport(imported);
    const mergedLibrary = JSON.parse(plan.writes.liner_guest_library_v1);
    expect(mergedLibrary.likes.map((entry: { track: { id: string } }) => entry.track.id))
      .toEqual(["phone-song", "pc-song"]);
    expect(mergedLibrary.playlists.map((entry: { playlist: { id: string } }) => entry.playlist.id))
      .toEqual(["phone-list", "pc-list"]);
    expect(JSON.parse(plan.writes.liner_local_history_v1)).toHaveLength(2);
    expect(JSON.parse(plan.writes.soniq_home_recommendations_v4).mix.tracks.map((t: { id: string }) => t.id))
      .toEqual(["phone-rec", "pc-rec"]);
    expect(localStorage.getItem("liner_guest_library_v1")).toBe(before);
  });

  it("exports only portable app data and rejects other files", () => {
    localStorage.setItem("liner_guest_library_v1", JSON.stringify(library("song", "list")));
    localStorage.setItem("liner_auth_session", "secret");
    const backup = JSON.parse(createPortableBackup());
    expect(backup.data.liner_guest_library_v1).toBeDefined();
    expect(backup.data.liner_auth_session).toBeUndefined();
    expect(() => preparePortableImport(JSON.stringify({ format: "other", version: 1, data: {} })))
      .toThrow();
  });

  it("unites songs added independently to the same playlist", () => {
    localStorage.setItem("liner_guest_library_v1", JSON.stringify(library("phone-song", "shared-list")));
    const backup = JSON.stringify({ format: "soniq-portable-backup", version: 1,
      exportedAt: "2026-10-20T12:00:00Z", data: {
        liner_guest_library_v1: JSON.stringify(library("pc-song", "shared-list")),
      } });
    const plan = preparePortableImport(backup);
    const merged = JSON.parse(plan.writes.liner_guest_library_v1);
    expect(merged.playlists).toHaveLength(1);
    expect(merged.playlists[0].items.map((item: { track: { id: string }; position: number }) =>
      [item.track.id, item.position])).toEqual([["phone-song", 0], ["pc-song", 1]]);
  });
});
