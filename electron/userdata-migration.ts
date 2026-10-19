import fs from "node:fs";
import path from "node:path";

// The app used to be called Liner and kept its data in <appData>/@liner/client.
// After the rename the data folder is <appData>/Soniq, so on the first launch
// the old library, history, settings and wallpaper are copied over. Copying
// (not moving) leaves the old folder intact if anything goes wrong.

export const MIGRATION_MARKER = ".migrated-from-liner";

// Chromium caches, lock files and old OTA bundles: rebuilt on demand
const SKIPPED_ENTRIES = new Set([
  "Cache",
  "Code Cache",
  "GPUCache",
  "DawnCache",
  "DawnGraphiteCache",
  "DawnWebGPUCache",
  "GrShaderCache",
  "ShaderCache",
  "Crashpad",
  "bundles",
  "active_bundle.json",
  "SingletonLock",
  "SingletonCookie",
  "SingletonSocket",
  "lockfile",
]);

// leveldb lock files are recreated and may be held by a running old app
const SKIPPED_FILES = new Set(["LOCK"]);

export type MigrationResult = "migrated" | "already-done" | "nothing-to-migrate" | "has-own-data";

export function legacyUserDataPath(appDataPath: string): string {
  return path.join(appDataPath, "@liner", "client");
}

function hasBrowserData(dir: string): boolean {
  return fs.existsSync(path.join(dir, "Local Storage")) || fs.existsSync(path.join(dir, "IndexedDB"));
}

export function migrateLegacyUserData(from: string, to: string): MigrationResult {
  const marker = path.join(to, MIGRATION_MARKER);
  if (fs.existsSync(marker)) return "already-done";
  fs.mkdirSync(to, { recursive: true });

  let result: MigrationResult;
  if (hasBrowserData(to)) {
    // never overwrite data the new app already has
    result = "has-own-data";
  } else if (!fs.existsSync(from)) {
    result = "nothing-to-migrate";
  } else {
    for (const entry of fs.readdirSync(from)) {
      if (SKIPPED_ENTRIES.has(entry)) continue;
      try {
        fs.cpSync(path.join(from, entry), path.join(to, entry), {
          recursive: true,
          force: false,
          errorOnExist: false,
          filter: (source) => !SKIPPED_FILES.has(path.basename(source)),
        });
      } catch (error) {
        // a single unreadable entry shouldn't block the rest of the migration
        console.warn(`[userdata] could not copy ${entry}:`, (error as Error)?.message ?? error);
      }
    }
    result = "migrated";
  }

  fs.writeFileSync(marker, `${result} ${new Date().toISOString()}\n`);
  return result;
}
