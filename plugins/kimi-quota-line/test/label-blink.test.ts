import { describe, expect, it } from "vitest";
import { BLINK_QUARTER_PERIOD_MS, formatKimiLabel, pickBlinkPhase } from "../src/label-blink.js";

describe("BLINK_QUARTER_PERIOD_MS", () => {
	it("is 150 ms (4 phases × 150 ms = 600 ms full cycle)", () => {
		expect(BLINK_QUARTER_PERIOD_MS).toBe(150);
	});
});

describe("pickBlinkPhase", () => {
	it("returns 'dim' at now=0", () => {
		expect(pickBlinkPhase(0)).toBe("dim");
	});

	it("returns 'off' at the first quarter boundary", () => {
		expect(pickBlinkPhase(BLINK_QUARTER_PERIOD_MS)).toBe("off");
	});

	it("returns 'red' at the half-cycle boundary", () => {
		expect(pickBlinkPhase(BLINK_QUARTER_PERIOD_MS * 2)).toBe("red");
	});

	it("returns 'off' at the third quarter boundary", () => {
		expect(pickBlinkPhase(BLINK_QUARTER_PERIOD_MS * 3)).toBe("off");
	});

	it("cycles back to 'dim' at the full-cycle boundary", () => {
		expect(pickBlinkPhase(BLINK_QUARTER_PERIOD_MS * 4)).toBe("dim");
	});

	it("returns 'dim' just before the first quarter boundary", () => {
		expect(pickBlinkPhase(BLINK_QUARTER_PERIOD_MS - 1)).toBe("dim");
	});

	it("returns 'off' just before the half-cycle boundary", () => {
		expect(pickBlinkPhase(BLINK_QUARTER_PERIOD_MS * 2 - 1)).toBe("off");
	});

	it("returns 'red' just before the third quarter boundary", () => {
		expect(pickBlinkPhase(BLINK_QUARTER_PERIOD_MS * 3 - 1)).toBe("red");
	});
});

describe("formatKimiLabel", () => {
	it("returns an empty string for an empty model", () => {
		expect(formatKimiLabel("")).toBe("");
	});

	it("returns an empty string for a MiniMax model", () => {
		expect(formatKimiLabel("minimax/MiniMax-M3")).toBe("");
		expect(formatKimiLabel("MiniMax-M2")).toBe("");
	});

	it("returns an empty string for an unknown model", () => {
		expect(formatKimiLabel("gpt-4")).toBe("");
		expect(formatKimiLabel("claude-opus")).toBe("");
	});

	it("renders the Kimi label in dim grey at phase 0 (now=0)", () => {
		const out = formatKimiLabel("kimi-for-coding", 0);
		expect(out).toBe("\x1b[38;5;244mKimi \x1b[0m");
	});

	it("renders 5 spaces (no letter) at phase 1 (off)", () => {
		const out = formatKimiLabel("kimi-for-coding", BLINK_QUARTER_PERIOD_MS);
		expect(out).toBe("\x1b[38;5;244m     \x1b[0m");
		expect(out).not.toContain("Kimi");
	});

	it("renders the Kimi label in bright red at phase 2", () => {
		const out = formatKimiLabel("kimi-for-coding", BLINK_QUARTER_PERIOD_MS * 2);
		expect(out).toBe("\x1b[91mKimi \x1b[0m");
	});

	it("renders 5 spaces again at phase 3 (off)", () => {
		const out = formatKimiLabel("kimi-for-coding", BLINK_QUARTER_PERIOD_MS * 3);
		expect(out).toBe("\x1b[38;5;244m     \x1b[0m");
		expect(out).not.toContain("Kimi");
	});

	it("cycles back to dim at phase 0 of the next cycle", () => {
		const out = formatKimiLabel("kimi-for-coding", BLINK_QUARTER_PERIOD_MS * 4);
		expect(out).toBe("\x1b[38;5;244mKimi \x1b[0m");
	});

	it("matches bare K-family model ids (k3, k3-256k, k2)", () => {
		expect(formatKimiLabel("k3", 0)).not.toBe("");
		expect(formatKimiLabel("k3-256k", 0)).not.toBe("");
		expect(formatKimiLabel("k2", 0)).not.toBe("");
	});

	it("matches the prefixed form (kimi-code/k3-256k)", () => {
		expect(formatKimiLabel("kimi-code/k3-256k", 0)).not.toBe("");
	});

	it("does not contain any ANSI blink codes (\x1b[5m / \x1b[25m)", () => {
		// 1.3.6 dropped ANSI blink. The on/off cue is delivered by the
		// space-rendering off-phase, not by \x1b[5m. Verify across all
		// 4 phases.
		for (let p = 0; p < 4; p++) {
			const out = formatKimiLabel("kimi-for-coding", BLINK_QUARTER_PERIOD_MS * p);
			expect(out).not.toContain("\x1b[5m");
			expect(out).not.toContain("\x1b[25m");
		}
	});

	it("preserves column width across phases (5 visible chars always)", () => {
		// Each phase output must contain 5 visible chars (either the
		// label "Kimi " or 5 spaces). The strip helper removes ANSI.
		const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");
		for (let p = 0; p < 4; p++) {
			const out = formatKimiLabel("kimi-for-coding", BLINK_QUARTER_PERIOD_MS * p);
			expect(strip(out).length).toBe(5);
		}
	});
});

