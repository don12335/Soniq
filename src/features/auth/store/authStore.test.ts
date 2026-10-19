import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// the player feature pulls lottie/canvas ui that jsdom cannot load; initialize() never touches it
vi.mock("@/features/player", () => ({ usePlayerStore: { getState: () => ({}) }, playerRuntime: null }));

import { useAuthStore } from "./authStore";
import { getAuthSession, setAuthSession, type AuthTokens } from "@/shared/api";

const stored = {
  accessToken: "access",
  refreshToken: "refresh-1",
  user: { id: "u1", username: "leo" },
} as unknown as AuthTokens;

// this build has no accounts: a session left by an older build is dropped
// locally and the app stays anonymous, without ever calling the server
describe("authStore.initialize without accounts", () => {
  beforeEach(() => {
    setAuthSession(stored);
    useAuthStore.setState({ status: "initializing", user: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setAuthSession(null);
  });

  it("drops a leftover session locally and stays anonymous", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState()).toMatchObject({ status: "anonymous", user: null });
    expect(getAuthSession()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("starts anonymous", () => {
    expect(useAuthStore.getInitialState().status).toBe("anonymous");
  });
});
