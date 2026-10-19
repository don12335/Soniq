// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { legacyUserDataPath, migrateLegacyUserData, MIGRATION_MARKER } from "./userdata-migration";

let root: string;
let from: string;
let to: string;

const write = (file: string, content = "x") => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

describe("migrateLegacyUserData", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "soniq-migration-"));
    from = legacyUserDataPath(root);
    to = path.join(root, "Soniq");
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("copies the old data and skips caches and lock files", () => {
    write(path.join(from, "Local Storage", "leveldb", "000003.log"), "library");
    write(path.join(from, "Local Storage", "leveldb", "LOCK"));
    write(path.join(from, "IndexedDB", "file__0.indexeddb.blob", "1"), "wallpaper");
    write(path.join(from, "Cache", "data_0"));
    write(path.join(from, "bundles", "bundle-0.1.40", "dist", "index.html"));

    expect(migrateLegacyUserData(from, to)).toBe("migrated");
    expect(fs.readFileSync(path.join(to, "Local Storage", "leveldb", "000003.log"), "utf8")).toBe("library");
    expect(fs.readFileSync(path.join(to, "IndexedDB", "file__0.indexeddb.blob", "1"), "utf8")).toBe("wallpaper");
    expect(fs.existsSync(path.join(to, "Local Storage", "leveldb", "LOCK"))).toBe(false);
    expect(fs.existsSync(path.join(to, "Cache"))).toBe(false);
    expect(fs.existsSync(path.join(to, "bundles"))).toBe(false);
    // the old folder is left untouched
    expect(fs.existsSync(path.join(from, "Local Storage", "leveldb", "000003.log"))).toBe(true);
  });

  it("runs only once", () => {
    write(path.join(from, "Local Storage", "a"));
    expect(migrateLegacyUserData(from, to)).toBe("migrated");
    expect(fs.existsSync(path.join(to, MIGRATION_MARKER))).toBe(true);
    write(path.join(from, "Local Storage", "b"));
    expect(migrateLegacyUserData(from, to)).toBe("already-done");
    expect(fs.existsSync(path.join(to, "Local Storage", "b"))).toBe(false);
  });

  it("never overwrites data the new app already has", () => {
    write(path.join(from, "Local Storage", "a"), "old");
    write(path.join(to, "Local Storage", "a"), "new");
    expect(migrateLegacyUserData(from, to)).toBe("has-own-data");
    expect(fs.readFileSync(path.join(to, "Local Storage", "a"), "utf8")).toBe("new");
  });

  it("handles a fresh install without old data", () => {
    expect(migrateLegacyUserData(from, to)).toBe("nothing-to-migrate");
    expect(fs.existsSync(path.join(to, MIGRATION_MARKER))).toBe(true);
  });
});
