import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import fullData from "react-apple-emojis/src/data.json";
import { APPLE_EMOJI_DATA } from "./AppleEmojiProvider";

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
}

describe("APPLE_EMOJI_DATA", () => {
  it("contains every emoji rendered in the app", () => {
    const srcDir = path.resolve(__dirname, "../..");
    const used = new Set<string>();
    for (const file of sourceFiles(srcDir)) {
      for (const match of fs.readFileSync(file, "utf8").matchAll(/<Emoji\s+name="([^"]+)"/g)) {
        used.add(match[1]);
      }
    }
    expect(used.size).toBeGreaterThan(0);
    for (const name of used) {
      expect(APPLE_EMOJI_DATA.emojis[name], name).toBeDefined();
    }
  });

  it("matches the package data", () => {
    expect(APPLE_EMOJI_DATA.baseUrl).toBe(fullData.baseUrl);
    const emojis = fullData.emojis as Record<string, string>;
    for (const [name, suffix] of Object.entries(APPLE_EMOJI_DATA.emojis)) {
      expect(suffix).toBe(emojis[name]);
    }
  });
});
