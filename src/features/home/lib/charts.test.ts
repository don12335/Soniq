import { describe, expect, it } from "vitest";
import { parseCharts, pickTrendingPlaylist } from "./charts";

const text = (t: string) => ({ runs: [{ text: t }] });

// trimmed shape of the YouTube Music FEmusic_charts response
const body = {
  contents: {
    sections: [
      {
        musicCarouselShelfRenderer: {
          contents: [
            { musicTwoRowItemRenderer: { title: text("台灣 20 大發燒影片"), navigationEndpoint: { browseEndpoint: { browseId: "VLOLAK5uy_top20" } } } },
            { musicTwoRowItemRenderer: { title: text("本日熱播音樂影片 - 台灣"), navigationEndpoint: { browseEndpoint: { browseId: "VLPLdaily" } } } },
          ],
        },
      },
      {
        musicCarouselShelfRenderer: {
          contents: [
            {
              musicResponsiveListItemRenderer: {
                navigationEndpoint: { browseEndpoint: { browseId: "UCjay" } },
                flexColumns: [{ musicResponsiveListItemFlexColumnRenderer: { text: text("周杰倫") } }],
                thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: "https://yt3.ggpht.com/jay=s120", width: 120, height: 120 }] } } },
              },
            },
          ],
        },
      },
    ],
  },
};

describe("charts", () => {
  it("reads chart playlists and top artists", () => {
    const charts = parseCharts(body);
    expect(charts.playlists).toEqual([
      { id: "VLOLAK5uy_top20", title: "台灣 20 大發燒影片" },
      { id: "VLPLdaily", title: "本日熱播音樂影片 - 台灣" },
    ]);
    expect(charts.artists).toHaveLength(1);
    expect(charts.artists[0]).toMatchObject({ id: "UCjay", name: "周杰倫" });
    expect(charts.artists[0].imageUrl).toContain("yt3.ggpht.com");
  });

  it("prefers the daily chart for the trending row", () => {
    expect(pickTrendingPlaylist(parseCharts(body).playlists)?.id).toBe("VLPLdaily");
    expect(pickTrendingPlaylist([])).toBeUndefined();
  });
});
