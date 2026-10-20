import { getCapabilities } from "./capabilities";
import { applyHostHeaderRules } from "./headerRules";

// Registered by the iOS shell (MediaProxySchemeHandler.swift in the Soniq-iOS repo).
export const MEDIA_PROXY_SCHEME = "soniq-media";

// iOS: WebKit's media loader can't send the Origin/Referer/User-Agent YouTube's media servers
// expect, so <audio> streams through the native proxy, which adds them and forwards Range requests.
export function toPlayableMediaUrl(url: string): string {
  if (!getCapabilities().mediaProxy || !/^https:/i.test(url)) return url;
  const headers = applyHostHeaderRules(url, { "User-Agent": navigator.userAgent });
  return `${MEDIA_PROXY_SCHEME}://stream?url=${encodeURIComponent(url)}&h=${encodeURIComponent(JSON.stringify(headers))}`;
}