describe("BLINK_QUARTER_PERIOD_MS boundary math", () => {
	// 1.3.7 verification: at 150 ms phase, the phase boundaries must land
	// exactly on multiples of 150. These tests lock in the contract so
	// future constant changes that break this math are caught immediately.

	it("dim phase ends at BLINK_QUARTER_PERIOD_MS - 1", () => {
		expect(pickBlinkPhase(BLINK_QUARTER_PERIOD_MS - 1)).toBe("dim");
	});

	it("off phase 1 starts at exactly BLINK_QUARTER_PERIOD_MS", () => {
		expect(pickBlinkPhase(BLINK_QUARTER_PERIOD_MS)).toBe("off");
	});

	it("off phase 1 ends at BLINK_QUARTER_PERIOD_MS * 2 - 1", () => {
		expect(pickBlinkPhase(BLINK_QUARTER_PERIOD_MS * 2 - 1)).toBe("off");
	});

	it("red phase starts at exactly BLINK_QUARTER_PERIOD_MS * 2", () => {
		expect(pickBlinkPhase(BLINK_QUARTER_PERIOD_MS * 2)).toBe("red");
	});

	it("red phase ends at BLINK_QUARTER_PERIOD_MS * 3 - 1", () => {
		expect(pickBlinkPhase(BLINK_QUARTER_PERIOD_MS * 3 - 1)).toBe("red");
	});

	it("off phase 3 starts at exactly BLINK_QUARTER_PERIOD_MS * 3", () => {
		expect(pickBlinkPhase(BLINK_QUARTER_PERIOD_MS * 3)).toBe("off");
	});

	it("cycles back to dim at BLINK_QUARTER_PERIOD_MS * 4", () => {
		expect(pickBlinkPhase(BLINK_QUARTER_PERIOD_MS * 4)).toBe("dim");
	});

	it("alternates phases correctly across two full cycles", () => {
		const expected: Array<"dim" | "off" | "red" | "off"> = ["dim", "off", "red", "off", "dim", "off", "red", "off"];
		const actual = expected.map((_, i) => pickBlinkPhase(BLINK_QUARTER_PERIOD_MS * i));
		expect(actual).toEqual(expected);
	});
});

describe("Kimi model detection edge cases", () => {
	// The model-detection regex `^k\d` was widened in 1.3.3. These tests
	// pin the contract so future changes can't silently drop support for
	// new Kimi model names.

	it("matches the bare k3 id", () => {
		expect(formatKimiLabel("k3", 0)).toBe("\x1b[38;5;244mKimi \x1b[0m");
	});

	it("matches the bare k3-256k id", () => {
		expect(formatKimiLabel("k3-256k", 0)).toBe("\x1b[38;5;244mKimi \x1b[0m");
	});

	it("matches a future k4 id (forward-compatibility)", () => {
		expect(formatKimiLabel("k4-new", 0)).toBe("\x1b[38;5;244mKimi \x1b[0m");
	});

	it("matches the prefixed form kimi-code/k3-256k", () => {
		expect(formatKimiLabel("kimi-code/k3-256k", 0)).toBe("\x1b[38;5;244mKimi \x1b[0m");
	});

	it("does NOT match bare 'k' alone (must be followed by a digit)", () => {
		expect(formatKimiLabel("k", 0)).toBe("");
	});

	it("does NOT match 'kerfuffle' (looks like k + letters, not k + digit)", () => {
		expect(formatKimiLabel("kerfuffle", 0)).toBe("");
	});

	it("handles uppercase KIMI-FOR-CODING (case-insensitive detection)", () => {
		expect(formatKimiLabel("KIMI-FOR-CODING", 0)).toBe("\x1b[38;5;244mKimi \x1b[0m");
	});

	it("handles mixed-case KiMi-anything", () => {
		expect(formatKimiLabel("KiMi-test", 0)).toBe("\x1b[38;5;244mKimi \x1b[0m");
	});
});

describe("formatKimiLabel phase boundaries", () => {
	// Same boundary logic as pickBlinkPhase but verified end-to-end:
	// the full ANSI string changes at each phase transition.

	it("emits dim grey at now = 0", () => {
		expect(formatKimiLabel("kimi-for-coding", 0)).toBe("\x1b[38;5;244mKimi \x1b[0m");
	});

	it("emits dim grey at now = BLINK_QUARTER_PERIOD_MS - 1 (last ms of dim)", () => {
		expect(formatKimiLabel("kimi-for-coding", BLINK_QUARTER_PERIOD_MS - 1)).toBe("\x1b[38;5;244mKimi \x1b[0m");
	});

	it("emits 5 spaces at now = BLINK_QUARTER_PERIOD_MS (off phase 1 starts)", () => {
		expect(formatKimiLabel("kimi-for-coding", BLINK_QUARTER_PERIOD_MS)).toBe("\x1b[38;5;244m     \x1b[0m");
	});

	it("emits bright red at now = BLINK_QUARTER_PERIOD_MS * 2 (red phase starts)", () => {
		expect(formatKimiLabel("kimi-for-coding", BLINK_QUARTER_PERIOD_MS * 2)).toBe("\x1b[91mKimi \x1b[0m");
	});

	it("emits 5 spaces at now = BLINK_QUARTER_PERIOD_MS * 3 (off phase 3 starts)", () => {
		expect(formatKimiLabel("kimi-for-coding", BLINK_QUARTER_PERIOD_MS * 3)).toBe("\x1b[38;5;244m     \x1b[0m");
	});
});
