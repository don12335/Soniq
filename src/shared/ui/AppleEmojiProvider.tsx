import { EmojiProvider } from "react-apple-emojis";

// Only the emojis the app actually renders. The package's full data.json maps
// ~4k emojis (~400 KB) and was shipped in the startup bundle just for these.
// AppleEmojiProvider.test.ts fails if an <Emoji name> is used but missing here.
export const APPLE_EMOJI_DATA = {
  baseUrl: "https://em-content.zobj.net/source/apple/419/",
  emojis: {
    "flag-brazil": "flag-brazil_1f1e7-1f1f7.png",
    "flag-france": "flag-france_1f1eb-1f1f7.png",
    "flag-germany": "flag-germany_1f1e9-1f1ea.png",
    "flag-italy": "flag-italy_1f1ee-1f1f9.png",
    "flag-poland": "flag-poland_1f1f5-1f1f1.png",
    "flag-russia": "flag-russia_1f1f7-1f1fa.png",
    "flag-spain": "flag-spain_1f1ea-1f1f8.png",
    "flag-taiwan": "flag-taiwan_1f1f9-1f1fc.png",
    "flag-turkey": "flag-turkey_1f1f9-1f1f7.png",
    "flag-ukraine": "flag-ukraine_1f1fa-1f1e6.png",
    "flag-united-kingdom": "flag-united-kingdom_1f1ec-1f1e7.png",
  } as Record<string, string>,
};

export function AppleEmojiProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <EmojiProvider data={APPLE_EMOJI_DATA}>{children}</EmojiProvider>;
}

export default AppleEmojiProvider;
