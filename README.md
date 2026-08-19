# @chronova/skill-sync

[![Tests](https://github.com/nx-solutions-ug/skill-sync/actions/workflows/test.yml/badge.svg)](https://github.com/nx-solutions-ug/skill-sync/actions/workflows/test.yml)
[![Release](https://github.com/nx-solutions-ug/skill-sync/actions/workflows/release.yml/badge.svg)](https://github.com/nx-solutions-ug/skill-sync/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Sync agent skills across harness directories via symlinks to a common store

skill-sync consolidates agent skills scattered across multiple harness directories (`~/.agents/skills`, `~/.omp/agent/managed-skills`, `~/.gemini/config/skills`, `~/.claude/skills`, etc.) into a single common store, then symlinks them back into every harness so all AI agent tools share the same skill set. It detects duplicates, reports content conflicts, and manages symlink lifecycle.

## Features

- **One Store, Many Harnesses** — canonical skill directories live in `~/.local/share/skill-sync/skills`; every harness gets relative symlinks back to the store
- **Duplicate Detection** — finds the same skill across multiple harnesses and consolidates; divergent content is reported as conflicts
- **Symlink Management** — creates relative symlinks, verifies they point to the store, and cleans broken or obsolete links
- **Dry Run** — preview any operation before making changes
- **Configurable** — JSON config at `~/.config/skill-sync/config.json` with sensible defaults
- **Source-Only Harnesses** — mark harnesses as `sourceOnly: true` to scan them without writing symlinks (useful for read-only skill providers like Gemini's bundled skills)
- **Zero Runtime Dependencies** — uses only Node builtins + Bun APIs

## Installation

### From Source

```bash
git clone https://github.com/nx-solutions-ug/skill-sync.git
cd skill-sync
bun install
bun run build
```

The binary is at `dist/cli.js`. Install globally:

```bash
bun link
# or copy manually:
cp dist/cli.js ~/.local/bin/skill-sync
```

### Compiled Binary

```bash
bun run build:bin
# Standalone binary at dist/skill-sync
cp dist/skill-sync ~/.local/bin/skill-sync
```

## Usage

```bash
skill-sync <command> [options]
```

### Commands

| Command | Description |
|---|---|
| `sync` | Consolidate skills into the store and symlink into all harnesses |
| `status` | Show sync state of all skills (synced / partial / orphaned / store-only) |
| `clean` | Remove broken or obsolete symlinks from harness directories |
| `list` | List all skills and their locations |
| `init` | Write a sample config file to `~/.config/skill-sync/config.json` |

### Options

| Option | Description |
|---|---|
| `--dry-run` | Preview without making changes |
| `--force` | Overwrite real directories with symlinks (sync) |
| `--all` | Remove all store-pointing symlinks (clean) |
| `--config <path>` | Use a custom config file |
| `--help` | Show help |

### Examples

```bash
# Preview what sync would do
skill-sync sync --dry-run

# Consolidate and link everything
skill-sync sync

# Replace original real directories with symlinks too
skill-sync sync --force

# Check status
skill-sync status

# List all skills and where they live
skill-sync list

# Remove broken symlinks
skill-sync clean

# Remove all symlinks pointing to the store (reset)
skill-sync clean --all

# Generate a config file
skill-sync init
```

## Configuration

The config file lives at `~/.config/skill-sync/config.json`. Generate one with `skill-sync init`:

```json
{
  "store": "~/.local/share/skill-sync/skills",
  "harnesses": [
    { "name": "agents", "path": "~/.agents/skills" },
    { "name": "omp-managed", "path": "~/.omp/agent/managed-skills" },
    { "name": "gemini", "path": "~/.gemini/config/skills" },
    { "name": "claude", "path": "~/.claude/skills" }
  ]
}
```

Set `"sourceOnly": true` on a harness to scan it as a source but never create symlinks in it (e.g. for harness-managed skill bundles like Gemini's Data Cloud skills).

## How It Works

1. **Scan** — all configured harness directories and the store are scanned in parallel
2. **Consolidate** — real skill directories are copied into the store (first source wins; divergent content reported as conflicts)
3. **Link** — relative symlinks are created in every non-`sourceOnly` harness pointing to the store
4. **Clean** — broken or stale symlinks are removed from harness directories

The store is the single source of truth. Harnesses contain only symlinks. Run `skill-sync sync` after adding or updating skills in any harness to propagate changes everywhere.

## Development

```bash
bun install          # Install dependencies
bun run src/cli.ts   # Run in dev mode
bun run build        # Build to dist/cli.js
bun run build:bin    # Build standalone binary
bun run typecheck    # TypeScript type check
```

Requires [Bun](https://bun.sh/) 1.3+.

## Contributing

PRs target `main` directly. Only vouched contributors or collaborators can open PRs (see [`.github/VOUCHED.td`](.github/VOUCHED.td)). Use conventional commit format (`feat:`, `fix:`, `chore:`, etc.) — semantic-release handles versioning and changelog automatically.

Ensure `bun run typecheck` and `bun run build` pass before requesting review.

See [`AGENTS.md`](AGENTS.md) for detailed codebase guidance.

## License

MIT — Copyright (c) 2026 Nx Solutions UG (haftungsbeschränkt)