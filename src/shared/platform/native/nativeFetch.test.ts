import { describe, expect, it, vi } from "vitest";
import type { HttpResponse } from "@capacitor/core";

vi.mock("@capacitor/core", () => ({ CapacitorHttp: { request: vi.fn() } }));

import { createNativeFetch, shouldUseNative } from "./nativeFetch";

function base64(text: string): string {
  return btoa(text);
}

function setup(response: Partial<HttpResponse> | Error) {
  const webFetch = vi.fn(async () => new Response("web"));
  const nativeRequest = vi.fn(async (_options: Record<string, any>) => {
    if (response instanceof Error) throw response;
    return { data: "", status: 200, headers: {}, url: "", ...response } as HttpResponse;
  });
  return { webFetch, nativeRequest, fetch: createNativeFetch(webFetch as unknown as typeof fetch, nativeRequest) };
}

describe("native fetch", () => {
  it("only routes cross-origin http(s) requests natively", () => {
    expect(shouldUseNative("https://music.youtube.com/x")).toBe(true);
    expect(shouldUseNative(`${window.location.origin}/index.html`)).toBe(false);
    expect(shouldUseNative("blob:https://x/1")).toBe(false);
    expect(shouldUseNative("data:text/plain,hi")).toBe(false);
  });

  it("passes same-origin requests to the web fetch", async () => {
    const { fetch, webFetch, nativeRequest } = setup({});
    await fetch(`${window.location.origin}/cover-sw.js`);
    expect(webFetch).toHaveBeenCalledTimes(1);
    expect(nativeRequest).not.toHaveBeenCalled();
  });

  it("applies youtube header rules and sends string bodies as text", async () => {
    const { fetch, nativeRequest } = setup({ data: { ok: true }, headers: { "content-type": "application/json" } });
    const res = await fetch("https://music.youtube.com/youtubei/v1/search", {
      method: "POST",
      headers: { "content-type": "application/json", "x-liner-user-agent": "VR/1" },
      body: JSON.stringify({ query: "a" }),
    });
    const options = nativeRequest.mock.calls[0][0];
    expect(options.method).toBe("POST");
    expect(options.data).toBe('{"query":"a"}');
    expect(options.dataType).toBeUndefined();
    expect(options.headers.Origin).toBe("https://music.youtube.com");
    expect(options.headers["User-Agent"]).toBe("VR/1");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("decodes base64 binary bodies and keeps 206 range headers", async () => {
    const { fetch } = setup({
      status: 206,
      data: base64("\x00\x01\x02\xff"),
      headers: { "content-type": "audio/mp4", "content-range": "bytes 0-3/100" },
      url: "https://rr1.googlevideo.com/videoplayback?range=0-3",
    });
    const res = await fetch("https://rr1.googlevideo.com/videoplayback?range=0-3");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-3/100");
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual([0, 1, 2, 255]);
    expect(res.url).toBe("https://rr1.googlevideo.com/videoplayback?range=0-3");
  });

  it("decodes text responses and reports the redirected url", async () => {
    const { fetch } = setup({ data: base64("hello"), headers: { "content-type": "text/html" }, url: "https://soundcloud.com/a/b" });
    const res = await fetch("https://on.soundcloud.com/xyz");
    expect(await res.text()).toBe("hello");
    expect(res.url).toBe("https://soundcloud.com/a/b");
  });

  it("returns a null body for 204 and HEAD", async () => {
    const empty = setup({ status: 204 });
    expect(await (await empty.fetch("https://lrclib.net/x")).text()).toBe("");
    const head = setup({ data: base64("ignored") });
    expect(await (await head.fetch("https://lrclib.net/x", { method: "HEAD" })).text()).toBe("");
  });

  it("sends binary bodies as base64 files", async () => {
    const { fetch, nativeRequest } = setup({});
    await fetch("https://example.com/upload", { method: "POST", body: new Uint8Array([1, 2, 3]) });
    const options = nativeRequest.mock.calls[0][0];
    expect(options.dataType).toBe("file");
    expect(options.data).toBe(btoa("\x01\x02\x03"));
    expect(options.headers["Content-Type"]).toBe("application/octet-stream");
  });

  it("rejects with AbortError when aborted", async () => {
    const controller = new AbortController();
    const { fetch } = setup({});
    controller.abort();
    await expect(fetch("https://lrclib.net/x", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("maps native failures to TypeError like browser fetch", async () => {
    const { fetch } = setup(new Error("The Internet connection appears to be offline."));
    await expect(fetch("https://lrclib.net/x")).rejects.toBeInstanceOf(TypeError);
  });
});
