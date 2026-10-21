import { usePlayerStore } from "../store/playerStore";

const STORAGE_KEY = "soniq_sleep_timer_v1";

export interface SleepTimerState {
  deadline: number | null;
  afterTrack: boolean;
}

function restore(): SleepTimerState {
  if (typeof localStorage === "undefined") return { deadline: null, afterTrack: false };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<SleepTimerState> | null;
    return {
      deadline: typeof saved?.deadline === "number" && Number.isFinite(saved.deadline) ? saved.deadline : null,
      afterTrack: saved?.afterTrack === true,
    };
  } catch {
    return { deadline: null, afterTrack: false };
  }
}

let state: SleepTimerState = restore();
let timeout: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

export const getSleepTimer = () => state;
export const subscribeSleepTimer = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

function update(next: SleepTimerState) {
  state = next;
  if (typeof localStorage !== "undefined") {
    if (next.deadline === null && !next.afterTrack) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  for (const listener of listeners) listener();
  schedule();
}

function checkDeadline() {
  if (state.deadline === null) return;
  if (Date.now() < state.deadline) { schedule(); return; }
  update({ deadline: null, afterTrack: false });
  usePlayerStore.getState().dispatch({ type: "PAUSE_REQUESTED" });
}

function schedule() {
  if (timeout !== null) clearTimeout(timeout);
  timeout = null;
  if (state.deadline !== null) {
    timeout = setTimeout(checkDeadline, Math.max(0, Math.min(state.deadline - Date.now(), 2_147_483_647)));
  }
}

export function setSleepMinutes(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) throw new Error("Invalid sleep timer");
  update({ deadline: Date.now() + minutes * 60_000, afterTrack: false });
}

export function setSleepAfterTrack() {
  update({ deadline: null, afterTrack: true });
}

export function cancelSleepTimer() {
  update({ deadline: null, afterTrack: false });
}

export function consumeSleepAfterTrack(): boolean {
  if (!state.afterTrack) return false;
  cancelSleepTimer();
  return true;
}

if (typeof window !== "undefined") {
  checkDeadline();
  window.addEventListener("focus", checkDeadline);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkDeadline();
  });
}
