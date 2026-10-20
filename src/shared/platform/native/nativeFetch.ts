import { CapacitorHttp, registerPlugin } from "@capacitor/core";
import { applyHostHeaderRules } from "../headerRules";
import { log } from "@/shared/utils/logger";

export interface NativeHttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  // base64; bodies pass through untouched in both directions
  body?: string;
  timeout: number;
}

export interface NativeHttpResponse {
  status: number;
  headers: Record<string, string>;
  url: string;
  data: string;
}

type NativeRequest = (options: NativeHttpRequest) => Promise<NativeHttpResponse>;

// SoniqHttpPlugin.swift in the Soniq-iOS shell. Capacitor's own CapacitorHttp can't be used:
// it parses application/json responses itself and loses bodies like YouTube's ")]}'"-prefixed sw.js_data.
const SoniqHttp = registerPlugin<{ request(options: NativeHttpRequest): Promise<NativeHttpResponse> }>("SoniqHttp");

const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

// WKWebView enforces CORS and won't let pages set Origin/Referer/User-Agent, so every
// cross-origin http(s) request goes through native URLSession instead.
export function shouldUseNative(url: string): boolean {
  if (!/^https?:/i.test(url)) return false;
  try {
    return new URL(url).origin !== window.location.origin;
  } catch {
    return false;
  }
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, name) => {
    out[name] = value;
  });
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal | null): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export function createNativeFetch(webFetch: typeof fetch, nativeRequest: NativeRequest): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    if (!shouldUseNative(request.url)) return webFetch(input, init);
    if (request.signal?.aborted) throw abortError();

    const method = request.method.toUpperCase();
    const headers = applyHostHeaderRules(request.url, headersToObject(request.headers));
    if (!Object.keys(headers).some((name) => name.toLowerCase() === "user-agent")) {
      headers["User-Agent"] = navigator.userAgent;
    }

    let body: string | undefined;
    if (method !== "GET" && method !== "HEAD") {
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.length > 0) body = bytesToBase64(bytes);
    }

    let res: NativeHttpResponse;
    try {
      res = await raceAbort(
        nativeRequest({ url: request.url, method, headers, body, timeout: 30000 }),
        request.signal,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      const reason = error instanceof Error ? error.message : String(error);
      log("red", "http", `${method} ${request.url.slice(0, 80)} failed: ${reason}`);
      throw new TypeError(`Failed to fetch (${reason})`, { cause: error });
    }

    const responseBody =
      NULL_BODY_STATUS.has(res.status) || method === "HEAD" || !res.data ? null : base64ToBytes(res.data);
    const response = new Response(responseBody, {
      status: res.status,
      headers: res.headers,
    });
    Object.defineProperty(response, "url", { value: res.url || request.url });
    return response;
  };
}

function utf8ToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

// Fallback for a shell without SoniqHttp. CapacitorHttp parses JSON-typed responses itself,
// so their bodies come back as objects (or are lost when they aren't valid JSON).
export async function requestViaCapacitorHttp(options: NativeHttpRequest): Promise<NativeHttpResponse> {
  const headers = { ...options.headers };
  if (options.body && !Object.keys(headers).some((name) => name.toLowerCase() === "content-type")) {
    // iOS only sends a body when Content-Type is set
    headers["Content-Type"] = "application/octet-stream";
  }
  const res = await CapacitorHttp.request({
    url: options.url,
    method: options.method,
    headers,
    data: options.body,
    dataType: options.body ? "file" : undefined,
    responseType: "arraybuffer",
    connectTimeout: options.timeout,
    readTimeout: options.timeout,
  });
  const resHeaders = (res.headers ?? {}) as Record<string, string>;
  const isJson = (resHeaders["content-type"] ?? "").toLowerCase().includes("application/json");
  const data =
    typeof res.data !== "string"
      ? utf8ToBase64(JSON.stringify(res.data ?? null))
      : isJson
        ? utf8ToBase64(res.data)
        : res.data;
  return { status: res.status, headers: resHeaders, url: res.url, data };
}

export function installNativeFetch(): void {
  const webFetch = window.fetch.bind(window);
  let useCapacitorHttp = false;
  window.fetch = createNativeFetch(webFetch, async (options) => {
    if (useCapacitorHttp) return requestViaCapacitorHttp(options);
    try {
      return await SoniqHttp.request(options);
    } catch (soniqError) {
      // a missing or broken plugin must not take all networking down: retry through CapacitorHttp,
      // and if that works, stop using the plugin
      const reason = soniqError instanceof Error ? soniqError.message : String(soniqError);
      let fallback: NativeHttpResponse;
      try {
        fallback = await requestViaCapacitorHttp(options);
      } catch {
        throw soniqError;
      }
      useCapacitorHttp = true;
      log("yellow", "http", `SoniqHttp failed (${reason}), using CapacitorHttp from now on`);
      return fallback;
    }
  });
}
