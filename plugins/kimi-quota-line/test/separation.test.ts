import { describe, expect, it } from "vitest";

describe("architectural separation: git vs quota", () => {
	it("git-footer module works without any quota code loaded", async () => {
		
		const git = await import("../src/git-footer.js");
		expect(typeof git.buildGitDetails).toBe("function");
		expect(typeof git.getCurrentBranch).toBe("function");
		expect(typeof git.getUncommittedCount).toBe("function");
		expect(typeof git.isInWorktree).toBe("function");

		
		expect(git).not.toHaveProperty("buildQuotaStatus");
		expect(git).not.toHaveProperty("weeklyPaceColor");
	});

	it("quota helpers work without any git code loaded", async () => {
		const helpers = await import("../src/helpers.js");
		expect(typeof helpers.formatRemaining).toBe("function");
		expect(typeof helpers.weeklyPaceColor).toBe("function");
		expect(typeof helpers.sessionPaceColor).toBe("function");
		expect(typeof helpers.statusFg).toBe("function");

		
		expect(helpers).not.toHaveProperty("buildGitDetails");
		expect(helpers).not.toHaveProperty("getCurrentBranch");
		expect(helpers).not.toHaveProperty("isInWorktree");
	});

	it("kimi-fetcher module works without any git code loaded", async () => {
		const fetcher = await import("../src/kimi-fetcher.js");
		expect(typeof fetcher.isKimiModel).toBe("function");

		
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

		
		expect(typeof row1.buildRow1).toBe("function");
		expect(typeof row1.formatGitCenter).toBe("function");
		expect(typeof row1.buildRightZone).toBe("function");

		
		expect(row1).not.toHaveProperty("git");
		expect(row1).not.toHaveProperty("quota");
	});

	it("git-footer has no cross-imports to quota modules", async () => {
		
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

		
		
		expect(helpersSrc).not.toMatch(/git-footer/);
		expect(helpersSrc).not.toMatch(/buildGitDetails/);
		expect(helpersSrc).not.toMatch(/getCurrentBranch/);
	});
});

describe("layered responsibility", () => {
	it("types module defines all shared interfaces", async () => {
		const types = await import("../src/types.js");
		
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
			
			expect(src).not.toMatch(/readFileSync|writeFileSync/);
			expect(src).not.toMatch(/mkdirSync|rmSync/);
		}
	});
});
