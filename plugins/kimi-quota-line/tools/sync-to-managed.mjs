#!/usr/bin/env node
/**
 * sync-to-managed.mjs — no-symlink workaround for kimi-code plugin dev loop.
 *
 * kimi-code does NOT support symlinks for plugin installs (see the Plugins doc).
 * Local installs are always copied to $KIMI_CODE_HOME/plugins/managed/<id>/.
 *
 * This script mirrors the plugin source into that managed directory after every
 * edit, so the next `/plugins reload` picks up your changes.
 *
 * Usage:
 *   pnpm run sync
 *
 * After sync, run `/plugins reload` in kimi-code.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HOME = process.env.KIMI_CODE_HOME || join(homedir(), ".kimi-code");
// SRC must be the plugin ROOT (one level above this script's directory in
// tools/). Using process.cwd() breaks when npm or a parent shell has a
// different working directory.
const SRC = dirname(dirname(fileURLToPath(import.meta.url)));
const DST = join(HOME, "plugins", "managed", "kimi-quota-line");

/* Patterns to exclude from the copy. Source-side only — the managed copy
 * must contain just kimi.plugin.json, skills/, commands/, SYSTEM.md, the
 * top-level docs (README, CHANGELOG, AGENTS, LICENSE, UPGRADING), and
 * dist/{hooks,bin,src,tools}/*.js. Anything else is dev-only.
 *
 * Exclusion is by relative path from SRC, not by basename — otherwise the
 * `dist/bin/` and `dist/hooks/` build output would also get excluded
 * (because their inner segment names are "bin" and "hooks"). */
const EXCLUDE_PATH_PREFIXES = ["node_modules", ".git", "test", "src", "hooks", "bin", "tools"];

const EXCLUDE_FILES = new Set([
	"tsconfig.json",
	"tsconfig.build.json",
	"tsconfig.contract.json",
	"vitest.config.ts",
	"package.json",
	"package-lock.json",
	"pnpm-lock.yaml",
	"yarn.lock",
	".gitignore",
	".DS_Store",
]);

function isExcluded(srcPath) {
	// cpSync passes full paths; compute relative path from SRC root.
	const rel = relative(SRC, srcPath);
	if (rel === "" || rel.startsWith("..")) {
		// SRC itself or outside — never exclude.
		return false;
	}
	// Only check the FIRST (top-level) segment — otherwise `dist/bin/` and
	// `dist/hooks/` (which we DO want) get excluded because of their inner
	// segment names.
	const firstSeg = rel.split("/")[0];
	if (EXCLUDE_PATH_PREFIXES.includes(firstSeg)) return true;
	const name = srcPath.split("/").pop() || "";
	if (EXCLUDE_FILES.has(name)) return true;
	if (name.endsWith(".log")) return true;
	return false;
}

function patchTuiToml(manifestPath) {
	// If tui.toml points at an old layout (dist/scripts/ or dist/hooks/) for
	// this plugin, rewrite it to the current dist/bin/ path. No-op when the
	// current path is already correct, or when tui.toml does not mention this
	// plugin.
	const tuiPath = join(HOME, "tui.toml");
	if (!existsSync(tuiPath)) return;
	const text = readFileSync(tuiPath, "utf8");
	// Match the managed dir prefix, not the manifest path — tui.toml points
	// at dist/bin/render-row1.js, not at kimi.plugin.json.
	const managedDir = dirname(manifestPath);
	if (!text.includes(managedDir)) return;

	const stableCurrent = "dist/bin/render-row1.js";
	const stalePatterns = [/dist\/scripts\/render-row1\.js/g, /dist\/hooks\/render-row1\.js/g];
	let updated = text;
	for (const pat of stalePatterns) {
		updated = updated.replace(pat, stableCurrent);
	}
	if (updated === text) return;

	writeFileSync(tuiPath, updated);
	console.log(`  patched: ${tuiPath} (stale dist path → ${stableCurrent})`);
}

function touchInstalledJson(version) {
	// Bump updatedAt and version in installed.json so the CLI sees the new
	// version on the next /plugins reload. Preserves all other fields.
	const regPath = join(HOME, "plugins", "installed.json");
	if (!existsSync(regPath)) return;
	const reg = JSON.parse(readFileSync(regPath, "utf8"));
	const entry = (reg.plugins || []).find((p) => p.id === "kimi-quota-line");
	if (!entry) return;
	const now = new Date().toISOString();
	entry.updatedAt = now;
	if (!entry.installedAt) entry.installedAt = now;
	entry.version = version;
	writeFileSync(regPath, `${JSON.stringify(reg, null, 2)}\n`);
	console.log(`  bumped:  ${regPath} (version → ${version}, updatedAt → ${now})`);
}

function readManifestVersion() {
	const manifest = JSON.parse(readFileSync(join(SRC, "kimi.plugin.json"), "utf8"));
	return manifest.version;
}

function main() {
	if (!existsSync(SRC)) {
		console.error(`Source not found: ${SRC}`);
		process.exit(1);
	}

	console.log(`Syncing plugin source`);
	console.log(`  src: ${SRC}`);
	console.log(`  dst: ${DST}`);

	mkdirSync(join(HOME, "plugins", "managed"), { recursive: true });

	if (existsSync(DST)) {
		rmSync(DST, { recursive: true, force: true });
	}

	cpSync(SRC, DST, {
		recursive: true,
		filter: (srcPath) => !isExcluded(srcPath),
	});

	const manifestPath = join(DST, "kimi.plugin.json");
	patchTuiToml(manifestPath);
	const version = readManifestVersion();
	touchInstalledJson(version);

	console.log(`Done.`);
	console.log(`Next: open kimi-code and run /plugins reload (or /reload).`);
}

main();
