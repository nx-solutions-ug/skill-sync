/**
 * Status reporting: show what's in sync, what's missing, what's broken.
 */

import { readlink, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { SkillSyncConfig } from "./config.js";
import { scanAll, scanStore } from "./scanner.js";

export interface HarnessState {
  name: string;
  present: boolean;
  linked: boolean;
  broken: boolean;
}

export interface StatusEntry {
  name: string;
  /** "synced" | "partial" | "orphaned" | "store-only" */
  state: "synced" | "partial" | "orphaned" | "store-only";
  inStore: boolean;
  harnesses: HarnessState[];
}

export async function status(config: SkillSyncConfig): Promise<StatusEntry[]> {
  const allSkills = await scanAll(config);
  const storeNames = await scanStore(config);

  const entries: StatusEntry[] = [];

  for (const [name, info] of allSkills) {
    const inStore = storeNames.has(name) || info.locations.has("store");

    const harnesses: HarnessState[] = [];
    for (const h of config.harnesses) {
      if (h.sourceOnly) continue;
      const linkPath = join(h.path, name);
      const present = info.locations.has(h.name);
      if (!present) {
        harnesses.push({ name: h.name, present: false, linked: false, broken: false });
        continue;
      }
      harnesses.push(await checkLinkAsync(linkPath, config.store, h.name));
    }

    const linkedCount = harnesses.filter((hs) => hs.linked).length;
    const totalHarnesses = harnesses.length;

    let state: StatusEntry["state"];
    if (inStore && linkedCount === totalHarnesses) {
      state = "synced";
    } else if (inStore && linkedCount > 0 && linkedCount < totalHarnesses) {
      state = "partial";
    } else if (inStore && linkedCount === 0) {
      state = "store-only";
    } else {
      state = "orphaned";
    }

    entries.push({ name, state, inStore, harnesses });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

async function checkLinkAsync(
  linkPath: string,
  store: string,
  harnessName: string,
): Promise<HarnessState> {
  let target: string | null = null;
  try {
    target = await readlink(linkPath);
  } catch {
    // not a symlink — real directory
  }

  if (target === null) {
    return { name: harnessName, present: true, linked: false, broken: false };
  }

  const resolved = resolve(join(linkPath, "..", target));
  const pointsToStore = resolved.startsWith(store);

  let broken = false;
  try {
    await stat(linkPath); // follows symlink
  } catch {
    broken = true;
  }

  return {
    name: harnessName,
    present: true,
    linked: pointsToStore && !broken,
    broken,
  };
}