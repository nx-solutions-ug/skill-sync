/**
 * Public API barrel for skill-sync.
 */

export { loadConfig, DEFAULT_CONFIG } from "./config.js";
export type { SkillSyncConfig, HarnessDir } from "./config.js";
export { scanAll, scanStore, scanHarness } from "./scanner.js";
export type { SkillInfo } from "./scanner.js";
export { sync } from "./syncer.js";
export type { SyncResult, ConflictReport } from "./syncer.js";
export { status } from "./status.js";
export type { StatusEntry, HarnessState } from "./status.js";
export { clean } from "./clean.js";
export type { CleanResult } from "./clean.js";