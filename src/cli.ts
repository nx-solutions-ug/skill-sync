#!/usr/bin/env node
/**
 * skill-sync — sync agent skills across harness directories via symlinks.
 *
 * Usage:
 *   skill-sync sync [--dry-run] [--force] [--config <path>]
 *   skill-sync status [--config <path>]
 *   skill-sync clean [--dry-run] [--all] [--config <path>]
 *   skill-sync list [--config <path>]
 *   skill-sync init [--config <path>]
 */

import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "./config.js";
import type { SkillSyncConfig } from "./config.js";
import { sync } from "./syncer.js";
import { status } from "./status.js";
import type { StatusEntry } from "./status.js";
import { clean } from "./clean.js";
import { scanAll } from "./scanner.js";

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
} as const;

function paint(color: keyof typeof COLORS, text: string): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      all: { type: "boolean", default: false },
      config: { type: "string" },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const command = positionals[0];

  if (!command || values.help) {
    printHelp();
    process.exit(command ? 0 : 1);
  }

  const config = await loadConfig(values.config);

  switch (command) {
    case "sync":
      await cmdSync(config, { dryRun: values["dry-run"], force: values.force });
      break;
    case "status":
      await cmdStatus(config);
      break;
    case "clean":
      await cmdClean(config, { dryRun: values["dry-run"], all: values.all });
      break;
    case "list":
      await cmdList(config);
      break;
    case "init":
      await cmdInit(config, values.config);
      break;
    default:
      console.error(paint("red", `Unknown command: ${command}`));
      printHelp();
      process.exit(1);
  }
}

async function cmdSync(
  config: SkillSyncConfig,
  opts: { dryRun: boolean; force: boolean },
): Promise<void> {
  if (opts.dryRun) console.log(paint("cyan", "=== DRY RUN ===\n"));
  console.log(paint("bold", "Syncing skills..."));
  console.log(paint("dim", `Store: ${config.store}`));
  console.log(paint("dim", `Harnesses: ${config.harnesses.map((h) => h.name).join(", ")}\n`));

  const result = await sync(config, opts);

  if (result.consolidated.length > 0) {
    console.log(paint("green", `Consolidated ${result.consolidated.length} skill(s) into store:`));
    for (const name of result.consolidated) {
      console.log(`  ${paint("green", "+")} ${name}`);
    }
    console.log();
  }

  if (result.linked.length > 0) {
    console.log(paint("cyan", `Linked ${result.linked.length} symlink(s):`));
    for (const entry of result.linked) {
      console.log(`  ${paint("cyan", "→")} ${entry}`);
    }
    console.log();
  }

  if (result.skipped.length > 0) {
    console.log(paint("dim", `Skipped ${result.skipped.length} (already linked):`));
    for (const entry of result.skipped) {
      console.log(`  ${paint("dim", "✓")} ${entry}`);
    }
    console.log();
  }

  if (result.conflicts.length > 0) {
    console.log(paint("yellow", `⚠  ${result.conflicts.length} conflict(s) — divergent content:`));
    for (const c of result.conflicts) {
      console.log(`  ${c.name}`);
      for (const p of c.paths) {
        console.log(paint("dim", `    ${p}`));
      }
    }
    console.log();
    console.log(paint("yellow", "  First source was used. Review and manually reconcile if needed."));
    console.log();
  }

  if (result.errors.length > 0) {
    console.log(paint("red", `Errors (${result.errors.length}):`));
    for (const err of result.errors) {
      console.log(`  ${paint("red", "✗")} ${err}`);
    }
    console.log();
  }

  const total = result.consolidated.length + result.linked.length + result.skipped.length;
  console.log(paint("bold", `Done. ${total} skill(s) processed.`));

  if (result.errors.length > 0) process.exit(1);
}

