// Share links point straight at YouTube Music, where the catalog comes from,
// so anyone can open them without this app or a Liner account.
const YOUTUBE_MUSIC = "https://music.youtube.com";

export type ShareEntityType = "artist" | "album" | "playlist" | "track";

const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

// returns null for things that only exist on this device (local playlists,
// tracks from other sources) and therefore have no public page
export function buildShareUrl(type: ShareEntityType, id: string): string | null {
  const value = id.trim().replace(/^yt:/, "");
  if (!value) return null;
  switch (type) {
    case "track":
      return VIDEO_ID.test(value) ? `${YOUTUBE_MUSIC}/watch?v=${value}` : null;
    case "artist":
      return value.startsWith("UC") ? `${YOUTUBE_MUSIC}/channel/${value}` : null;
    case "album":
      return value.startsWith("MPRE") ? `${YOUTUBE_MUSIC}/browse/${value}` : null;
    case "playlist": {
      const list = value.replace(/^VL/, "");
      return /^(PL|OLAK5uy_|RD|LM)/.test(list) ? `${YOUTUBE_MUSIC}/playlist?list=${encodeURIComponent(list)}` : null;
    }
  }
}
