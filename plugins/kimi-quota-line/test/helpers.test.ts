/**
 * Unit tests for src/helpers.ts. Pure functions — no I/O, no network, fast.
 * Reuses pi-footer's expected values (format and colors are locked).
 */

import { describe, expect, it } from "vitest";

import {
	formatPaceHours,
	formatRemaining,
	formatTokens,
	hoursUntilReset,
	pct,
	sessionPaceColor,
	statusFg,
	usageColor,
	vbar,
	weeklyPaceColor,
} from "../src/helpers.js";

describe("formatTokens", () => {
	it("renders small counts as plain numbers", () => {
		expect(formatTokens(0)).toBe("0");
		expect(formatTokens(1)).toBe("1");
		expect(formatTokens(999)).toBe("999");
	});

	it("uses one decimal for 1k–9.9k", () => {
		expect(formatTokens(1000)).toBe("1.0k");
		expect(formatTokens(1500)).toBe("1.5k");
		expect(formatTokens(9999)).toBe("10.0k");
	});

	it("rounds to whole k for 10k–999k", () => {
		expect(formatTokens(10000)).toBe("10k");
		expect(formatTokens(999000)).toBe("999k");
	});

	it("uses one decimal for 1M–9.9M", () => {
		expect(formatTokens(1500000)).toBe("1.5M");
		expect(formatTokens(9999999)).toBe("10.0M");
	});

	it("rounds to whole M for 10M+", () => {
		expect(formatTokens(10000000)).toBe("10M");
		expect(formatTokens(123456789)).toBe("123M");
	});
});

describe("pct", () => {
	it("rounds to nearest whole percent", () => {
		expect(pct(0, 100)).toBe("0%");
		expect(pct(50, 100)).toBe("50%");
		expect(pct(67, 100)).toBe("67%");
		expect(pct(68, 100)).toBe("68%"); // pi-footer reference value
		expect(pct(99, 100)).toBe("99%");
		expect(pct(100, 100)).toBe("100%");
	});

	it("returns 0% for zero limit", () => {
		expect(pct(50, 0)).toBe("0%");
	});
});

describe("vbar", () => {
	it("renders zero usage as ten empties", () => {
		expect(vbar(0, 100)).toBe("▯▯▯▯▯▯▯▯▯▯");
	});

	it("renders full usage as ten filled", () => {
		expect(vbar(100, 100)).toBe("▮▮▮▮▮▮▮▮▮▮");
	});

	it("renders 68% as 7 filled + 3 empty (pi-footer reference)", () => {
		expect(vbar(68, 100)).toBe("▮▮▮▮▮▮▮▯▯▯");
	});

	it("returns ten empties for zero limit", () => {
		expect(vbar(50, 0)).toBe("▯▯▯▯▯▯▯▯▯▯");
	});
});

describe("formatPaceHours", () => {
	it("renders hours + minutes, negative with a leading minus", () => {
		expect(formatPaceHours(14.2)).toBe("14h12m");
		expect(formatPaceHours(-14.2)).toBe("-14h12m");
		expect(formatPaceHours(0.5)).toBe("0h30m");
		expect(formatPaceHours(9.924)).toBe("9h55m");
		expect(formatPaceHours(-0.7903)).toBe("-0h47m");
		expect(formatPaceHours(108.7)).toBe("108h42m");
	});

	it("collapses near-zero to 0 (no -0h00m artifact)", () => {
		expect(formatPaceHours(0)).toBe("0h00m");
		expect(formatPaceHours(0.04)).toBe("0h00m");
		expect(formatPaceHours(-0.04)).toBe("0h00m");
	});

	it("rounds whole minutes first so the minute field never reaches 60", () => {
		expect(formatPaceHours(1.999)).toBe("2h00m");
		expect(formatPaceHours(0.9999)).toBe("1h00m");
		expect(formatPaceHours(-1.999)).toBe("-2h00m");
	});
});

describe("formatRemaining", () => {
	it("returns ? for invalid input", () => {
		expect(formatRemaining(undefined)).toBe("?");
		expect(formatRemaining("not-a-date")).toBe("?");
	});

	it("returns 0.00 for past timestamps", () => {
		expect(formatRemaining(new Date(Date.now() - 1000).toISOString())).toBe("0.00");
	});
});

describe("statusFg", () => {
	it("emits truecolor ANSI + reset for each status", () => {
		expect(statusFg("success", "OK")).toBe("\x1b[38;2;40;167;69mOK\x1b[39m");
		expect(statusFg("warning", "WARN")).toBe("\x1b[38;2;224;168;0mWARN\x1b[39m");
		expect(statusFg("error", "ERR")).toBe("\x1b[38;2;220;53;69mERR\x1b[39m");
	});
});

describe("weeklyPaceColor", () => {
	it("uses simple percent inside grace period", () => {
		const farFuture = new Date(Date.now() + 167 * 3600 * 1000).toISOString();
		expect(weeklyPaceColor(0, 100, farFuture)).toBe("success");
		expect(weeklyPaceColor(85, 100, farFuture)).toBe("warning");
		expect(weeklyPaceColor(110, 100, farFuture)).toBe("error");
	});
});

describe("sessionPaceColor", () => {
	it("returns success for zero limit", () => {
		expect(sessionPaceColor(50, 0)).toBe("success");
	});
});

describe("usageColor", () => {
	it("uses strict > thresholds (0.5 and 0.8 stay success/warning)", () => {
		expect(usageColor(40, 100)).toBe("success");
		expect(usageColor(50, 100)).toBe("success");
		expect(usageColor(51, 100)).toBe("warning");
		expect(usageColor(80, 100)).toBe("warning");
		expect(usageColor(81, 100)).toBe("error");
		expect(usageColor(100, 100)).toBe("error");
	});
});

describe("hoursUntilReset", () => {
	it("returns 0 for past timestamps", () => {
		expect(hoursUntilReset(new Date(Date.now() - 60000).toISOString())).toBe(0);
	});

	it("returns positive hours for valid future timestamps", () => {
		const future = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
		const h = hoursUntilReset(future);
		expect(h).toBeGreaterThan(1.99);
		expect(h).toBeLessThan(2.01);
	});
});
