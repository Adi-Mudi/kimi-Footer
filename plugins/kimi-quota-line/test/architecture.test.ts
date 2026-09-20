/**
 * Layer guard test — enforces the layer rules from AGENTS.md.
 *
 * Reads each source file as text and asserts forbidden imports / symbols.
 * This is the only architecture-level enforcement we have. If a future
 * contributor adds e.g. a `fetch` call to `bin/render-row1.ts`, this test
 * fails in CI before the change can land.
 *
 * Not exhaustive — it cannot catch every possible violation. But it catches
 * the most common drift: someone adding I/O to the render path, coupling
 * the cache module to a fetcher, or reintroducing the git disk cache that
 * was the source of the v1.3.0 staleness bug.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");
const BIN = join(HERE, "..", "bin");

function readSrc(rel: string): string {
	return readFileSync(join(SRC, rel), "utf-8");
}

function readBin(rel: string): string {
	return readFileSync(join(BIN, rel), "utf-8");
}

describe("architecture layer rules", () => {
	describe("bin/render-row1.ts (render path = read-only)", () => {
		const src = readBin("render-row1.ts");

		it("does not import the API-calling fetch functions", () => {
			// isKimiModel / isMinimaxModel are pure name detectors and may be
			// imported (they do not hit the network). We forbid the actual
			// fetch functions instead.
			expect(src).not.toMatch(/\bfetchKimiUsage\b/);
			expect(src).not.toMatch(/\bfetchMinimaxUsage\b/);
		});

		it("does not call fetch", () => {
			// Disallow `fetch(` and `globalThis.fetch` and bare `fetch(`. We
			// accept `fetch(` only in comments. Strip line comments first.
			const stripped = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
			expect(stripped).not.toMatch(/\bfetch\s*\(/);
		});

		it("does not write files (no writeFileSync / fs.writeFile / createWriteStream)", () => {
			const stripped = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
			expect(stripped).not.toMatch(/\bwriteFileSync\s*\(/);
			expect(stripped).not.toMatch(/\bfs\.writeFile\b/);
			expect(stripped).not.toMatch(/\bcreateWriteStream\b/);
		});

		it("does not import child_process", () => {
			// v1.3.1: render-row1 does not call git directly. git-footer.ts
			// does. The render path must not spawn subprocesses.
			expect(src).not.toMatch(/from\s+["']node:child_process/);
			expect(src).not.toMatch(/from\s+["']child_process/);
		});
	});

	describe("src/quota-cache.ts (quota module isolation)", () => {
		const src = readSrc("quota-cache.ts");

		it("does not import git-footer or git-cache", () => {
			expect(src).not.toMatch(/from\s+["']\.\/git-footer/);
			expect(src).not.toMatch(/from\s+["']\.\/git-cache/);
			expect(src).not.toMatch(/from\s+["']\.\.\/src\/git-footer/);
			expect(src).not.toMatch(/from\s+["']\.\.\/src\/git-cache/);
		});

		it("does not import a fetcher", () => {
			expect(src).not.toMatch(/from\s+["']\.\/kimi-fetcher/);
			expect(src).not.toMatch(/from\s+["']\.\/minimax-fetcher/);
		});
	});

	describe("src/git-footer.ts (git module isolation)", () => {
		const src = readSrc("git-footer.ts");

		it("does not import the cache module (git is live, not cached)", () => {
			// v1.3.1: git-footer must not depend on git-cache.ts (which
			// was deleted). It also must not depend on file-lock.ts — git
			// is now lock-free on the render path.
			expect(src).not.toMatch(/from\s+["']\.\/git-cache/);
			expect(src).not.toMatch(/from\s+["']\.\.\/src\/git-cache/);
			expect(src).not.toMatch(/from\s+["']\.\/file-lock/);
			expect(src).not.toMatch(/from\s+["']\.\.\/src\/file-lock/);
		});

		it("does not import the cache or quota modules", () => {
			expect(src).not.toMatch(/from\s+["']\.\/quota-cache/);
			expect(src).not.toMatch(/from\s+["']\.\/cache/);
		});
	});

	describe("src/cache.ts (deleted in v1.3.0)", () => {
		it("does not exist", () => {
			expect(existsSync(join(SRC, "cache.ts"))).toBe(false);
		});
	});

	describe("src/git-cache.ts (deleted in v1.3.1)", () => {
		it("does not exist (git data is live, not cached)", () => {
			// v1.3.1 removed src/git-cache.ts. If this fails, someone has
			// re-added the disk cache for git — update the assertion but
			// remember the cache was the source of the staleness bug.
			expect(existsSync(join(SRC, "git-cache.ts"))).toBe(false);
		});
	});

	describe("quota cache module", () => {
		it("exposes quotaLockPath + QUOTA_LOCK_PATH", () => {
			const q = readSrc("quota-cache.ts");
			expect(q).toMatch(/export function quotaLockPath\(/);
			expect(q).toMatch(/export const QUOTA_LOCK_PATH\s*=\s*quotaLockPath\(/);
		});

		it("cache filename includes 'quota'", () => {
			const q = readSrc("quota-cache.ts");
			const qName = q.match(/join\(cacheDir\(\),\s*[`'"]([^`'"]+)[`'"]\)/)?.[1] ?? "";
			expect(qName).not.toBe("");
			expect(qName).toContain("quota");
		});
	});

	describe("src/file-lock.ts (the only lock module)", () => {
		it("has a distinctive marker so other modules do not duplicate lock logic", () => {
			const src = readSrc("file-lock.ts");
			expect(src).toContain("withFileLock");
		});
	});

	describe("src/helpers.ts (pure functions only)", () => {
		const src = readSrc("helpers.ts");

		it("does not import node:fs", () => {
			expect(src).not.toMatch(/from\s+["']node:fs/);
		});

		it("does not import node:child_process", () => {
			expect(src).not.toMatch(/from\s+["']node:child_process/);
		});

		it("does not import node:http or node:https", () => {
			expect(src).not.toMatch(/from\s+["']node:https?\b/);
		});
	});

	describe("src/sunset-dir.ts (pure)", () => {
		const src = readSrc("sunset-dir.ts");

		it("does not import node:fs", () => {
			expect(src).not.toMatch(/from\s+["']node:fs/);
		});
		it("does not import node:child_process", () => {
			expect(src).not.toMatch(/from\s+["']node:child_process/);
		});
	});

	describe("src/width.ts (pure)", () => {
		const src = readSrc("width.ts");

		it("does not import node:fs", () => {
			expect(src).not.toMatch(/from\s+["']node:fs/);
		});
		it("does not import node:child_process", () => {
			expect(src).not.toMatch(/from\s+["']node:child_process/);
		});
	});
});
