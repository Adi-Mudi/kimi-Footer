import { describe, expect, it } from "vitest";
import {
	BLINK_QUARTER_PERIOD_MS,
	buildRightZone,
	buildRow1,
	formatGitCenter,
} from "../bin/render-row1.js";
import type { GitInfo, QuotaCache, StatusLinePayload } from "../src/types.js";

const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");
const Q = BLINK_QUARTER_PERIOD_MS;

function makePayload(model: string, cwd: string): StatusLinePayload {
	return {
		model,
		cwd,
		gitBranch: null,
		permissionMode: "manual",
		planMode: false,
		contextUsage: 0,
		contextTokens: 0,
		maxContextTokens: 0,
		sessionId: "test",
		version: "0",
	};
}

function kimiCache(): QuotaCache {
	return {
		ts: Date.now(),
		model: "kimi-for-coding",
		kimi: {
			wUsed: 80,
			wLimit: 120,
			wResetAt: new Date(Date.now() + 86_400_000).toISOString(),
			hUsed: 10,
			hLimit: 50,
			hResetAt: new Date(Date.now() + 3_600_000).toISOString(),
			hRemaining: "0.59",
		},
		minimax: null,
	};
}

function minimaxCache(): QuotaCache {
	return {
		ts: Date.now(),
		model: "minimax-text-01",
		kimi: null,
		minimax: {
			wUsed: 30,
			wLimit: 100,
			wResetAt: new Date(Date.now() + 86_400_000).toISOString(),
			hUsed: 5,
			hLimit: 20,
			hResetAt: new Date(Date.now() + 3_600_000).toISOString(),
			hRemaining: "0.59",
		},
	};
}

function ocgCache(): QuotaCache {
	return {
		ts: 0,
		model: "opencode-go/mimo-v2.6-flash",
		kimi: null,
		minimax: null,
		opencodeGo: {
			wUsed: 7,
			wLimit: 100,
			wResetAt: undefined,
			hUsed: 3,
			hLimit: 100,
			hResetAt: undefined,
			hRemaining: "",
		},
	};
}

function orCache(used = 42, limit = 1000, which: "openrouter" | "openrouter2" = "openrouter"): QuotaCache {
	return {
		ts: 0,
		model: which === "openrouter" ? "openrouter/anthropic/claude-opus-4.8" : "openrouter-2/openai/gpt-6-sol",
		kimi: null,
		minimax: null,
		...(which === "openrouter" ? { openrouter: { used, limit } } : { openrouter2: { used, limit } }),
	};
}

const wideTerminal = 140;
const dirtyGit: GitInfo = {
	branch: "main",
	count: 3,
	text: "main • 3 files",
	isWorktree: false,
};

describe("locked right-zone mockup", () => {
	it("Kimi row", () => {
		const line = strip(buildRightZone("kimi-k3.1-pro", kimiCache(), true, 0) ?? "");
		expect(line).toMatch(/^Kimi {2}kimi-k3\.1-pro {2}W:\d+% {2}5H:\d+%$/);
	});

	it("MM row", () => {
		const line = strip(buildRightZone("minimax/minimax-m3", minimaxCache(), true, 0) ?? "");
		expect(line).toMatch(/^MM {4}minimax-m3 {2}W:\d+% {2}5H:\d+%$/);
	});

	it("OCG row", () => {
		const line = strip(buildRightZone("opencode-go/mimo-v2.6-flash", ocgCache(), true, 0) ?? "");
		expect(line).toMatch(/^OCG {3}mimo-v2\.6-flash {2}W:7% {2}5H:3%$/);
	});

	it("OR row", () => {
		const line = strip(buildRightZone("openrouter/anthropic/claude-opus-4.8", orCache(42, 1000), true, 0) ?? "");
		expect(line).toMatch(/^OR {4}anthropic\/claude-opus-4\.8 {2}Req: 42\/1000$/);
	});

	it("OR2 row", () => {
		const line = strip(
			buildRightZone("openrouter-2/openai/gpt-6-sol", orCache(254, 1000, "openrouter2"), true, 0) ?? "",
		);
		expect(line).toMatch(/^OR2 {3}openai\/gpt-6-sol {2}Req: 254\/1000$/);
	});

	it("CP row has no metrics", () => {
		const line = strip(buildRightZone("cline-pass/cline-pass/muse-spark-1.3", null, true, 0) ?? "");
		expect(line).toMatch(/^CP {4}cline-pass\/muse-spark-1\.3$/);
		expect(line).not.toContain("W:");
		expect(line).not.toContain("5H:");
		expect(line).not.toContain("Req:");
	});

	it("never uses 5R label", () => {
		const lines = [
			buildRightZone("kimi-k3.1-pro", kimiCache(), true, 0) ?? "",
			buildRightZone("minimax/minimax-m3", minimaxCache(), true, 0) ?? "",
			buildRightZone("opencode-go/mimo-v2.6-flash", ocgCache(), true, 0) ?? "",
		];
		for (const l of lines) {
			expect(strip(l)).not.toContain("5R");
			expect(strip(l)).toContain("5H:");
		}
	});
});

