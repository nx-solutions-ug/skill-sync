/**
 * Clean logic: remove broken/obsolete symlinks from harness directories.
 */

import { readdir, readlink, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { SkillSyncConfig } from "./config.js";
import { scanStore } from "./scanner.js";

export interface CleanResult {
  removed: string[]; // "harness/skillname" entries removed
  errors: string[];
}

/**
 * Remove symlinks in harness dirs that are:
 * - broken (target doesn't exist)
 * - pointing outside the store (stale)
 * Optionally remove all store-pointing symlinks (--all).
 */
export async function clean(
  config: SkillSyncConfig,
  options: { dryRun?: boolean; all?: boolean } = {},
): Promise<CleanResult> {
  const result: CleanResult = { removed: [], errors: [] };
  const storeNames = await scanStore(config);

  for (const harness of config.harnesses) {
    if (harness.sourceOnly) continue;

    let entries;
    try {
      entries = await readdir(harness.path, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (!entry.isSymbolicLink()) continue;

      const linkPath = join(harness.path, entry.name);
      const target = await readlinkSafe(linkPath);
      if (target === null) continue;

      const resolvedTarget = resolve(join(linkPath, "..", target));

      // Check if broken
      let targetExists = false;
      try {
        await stat(linkPath); // follows symlink
        targetExists = true;
      } catch {
        targetExists = false;
      }

      const pointsToStore = resolvedTarget.startsWith(config.store);

      const shouldRemove = options.all
        ? pointsToStore || !targetExists
        : !targetExists || (pointsToStore && !storeNames.has(entry.name));

      if (shouldRemove) {
        if (!options.dryRun) {
          try {
            await rm(linkPath, { force: true });
            result.removed.push(`${harness.name}/${entry.name}`);
          } catch (err) {
            result.errors.push(
              `Failed to remove ${harness.name}/${entry.name}: ${err}`,
            );
          }
        } else {
          result.removed.push(`${harness.name}/${entry.name} (dry-run)`);
        }
      }
    }
  }

  return result;
}

async function readlinkSafe(path: string): Promise<string | null> {
  try {
    return await readlink(path);
  } catch {
    return null;
  }
}