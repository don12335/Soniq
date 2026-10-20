import { debouncedStorage } from "@/shared/utils/storage";
import { CLOUD_KEYS, mergeCloudData, type CloudData } from "./merge";
import { readBaseline, writeBaseline } from "./baselineDb";

const SESSION_KEY = "soniq_cloud_session_v1";
const SERVER_KEY = "soniq_cloud_server_v1";
const DEFAULT_SERVER = "https://129.146.222.51";
const CHANGE_EVENT = "soniq:cloud-state";
const message = (zh: string, en: string) => document.documentElement.lang.startsWith("zh") ? zh : en;
type Session = { token: string; account: { id: string; email: string | null } };
export type CloudState = { session: Session | null; busy: boolean; lastSync: number | null; error: string | null };
let state: CloudState = { session: null, busy: false, lastSync: null, error: null };
let booted = false;
let running: Promise<void> | null = null;
let rerun = false;
let pendingCredential = "";
export const getPendingCredential = () => pendingCredential;
export const acknowledgeCredential = () => { pendingCredential = ""; };

function emit(patch: Partial<CloudState>) {
  state = { ...state, ...patch };
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export const getCloudState = () => state;
export const onCloudState = (callback: () => void) => {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
};
export const getCloudServer = () => localStorage.getItem(SERVER_KEY) ?? DEFAULT_SERVER;
export function setCloudServer(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))
    throw new Error(message("雲端伺服器需要有效的 HTTPS 位址。", "Enter a valid HTTPS server address."));
  if (url.username || url.password || url.search || url.hash)
    throw new Error(message("伺服器位址不能包含帳密或參數。", "The server address cannot include credentials or parameters."));
  const next = url.origin + url.pathname.replace(/\/$/, "");
  if (state.session && getCloudServer() && getCloudServer() !== next)
    throw new Error(message("請先登出，再變更伺服器位址。", "Sign out before changing the server address."));
  localStorage.setItem(SERVER_KEY, next);
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const base = getCloudServer();
  if (!base) throw new Error(message("請先填入伺服器 HTTPS 位址。", "Enter the server HTTPS address first."));
  const endpoint = new URL(base);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1"].includes(endpoint.hostname)))
    throw new Error(message("雲端伺服器需要有效的 HTTPS 位址。", "Enter a valid HTTPS server address."));
  const response = await fetch(`${base}${path}`, { ...init, headers: {
    "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers,
  } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error === "RATE_LIMITED" ? message("嘗試太頻繁，請稍後再試。", "Too many attempts. Try again later.") :
    data.error === "INVALID_CREDENTIALS" ? message("帳號數字不正確。", "Incorrect account number.") :
    data.error === "UNAUTHORIZED" ? message("登入已過期，請重新登入。", "Your session expired. Sign in again.") :
    data.error === "INVALID_EMAIL" ? message("Email 格式不正確。", "Enter a valid email address.") :
    data.error === "TOO_LARGE" ? message("同步資料超過 20 MB 上限。", "Sync data exceeds the 20 MB limit.") :
    data.error === "CONFLICT" ? "CONFLICT" : `伺服器錯誤 (${response.status})`);
  return data as T;
}

const snapshot = (): CloudData => {
  debouncedStorage.flush();
  const data: CloudData = {};
  for (const key of CLOUD_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) data[key] = value;
  }
  return data;
};
const equal = (a: CloudData, b: CloudData) => JSON.stringify(a) === JSON.stringify(b);

function applyLocal(before: CloudData, merged: CloudData) {
  // A change made during an HTTP round trip must never be overwritten.
  if (!equal(snapshot(), before)) return false;
  let libraryChanged = false;
  let historyChanged = false;
  let recommendationsChanged = false;
  let preferencesChanged = false;
  const changed: string[] = [];
  try {
    for (const key of CLOUD_KEYS) {
      if (before[key] === merged[key]) continue;
      changed.push(key);
      if (merged[key] === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, merged[key]);
      if (key === "liner_guest_library_v1") libraryChanged = true;
      if (key === "liner_local_history_v1") historyChanged = true;
      if (key === "soniq_home_recommendations_v4") recommendationsChanged = true;
      if (["liner_customization_v1", "liner_lyrics_session_v1", "liner_locale", "theme", "liner_library_view_mode"].includes(key)) preferencesChanged = true;
    }
  } catch (error) {
    for (const key of changed.reverse()) {
      if (before[key] === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, before[key]);
    }
    throw error;
  }
  if (libraryChanged) window.dispatchEvent(new Event("library:changed"));
  if (historyChanged) window.dispatchEvent(new Event("soniq:local-history-changed"));
  if (recommendationsChanged) window.dispatchEvent(new Event("soniq:recommendations-changed"));
  if (preferencesChanged) window.dispatchEvent(new Event("soniq:cloud-preferences-changed"));
  return true;
}

