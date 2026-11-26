import { describe, expect, it } from "vitest";
import {
	formatRemaining,
	hoursUntilReset,
	monthlyPaceColor,
	sessionPaceColor,
	statusFg,
	weeklyPaceColor,
} from "../src/helpers.js";

describe("formatRemaining", () => {
	it("returns ? for invalid input", () => {
		expect(formatRemaining(undefined)).toBe("?");
		expect(formatRemaining("not-a-date")).toBe("?");
	});

	it("returns 0.00 for past timestamps", () => {
		expect(formatRemaining("2000-01-01T00:00:00Z")).toBe("0.00");
	});
});

describe("statusFg", () => {
	it("emits dim theme #6e7681 for success and truecolor ANSI + reset for warning and error", () => {
		expect(statusFg("success", "x")).toBe("\x1b[38;2;110;118;129mx\x1b[39m");
		expect(statusFg("warning", "x")).toBe("\x1b[38;2;224;168;0mx\x1b[39m");
		expect(statusFg("error", "x")).toBe("\x1b[38;2;220;53;69mx\x1b[39m");
	});
});

describe("weeklyPaceColor", () => {
	it("uses simple percent inside grace period", () => {
		const now = Date.now();
		const soon = new Date(now + 30 * 60 * 1000).toISOString();
		expect(weeklyPaceColor(10, 100, soon)).toBe("success");
		expect(weeklyPaceColor(85, 100, soon)).toBe("warning");
		expect(weeklyPaceColor(100, 100, soon)).toBe("error");
	});
	it("returns error at 100% without resetAt", () => {
		expect(weeklyPaceColor(100, 100)).toBe("error");
		expect(weeklyPaceColor(120, 100)).toBe("error");
	});

	it("never demotes 100% even when elapsed is inside grace or clamped", () => {
		const farFuture = new Date(Date.now() + 400 * 60 * 60 * 1000).toISOString();
		expect(weeklyPaceColor(100, 100, farFuture)).toBe("error");
	});

	it("clamps elapsed hours into [0, 168] for far-future resetAt", () => {
		const farFuture = new Date(Date.now() + 400 * 60 * 60 * 1000).toISOString();
		expect(weeklyPaceColor(10, 100, farFuture)).toBe("success");
		expect(weeklyPaceColor(85, 100, farFuture)).toBe("warning");
	});
});

describe("monthlyPaceColor", () => {
	it("uses simple percent inside grace period", () => {
		const soon = new Date(Date.now() + 30 * 60 * 1000).toISOString();
		expect(monthlyPaceColor(10, 100, soon)).toBe("success");
		expect(monthlyPaceColor(85, 100, soon)).toBe("warning");
		expect(monthlyPaceColor(100, 100, soon)).toBe("error");
	});

	it("returns success for zero limit", () => {
		expect(monthlyPaceColor(0, 0)).toBe("success");
	});

	it("returns error at 100% without resetAt and clamps far-future elapsed hours", () => {
		expect(monthlyPaceColor(100, 100)).toBe("error");
		const farFuture = new Date(Date.now() + 900 * 60 * 60 * 1000).toISOString();
		expect(monthlyPaceColor(10, 100, farFuture)).toBe("success");
		expect(monthlyPaceColor(85, 100, farFuture)).toBe("warning");
		expect(monthlyPaceColor(100, 100, farFuture)).toBe("error");
	});
});

describe("sessionPaceColor", () => {
	it("returns success for zero limit", () => {
		expect(sessionPaceColor(0, 0)).toBe("success");
	});

	it("colors by percent when window is in grace", () => {
		const soon = new Date(Date.now() + 60 * 1000).toISOString();
		expect(sessionPaceColor(10, 100, soon)).toBe("success");
		expect(sessionPaceColor(85, 100, soon)).toBe("warning");
		expect(sessionPaceColor(100, 100, soon)).toBe("error");
	});

	it("returns error at 100% without resetAt and clamps far-future elapsed hours", () => {
		expect(sessionPaceColor(100, 100)).toBe("error");
		const farFuture = new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString();
		expect(sessionPaceColor(10, 100, farFuture)).toBe("success");
		expect(sessionPaceColor(85, 100, farFuture)).toBe("warning");
		expect(sessionPaceColor(100, 100, farFuture)).toBe("error");
	});
});

describe("hoursUntilReset", () => {
	it("returns 0 for past timestamps", () => {
		expect(hoursUntilReset("2000-01-01T00:00:00Z")).toBe(0);
		expect(hoursUntilReset(undefined)).toBe(0);
	});

	it("returns positive hours for valid future ISO timestamps", () => {
		const h = hoursUntilReset(new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString());
		expect(h).toBeGreaterThan(1.5);
		expect(h).toBeLessThanOrEqual(2.1);
	});

	it("parses date-only YYYY-MM-DD strings", () => {
		const futureDate = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
		const h = hoursUntilReset(futureDate);
		expect(h).toBeGreaterThan(40);
		expect(h).toBeLessThanOrEqual(72.1);
	});

	it("parses epoch seconds and milliseconds (number and numeric string)", () => {
		const targetMs = Date.now() + 3 * 60 * 60 * 1000;
		const sec = Math.floor(targetMs / 1000);
		expect(hoursUntilReset(sec)).toBeGreaterThan(2.9);
		expect(hoursUntilReset(String(sec))).toBeGreaterThan(2.9);
		expect(hoursUntilReset(targetMs)).toBeGreaterThan(2.9);
		expect(hoursUntilReset(String(targetMs))).toBeGreaterThan(2.9);
		expect(hoursUntilReset(targetMs)).toBeLessThanOrEqual(3.1);
	});
});
