/**
 * Configuration types and defaults for skill-sync.
 */

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { SkillSyncConfig, HarnessDir } from "./types.js";

export type { SkillSyncConfig, HarnessDir };

const HOME = homedir();

export const DEFAULT_CONFIG: SkillSyncConfig = {
  store: join(HOME, ".local", "share", "skill-sync", "skills"),
  harnesses: [
    { name: "agents", path: join(HOME, ".agents", "skills") },
    { name: "omp-managed", path: join(HOME, ".omp", "agent", "managed-skills") },
    { name: "gemini", path: join(HOME, ".gemini", "config", "skills") },
    { name: "claude", path: join(HOME, ".claude", "skills") },
  ],
};

/**
 * Load config from a JSON file, falling back to defaults.
 * Missing file → defaults. File present → merged over defaults.
 */
export async function loadConfig(configPath?: string): Promise<SkillSyncConfig> {
  const path = configPath
    ? resolve(configPath)
    : join(HOME, ".config", "skill-sync", "config.json");

  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return structuredClone(DEFAULT_CONFIG);
    const data = await file.json() as Partial<SkillSyncConfig>;
    return mergeConfig(DEFAULT_CONFIG, data);
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

function mergeConfig(
  base: SkillSyncConfig,
  override: Partial<SkillSyncConfig>,
): SkillSyncConfig {
  return {
    store: override.store ?? base.store,
    harnesses:
      override.harnesses?.map((h) => ({
        name: h.name,
        path: h.path,
        sourceOnly: h.sourceOnly,
      })) ?? base.harnesses,
  };
}