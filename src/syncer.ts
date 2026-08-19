/**
 * Sync logic: consolidate skills into the common store and symlink them
 * into every non-sourceOnly harness directory.
 */

import {
  mkdir,
  symlink,
  rm,
  readdir,
  stat,
  readlink,
  copyFile,
  lstat,
} from "node:fs/promises";
import { join, resolve, dirname, relative } from "node:path";
import type { SkillSyncConfig } from "./config.js";
import { scanAll, scanStore, scanHarness } from "./scanner.js";

export interface SyncResult {
  consolidated: string[]; // skill names copied into the store
  linked: string[]; // skill names symlinked into harness dirs
  skipped: string[]; // skill names already correctly linked
  conflicts: ConflictReport[]; // duplicate skills with divergent content
  errors: string[];
}

export interface ConflictReport {
  name: string;
  paths: string[]; // all source paths where this skill was found
}

/**
 * Main sync operation.
 *
 * 1. Scan all harnesses.
 * 2. For skills not yet in the store, copy them in (first source wins,
 *    divergent copies reported as conflicts).
 * 3. For every harness that is not sourceOnly, replace real dirs/symlinks
 *    with symlinks pointing to the store.
 */
export async function sync(
  config: SkillSyncConfig,
  options: { dryRun?: boolean; force?: boolean } = {},
): Promise<SyncResult> {
  const result: SyncResult = {
    consolidated: [],
    linked: [],
    skipped: [],
    conflicts: [],
    errors: [],
  };

  const allSkills = await scanAll(config);
  const storeNames = await scanStore(config);

  // Ensure store exists
  if (!options.dryRun) {
    await mkdir(config.store, { recursive: true });
  }

  // Phase 1: Consolidate — copy real dirs into the store
  for (const [name, info] of allSkills) {
    if (storeNames.has(name)) continue;

    // Find a real (non-symlink) source to copy from
    const realSources: string[] = [];
    for (const [harness, path] of info.locations) {
      if (harness === "store") continue;
      if (!info.symlinkIn.has(harness)) {
        realSources.push(path);
      }
    }

    if (realSources.length === 0) continue;

    // Check for content divergence among sources
    if (realSources.length > 1) {
      const hashes = await Promise.all(
        realSources.map((p) => hashDir(p)),
      );
      const uniqueHashes = new Set(hashes);
      if (uniqueHashes.size > 1) {
        result.conflicts.push({ name, paths: realSources });
      }
    }

    const source = realSources[0]; // first harness wins
    const dest = join(config.store, name);

    if (options.dryRun) {
      result.consolidated.push(name);
    } else {
      try {
        await copyDir(source, dest);
        result.consolidated.push(name);
      } catch (err) {
        result.errors.push(
          `Failed to consolidate "${name}" from ${source}: ${err}`,
        );
      }
    }
  }

  // Phase 2: Link — create symlinks in each non-sourceOnly harness
  const storeEntries = options.dryRun
    ? new Set([...storeNames, ...result.consolidated])
    : await scanStore(config);

  for (const harness of config.harnesses) {
    if (harness.sourceOnly) continue;

    if (!options.dryRun) {
      await mkdir(harness.path, { recursive: true });
    }

    for (const name of storeEntries) {
      const storePath = join(config.store, name);
      const linkPath = join(harness.path, name);

      // Check if it's already a correct symlink
      const currentTarget = await readlinkSafe(linkPath);
      const resolvedStorePath = resolve(storePath);
      const resolvedCurrent = currentTarget
        ? resolve(join(linkPath, "..", currentTarget))
        : null;

      if (resolvedCurrent === resolvedStorePath) {
        result.skipped.push(`${harness.name}/${name}`);
        continue;
      }

      if (options.dryRun) {
        result.linked.push(`${harness.name}/${name}`);
        continue;
      }

      // Remove existing entry at linkPath
      const existing = await safeLstat(linkPath);
      if (existing) {
        const isLink = existing.isSymbolicLink();
        // Don't clobber a real directory unless force
        if (!isLink && !options.force) continue;
        await rm(linkPath, { recursive: true, force: true });
      }

      // Create relative symlink
      const relTarget = relative(dirname(linkPath), storePath);
      try {
        await symlink(relTarget, linkPath);
        result.linked.push(`${harness.name}/${name}`);
      } catch (err) {
        result.errors.push(
          `Failed to link "${name}" into ${harness.name}: ${err}`,
        );
      }
    }
  }

  return result;
}

// --- helpers ---

async function readlinkSafe(path: string): Promise<string | null> {
  try {
    return await readlink(path);
  } catch {
    return null;
  }
}

async function safeLstat(path: string) {
  try {
    return await lstat(path);
  } catch {
    return null;
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);
      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath);
      } else if (entry.isSymbolicLink()) {
        const target = await readlink(srcPath);
        await symlink(target, destPath);
      } else {
        await copyFile(srcPath, destPath);
      }
    }),
  );
}

async function hashDir(dirPath: string): Promise<string> {
  // Simple content hash: collect file names + sizes
  const files: string[] = [];
  await walk(dirPath, async (path, st) => {
    files.push(`${relative(dirPath, path)}:${st.size}`);
  });
  files.sort();
  let hash = 0;
  const str = files.join("|");
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(16);
}

async function walk(
  dir: string,
  cb: (path: string, st: { size: number }) => Promise<void>,
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.name.startsWith(".")) return;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path, cb);
      } else if (entry.isFile()) {
        const s = await stat(path);
        await cb(path, s);
      }
    }),
  );
}