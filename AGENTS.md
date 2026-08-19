# Repository Guidelines

## Project Overview

`@chronova/skill-sync` is a standalone Bun-native CLI that consolidates agent skills scattered across multiple harness directories (`~/.agents/skills`, `~/.omp/agent/managed-skills`, `~/.gemini/config/skills`, `~/.claude/skills`, etc.) into a single common store (`~/.local/share/skill-sync/skills`), then symlinks them back into every harness so all AI agent tools share the same skill set. It detects duplicates, reports content conflicts, and manages symlink lifecycle (create, verify, clean broken links).

## Architecture & Data Flow

```
cli.ts (entry, bin: ./dist/cli.js, shebang #!/usr/bin/env bun)
  ├── parseArgs → sync | status | clean | list | init
  ├── loadConfig (config.ts) → merges JSON file > defaults
  └── dispatch to command handler
      ├── sync   → syncer.ts:sync()     → scanAll → consolidate to store → symlink harnesses
      ├── status → status.ts:status()   → scanAll + scanStore → classify per-skill state
      ├── clean  → clean.ts:clean()     → scan harnesses → remove broken/obsolete symlinks
      ├── list   → scanner.ts:scanAll() → report all skills + locations
      └── init   → write sample config to ~/.config/skill-sync/config.json
```

**Data flow**: `scanner.ts` is the shared data layer — `scanAll()` builds a `Map<name, SkillInfo>` across store + all harnesses in parallel (`Promise.all`). `syncer.ts` consumes the scan in two phases: (1) consolidate real directories into the store (first source wins, divergent content reported as conflicts via `hashDir`), then (2) create relative symlinks from each non-`sourceOnly` harness to the store. `status.ts` and `clean.ts` both consume the same scan to classify state and prune broken symlinks respectively.

**Error model**: Errors are collected into `result.errors` arrays rather than thrown. The CLI surfaces them and exits 1 if any errors occurred.

**Storage model**: Canonical real skill directories live in the store. Harnesses hold only relative symlinks pointing back to the store. `sourceOnly` harnesses are read-only sources (scanned but never written to).

## Key Directories

```
src/
  types.ts       # Shared interfaces (SkillSyncConfig, HarnessDir)
  config.ts      # Config loading via Bun.file + defaults (4 harnesses auto-detected)
  scanner.ts     # Parallel scan of all dirs; detects symlinks vs real dirs; checks SKILL.md
  syncer.ts      # Consolidation (copyDir) + symlink creation + conflict detection (hashDir)
  status.ts      # Per-skill state classification (synced/partial/orphaned/store-only)
  clean.ts       # Broken/obsolete symlink removal
  cli.ts         # Entry point: arg parsing, 5 commands, ANSI-colored output
  index.ts       # Public API barrel (re-exports all modules + types)
.omp/
  agent/config.yml    # OMP model roles (minimax-m3 default, kimi-k2.6 plan, qwen3.5 vision)
  commands/           # OMP command templates (triage-issue, label-pr, review-pr, fix-issue)
  rules/              # Enforced rules (gh-label-idempotent, tool-paths-must-be-arrays)
  stream-log.py       # Formats OMP JSONL output into human-readable CI log lines
.github/workflows/    # 8 CI workflows (see CI/CD section)
```

## Development Commands

```bash
# Install dependencies
bun install

# Run in dev mode (no build needed)
bun run src/cli.ts --help
bun run src/cli.ts list
bun run src/cli.ts sync --dry-run

# Build (produces dist/cli.js — matches package.json bin)
bun run build

# Build standalone compiled binary
bun run build:bin

# Type check
bun run typecheck
```

## Code Conventions & Common Patterns

