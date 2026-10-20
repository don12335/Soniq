import { describe, expect, it } from 'vitest';
import { mergeCloudData } from './merge';

const library = (likes: string[], playlists: unknown[] = []) => JSON.stringify({
  likes: likes.map(id => ({ track: { id }, likedAt: '2026-10-20T00:00:00Z' })),
  collections: { albums: [], artists: [], playlists: [] }, playlists,
});

describe('cloud three-way merge', () => {
  it('combines two devices on first login', () => {
    const merged = mergeCloudData({},
      { liner_guest_library_v1: library(['a']) },
      { liner_guest_library_v1: library(['b']) });
    expect(JSON.parse(merged.liner_guest_library_v1).likes.map((x: any) => x.track.id)).toEqual(['a', 'b']);
  });
  it('propagates a deletion when the other device is unchanged', () => {
    const before = { liner_guest_library_v1: library(['a', 'b']) };
    const merged = mergeCloudData(before, { liner_guest_library_v1: library(['b']) }, before);
    expect(JSON.parse(merged.liner_guest_library_v1).likes.map((x: any) => x.track.id)).toEqual(['b']);
  });
  it('keeps independent additions and a deletion together', () => {
    const before = { liner_guest_library_v1: library(['a']) };
    const merged = mergeCloudData(before, { liner_guest_library_v1: library([]) },
      { liner_guest_library_v1: library(['a', 'b']) });
    expect(JSON.parse(merged.liner_guest_library_v1).likes.map((x: any) => x.track.id)).toEqual(['b']);
  });
  it('does not restore a deleted playlist track', () => {
    const playlist = (tracks: string[]) => [{
      playlist: { id: 'guest-p', title: 'Mix', revision: 1, updatedAt: '2026-10-20T00:00:00Z' },
      items: tracks.map((id, position) => ({ id: `item-${id}`, track: { id }, position })),
    }];
    const base = { liner_guest_library_v1: library([], playlist(['a', 'b'])) };
    const merged = mergeCloudData(base,
      { liner_guest_library_v1: library([], playlist(['b'])) }, base);
    expect(JSON.parse(merged.liner_guest_library_v1).playlists[0].items.map((x: any) => x.track.id)).toEqual(['b']);
  });
});