async function syncOnce() {
  const session = state.session;
  if (!session) return;
  emit({ busy: true, error: null });
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const local = snapshot();
      const base = await readBaseline(session.account.id);
      const remoteResponse = await request<{ revision: number; data?: CloudData; unchanged?: boolean }>(
        `/v1/sync?since=${base.revision}`, {}, session.token);
      if (!state.session || state.session.token !== session.token) return;
      const remote = remoteResponse.unchanged ? base.data : remoteResponse.data;
      if (!remote) throw new Error("Invalid cloud response");
      const merged = mergeCloudData(base.data, local, remote);
      let revision = remoteResponse.revision;
      if (!equal(merged, remote)) {
        try {
          const saved = await request<{ revision: number }>("/v1/sync", {
            method: "PUT", body: JSON.stringify({ revision, data: merged }),
          }, session.token);
          revision = saved.revision;
        } catch (error) { if (String(error).includes("CONFLICT")) continue; throw error; }
      }
      if (!state.session || state.session.token !== session.token) return;
      if (!applyLocal(local, merged)) { rerun = true; return; }
      await writeBaseline(session.account.id, { revision, data: merged });
      emit({ lastSync: Date.now(), error: null });
      return;
    }
    throw new Error(message("同步資料正在其他裝置更新，請稍後重試。", "Another device is updating this account. Try again soon."));
  } catch (error) {
    emit({ error: error instanceof Error ? error.message : String(error) });
  } finally { emit({ busy: false }); }
}

export async function syncCloud(): Promise<void> {
  if (running) { rerun = true; return running; }
  running = (async () => {
    do { rerun = false; await syncOnce(); } while (rerun && state.session);
  })();
  try { await running; } finally { running = null; }
}

export function bootCloud() {
  if (booted) return;
  booted = true;
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
    if (saved?.token && saved.account?.id) emit({ session: saved });
  } catch { localStorage.removeItem(SESSION_KEY); }
  if (state.session) void syncCloud();
  window.addEventListener("online", () => void syncCloud());
  window.addEventListener("focus", () => { if (state.session) void syncCloud(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.session) void syncCloud();
  });
  window.addEventListener("soniq:sync-local-change", () => { window.setTimeout(() => void syncCloud(), 1500); });
  window.setInterval(() => { if (state.session) void syncCloud(); }, 30_000);
}

function saveSession(session: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  emit({ session, error: null, lastSync: null });
  void syncCloud();
}
export async function createCloudAccount(): Promise<string> {
  const result = await request<Session & { credential: string }>("/v1/accounts", { method: "POST" });
  pendingCredential = result.credential;
  saveSession(result);
  return result.credential;
}
export async function loginCloud(credential: string) {
  const digits = credential.replace(/\s/g, "");
  if (!/^\d{24}$/.test(digits)) throw new Error(message("請輸入 24 位數字帳號。", "Enter the 24-digit account number."));
  const session = await request<Session>("/v1/sessions", { method: "POST", body: JSON.stringify({ credential: digits }) });
  pendingCredential = "";
  saveSession(session);
}
export async function logoutCloud() {
  const session = state.session;
  localStorage.removeItem(SESSION_KEY);
  emit({ session: null, error: null, lastSync: null });
  if (session) await request("/v1/sessions/current", { method: "DELETE" }, session.token).catch(() => {});
}
export async function saveCloudEmail(email: string | null) {
  const session = state.session;
  if (!session) throw new Error(message("請先登入。", "Sign in first."));
  const response = await request<{ account: Session["account"] }>("/v1/me/email", {
    method: "PATCH", body: JSON.stringify({ email }),
  }, session.token);
  saveSession({ ...session, account: response.account });
}
