// Mirrors the onBeforeSendHeaders rules in electron/main.ts so native builds send
// the same Origin/Referer/User-Agent that Electron does.

// Same value as USER_AGENT_HEADER_OVERRIDE in innertubeClient.ts (not imported to keep this module dependency-free)
const USER_AGENT_HEADER_OVERRIDE = "x-liner-user-agent";
const SPOOFED_HOST = /(^|\.)(youtube\.com|googlevideo\.com)$|^(amp-)?api\.music\.apple\.com$/;

export function matchesSpoofedHost(url: string): boolean {
  try {
    return SPOOFED_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function applyHostHeaderRules(url: string, headers: Record<string, string>): Record<string, string> {
  if (!matchesSpoofedHost(url)) return headers;

  const next: Record<string, string> = {};
  let userAgentOverride: string | undefined;
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower === USER_AGENT_HEADER_OVERRIDE) {
      userAgentOverride = value;
    } else if (lower !== "origin" && lower !== "referer") {
      next[name] = value;
    }
  }

  const origin = url.includes("music.apple.com/")
    ? "https://music.apple.com"
    : url.includes("://www.youtube.com/")
      ? "https://www.youtube.com"
      : "https://music.youtube.com";
  next["Origin"] = origin;
  next["Referer"] = `${origin}/`;

  if (userAgentOverride) {
    for (const name of Object.keys(next)) {
      if (name.toLowerCase() === "user-agent") delete next[name];
    }
    next["User-Agent"] = userAgentOverride;
  }
  return next;
}
