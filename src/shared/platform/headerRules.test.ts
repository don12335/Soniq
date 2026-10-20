import { describe, expect, it } from "vitest";
import { applyHostHeaderRules, matchesSpoofedHost } from "./headerRules";

describe("host header rules", () => {
  it("matches the same hosts as electron's onBeforeSendHeaders filter", () => {
    expect(matchesSpoofedHost("https://music.youtube.com/youtubei/v1/search")).toBe(true);
    expect(matchesSpoofedHost("https://youtube.com/sw.js_data")).toBe(true);
    expect(matchesSpoofedHost("https://rr3---sn-abc.googlevideo.com/videoplayback?x=1")).toBe(true);
    expect(matchesSpoofedHost("https://api.music.apple.com/v1/catalog")).toBe(true);
    expect(matchesSpoofedHost("https://amp-api.music.apple.com/v1/me")).toBe(true);
    expect(matchesSpoofedHost("https://music.apple.com/us/playlist")).toBe(false);
    expect(matchesSpoofedHost("https://notyoutube.com/")).toBe(false);
    expect(matchesSpoofedHost("https://api-v2.soundcloud.com/tracks")).toBe(false);
    expect(matchesSpoofedHost("not a url")).toBe(false);
  });

  it("forces music.youtube.com origin and drops incoming origin/referer", () => {
    const headers = applyHostHeaderRules("https://music.youtube.com/youtubei/v1/search", {
      origin: "capacitor://localhost",
      Referer: "capacitor://localhost/",
      "content-type": "application/json",
    });
    expect(headers).toEqual({
      "content-type": "application/json",
      Origin: "https://music.youtube.com",
      Referer: "https://music.youtube.com/",
    });
  });

  it("uses www.youtube.com and music.apple.com origins for those hosts", () => {
    expect(applyHostHeaderRules("https://www.youtube.com/sw.js_data", {}).Origin).toBe("https://www.youtube.com");
    expect(applyHostHeaderRules("https://amp-api.music.apple.com/v1/x", {}).Origin).toBe("https://music.apple.com");
    expect(applyHostHeaderRules("https://rr1.googlevideo.com/videoplayback", {}).Origin).toBe("https://music.youtube.com");
  });

  it("turns x-liner-user-agent into the real User-Agent", () => {
    const headers = applyHostHeaderRules("https://www.youtube.com/youtubei/v1/player", {
      "user-agent": "WebKit",
      "x-liner-user-agent": "com.google.android.apps.youtube.vr.oculus/1.0",
    });
    expect(headers["User-Agent"]).toBe("com.google.android.apps.youtube.vr.oculus/1.0");
    expect(headers["user-agent"]).toBeUndefined();
    expect(headers["x-liner-user-agent"]).toBeUndefined();
  });

  it("leaves other hosts untouched", () => {
    const original = { origin: "capacitor://localhost", "x-liner-user-agent": "x" };
    expect(applyHostHeaderRules("https://lrclib.net/api/get", original)).toBe(original);
  });
});