async function cmdStatus(config: SkillSyncConfig): Promise<void> {
  const entries = await status(config);

  if (entries.length === 0) {
    console.log(paint("dim", "No skills found. Run `skill-sync sync` to get started."));
    return;
  }

  console.log(paint("bold", `Store: ${config.store}\n`));

  const stateLabel: Record<StatusEntry["state"], string> = {
    synced: paint("green", "synced"),
    partial: paint("yellow", "partial"),
    orphaned: paint("red", "orphaned"),
    "store-only": paint("cyan", "store-only"),
  };

  // Group by state
  const grouped: Record<string, string[]> = {};
  for (const entry of entries) {
    const label = stateLabel[entry.state];
    grouped[label] ??= [];
    grouped[label].push(entry.name);
  }

  for (const [label, names] of Object.entries(grouped)) {
    console.log(`${label}  ${paint("dim", `(${names.length})`)}`);
    for (const name of names) {
      console.log(`  ${name}`);
    }
    console.log();
  }

  console.log(paint("dim", `Total: ${entries.length} skill(s)`));
}

async function cmdClean(
  config: SkillSyncConfig,
  opts: { dryRun: boolean; all: boolean },
): Promise<void> {
  if (opts.dryRun) console.log(paint("cyan", "=== DRY RUN ===\n"));

  const result = await clean(config, opts);

  if (result.removed.length > 0) {
    console.log(paint("yellow", `Removed ${result.removed.length} symlink(s):`));
    for (const entry of result.removed) {
      console.log(`  ${paint("yellow", "✗")} ${entry}`);
    }
  } else {
    console.log(paint("green", "Nothing to clean — all symlinks are valid."));
  }

  if (result.errors.length > 0) {
    console.log(paint("red", `\nErrors (${result.errors.length}):`));
    for (const err of result.errors) {
      console.log(`  ${paint("red", "✗")} ${err}`);
    }
  }
}

async function cmdList(config: SkillSyncConfig): Promise<void> {
  const skills = await scanAll(config);

  if (skills.size === 0) {
    console.log(paint("dim", "No skills found anywhere."));
    return;
  }

  console.log(paint("bold", `Skills (${skills.size}):\n`));

  const sorted = [...skills.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  for (const [name, info] of sorted) {
    const locations = [...info.locations.entries()]
      .map(([h, p]) => {
        const isLink = info.symlinkIn.has(h);
        const icon = isLink ? paint("cyan", "→") : paint("green", "●");
        return `${icon} ${h}${paint("dim", ` (${p})`)}`;
      })
      .join("  ");

    const badge = info.hasSkillMd ? "" : paint("yellow", " [no SKILL.md]");
    console.log(`  ${name}${badge}`);
    console.log(paint("dim", `    ${locations}`));
  }
}

async function cmdInit(
  config: SkillSyncConfig,
  configPath?: string,
): Promise<void> {
  const path = configPath
    ? configPath
    : join(homedir(), ".config", "skill-sync", "config.json");

  await mkdir(dirname(path), { recursive: true });

  const sample = {
    store: config.store,
    harnesses: config.harnesses,
  };

  await writeFile(path, JSON.stringify(sample, null, 2) + "\n", "utf-8");
  console.log(paint("green", `Config written to ${path}`));
  console.log(paint("dim", "Edit this file to customize harness directories."));
}

function printHelp(): void {
  console.log(`
${paint("bold", "skill-sync")} — sync agent skills across harness directories

${paint("bold", "USAGE")}
  skill-sync <command> [options]

${paint("bold", "COMMANDS")}
  sync      Consolidate skills into the store and symlink into all harnesses
  status    Show sync state of all skills
  clean     Remove broken or obsolete symlinks from harness dirs
  list      List all skills and their locations
  init      Write a sample config file

${paint("bold", "OPTIONS")}
  --dry-run       Preview without making changes
  --force         Overwrite real directories with symlinks (sync)
  --all           Remove all store-pointing symlinks (clean)
  --config <path> Use a custom config file
  --help          Show this help
`);
}

main().catch((err) => {
  console.error(paint("red", `Fatal: ${err}`));
  process.exit(1);
});