describe("buildRow1", () => {
	it("emits sunset folder when cache is missing; short+model still show, no metrics", () => {
		const line = buildRow1(makePayload("kimi-for-coding", "/tmp/myproj"), null, 80, null, 0);
		expect(line).toMatch(/\x1b\[38;5;198m/);
		expect(line).toContain("myproj");
		expect(line).toContain("Kimi");
		expect(line).not.toContain("W:");
		expect(line).not.toContain("5H:");
	});

	it("includes Kimi + W% + 5H% when Kimi data exists", () => {
		const line = buildRow1(makePayload("kimi-for-coding", "/tmp"), kimiCache(), 120, null, 0);
		expect(line).toContain("Kimi");
		expect(line).toContain("W:");
		expect(line).toContain("5H:");
	});

	it("renders Kimi for bare K3 model id", () => {
		const line = buildRow1(makePayload("k3-256k", "/tmp"), kimiCache(), 120, null, 0);
		expect(line).toContain("Kimi");
	});

	it("uses MM label for MiniMax model", () => {
		const line = buildRow1(makePayload("minimax-text-01", "/tmp"), minimaxCache(), 120, null);
		expect(line).toContain("MM");
		expect(line).not.toContain("Kimi");
	});

	it("truncates the left side when width is too narrow", () => {
		const line = buildRow1(makePayload("kimi-for-coding", "/tmp"), kimiCache(), 40, null, 0);
		expect(line).toContain("Kimi");
	});
});

describe("buildRow1 with git center column", () => {
	it("includes branch + dirty count when wide enough", () => {
		const line = buildRow1(
			makePayload("kimi-for-coding", "/tmp"),
			kimiCache(),
			wideTerminal,
			dirtyGit,
			Q * 2,
		);
		expect(line).toContain("Kimi");
		expect(strip(line)).toContain("main");
		expect(strip(line)).toContain("3 files");
		expect(line).toMatch(/\x1b\[91m3\x1b\[0m/);
	});

	it("uses cyan bold ANSI for worktree branch with blinking [wt]", () => {
		const wtGit: GitInfo = { ...dirtyGit, isWorktree: true };
		const line = buildRow1(makePayload("kimi-for-coding", "/tmp"), kimiCache(), wideTerminal, wtGit, 0);
		expect(line).toMatch(/\x1b\[96m\x1b\[1mmain\x1b\[22m\x1b\[39m /);
		expect(line).toContain("[wt]");
	});

	it("renders 'clean' for non-dirty worktree", () => {
		const cleanWt: GitInfo = { branch: "feat-x", count: 0, text: "", isWorktree: true };
		const line = buildRow1(makePayload("kimi-for-coding", "/tmp"), kimiCache(), wideTerminal, cleanWt, 0);
		expect(line).toContain("clean");
		expect(line).toContain("[wt]");
	});

	it("shows 'no git' when git is null", () => {
		const line = buildRow1(makePayload("kimi-for-coding", "/tmp"), kimiCache(), wideTerminal, null, 0);
		expect(line).toContain("no git");
		expect(line).not.toContain(" files");
	});

	it("emits no ANSI blink codes anywhere", () => {
		const phases = [0, Q, Q * 2, Q * 3];
		for (const now of phases) {
			const line = buildRow1(makePayload("minimax-text-01", "/tmp"), minimaxCache(), wideTerminal, dirtyGit, now);
			expect(line).not.toContain("\x1b[5m");
			expect(line).not.toContain("\x1b[25m");
		}
	});

	it("falls back to fetching git when no git param is passed", () => {
		const line = buildRow1(makePayload("kimi-for-coding", process.cwd()), kimiCache(), wideTerminal, undefined, 0);
		expect(line).toContain("Kimi");
	});
});

describe("buildRightZone Kimi label blink", () => {
	it("dim at phase 0", () => {
		const line = buildRightZone("kimi-for-coding", kimiCache(), true, 0) ?? "";
		expect(line).toContain("\x1b[38;5;244mKimi");
		expect(line).not.toContain("\x1b[91mKimi");
	});

	it("blank at phase 1 but model + metrics stay", () => {
		const line = buildRightZone("kimi-for-coding", kimiCache(), true, Q) ?? "";
		expect(strip(line)).not.toContain("Kimi");
		expect(line).toContain("W:");
	});

	it("red at phase 2", () => {
		const line = buildRightZone("kimi-for-coding", kimiCache(), true, Q * 2) ?? "";
		expect(line).toContain("\x1b[91mKimi");
	});

	it("blank at phase 3", () => {
		const line = buildRightZone("kimi-for-coding", kimiCache(), true, Q * 3) ?? "";
		expect(strip(line)).not.toContain("Kimi");
		expect(line).toContain("W:");
	});

	it("cycles back to dim", () => {
		const line = buildRightZone("kimi-for-coding", kimiCache(), true, Q * 4) ?? "";
		expect(line).toContain("\x1b[38;5;244mKimi");
	});

	it("does NOT blink MM", () => {
		for (const now of [0, Q, Q * 2, Q * 3]) {
			const line = buildRightZone("minimax/MiniMax-M3", minimaxCache(), true, now) ?? "";
			expect(line).toContain("MM");
			expect(line).not.toContain("\x1b[5m");
		}
	});
});

describe("buildRow1 narrow-terminal drop order", () => {
	const gitInfo: GitInfo = {
		branch: "ph-3-bugfix",
		count: 1,
		text: "ph-3-bugfix • 1 files",
		isWorktree: false,
	};

	it("keeps metrics at 90 cols", () => {
		const line = buildRow1(makePayload("minimax-text-01", "/some/folder"), minimaxCache(), 90, gitInfo, 0);
		expect(line).toContain("MM");
		expect(line).toContain("W:");
		expect(line).toContain("5H:");
		expect(strip(line).length).toBeLessThanOrEqual(90);
	});

	it("keeps short+model when metrics dropped at tighter width", () => {
		const line = buildRow1(makePayload("minimax-text-01", "/some/folder"), minimaxCache(), 70, gitInfo, 0);
		const visible = strip(line);
		expect(visible).toContain("MM");
		expect(visible).toContain("minimax-text-01");
		expect(visible.length).toBeLessThanOrEqual(70);
	});

	it("drops folder before model at very narrow width", () => {
		const line = buildRow1(makePayload("minimax-text-01", "/some/folder"), minimaxCache(), 50, gitInfo, 0);
		const visible = strip(line);
		expect(visible).toContain("minimax-text-01");
		expect(visible.length).toBeLessThanOrEqual(55);
	});
});

describe("buildRow1 edge cases", () => {
	it("Kimi visible in dim and red phases", () => {
		for (const now of [0, Q * 2]) {
			const line = buildRow1(makePayload("kimi-for-coding", "/tmp"), kimiCache(), 120, null, now);
			expect(line).toContain("Kimi");
		}
	});

	it("Kimi blank in off phases but metrics stay", () => {
		for (const now of [Q, Q * 3]) {
			const line = buildRow1(makePayload("kimi-for-coding", "/tmp"), kimiCache(), 120, null, now);
			expect(strip(line)).not.toContain("Kimi");
			expect(line).toContain("W:");
		}
	});

	it("renders dirty digit single and multi-digit", () => {
		expect(strip(formatGitCenter({ branch: "main", count: 1, text: "", isWorktree: false }, 0))).toContain("1 files");
		expect(strip(formatGitCenter({ branch: "main", count: 99, text: "", isWorktree: false }, Q * 2))).toContain(
			"99 files",
		);
	});
});

describe("key error badges", () => {
	const base = (keyStatus: QuotaCache["keyStatus"]): QuotaCache => ({
		ts: Date.now(),
		model: "kimi-k3.1-pro",
		kimi: null,
		minimax: null,
		keyStatus,
	});

	it("shows Err:key when keyStatus is key and no metrics", () => {
		const line = strip(buildRightZone("kimi-k3.1-pro", base({ "kimi-code": "key" }), true, 0) ?? "");
		expect(line).toContain("Err:key");
		expect(line).toContain("kimi-k3.1-pro");
	});

	it("shows Err:api when keyStatus is api and no metrics", () => {
		const line = strip(buildRightZone("kimi-k3.1-pro", base({ "kimi-code": "api" }), true, 0) ?? "");
		expect(line).toContain("Err:api");
	});

	it("does not show Err when metrics present", () => {
		const cache: QuotaCache = {
			ts: Date.now(),
			model: "kimi-k3.1-pro",
			kimi: { wUsed: 67, wLimit: 100, wResetAt: undefined, hUsed: 20, hLimit: 100, hResetAt: undefined, hRemaining: "" },
			minimax: null,
			keyStatus: { "kimi-code": "ok" },
		};
		const line = strip(buildRightZone("kimi-k3.1-pro", cache, true, 0) ?? "");
		expect(line).toContain("W:67%");
		expect(line).not.toContain("Err:");
	});
});
