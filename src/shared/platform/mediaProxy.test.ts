import { afterEach, describe, expect, it } from "vitest";
import { resetCapabilitiesForTests } from "./capabilities";
import { toPlayableMediaUrl } from "./mediaProxy";

function setNativePlatform(platform: string | null) {
  window.Capacitor = platform ? { isNativePlatform: () => true, getPlatform: () => platform } : undefined;
  resetCapabilitiesForTests();
}

describe("media proxy urls", () => {
  afterEach(() => setNativePlatform(null));

  it("leaves urls alone outside iOS", () => {
    setNativePlatform(null);
    expect(toPlayableMediaUrl("https://rr1.googlevideo.com/videoplayback?id=1")).toBe(
      "https://rr1.googlevideo.com/videoplayback?id=1",
    );
  });

  it("routes iOS streams through soniq-media:// with youtube headers", () => {
    setNativePlatform("ios");
    const source = "https://rr1.googlevideo.com/videoplayback?id=1&itag=140";
    const proxied = new URL(toPlayableMediaUrl(source));
    expect(proxied.protocol).toBe("soniq-media:");
    expect(proxied.searchParams.get("url")).toBe(source);
    const headers = JSON.parse(proxied.searchParams.get("h") ?? "{}");
    expect(headers.Origin).toBe("https://music.youtube.com");
    expect(headers.Referer).toBe("https://music.youtube.com/");
    expect(headers["User-Agent"]).toBe(navigator.userAgent);
  });

  it("does not proxy blob urls", () => {
    setNativePlatform("ios");
    expect(toPlayableMediaUrl("blob:capacitor://localhost/abc")).toBe("blob:capacitor://localhost/abc");
  });
});
