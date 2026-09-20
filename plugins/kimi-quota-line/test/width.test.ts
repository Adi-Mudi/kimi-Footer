import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectWidth } from "../src/width.js";

describe("detectWidth", () => {
	const originalStdout = process.stdout.columns;
	const originalStderr = process.stderr.columns;
	const originalEnv = process.env.COLUMNS;

	beforeEach(() => {
		delete process.env.COLUMNS;
		Object.defineProperty(process.stdout, "columns", { value: undefined, configurable: true });
		Object.defineProperty(process.stderr, "columns", { value: undefined, configurable: true });
	});

	afterEach(() => {
		Object.defineProperty(process.stdout, "columns", { value: originalStdout, configurable: true });
		Object.defineProperty(process.stderr, "columns", { value: originalStderr, configurable: true });
		if (originalEnv === undefined) delete process.env.COLUMNS;
		else process.env.COLUMNS = originalEnv;
	});

	it("returns stdout.columns when set", () => {
		Object.defineProperty(process.stdout, "columns", { value: 150, configurable: true });
		expect(detectWidth()).toBe(150);
	});

	it("falls back to stderr.columns when stdout is unset", () => {
		Object.defineProperty(process.stderr, "columns", { value: 90, configurable: true });
		expect(detectWidth()).toBe(90);
	});

	it("falls back to COLUMNS env when stdout and stderr are unset", () => {
		process.env.COLUMNS = "200";
		expect(detectWidth()).toBe(200);
	});

	it("returns fallback (120) when all sources are unset", () => {
		expect(detectWidth()).toBe(120);
	});

	it("returns custom fallback when provided", () => {
		expect(detectWidth(80)).toBe(80);
	});

	it("ignores 0 and negative values from sources", () => {
		Object.defineProperty(process.stdout, "columns", { value: 0, configurable: true });
		Object.defineProperty(process.stderr, "columns", { value: -5, configurable: true });
		process.env.COLUMNS = "0";
		expect(detectWidth()).toBe(120);
	});

	it("prefers stdout over stderr and env", () => {
		Object.defineProperty(process.stdout, "columns", { value: 100, configurable: true });
		Object.defineProperty(process.stderr, "columns", { value: 200, configurable: true });
		process.env.COLUMNS = "300";
		expect(detectWidth()).toBe(100);
	});

	it("prefers stderr over env when stdout is unset", () => {
		Object.defineProperty(process.stderr, "columns", { value: 175, configurable: true });
		process.env.COLUMNS = "250";
		expect(detectWidth()).toBe(175);
	});
});
