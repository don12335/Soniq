import { create } from "zustand";
import { api, ApiError } from "@/shared/api";
import {
  clearAuthSession,
  getAuthSession,
  setAuthSession,
  refreshAuthSession,
  type AuthUser,
  type PublicUser,
  type UpdateProfileInput,
} from "@/shared/api";
import { usePlayerStore, playerRuntime } from "@/features/player";

export type AuthStatus = "initializing" | "authenticated" | "anonymous";
export type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    username: string,
    displayName: string,
  ) => Promise<void>;
  updateProfile: (patch: UpdateProfileInput) => Promise<PublicUser>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  // The legacy Liner account API remains disabled. Soniq cloud accounts use
  // src/shared/account and keep the local library as the offline source.
  status: "anonymous",
  user: null,
  initialize: async () => {
    // a session left by an older build is dropped locally; the server is never contacted
    if (getAuthSession()) setAuthSession(null);
    set({ status: "anonymous", user: null });
  },
  login: async (email, password) => {
    const result = await api.login(email, password);
    set({ status: "authenticated", user: result.user });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("library:changed"));
    }
  },
  register: async (email, password, username, displayName) => {
    const result = await api.register(email, password, username, displayName);
    set({ status: "authenticated", user: result.user });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("library:changed"));
    }
  },
  updateProfile: async (patch) => {
    const updated = await api.updateProfile(patch);
    const current = getAuthSession();
    if (current) {
      setAuthSession({ ...current, user: { ...current.user, ...updated } });
    }
    set((prev) => ({
      user: prev.user ? { ...prev.user, ...updated } : updated,
    }));
    return updated;
  },
  logout: async () => {
    try {
      usePlayerStore.getState().dispatch({ type: "PAUSE_REQUESTED" });
      playerRuntime?.pause();
    } catch {}
    try {
      usePlayerStore.getState().setFullscreen(false);
    } catch {}
    try {
      window.linerElectron?.closeOverlay?.();
      window.linerElectron?.sendOverlayAction?.({ type: "closeOverlay" });
    } catch {}
    if (typeof window !== "undefined" && window.location.hash.includes("/player")) {
      window.location.hash = "#/";
    }
    await clearAuthSession();
    set({ status: "anonymous", user: null });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("library:changed"));
    }
  },
}));

export function getAuthErrorCode(error: unknown): string {
  if (!(error instanceof ApiError)) return "server_unavailable";
  if (error.status === 0) return "server_unavailable";
  // 5xx and cloudflare 52x: the server is down, not the user's input or connection
  if (error.status >= 500) return "server_error";
  if (error.code === "INVALID_CREDENTIALS") return "invalid_credentials";
  if (error.code === "EMAIL_ALREADY_USED") return "email_already_used";
  if (error.code === "USERNAME_TAKEN") return "username_taken";
  if (error.code === "INVALID_USERNAME") return "invalid_username";
  if (error.code === "INVALID_INPUT") return "invalid_input";
  return "unknown_error";
}

export function authErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Unable to reach the server.";
  if (error.code === "INVALID_CREDENTIALS")
    return "Email or password is incorrect.";
  if (error.code === "EMAIL_ALREADY_USED")
    return "This email is already in use.";
  if (error.code === "USERNAME_TAKEN")
    return "This username is already taken. Please choose another.";
  if (error.code === "INVALID_USERNAME")
    return "Username must be 3-30 lowercase characters (a-z, 0-9, _).";
  // unknown api errors stay generic, never surface raw bodies
  return "Something went wrong. Please try again.";
}
