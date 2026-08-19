# Repository Guidelines

## Project Overview

skill-sync is a standalone CLI utility that consolidates agent skills scattered across multiple harness directories (`~/.agents/skills`, `~/.omp/agent/managed-skills`, `~/.gemini/config/skills`, `~/.claude/skills`, etc.) into a single common store, then symlinks them back into every harness so all AI agent tools share the same skill set.

It detects duplicate skills across harnesses, reports content conflicts, and manages symlink lifecycle (create, verify, clean broken links). Written in TypeScript, runs on Bun.

## Architecture & Data Flow

```
cli.ts (entry, bin: ./dist/cli.js)
  ├── parseArgs → sync | status | clean | list | init
  ├── loadConfig (config.ts) → merges config file > defaults
  └── dispatch to command handler
      ├── sync   → syncer.ts:sync()     → scan → consolidate → link
      ├── status → status.ts:status()   → scan → report per-skill state
      ├── clean  → clean.ts:clean()     → scan harnesses → remove broken symlinks
      ├── list   → scanner.ts:scanAll() → report all skills + locations
      └── init   → write sample config
```

**Sync flow** (`src/syncer.ts`):
1. Scan all harness directories + store via `scanner.ts:scanAll()`
2. For skills not yet in store: copy real dirs into store (first source wins; divergent content reported as conflicts)
3. For each non-sourceOnly harness: create relative symlinks pointing to store (skip if already correct; `--force` replaces real dirs)

**Scanner** (`src/scanner.ts`): walks all configured directories in parallel, records skill name → location map, tracks which entries are symlinks vs real dirs, checks for `SKILL.md` presence.

## Key Directories

```
src/
  types.ts       # Shared interfaces (SkillSyncConfig, HarnessDir)
  config.ts      # Config loading + defaults (4 harnesses auto-detected)
  scanner.ts     # Scans all dirs, detects symlinks vs real dirs
  syncer.ts      # Consolidation + symlink creation + conflict detection
  status.ts      # Reports sync state per skill (synced/partial/orphaned/store-only)
  clean.ts       # Removes broken/obsolete symlinks
  cli.ts         # Entry point with 5 commands
  index.ts       # Public API barrel
```

## Development Commands

```bash
# Install deps
bun install

# Run in dev mode
bun run src/cli.ts --help
bun run src/cli.ts list
bun run src/cli.ts sync --dry-run

# Build (produces dist/cli.js — matches package.json bin)
bun run build

# Build standalone binary
bun run build:bin

# Type check
bun run typecheck
```

## Conventions

- **Runtime**: Bun (not npm). Use `bun install`, `bun run`, `bun build`.
- **No npm publish**: This is a CLI tool, not an npm package. `npmPublish: false` in `.releaserc.json`.
- **Releases**: semantic-release on push to `main`. Conventional commits (`feat:`, `fix:`, `chore:`, etc.).
- **Config**: `~/.config/skill-sync/config.json` overrides defaults. See `skill-sync init`.
- **Symlink strategy**: Relative symlinks from harness dirs to the common store (`~/.local/share/skill-sync/skills`).
- **Source-only harnesses**: Set `sourceOnly: true` in config to prevent symlink creation in a harness (still scanned as a source).
- **Force**: `sync --force` replaces real directories with symlinks. Without `--force`, real dirs are preserved (only cross-harness symlinks are created).

## Pull Request Process

- PRs target `main` directly (no `develop` branch).
- Only vouched contributors or collaborators can open PRs (see `.github/VOUCHED.td`).
- Use conventional commit format for all commits.
- Ensure `bun run typecheck` and `bun run build` pass before requesting review.