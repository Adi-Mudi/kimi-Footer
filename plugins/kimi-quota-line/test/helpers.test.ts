import { describe, expect, it } from "vitest";
import {
	formatRemaining,
	hoursUntilReset,
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
	it("emits truecolor ANSI + reset for each status", () => {
		expect(statusFg("success", "x")).toBe("\x1b[38;2;40;167;69mx\x1b[39m");
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
});

describe("hoursUntilReset", () => {
	it("returns 0 for past timestamps", () => {
		expect(hoursUntilReset("2000-01-01T00:00:00Z")).toBe(0);
		expect(hoursUntilReset(undefined)).toBe(0);
	});

	it("returns positive hours for valid future timestamps", () => {
		const h = hoursUntilReset(new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString());
		expect(h).toBeGreaterThan(1.5);
		expect(h).toBeLessThanOrEqual(2.1);
	});
});