- **Runtime**: Bun exclusively. Source uses `Bun.file()` for config loading and `SKILL.md` existence checks. Build target is `--target bun`, shebang `#!/usr/bin/env bun`.
- **Imports**: `node:` protocol for all Node builtins (`node:fs/promises`, `node:os`, `node:path`, `node:util`). Type-only imports use `import type` syntax. No third-party runtime dependencies — only Node builtins + Bun APIs.
- **Async**: Parallel I/O via `Promise.all` for directory scanning and file operations. All filesystem calls wrapped in try/catch guards (`safeReaddir`, `safeLstat`, `readlinkSafe`) that return empty/null on error instead of throwing.
- **Error handling**: Errors collected into `result.errors[]` arrays, never thrown to caller. CLI checks `result.errors.length > 0` and exits 1. Individual file/link operations are isolated — one failure doesn't abort the batch.
- **Naming**: Files: lowercase module names. Functions: camelCase (`scanAll`, `copyDir`, `readlinkSafe`). Types: PascalCase interfaces (`SkillSyncConfig`, `HarnessDir`, `SyncResult`). Constants: UPPER_SNAKE (`DEFAULT_CONFIG`, `COLORS`).
- **Config pattern**: `loadConfig(path?)` loads JSON from `~/.config/skill-sync/config.json` via `Bun.file`, merges over `structuredClone(DEFAULT_CONFIG)` via `mergeConfig`. Missing file or parse error → defaults silently.
- **Symlink strategy**: Relative symlinks (via `relative(dirname(linkPath), storePath)`) so the links work regardless of home directory mount path. `sync --force` replaces real directories with symlinks; without `--force`, real dirs are preserved.
- **Barrel exports**: `src/index.ts` re-exports all public modules + types. `cli.ts` imports modules directly (doesn't use the barrel).
- **No lint/format config**: No ESLint, Biome, or Prettier configured. TypeScript strict mode (`tsc --noEmit`) is the only static analysis gate.
- **Conventional commits**: Required for semantic-release to trigger (`feat:`, `fix:`, `chore:`, `perf:`, `BREAKING CHANGE`).

## Important Files

| File | Purpose |
|---|---|
| `src/cli.ts` | Entry point — arg parsing (`node:util parseArgs`), 5 command handlers, ANSI color output |
| `src/config.ts` | `loadConfig()` + `DEFAULT_CONFIG` (store path + 4 default harnesses) |
| `src/scanner.ts` | `scanAll()` — parallel directory scan, symlink detection, `SKILL.md` validation |
| `src/syncer.ts` | `sync()` — 2-phase consolidate + link; `hashDir()` for conflict detection |
| `src/status.ts` | `status()` — classifies each skill as synced/partial/orphaned/store-only |
| `src/clean.ts` | `clean()` — removes broken or `--all` store-pointing symlinks |
| `src/types.ts` | `HarnessDir`, `SkillSyncConfig` interface definitions |
| `package.json` | Name `@chronova/skill-sync`, bin `./dist/cli.js`, build/typecheck scripts |
| `.releaserc.json` | semantic-release config: `npmPublish: false`, changelog + git + github plugins |
| `.omp/` | OMP agent config, command templates, enforced rules, stream-log formatter |

## Runtime/Tooling Preferences

- **Runtime**: Bun (not Node). `Bun.file()` is used in source; build target is `--target bun`.
- **Package manager**: Bun (`bun.lock`, no `package-lock.json`).
- **TypeScript**: strict mode, ES2022 target, ESNext modules, bundler resolution, `bun-types`.
- **No npm publish**: `npmPublish: false` in `.releaserc.json`. This is a CLI tool, not an npm package.
- **No lint**: No ESLint, Biome, or Prettier. `tsc --noEmit` is the only gate.
- **No Docker**: No Dockerfile, docker-compose, or container config.
- **Config location**: `~/.config/skill-sync/config.json` (user-configurable). Run `skill-sync init` to generate.

## Testing & QA

**No test framework exists.** There are no test files, no test directories, no test script, and no test framework dependency. CI verification is limited to:

1. **TypeScript typecheck** — `bunx tsc --noEmit` (run in `test.yml` and `release.yml`)
2. **Build verification** — `bun run build` (run in `test.yml` and `release.yml`)
3. **OMP agent code review** — AI-driven PR review via `omp-ci.yml` (not automated tests)

If adding tests in the future, `bun:test` (Bun's built-in runner) is the lowest-friction path since Bun is already the runtime and `@types/bun` is installed.

## CI/CD

| Workflow | Trigger | Purpose |
|---|---|---|
| `test.yml` | push/PR to `main`, `feat/*`, `fix/*` | Typecheck + build (no tests) |
| `release.yml` | push to `main` | semantic-release + full-changelog post-release step |
| `omp-ci.yml` | issues, PRs, reviews | AI triage/label/review via OMP agent (minimax-m3) |
| `omp.yml` | `/omp` issue comments | OMP agent slash-command handler |
| `omp-fix-issue.yml` | `repository_dispatch` | AI fix-issue workflow for triaged issues |
| `auto-manage.yml` | issues/PRs opened | Auto-assign to `niklasschaeffer`, tag `needs-triage` |
| `vouch-manage.yml` | discussion comments | Vouch gate via `!vouch`/`!denounce` |
| `vouch-pr.yml` | PR opened/reopened | Vouch check — auto-close non-vouched PRs |

**Secrets** (org-level, automatically available): `APP_CLIENT_ID`, `APP_PRIVATE_KEY`, `OLLAMA_API_KEY`.

**Vouch gate**: Only vouched contributors (`.github/VOUCHED.td`) or collaborators can open PRs. Bots are auto-allowed.

**Pull requests**: Target `main` directly (no `develop` branch). Use conventional commit format. Ensure `bun run typecheck` and `bun run build` pass before requesting review.