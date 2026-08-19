/**
 * Shared types for skill-sync.
 */

export interface HarnessDir {
  /** Display name, e.g. "agents", "omp-managed", "gemini" */
  name: string;
  /** Absolute path to the directory that contains skill subdirectories */
  path: string;
  /** If true, skills here are read-only sources (never written to). If absent, symlinks will be created here. */
  sourceOnly?: boolean;
}

export interface SkillSyncConfig {
  /** The common store where canonical skill directories live */
  store: string;
  /** Harness directories to scan and link */
  harnesses: HarnessDir[];
}