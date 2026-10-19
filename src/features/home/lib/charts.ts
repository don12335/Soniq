import { api, toClientTrack } from "@/shared/api";
import { postInnertube } from "@/shared/media/innertube";
import { WEB_REMIX_PROFILE, type InnertubeProfile } from "@/shared/media/innertube/innertubeClient";
import { getBrowseEndpoint, getText } from "@/shared/media/innertube/innertubeJson";
import { coverFromThumbnail } from "@/shared/media/innertube/innertubeThumbnail";
import { asArray, asRecord, stringValue, walkRecords } from "@/shared/utils/json";
import type { Track } from "@/shared/types";
import type { PopularArtistItem } from "../hooks/usePopularTracks";

// YouTube Music charts for Taiwan. YouTube publishes no "top songs" chart for
// Taiwan, so the songs come from its daily music-video chart playlist.

export const CHART_COUNTRY = "TW";
// artist cards are 175px wide; 360px stays sharp on 2x displays
const ARTIST_IMAGE_SIZE = 360;

const CHART_PROFILE: InnertubeProfile = {
  ...WEB_REMIX_PROFILE,
  extraContext: { gl: CHART_COUNTRY, hl: "zh-TW" },
};

export interface ChartPlaylist {
  id: string;
  title: string;
}

export interface ChartsOverview {
  playlists: ChartPlaylist[];
  artists: PopularArtistItem[];
}

export function parseCharts(body: unknown): ChartsOverview {
  const playlists: ChartPlaylist[] = [];
  const artists: PopularArtistItem[] = [];

  walkRecords(body, (record) => {
    const card = asRecord(record.musicTwoRowItemRenderer);
    if (card) {
      const id = stringValue(getBrowseEndpoint(card)?.browseId);
      const title = getText(card.title);
      if (id?.startsWith("VL") && title) playlists.push({ id, title });
      return true;
    }

    const row = asRecord(record.musicResponsiveListItemRenderer);
    if (row) {
      const id = stringValue(getBrowseEndpoint(row)?.browseId);
      const firstColumn = asRecord(asArray(row.flexColumns)[0]);
      const name = getText(asRecord(firstColumn?.musicResponsiveListItemFlexColumnRenderer)?.text);
      if (id?.startsWith("UC") && name) {
        artists.push({
          id,
          name,
          // a sized image, not the full-resolution original: 20 of those decoding
          // while the row scrolls is what made it stutter
          imageUrl: coverFromThumbnail(row.thumbnail, { size: ARTIST_IMAGE_SIZE })?.url ?? "",
          followers: 0,
          description: "",
          totalListens: 0,
          totalTracks: 0,
        });
      }
      return true;
    }
    return false;
  });

  return { playlists, artists };
}

export async function fetchChartsOverview(signal?: AbortSignal): Promise<ChartsOverview> {
  const body = await postInnertube(
    "browse",
    { browseId: "FEmusic_charts", formData: { selectedValues: [CHART_COUNTRY] } },
    { profile: CHART_PROFILE, signal },
  );
  return parseCharts(body);
}

// the daily chart moves the most, so it makes the liveliest "trending" row
export function pickTrendingPlaylist(playlists: ChartPlaylist[]): ChartPlaylist | undefined {
  return playlists.find((p) => /本日|今日|daily/i.test(p.title)) ?? playlists[0];
}

export async function fetchChartTracks(playlist: ChartPlaylist, limit = 20): Promise<Track[]> {
  const details = await api.getPlaylist(playlist.id);
  return details.tracks.slice(0, limit).map((track) => toClientTrack(track));
}
