import { CapacitorHttp, type HttpResponse } from "@capacitor/core";
import { applyHostHeaderRules } from "../headerRules";

type NativeRequest = (options: {
  url: string;
  method: string;
  headers: Record<string, string>;
  data?: string;
  dataType?: "file";
  responseType: "arraybuffer";
  connectTimeout: number;
  readTimeout: number;
}) => Promise<HttpResponse>;

const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

// WKWebView enforces CORS and won't let pages set Origin/Referer/User-Agent, so every
// cross-origin http(s) request goes through native URLSession (CapacitorHttp) instead.
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

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isJsonContentType(headers: Record<string, string>): boolean {
  return (headers["content-type"] ?? "").toLowerCase().includes("application/json");
}

// iOS parses JSON responses itself regardless of responseType; everything else arrives as base64.
function responseBody(res: HttpResponse): BodyInit {
  const headers = res.headers ?? {};
  if (isJsonContentType(headers) && typeof res.data !== "string") {
    return JSON.stringify(res.data);
  }
  if (typeof res.data !== "string") return JSON.stringify(res.data ?? null);
  if (isJsonContentType(headers)) return res.data;
  try {
    return base64ToBytes(res.data) as Uint8Array<ArrayBuffer>;
  } catch {
    return res.data;
  }
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

    let data: string | undefined;
    let dataType: "file" | undefined;
    if (method !== "GET" && method !== "HEAD") {
      const contentType = request.headers.get("content-type") ?? "";
      if (/^(text\/|application\/(json|x-www-form-urlencoded|xml))/i.test(contentType)) {
        data = await request.text();
      } else {
        const bytes = new Uint8Array(await request.arrayBuffer());
        if (bytes.length > 0) {
          data = bytesToBase64(bytes);
          dataType = "file";
        }
      }
      // iOS only sends a body when Content-Type is set
      if (data !== undefined && !contentType) headers["Content-Type"] = "application/octet-stream";
    }

    let res: HttpResponse;
    try {
      res = await raceAbort(
        nativeRequest({
          url: request.url,
          method,
          headers,
          data,
          dataType,
          responseType: "arraybuffer",
          connectTimeout: 15000,
          readTimeout: 30000,
        }),
        request.signal,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new TypeError("Failed to fetch", { cause: error });
    }

    const body = NULL_BODY_STATUS.has(res.status) || method === "HEAD" ? null : responseBody(res);
    const response = new Response(body, {
      status: res.status,
      headers: res.headers as Record<string, string>,
    });
    Object.defineProperty(response, "url", { value: res.url || request.url });
    return response;
  };
}

export function installNativeFetch(): void {
  const webFetch = window.fetch.bind(window);
  window.fetch = createNativeFetch(webFetch, (options) => CapacitorHttp.request(options));
}
