import { afterEach, describe, expect, it } from "vitest";
import { getCloudServer } from "./account";

const SERVER_KEY = "soniq_cloud_server_v1";

describe("cloud server address", () => {
  afterEach(() => localStorage.removeItem(SERVER_KEY));

  it("uses the current default when nothing is saved", () => {
    expect(getCloudServer()).toBe("https://129.153.211.65");
  });

  it("moves a saved retired default to the current server", () => {
    localStorage.setItem(SERVER_KEY, "https://129.146.222.51");
    expect(getCloudServer()).toBe("https://129.153.211.65");
  });

  it("keeps a custom server", () => {
    localStorage.setItem(SERVER_KEY, "https://sync.example.com");
    expect(getCloudServer()).toBe("https://sync.example.com");
  });
});
