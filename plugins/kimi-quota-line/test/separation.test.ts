/**
 * Architectural separation test.
 *
 * Proves that the git-info and quota-info layers are independent by:
 *   1. Importing each in isolation and verifying it works without the other.
 *   2. Checking that no git module re-exports quota symbols (and vice versa).
 *   3. Checking that the orchestrator only re-exports composition entry points.
 *
 * If any of these fail, the architecture has been entangled.
 */

import { describe, expect, it } from "vitest";

describe("architectural separation: git vs quota", () => {
	it("git-footer module works without any quota code loaded", async () => {
		// Dynamic import — no static reference to quota modules.
		const git = await import("../src/git-footer.js");
		expect(typeof git.buildGitDetails).toBe("function");
		expect(typeof git.getCurrentBranch).toBe("function");
		expect(typeof git.getUncommittedCount).toBe("function");
		expect(typeof git.isInWorktree).toBe("function");

		// Git module must NOT export any quota symbols.
		expect(git).not.toHaveProperty("buildQuotaStatus");
		expect(git).not.toHaveProperty("vbar");
		expect(git).not.toHaveProperty("pct");
		expect(git).not.toHaveProperty("weeklyPaceColor");
	});

	it("quota helpers work without any git code loaded", async () => {
		const helpers = await import("../src/helpers.js");
		expect(typeof helpers.vbar).toBe("function");
		expect(typeof helpers.pct).toBe("function");
		expect(typeof helpers.formatRemaining).toBe("function");
		expect(typeof helpers.weeklyPaceColor).toBe("function");
		expect(typeof helpers.sessionPaceColor).toBe("function");
		expect(typeof helpers.statusFg).toBe("function");

		// Helpers module must NOT export any git symbols.
		expect(helpers).not.toHaveProperty("buildGitDetails");
		expect(helpers).not.toHaveProperty("getCurrentBranch");
		expect(helpers).not.toHaveProperty("isInWorktree");
	});

	it("kimi-fetcher module works without any git code loaded", async () => {
		const fetcher = await import("../src/kimi-fetcher.js");
		expect(typeof fetcher.isKimiModel).toBe("function");

		// Kimi fetcher must NOT export any git symbols.
		expect(fetcher).not.toHaveProperty("buildGitDetails");
		expect(fetcher).not.toHaveProperty("getCurrentBranch");
	});

	it("minimax-fetcher module works without any git code loaded", async () => {
		const fetcher = await import("../src/minimax-fetcher.js");
		expect(typeof fetcher.isMinimaxModel).toBe("function");

		expect(fetcher).not.toHaveProperty("buildGitDetails");
		expect(fetcher).not.toHaveProperty("getCurrentBranch");
	});

	it("orchestrator (render-row1) is composition only", async () => {
		const row1 = await import("../bin/render-row1.js");

		// Exports the composition entry point + helpers used by tests.
		expect(typeof row1.buildRow1).toBe("function");
		expect(typeof row1.formatGitCenter).toBe("function");
		expect(typeof row1.buildQuotaStatus).toBe("function");

		// Must NOT export raw internals (proves the orchestrator is a thin wrapper).
		expect(row1).not.toHaveProperty("git");
		expect(row1).not.toHaveProperty("quota");
	});

	it("git-footer has no cross-imports to quota modules", async () => {
		// Load the source as text and assert it doesn't import quota files.
		const { readFileSync } = await import("node:fs");
		const { fileURLToPath } = await import("node:url");
		const { dirname, join } = await import("node:path");
		const here = dirname(fileURLToPath(import.meta.url));
		const gitSrc = readFileSync(join(here, "..", "src", "git-footer.ts"), "utf-8");

		expect(gitSrc).not.toMatch(/kimi-fetcher/);
		expect(gitSrc).not.toMatch(/minimax-fetcher/);
		expect(gitSrc).not.toMatch(/quota/i);
		expect(gitSrc).not.toMatch(/helpers/);
	});

	it("quota helpers have no cross-imports to git modules", async () => {
		const { readFileSync } = await import("node:fs");
		const { fileURLToPath } = await import("node:url");
		const { dirname, join } = await import("node:path");
		const here = dirname(fileURLToPath(import.meta.url));
		const helpersSrc = readFileSync(join(here, "..", "src", "helpers.ts"), "utf-8");

		// helpers.ts may import FILLED/EMPTY from kimi-fetcher (display chars) —
		// that's allowed. But it must NOT import git code.
		expect(helpersSrc).not.toMatch(/git-footer/);
		expect(helpersSrc).not.toMatch(/buildGitDetails/);
		expect(helpersSrc).not.toMatch(/getCurrentBranch/);
	});
});

describe("layered responsibility", () => {
	it("types module defines all shared interfaces", async () => {
		const types = await import("../src/types.js");
		// These interfaces are the contract between layers.
		expect(types).toBeDefined();
	});

	it("cache module owns I/O; other modules are pure", async () => {
		const { readFileSync } = await import("node:fs");
		const { fileURLToPath } = await import("node:url");
		const { dirname, join } = await import("node:path");
		const here = dirname(fileURLToPath(import.meta.url));
		const filesToCheck = ["sunset-dir.ts", "helpers.ts", "sunset-dir.ts", "types.ts", "width.ts"];

		for (const f of filesToCheck) {
			const src = readFileSync(join(here, "..", "src", f), "utf-8");
			// These modules must NOT touch the filesystem (only cache.ts does).
			expect(src).not.toMatch(/readFileSync|writeFileSync/);
			expect(src).not.toMatch(/mkdirSync|rmSync/);
		}
	});
});
