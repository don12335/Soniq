import { parseVisitorData } from "./visitorData";
import { log } from "@/shared/utils/logger";

/**
 * Client-side YouTube visitorData session manager.
 * Fetches fresh, authentic visitorData directly from the client's residential IP
 * and caches it in-memory / session for up to 6 hours.
 */

interface VisitorSession {
  visitorData: string;
  expiresAt: number;
}

const STORAGE_KEY = "soniq_youtube_visitor_v1";

function restoreSession(): VisitorSession | null {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as VisitorSession | null;
    return stored && typeof stored.visitorData === "string" && stored.expiresAt > Date.now()
      ? stored : null;
  } catch {
    return null;
  }
}

let cachedSession: VisitorSession | null = typeof localStorage === "undefined" ? null : restoreSession();
let pendingFetch: Promise<string> | null = null;

const SESSION_TTL_MS = 5.5 * 60 * 60 * 1000; // 5.5 hours

const USER_AGENT =
  typeof navigator !== "undefined"
    ? navigator.userAgent
    : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchFromServiceWorkerData(): Promise<string> {
  const res = await fetch("https://www.youtube.com/sw.js_data", {
    headers: { "user-agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`sw.js_data returned ${res.status}`);
  }
  const visitorData = parseVisitorData(await res.text());
  if (!visitorData) {
    throw new Error("Could not parse visitorData from sw.js_data");
  }
  return visitorData;
}

// Plain-JSON fallback. sw.js_data is ")]}'"-prefixed JSON, which some native HTTP layers
// (Capacitor's CapacitorHttp on iOS) can't hand back intact.
async function fetchFromVisitorIdEndpoint(): Promise<string> {
  const res = await fetch("https://www.youtube.com/youtubei/v1/visitor_id?prettyPrint=false", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": USER_AGENT },
    body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: "2.20260101.00.00", hl: "en" } } }),
  });
  if (!res.ok) {
    throw new Error(`visitor_id returned ${res.status}`);
  }
  const visitorData = parseVisitorData(
    String(((await res.json()) as { responseContext?: { visitorData?: unknown } })?.responseContext?.visitorData ?? ""),
  );
  if (!visitorData) {
    throw new Error("visitor_id returned no visitorData");
  }
  return visitorData;
}

export function resetClientVisitorData(): void {
  cachedSession = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage may be unavailable */ }
}

export async function getClientVisitorData(): Promise<string> {
  const now = Date.now();
  if (cachedSession && cachedSession.expiresAt > now) {
    return cachedSession.visitorData;
  }

  if (pendingFetch) {
    return pendingFetch;
  }

  pendingFetch = (async () => {
    try {
      let visitorData: string;
      try {
        visitorData = await fetchFromServiceWorkerData();
      } catch (swError) {
        log("yellow", "visitor", `sw.js_data failed (${swError instanceof Error ? swError.message : String(swError)}), trying visitor_id`);
        visitorData = await fetchFromVisitorIdEndpoint();
      }

      cachedSession = {
        visitorData,
        expiresAt: Date.now() + SESSION_TTL_MS,
      };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedSession)); } catch { /* optional cache */ }

      log("green", "visitor", `ready: ${visitorData.slice(0, 16)}...`);
      console.info(
        `%c[VisitorSession]%c Ready: ${visitorData.slice(0, 16)}... (valid 5.5h)`,
        "color: #10b981; font-weight: bold;",
        "color: inherit;",
      );

      return visitorData;
    } catch (err) {
      console.warn("[VisitorSession] Failed to fetch fresh visitorData:", err);
      log("red", "visitor", `failed: ${err instanceof Error ? err.message : String(err)}`);
      // Fallback: if cached exists even if slightly expired, keep it
      if (cachedSession?.visitorData) {
        return cachedSession.visitorData;
      }
      return "";
    } finally {
      pendingFetch = null;
    }
  })();

  return pendingFetch;
}

/**
 * Eagerly warm up the client's visitorData on app launch in the background.
 */
export function initClientVisitorSession(): void {
  void getClientVisitorData().catch(() => {});
}
