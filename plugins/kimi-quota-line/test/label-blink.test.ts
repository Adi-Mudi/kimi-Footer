import { describe, expect, it } from "vitest";
import {
	BLINK_QUARTER_PERIOD_MS,
	formatProviderLabel,
	formatWorktreeMarker,
	pickBlinkPhase,
} from "../src/label-blink.js";

const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");
const DIM = "\x1b[38;5;244m";
const RED = "\x1b[91m";
const RESET = "\x1b[0m";
const Q = BLINK_QUARTER_PERIOD_MS;

describe("BLINK_QUARTER_PERIOD_MS", () => {
	it("is 150 ms", () => {
		expect(BLINK_QUARTER_PERIOD_MS).toBe(150);
	});
});

describe("pickBlinkPhase", () => {
	it("cycles dim → off → red → off", () => {
		expect(pickBlinkPhase(0)).toBe("dim");
		expect(pickBlinkPhase(Q)).toBe("off");
		expect(pickBlinkPhase(Q * 2)).toBe("red");
		expect(pickBlinkPhase(Q * 3)).toBe("off");
		expect(pickBlinkPhase(Q * 4)).toBe("dim");
	});
});

describe("formatProviderLabel", () => {
	it("pads Kimi to width 4", () => {
		expect(strip(formatProviderLabel("Kimi", 0))).toBe("Kimi");
	});

	it("pads MM to width 4 with trailing spaces", () => {
		expect(strip(formatProviderLabel("MM", 0))).toBe("MM  ");
	});

	it("pads OCG to width 4", () => {
		expect(strip(formatProviderLabel("OCG", 0))).toBe("OCG ");
	});

	it("pads OR to width 4", () => {
		expect(strip(formatProviderLabel("OR", 0))).toBe("OR  ");
	});

	it("pads OR2 to width 4", () => {
		expect(strip(formatProviderLabel("OR2", 0))).toBe("OR2 ");
	});

	it("pads CP to width 4", () => {
		expect(strip(formatProviderLabel("CP", 0))).toBe("CP  ");
	});

	it("Kimi blinks: dim at phase 0", () => {
		expect(formatProviderLabel("Kimi", 0)).toBe(`${DIM}Kimi${RESET}`);
	});

	it("Kimi blinks: off at phase 1 (4 spaces)", () => {
		expect(formatProviderLabel("Kimi", Q)).toBe(`${DIM}    ${RESET}`);
		expect(strip(formatProviderLabel("Kimi", Q))).not.toContain("Kimi");
	});

	it("Kimi blinks: red at phase 2", () => {
		expect(formatProviderLabel("Kimi", Q * 2)).toBe(`${RED}Kimi${RESET}`);
	});

	it("Kimi blinks: off at phase 3", () => {
		expect(formatProviderLabel("Kimi", Q * 3)).toBe(`${DIM}    ${RESET}`);
	});

	it("non-Kimi labels stay static dim across phases", () => {
		for (const short of ["MM", "OCG", "OR", "OR2", "CP"]) {
			const a = formatProviderLabel(short, 0);
			const b = formatProviderLabel(short, Q);
			const c = formatProviderLabel(short, Q * 2);
			expect(a).toBe(b);
			expect(b).toBe(c);
			expect(a).toContain(DIM);
			expect(a).not.toContain(RED);
		}
	});

	it("preserves visible width 4 across Kimi phases", () => {
		for (const now of [0, Q, Q * 2, Q * 3]) {
			expect(strip(formatProviderLabel("Kimi", now))).toHaveLength(4);
		}
	});

	it("never uses ANSI slow blink", () => {
		for (const now of [0, Q, Q * 2, Q * 3]) {
			expect(formatProviderLabel("Kimi", now)).not.toContain("\x1b[5m");
		}
	});
});

describe("formatWorktreeMarker", () => {
	it("emits cyan bold [wt] at dim phase", () => {
		expect(formatWorktreeMarker(0)).toBe("\x1b[96m\x1b[1m[wt]\x1b[22m\x1b[39m");
	});

	it("keeps visible width 4 in every phase", () => {
		for (const now of [0, Q, Q * 2, Q * 3]) {
			expect(strip(formatWorktreeMarker(now))).toHaveLength(4);
		}
	});
});
