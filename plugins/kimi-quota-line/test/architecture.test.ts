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
			
			
			
			expect(src).not.toMatch(/\bfetchKimiUsage\b/);
			expect(src).not.toMatch(/\bfetchMinimaxUsage\b/);
		});

		it("does not call fetch", () => {
			
			
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
			
			
			expect(src).not.toMatch(/from\s+["']node:child_process/);
			expect(src).not.toMatch(/from\s+["']child_process/);
		});

		it("does not import the fetcher modules at all", () => {
			expect(src).not.toMatch(/kimi-fetcher/);
			expect(src).not.toMatch(/minimax-fetcher/);
			expect(src).not.toMatch(/openrouter-fetcher/);
			expect(src).not.toMatch(/opencode-go-fetcher/);
			expect(src).not.toMatch(/cline-fetcher/);
			expect(src).not.toMatch(/from\s+["']\.\.\/src\/providers/);
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

		it("imports only its own mtime cache — never the quota cache or file-lock", () => {
			expect(src).not.toMatch(/from\s+["']\.\/quota-cache/);
			expect(src).not.toMatch(/from\s+["']\.\/file-lock/);
			expect(src).not.toMatch(/from\s+["']\.\.\/src\/quota-cache/);
			expect(src).not.toMatch(/from\s+["']\.\.\/src\/file-lock/);
		});

		it("passes --no-optional-locks so status checks never fight index.lock", () => {
			expect(src).toContain("--no-optional-locks");
		});

		it("no longer spawns git rev-parse (worktree detection reads .git directly)", () => {
			const stripped = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
			expect(stripped).not.toContain("rev-parse");
		});
	});

	describe("src/cache.ts (deleted in v1.3.0)", () => {
		it("does not exist", () => {
			expect(existsSync(join(SRC, "cache.ts"))).toBe(false);
		});
	});

	describe("src/git-cache.ts (mtime-keyed — the v1.3.1 TTL bug must never return)", () => {
		it("exists and is keyed on git internals' mtimes", () => {
			const src = readSrc("git-cache.ts");
			expect(src).toContain("headMtimeMs");
			expect(src).toContain("indexMtimeMs");
		});

		it("writes atomically via tmp + renameSync", () => {
			const src = readSrc("git-cache.ts");
			expect(src).toContain("renameSync");
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

	describe("src/model-detect.ts (pure model detectors)", () => {
		const src = readSrc("model-detect.ts");

		it("does not import node:fs", () => {
			expect(src).not.toMatch(/from\s+["']node:fs/);
		});
		it("does not import node:child_process", () => {
			expect(src).not.toMatch(/from\s+["']node:child_process/);
		});
		it("does not call fetch", () => {
			const stripped = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
			expect(stripped).not.toMatch(/\bfetch\s*\(/);
		});
	});
});
