/**
 * Scanning logic: discover skills in harness directories and in the common store.
 */

import { readdir, lstat, readlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { HarnessDir, SkillSyncConfig } from "./config.js";

export interface SkillInfo {
  name: string;
  /** Map of harness-name → absolute path where this skill was found */
  locations: Map<string, string>;
  /** Map of harness-name → true if the entry is a symlink */
  symlinkIn: Set<string>;
  /** True if the skill has a SKILL.md (valid skill, not a random dir) */
  hasSkillMd: boolean;
}

/**
 * Scan all configured harness directories and the store.
 * Returns a map keyed by skill name.
 */
export async function scanAll(
  config: SkillSyncConfig,
): Promise<Map<string, SkillInfo>> {
  const skills = new Map<string, SkillInfo>();

  const dirs: { harness: string; path: string }[] = [
    { harness: "store", path: config.store },
    ...config.harnesses.map((h) => ({ harness: h.name, path: h.path })),
  ];

  await Promise.all(
    dirs.map(async (dir) => {
      const entries = await safeReaddir(dir.path);
      await Promise.all(
        entries.map(async (entry) => {
          if (!entry.isDirectory() && !entry.isSymbolicLink()) return;
          if (entry.name.startsWith(".")) return;

          const fullPath = join(dir.path, entry.name);
          await registerSkill(skills, entry.name, fullPath, dir.harness);
        }),
      );
    }),
  );

  return skills;
}

async function registerSkill(
  skills: Map<string, SkillInfo>,
  name: string,
  path: string,
  harness: string,
): Promise<void> {
  const lstatResult = await safeLstat(path);
  const isSymlink = lstatResult?.isSymbolicLink() ?? false;

  // Resolve symlink target for SKILL.md check
  let realPath = path;
  if (isSymlink) {
    const link = await readlinkSafe(path);
    if (link) realPath = resolve(join(path, "..", link));
  }

  const hasSkillMd = await hasSkillMdFile(realPath);

  let skill = skills.get(name);
  if (!skill) {
    skill = {
      name,
      locations: new Map(),
      symlinkIn: new Set(),
      hasSkillMd,
    };
    skills.set(name, skill);
  }

  skill.locations.set(harness, path);
  if (isSymlink) skill.symlinkIn.add(harness);
  if (hasSkillMd) skill.hasSkillMd = true;
}

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

async function hasSkillMdFile(dirPath: string): Promise<boolean> {
  try {
    const file = Bun.file(join(dirPath, "SKILL.md"));
    return await file.exists();
  } catch {
    return false;
  }
}

interface DirEntry {
  name: string;
  isDirectory: () => boolean;
  isSymbolicLink: () => boolean;
}

async function safeReaddir(path: string): Promise<DirEntry[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries as unknown as DirEntry[];
  } catch {
    return [];
  }
}

/**
 * Get all skill names that exist in the store.
 */
export async function scanStore(
  config: SkillSyncConfig,
): Promise<Set<string>> {
  const names = new Set<string>();
  try {
    const entries = await readdir(config.store, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (e.isDirectory() || e.isSymbolicLink()) names.add(e.name);
    }
  } catch {
    // store doesn't exist yet
  }
  return names;
}

/**
 * Get all skill names in a specific harness directory.
 */
export async function scanHarness(
  harness: HarnessDir,
): Promise<Set<string>> {
  const names = new Set<string>();
  try {
    const entries = await readdir(harness.path, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (e.isDirectory() || e.isSymbolicLink()) names.add(e.name);
    }
  } catch {
    // harness dir doesn't exist
  }
  return names;
}