import { describe, expect, it } from "vitest";
import { buildRightZone, buildRow1 } from "../bin/render-row1.js";
import type { GitInfo, QuotaCache, StatusLinePayload } from "../src/types.js";

const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");
const DIM = "\x1b[38;5;244m";
const RESET = "\x1b[0m";

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
		ts: 0,
		model: "kimi-for-coding",
		kimi: {
			wUsed: 67,
			wLimit: 100,
			wResetAt: "2026-10-08T20:04:15Z",
			hUsed: 20,
			hLimit: 100,
			hResetAt: "2026-10-06T01:04:15Z",
			hRemaining: "4.59",
		},
		minimax: null,
	};
}

describe("buildRightZone full model (never truncated)", () => {
	it("keeps a 40-char model name intact", () => {
		const long = "a".repeat(40);
		const line = buildRightZone(long, null, true, 0) ?? "";
		expect(strip(line)).toContain(long);
		expect(strip(line)).not.toContain("…");
	});

	it("strips only the first provider segment", () => {
		const line = buildRightZone("openrouter/anthropic/claude-opus-4.8", null, true, 0) ?? "";
		const visible = strip(line);
		expect(visible).toContain("OR");
		expect(visible).toContain("anthropic/claude-opus-4.8");
		expect(visible).not.toContain("openrouter/anthropic");
	});

	it("empty model returns undefined", () => {
		expect(buildRightZone("", kimiCache(), true, 0)).toBeUndefined();
	});

	it("unknown bare model shows dim name only", () => {
		const line = buildRightZone("mimo-v2.6-flash-free", kimiCache(), true, 0) ?? "";
		expect(line).toBe(`${DIM}mimo-v2.6-flash-free${RESET}`);
		expect(line).not.toContain("%");
	});
});

describe("buildRightZone metrics", () => {
	it("Kimi shows W and 5H with two-space gap", () => {
		const line = strip(buildRightZone("kimi-for-coding", kimiCache(), true, 0) ?? "");
		expect(line).toContain("Kimi");
		expect(line).toContain("kimi-for-coding");
		expect(line).toContain("W:67%");
		expect(line).toContain("5H:20%");
		expect(line).toContain("W:67%  5H:20%");
	});

	it("CL-P shows short + model only (no metrics)", () => {
		const line = strip(buildRightZone("cline-pass/cline-pass/muse-spark-1.3", null, true, 0) ?? "");
		expect(line).toContain("CL-P");
		expect(line).toContain("cline-pass/muse-spark-1.3");
		expect(line).not.toContain("W:");
		expect(line).not.toContain("Req:");
		expect(line).not.toContain("5H:");
	});

	it("OR shows Req only when data present", () => {
		const cache: QuotaCache = {
			ts: 0,
			model: "openrouter/anthropic/claude-opus-4.8",
			kimi: null,
			minimax: null,
			openrouter: { used: 42, limit: 1000 },
		};
		const line = strip(buildRightZone("openrouter/anthropic/claude-opus-4.8", cache, true, 0) ?? "");
		expect(line).toContain("OR");
		expect(line).toContain("anthropic/claude-opus-4.8");
		expect(line).toContain("Req: 42/1000");
		expect(line).not.toContain("W:");
		expect(line).not.toContain("5H:");
	});

	it("OR2 uses openrouter2 slot", () => {
		const cache: QuotaCache = {
			ts: 0,
			model: "openrouter-2/openai/gpt-6-sol",
			kimi: null,
			minimax: null,
			openrouter2: { used: 254, limit: 1000 },
		};
		const line = strip(buildRightZone("openrouter-2/openai/gpt-6-sol", cache, true, 0) ?? "");
		expect(line).toContain("OR2");
		expect(line).toContain("openai/gpt-6-sol");
		expect(line).toContain("Req: 254/1000");
	});

	it("OPC-G shows W and 5H from percent cache", () => {
		const cache: QuotaCache = {
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
		const line = strip(buildRightZone("opencode-go/mimo-v2.6-flash", cache, true, 0) ?? "");
		expect(line).toContain("OPC-G");
		expect(line).toContain("mimo-v2.6-flash");
		expect(line).toContain("W:7%");
		expect(line).toContain("5H:3%");
	});

	it("withMetrics=false drops metrics but keeps short + model", () => {
		const line = strip(buildRightZone("kimi-for-coding", kimiCache(), false, 0) ?? "");
		expect(line).toContain("Kimi");
		expect(line).toContain("kimi-for-coding");
		expect(line).not.toContain("W:");
		expect(line).not.toContain("5H:");
	});

	it("two-space gap between short and model", () => {
		const line = strip(buildRightZone("minimax/minimax-m3", {
			ts: 0,
			model: "minimax/minimax-m3",
			kimi: null,
			minimax: {
				wUsed: 31,
				wLimit: 100,
				wResetAt: undefined,
				hUsed: 25,
				hLimit: 100,
				hResetAt: undefined,
				hRemaining: "",
			},
		}, true, 0) ?? "");
		expect(line).toMatch(/MM {4}minimax-m3/);
		expect(line).toContain("W:31%");
		expect(line).toContain("5H:25%");
	});
});

describe("buildRow1 with a non-provider model", () => {
	const gitInfo: GitInfo = {
		branch: "dev",
		count: 0,
		text: "dev • clean",
		isWorktree: false,
	};

	it("shows folder + git + dim model name", () => {
		const line = buildRow1(makePayload("mimo-v2.6-flash-free", "/tmp/proj"), kimiCache(), 120, gitInfo, 0);
		const visible = strip(line);
		expect(visible).toContain("proj");
		expect(visible).toContain("dev • clean");
		expect(visible).toContain("mimo-v2.6-flash-free");
		expect(visible.length).toBeLessThanOrEqual(120);
	});

	it("respects the width budget at 80 cols", () => {
		const line = buildRow1(makePayload("mimo-v2.6-flash-free", "/tmp/proj"), kimiCache(), 80, gitInfo, 0);
		const visible = strip(line);
		expect(visible).toContain("mimo-v2.6-flash-free");
		expect(visible.length).toBeLessThanOrEqual(80);
	});

	it("empty model keeps folder + git only", () => {
		const line = buildRow1(makePayload("", "/tmp/proj"), kimiCache(), 120, gitInfo, 0);
		const visible = strip(line);
		expect(visible).toContain("proj");
		expect(visible).toContain("dev • clean");
		expect(visible.trimEnd().endsWith("dev • clean")).toBe(true);
	});
});
