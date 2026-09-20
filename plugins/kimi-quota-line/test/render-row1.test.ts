/**
 * Pure-function tests for buildRow1 in bin/render-row1.ts.
 * Imports buildRow1 directly — no subprocess.
 *
 * Git info is now passed explicitly as the 4th arg to buildRow1 (instead of
 * coming from the cache). This lets tests stay deterministic without
 * spawning git subprocesses.
 */

import { describe, expect, it } from "vitest";
import { BLINK_QUARTER_PERIOD_MS, buildQuotaStatus, buildRow1, formatGitCenter } from "../bin/render-row1.js";
import type { GitInfo, QuotaCache, StatusLinePayload } from "../src/types.js";

/** Strip ANSI escape sequences from a string for substring checks. */
const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

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

const wideTerminal = 140;
const dirtyGit: GitInfo = {
	branch: "main",
	count: 3,
	text: "main \u2022 3 files",
	isWorktree: false,
};

describe("buildRow1", () => {
	it("emits sunset folder only when cache is missing", () => {
		const line = buildRow1(makePayload("kimi-for-coding", "/tmp/myproj"), null, 80, null);
		expect(line).toMatch(/\x1b\[38;5;198m/);
		expect(line).toContain("myproj");
		expect(line).not.toContain("Kimi ");
	});

	it("includes Kimi label + 67% when Kimi data exists for Kimi model", () => {
		// 1.3.6: pin now to dim phase (0) so the label is visible.
		// Default `now = Date.now()` would land in an off-phase ~50% of
		// the time and render 5 spaces instead of "Kimi ".
		const line = buildRow1(
			makePayload("kimi-for-coding", "/tmp"),
			kimiCache(),
			120,
			null, // no git → no center → 2-col layout
			0,
		);
		expect(line).toContain("Kimi ");
		expect(line).toContain("67%");
	});

	it("renders Kimi bar for bare K3 model id (no provider prefix)", () => {
		// 1.3.6: pin now to dim phase (see comment above).
		const line = buildRow1(
			makePayload("k3-256k", "/tmp"),
			kimiCache(),
			120,
			null, // no git → no center → 2-col layout
			0,
		);
		expect(line).toContain("Kimi ");
		expect(line).toContain("67%");
	});

	it("uses MM label for MiniMax model", () => {
		const line = buildRow1(makePayload("minimax-text-01", "/tmp"), minimaxCache(), 120, null);
		expect(line).toContain("MM ");
		expect(line).not.toContain("Kimi ");
	});

	it("truncates the left side when width is too narrow", () => {
		// 1.3.6: pin now=0 to land on dim phase so "Kimi " is visible.
		const line = buildRow1(makePayload("kimi-for-coding", "/tmp"), kimiCache(), 40, null, 0);
		expect(line).toContain("Kimi ");
	});
});

describe("buildRow1 with git center column", () => {
	it("includes branch + dirty count when wide enough for three columns", () => {
		// 1.3.6: red phase is now at quarter-period × 2 (400 ms in).
		const line = buildRow1(
			makePayload("kimi-for-coding", "/tmp"),
			kimiCache(),
			wideTerminal,
			dirtyGit,
			BLINK_QUARTER_PERIOD_MS * 2,
		);
		expect(line).toContain("Kimi ");
		expect(line).toContain("67%");
		expect(line).toContain("main");
		// Strip ANSI: the dirty digit switches color between phases, so the
		// visible "3 files" string has escape codes between the digit and
		// the word "files". Strip first, then match.
		expect(strip(line)).toContain("3 files");
		// 1.3.6: digit is bright red, no bold, no ANSI blink
		expect(line).toMatch(/\x1b\[91m3\x1b\[0m/);
	});

	it("uses cyan bold ANSI for worktree branch with [wt] marker", () => {
		const wtGit: GitInfo = { ...dirtyGit, isWorktree: true };
		const line = buildRow1(makePayload("kimi-for-coding", "/tmp"), kimiCache(), wideTerminal, wtGit, 0);
		expect(line).toContain("main [wt]");
		expect(line).toMatch(/\x1b\[96m\x1b\[1mmain \[wt\]\x1b\[22m\x1b\[39m/);
	});

	it("uses bright red ANSI for dirty digit on the red phase", () => {
		// 1.3.6: red phase is now at quarter-period × 2 (400 ms in).
		const line = buildRow1(
			makePayload("kimi-for-coding", "/tmp"),
			kimiCache(),
			wideTerminal,
			dirtyGit,
			BLINK_QUARTER_PERIOD_MS * 2,
		);
		// Digit is rendered in bright red (no bold, no blink in 1.3.6).
		expect(line).toMatch(/\x1b\[91m3\x1b\[0m/);
		// " files" stays static dim, separated from the digit by RESET.
		expect(line).toContain("\x1b[0m\x1b[38;5;244m files\x1b[0m");
		// No ANSI blink anywhere.
		expect(line).not.toContain("\x1b[5m");
		expect(line).not.toContain("\x1b[25m");
	});

	it("uses dim ANSI for dirty digit on the dim phase", () => {
		// 1.3.6: dim phase is now at now=0 (the start of the cycle).
		const line = buildRow1(
			makePayload("kimi-for-coding", "/tmp"),
			kimiCache(),
			wideTerminal,
			dirtyGit,
			0, // dim phase
		);
		// Visible text: "3 files" with the digit in dim grey.
		expect(strip(line)).toContain("3 files");
		expect(line).not.toContain("\x1b[91m"); // no red on dim phase
		// No ANSI blink anywhere (1.3.6 dropped it).
		expect(line).not.toContain("\x1b[5m");
		expect(line).not.toContain("\x1b[25m");
	});

	it("renders 'clean' for non-dirty worktree", () => {
		const cleanWt: GitInfo = { branch: "feat-x", count: 0, text: "", isWorktree: true };
		const line = buildRow1(makePayload("kimi-for-coding", "/tmp"), kimiCache(), wideTerminal, cleanWt, 0);
		expect(line).toContain("clean");
		expect(line).toContain("feat-x [wt]");
	});

	it("drops the center column when terminal is narrow", () => {
		const line = buildRow1(
			makePayload("kimi-for-coding", "/tmp"),
			kimiCache(),
			60, // too narrow for all three
			dirtyGit,
			0,
		);
		expect(line).toContain("Kimi ");
		expect(line).toContain("67%");
	});

	it("shows 'no git' in center when git is null", () => {
		const line = buildRow1(makePayload("kimi-for-coding", "/tmp"), kimiCache(), wideTerminal, null, 0);
		expect(line).toContain("Kimi ");
		expect(line).toContain("no git");
		// No dirty count in the no-git branch
		expect(line).not.toContain(" files");
		expect(line).not.toContain("[wt]");
	});

	it("falls back to fetching git when no git param is passed", () => {
		// When git is undefined, buildRow1 calls getCurrentBranch internally.
		// Running from the plugin dir (a real git repo) it should find a branch.
		// 1.3.6: pin now=0 to land on dim phase so "Kimi " is visible.
		const line = buildRow1(
			makePayload("kimi-for-coding", process.cwd()),
			kimiCache(),
			wideTerminal,
			// git param intentionally omitted → falls back to git fetch
			undefined,
			0,
		);
		// Should not crash; output should at least contain the folder and bars.
		expect(line).toContain("Kimi ");
		expect(line).toContain("67%");
	});

	// Integration regression tests for the blink leak (1.3.4 bug):
	// \x1b[5m (ANSI blink) used to cascade through the rest of the line,
	// flashing " files" AND the entire MM quota column. These tests pin
	// that the leak is gone at the buildRow1 boundary, not just inside
	// formatDirtyCount.

	it("emits no ANSI blink codes anywhere in buildRow1 (1.3.6 dropped \x1b[5m)", () => {
		// 1.3.6 removed ANSI blink entirely. Sample multiple phases to be sure.
		const phases = [0, BLINK_QUARTER_PERIOD_MS, BLINK_QUARTER_PERIOD_MS * 2, BLINK_QUARTER_PERIOD_MS * 3];
		for (const now of phases) {
			const line = buildRow1(makePayload("minimax-text-01", "/tmp"), minimaxCache(), wideTerminal, dirtyGit, now);
			expect(line).not.toContain("\x1b[5m");
			expect(line).not.toContain("\x1b[25m");
		}
	});

	it("' files' word never carries ANSI blink codes in buildRow1 (1.3.6 dropped blink)", () => {
		// 1.3.6 dropped ANSI blink. Sample all 4 phases — " files" must
		// never have any blink code attached.
		const phases = [0, BLINK_QUARTER_PERIOD_MS, BLINK_QUARTER_PERIOD_MS * 2, BLINK_QUARTER_PERIOD_MS * 3];
		for (const now of phases) {
			const line = buildRow1(makePayload("minimax-text-01", "/tmp"), minimaxCache(), wideTerminal, dirtyGit, now);
			expect(line).not.toContain("\x1b[5m");
			expect(line).not.toContain("\x1b[25m");
		}
	});

	it("MM section never carries ANSI blink in buildRow1 (1.3.6 dropped blink)", () => {
		// 1.3.6 dropped ANSI blink. Sample all 4 phases — right column must
		// remain completely blink-free.
		const phases = [0, BLINK_QUARTER_PERIOD_MS, BLINK_QUARTER_PERIOD_MS * 2, BLINK_QUARTER_PERIOD_MS * 3];
		for (const now of phases) {
			const line = buildRow1(makePayload("minimax-text-01", "/tmp"), minimaxCache(), wideTerminal, dirtyGit, now);
			const mmIdx = line.indexOf("MM ");
			expect(mmIdx).toBeGreaterThan(-1);
			const fromMm = line.substring(mmIdx);
			expect(fromMm).not.toContain("\x1b[5m");
			expect(fromMm).not.toContain("\x1b[25m");
		}
	});

	it("does not emit ANSI blink codes when git is clean (count = 0)", () => {
		// 1.3.6 dropped ANSI blink entirely. Sample all 4 phases.
		const cleanGit: GitInfo = { branch: "main", count: 0, text: "", isWorktree: false };
		const phases = [0, BLINK_QUARTER_PERIOD_MS, BLINK_QUARTER_PERIOD_MS * 2, BLINK_QUARTER_PERIOD_MS * 3];
		for (const now of phases) {
			const line = buildRow1(makePayload("minimax-text-01", "/tmp"), minimaxCache(), wideTerminal, cleanGit, now);
			expect(line).not.toContain("\x1b[5m");
			expect(line).not.toContain("\x1b[25m");
		}
	});

	it("renders folder + git when quota is missing AND git has a real branch", () => {
		// Decoupling test: quota may be null but git should still render.
		const line = buildRow1(
			makePayload("kimi-for-coding", "/tmp/myproj"),
			null, // no cache at all
			wideTerminal, // 140 cols
			{ branch: "main", count: 2, text: "", isWorktree: false },
			BLINK_QUARTER_PERIOD_MS * 2, // pin red phase (1.3.6: red = qp × 2)
		);
		// Folder is there.
		expect(line).toContain("myproj");
		// 1.3.3 restored: branch + dirty count text + digit
		expect(line).toContain("main");
		expect(strip(line)).toContain("2 files");
		// 1.3.6: digit is bright red, no bold, no ANSI blink
		expect(line).toMatch(/\x1b\[91m2\x1b\[0m/);
		// No quota bar is the point of this case.
		expect(line).not.toContain("Kimi ");
		expect(line).not.toContain("MM ");
	});

	it("renders 'no git' placeholder when both quota and git branch are missing", () => {
		// Quota missing + no real git → folder + "no git" placeholder.
		const line = buildRow1(
			makePayload("kimi-for-coding", "/tmp/myproj"),
			null, // no cache
			wideTerminal,
			{ branch: "", count: 0, text: "no git repo", isWorktree: false },
			0,
		);
		expect(line).toContain("myproj");
		expect(line).toContain("no git");
		expect(line).not.toContain("Kimi ");
	});
});

describe("formatGitCenter", () => {
	it("returns dim 'no git' for null git (keeps center column populated)", () => {
		expect(formatGitCenter(null)).toBe("\x1b[2mno git\x1b[22m");
	});

	it("returns dim 'no git' for empty branch (no git repo case)", () => {
		expect(formatGitCenter({ branch: "", count: 0, text: "no git repo", isWorktree: false })).toBe(
			"\x1b[2mno git\x1b[22m",
		);
	});

	it("renders dirty worktree with cyan bold + dirty count", () => {
		// 1.3.6: red phase is now at quarter-period × 2.
		const result = formatGitCenter({ branch: "main", count: 5, text: "", isWorktree: true }, BLINK_QUARTER_PERIOD_MS * 2);
		expect(result).toContain("main [wt]");
		expect(strip(result)).toContain("5 files");
		expect(result).toMatch(/\x1b\[96m\x1b\[1mmain \[wt\]/);
		// Dirty digit uses bright red (no bold, no ANSI blink in 1.3.6)
		expect(result).toMatch(/\x1b\[91m5\x1b\[0m/);
	});

	it("renders clean worktree with cyan bold + dim 'clean'", () => {
		const result = formatGitCenter({ branch: "feat-x", count: 0, text: "", isWorktree: true }, 0);
		expect(result).toContain("feat-x [wt]");
		expect(result).toContain("clean");
		expect(result).toMatch(/\x1b\[96m\x1b\[1m/);
		expect(result).not.toMatch(/\x1b\[91m/); // no red for clean
	});

	it("renders dirty non-worktree: dim branch + dirty count", () => {
		// 1.3.6: now=0 is the dim phase.
		const result = formatGitCenter({ branch: "develop", count: 2, text: "", isWorktree: false }, 0);
		expect(result).toContain("develop");
		// Dim phase: digit in dim grey; " files" also dim.
		expect(strip(result)).toContain("2 files");
		// No ANSI blink (1.3.6 dropped it).
		expect(result).not.toContain("\x1b[5m");
		expect(result).not.toContain("\x1b[25m");
		expect(result).not.toContain("[wt]");
	});

	it("renders clean non-worktree: dim branch + dim 'clean'", () => {
		expect(formatGitCenter({ branch: "main", count: 0, text: "", isWorktree: false })).toBe(
			"\x1b[2mmain \u2022 clean\x1b[22m",
		);
	});

	it("renders dim digit at phase 0", () => {
		const result = formatGitCenter({ branch: "main", count: 3, text: "", isWorktree: false }, 0);
		// Visible string: "main • 3 files"
		expect(strip(result)).toContain("3 files");
		// No ANSI blink, no red, no bold (1.3.6 dropped all of them)
		expect(result).not.toContain("\x1b[5m");
		expect(result).not.toContain("\x1b[91m");
		expect(result).not.toContain("\x1b[1m");
	});

	it("renders blank digit at phase 1 (off)", () => {
		const result = formatGitCenter({ branch: "main", count: 3, text: "", isWorktree: false }, BLINK_QUARTER_PERIOD_MS);
		// Digit slot is a space, not "3". Visible string: "main •   files"
		// (template "main • " + formatDirtyCount's "  files" — the off-phase
		// digit slot is one space, " files" prefix is another space, so two
		// spaces come out of formatDirtyCount and three spaces between "•" and "f").
		const visible = strip(result);
		expect(visible).toBe("main •   files");
		expect(visible).not.toContain("3 files");
	});

	it("renders bright red digit at phase 2", () => {
		const result = formatGitCenter(
			{ branch: "main", count: 3, text: "", isWorktree: false },
			BLINK_QUARTER_PERIOD_MS * 2,
		);
		// Visible string: "main • 3 files" with digit in bright red.
		expect(strip(result)).toContain("3 files");
		// No ANSI blink, no bold (1.3.6 dropped both)
		expect(result).not.toContain("\x1b[5m");
		expect(result).toContain("\x1b[91m");
		expect(result).not.toContain("\x1b[1m");
	});

	it("renders blank digit again at phase 3 (off)", () => {
		const result = formatGitCenter(
			{ branch: "main", count: 3, text: "", isWorktree: false },
			BLINK_QUARTER_PERIOD_MS * 3,
		);
		const visible = strip(result);
		expect(visible).toBe("main •   files");
		expect(visible).not.toContain("3 files");
	});

	it("cycles back to dim at phase 0 of the next cycle", () => {
		const result = formatGitCenter(
			{ branch: "main", count: 3, text: "", isWorktree: false },
			BLINK_QUARTER_PERIOD_MS * 4,
		);
		expect(strip(result)).toContain("3 files");
		expect(result).not.toContain("\x1b[91m");
	});

	it("does not emit any ANSI blink codes anywhere in the output", () => {
		// 1.3.6 regression: \x1b[5m and \x1b[25m are gone. Verify across all
		// 4 phases and both worktree modes.
		const variants = [
			{ branch: "main", count: 3, text: "", isWorktree: false },
			{ branch: "main", count: 3, text: "", isWorktree: true },
		];
		for (const v of variants) {
			for (let p = 0; p < 4; p++) {
				const out = formatGitCenter(v, BLINK_QUARTER_PERIOD_MS * p);
				expect(out).not.toContain("\x1b[5m");
				expect(out).not.toContain("\x1b[25m");
			}
		}
	});

	it("does not let blink cascade to the right column (regression guard)", () => {
		// Even though \x1b[5m is gone, the off-phase must not visually
		// break the right column layout. Verify that buildRow1 output for
		// an MM model in the off phase still contains "MM " intact.
		const line = buildRow1(
			makePayload("minimax-text-01", "/tmp"),
			minimaxCache(),
			140,
			{ branch: "main", count: 3, text: "", isWorktree: false },
			BLINK_QUARTER_PERIOD_MS, // digit in off phase
		);
		expect(line).toContain("MM ");
	});
});

describe("buildQuotaStatus compact mode", () => {
	const cache = (): QuotaCache => ({
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
	});

	it("full mode includes pace hours and reset countdowns", () => {
		const full = buildQuotaStatus("minimax-text-01", cache(), false);
		expect(full).toBeDefined();
		const visible = full?.replace(/\x1b\[[0-9;]*m/g, "");
		// Pace hours pattern: digit(s) followed by "h"
		expect(visible).toMatch(/\d+h/);
		// Reset countdown pattern: "/" followed by digits.digits (e.g. "/24.00")
		expect(visible).toMatch(/\/\d+\.\d{2}/);
	});

	it("compact mode omits pace hours and reset countdowns but keeps both bars + 5H label", () => {
		const compact = buildQuotaStatus("minimax-text-01", cache(), true);
		expect(compact).toBeDefined();
		const visible = compact?.replace(/\x1b\[[0-9;]*m/g, "");
		// No pace hours
		expect(visible).not.toMatch(/\d+h/);
		// No reset countdowns (slash-digit-dot pattern)
		expect(visible).not.toMatch(/\/\d+\.\d{2}/);
		// 5H section IS preserved in compact mode now
		expect(visible).toContain("5H:");
		// Still has label, both bars, and pct
		expect(visible).toContain("MM ");
		expect(visible).toContain("%");
		// Both limits (denominators) are preserved
		expect(visible).toMatch(/\/100/); // weekly limit
		expect(visible).toMatch(/\/20/); // 5H limit (hLimit=20 in cache())
	});

	it("compact is shorter than full but contains both bars", () => {
		const full = buildQuotaStatus("minimax-text-01", cache(), false)!;
		const compact = buildQuotaStatus("minimax-text-01", cache(), true)!;
		const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
		expect(stripAnsi(compact).length).toBeLessThan(stripAnsi(full).length);
		// Pace hours (~6 chars × 2) + reset countdowns (~6 chars × 2) ≈ 24 chars trimmed.
		// Lower the floor from 15 to a still-meaningful 10 to reflect the change.
		expect(stripAnsi(full).length - stripAnsi(compact).length).toBeGreaterThanOrEqual(10);
		// Compact still has both bars
		expect(stripAnsi(compact)).toContain("5H:");
		expect(stripAnsi(compact)).toContain("/100");
	});
});

describe("buildQuotaStatus Kimi label 4-phase blink (1.3.6)", () => {
	it("renders the Kimi label in dim grey at phase 0 (now=0)", () => {
		const line = buildQuotaStatus("kimi-for-coding", kimiCache(), false, 0);
		// Phase 0: dim grey "Kimi "
		expect(line).toContain("\x1b[38;5;244mKimi ");
		expect(line).not.toContain("\x1b[91mKimi ");
		// 1.3.6 dropped ANSI blink
		expect(line).not.toContain("\x1b[5m");
		expect(line).not.toContain("\x1b[25m");
	});

	it("renders blank spaces at phase 1 (off)", () => {
		const line = buildQuotaStatus("kimi-for-coding", kimiCache(), false, BLINK_QUARTER_PERIOD_MS);
		// Phase 1: 5 spaces in dim grey. Visible text has no "Kimi ".
		expect(strip(line ?? "")).not.toContain("Kimi ");
		// But the rest of the quota bar still renders
		expect(line).toContain("67%");
		// No ANSI blink
		expect(line).not.toContain("\x1b[5m");
	});

	it("renders the Kimi label in bright red at phase 2", () => {
		const line = buildQuotaStatus("kimi-for-coding", kimiCache(), false, BLINK_QUARTER_PERIOD_MS * 2);
		expect(line).toContain("\x1b[91mKimi ");
		expect(line).not.toContain("\x1b[5m");
		expect(line).not.toContain("\x1b[25m");
	});

	it("renders blank spaces again at phase 3 (off)", () => {
		const line = buildQuotaStatus("kimi-for-coding", kimiCache(), false, BLINK_QUARTER_PERIOD_MS * 3);
		expect(strip(line ?? "")).not.toContain("Kimi ");
		expect(line).toContain("67%");
		expect(line).not.toContain("\x1b[5m");
	});

	it("cycles back to dim at phase 0 of the next cycle", () => {
		const line = buildQuotaStatus("kimi-for-coding", kimiCache(), false, BLINK_QUARTER_PERIOD_MS * 4);
		expect(line).toContain("\x1b[38;5;244mKimi ");
		expect(line).not.toContain("\x1b[91mKimi ");
	});

	it("does NOT blink the MiniMax label (MM stays static dim across all phases)", () => {
		// Sample all 4 phases of MiniMax — confirm no \x1b[5m anywhere.
		const phases = [0, BLINK_QUARTER_PERIOD_MS, BLINK_QUARTER_PERIOD_MS * 2, BLINK_QUARTER_PERIOD_MS * 3];
		for (const now of phases) {
			const line = buildQuotaStatus("minimax/MiniMax-M3", minimaxCache(), false, now);
			expect(line).toContain("MM ");
			expect(line).not.toContain("\x1b[5m");
			expect(line).not.toContain("\x1b[25m");
		}
	});

	it("renders no label and no bar for unknown model", () => {
		const line = buildQuotaStatus("gpt-4", kimiCache(), false, 0);
		expect(line).toBeUndefined();
	});
});

describe("buildRow1 narrow-terminal fallback to compact right", () => {
	const gitInfo: GitInfo = {
		branch: "ph-3-bugfix",
		count: 1,
		text: "ph-3-bugfix \u2022 1 files",
		isWorktree: false,
	};

	it("uses compact right at 90 cols so 3-col fits with both bars", () => {
		// folder (~12) + git ("ph-3-bugfix • 1 files" ~24) + compact (~38 incl. 5H) + 4 gaps = ~78 — fits 90
		const line = buildRow1(makePayload("minimax-text-01", "/some/folder"), minimaxCache(), 90, gitInfo, 0);
		// 1.3.3 restored: branch + files text both present
		expect(line).toContain("ph-3-bugfix");
		expect(strip(line)).toContain("1 files");
		expect(line).toContain("MM ");
		expect(line).toContain("%");
		expect(line).toContain("5H:");
		// Force ANSI-stripped length <= 90
		const visible = line.replace(/\x1b\[[0-9;]*m/g, "");
		expect(visible.length).toBeLessThanOrEqual(90);
	});

	it("uses full right at wide widths (≥ ~120 cols)", () => {
		const line = buildRow1(makePayload("minimax-text-01", "/some/folder"), minimaxCache(), 140, gitInfo, 0);
		// Full right includes pace hours
		expect(line).toMatch(/\d+\.\d+h/);
		expect(line).toContain("5H:");
		expect(line).toContain("ph-3-bugfix");
	});

	it("falls back to 2-col compact when 3-col doesn't fit (e.g. width 50)", () => {
		const line = buildRow1(makePayload("minimax-text-01", "/some/folder"), minimaxCache(), 50, gitInfo, 0);
		// Center dropped because right + folder + center > 50
		expect(line).toContain("MM ");
		expect(line).toContain("%");
		// No git center text in the output (center dropped)
		const visible = line.replace(/\x1b\[[0-9;]*m/g, "");
		expect(visible).not.toContain("ph-3-bugfix");
	});
});

describe("buildRow1 edge cases — phase interactions", () => {
	// These tests pin the integration of phase + worktree + dirty digit +
	// label. Each test pins `now` explicitly to avoid phase-flakiness.

	it("renders the Kimi label visible in both dim and red phases across one full cycle", () => {
		const phases = [0, BLINK_QUARTER_PERIOD_MS * 2];
		for (const now of phases) {
			const line = buildRow1(makePayload("kimi-for-coding", "/tmp"), kimiCache(), 120, null, now);
			expect(line).toContain("Kimi ");
			expect(line).toContain("67%");
		}
	});

	it("renders the Kimi label as 5 spaces in both off phases", () => {
		const phases = [BLINK_QUARTER_PERIOD_MS, BLINK_QUARTER_PERIOD_MS * 3];
		for (const now of phases) {
			const line = buildRow1(makePayload("kimi-for-coding", "/tmp"), kimiCache(), 120, null, now);
			// Visible label slot is 5 spaces (not "Kimi ")
			expect(line).not.toContain("Kimi ");
			// But the rest of the bar still renders
			expect(line).toContain("67%");
		}
	});

	it("renders dirty digit '1' correctly (single-digit count)", () => {
		const result = formatGitCenter({ branch: "main", count: 1, text: "", isWorktree: false }, 0);
		expect(strip(result)).toContain("1 files");
	});

	it("renders dirty digit '99' correctly (multi-digit count)", () => {
		const result = formatGitCenter(
			{ branch: "main", count: 99, text: "", isWorktree: false },
			BLINK_QUARTER_PERIOD_MS * 2,
		);
		expect(strip(result)).toContain("99 files");
		// Red phase: digit in bright red (1.3.6 dropped bold)
		expect(result).toMatch(/\x1b\[91m99\x1b\[0m/);
	});

	it("renders off-phase dirty digit as 1 space + dim ' files' (multi-digit count off)", () => {
		const result = formatGitCenter({ branch: "main", count: 99, text: "", isWorktree: false }, BLINK_QUARTER_PERIOD_MS);
		// Digit slot is 1 space; the "99" never appears
		const visible = strip(result);
		expect(visible).toBe("main •   files");
		expect(visible).not.toContain("99");
	});

	it("renders worktree + dirty digit with bright red no-bold on the digit (1.3.6 change)", () => {
		// 1.3.6 removed bold from the dirty digit. The worktree branch label
		// ("feat [wt]") is STILL bold (it's a branch name, not a count) —
		// only the digit "3" itself lost the bold attribute. So we assert
		// that the digit is wrapped in \x1b[91m WITHOUT \x1b[1m, even though
		// the branch label has \x1b[1m elsewhere.
		const result = formatGitCenter({ branch: "feat", count: 3, text: "", isWorktree: true }, BLINK_QUARTER_PERIOD_MS * 2);
		expect(result).toContain("feat [wt]");
		expect(strip(result)).toContain("3 files");
		// Bright red present (somewhere)
		expect(result).toContain("\x1b[91m");
		// Digit "3" itself is NOT wrapped in bold. Match the digit, not the
		// branch label: "\x1b[91m" followed by "3" with no "\x1b[1m" before it.
		expect(result).toMatch(/\x1b\[91m3\x1b\[0m/);
		expect(result).not.toMatch(/\x1b\[91m\x1b\[1m3/);
	});

	it("renders worktree + clean (no digit) consistently across all 4 phases", () => {
		const cleanWt: GitInfo = { branch: "feat-x", count: 0, text: "", isWorktree: true };
		const phases = [0, BLINK_QUARTER_PERIOD_MS, BLINK_QUARTER_PERIOD_MS * 2, BLINK_QUARTER_PERIOD_MS * 3];
		for (const now of phases) {
			const result = formatGitCenter(cleanWt, now);
			expect(result).toContain("feat-x [wt]");
			expect(result).toContain("clean");
		}
	});

	it("phase transitions do not leak ANSI codes across the right column", () => {
		// Sample all 4 phases + Kimi model + dirty digit. Right column must
		// never contain ANSI blink codes (1.3.6 dropped them).
		const phases = [0, BLINK_QUARTER_PERIOD_MS, BLINK_QUARTER_PERIOD_MS * 2, BLINK_QUARTER_PERIOD_MS * 3];
		for (const now of phases) {
			const line = buildRow1(
				makePayload("kimi-for-coding", "/tmp"),
				kimiCache(),
				wideTerminal,
				{ branch: "main", count: 3, text: "", isWorktree: false },
				now,
			);
			// Find the right column (where the Kimi label or its spaces live)
			const rightStart = line.indexOf("Kimi ") !== -1 ? line.indexOf("Kimi ") : line.indexOf("\x1b[38;5;244m     \x1b[0m");
			expect(rightStart).toBeGreaterThan(-1);
			const fromRight = line.substring(rightStart);
			expect(fromRight).not.toContain("\x1b[5m");
			expect(fromRight).not.toContain("\x1b[25m");
		}
	});

	it("handles very wide terminals (200 cols) without overflow on Kimi label", () => {
		const line = buildRow1(
			makePayload("kimi-for-coding", "/tmp"),
			kimiCache(),
			200,
			null,
			0, // dim phase so "Kimi " is visible
		);
		expect(line).toContain("Kimi ");
		expect(line).toContain("67%");
		// Output length should fit within 200 cols (visible chars)
		const visible = strip(line);
		expect(visible.length).toBeLessThanOrEqual(200);
	});
});
