/**
 * End-to-end width detection tests.
 *
 * Spawns the BUILT render-row1.js (dist/bin/render-row1.js) as a
 * subprocess the same way kimi-code does — stdin JSON payload, stdout is
 * the row. Verifies that the rendered output length matches the detected
 * terminal width exactly, for a representative spread of widths.
 *
 * Why a subprocess: process.stdout.columns / process.env.COLUMNS / TTY state
 * only behave realistically in a real child process. Mocking them in the
 * parent test process leaks state across tests.
 *
 * Requires `pnpm build` to have run first.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, "..");
const RENDER = join(PLUGIN_ROOT, "dist", "bin", "render-row1.js");

// Sample payload that yields a non-trivial render: real-looking cache with
// weekly + 5H quota, model is minimax so the MM label appears.
const PAYLOAD = JSON.stringify({
	model: "minimax-text-01",
	cwd: "/some/folder",
	gitBranch: "dev",
	permissionMode: "manual",
	planMode: false,
	contextUsage: 0.01,
	contextTokens: 42700,
	maxContextTokens: 977000,
	sessionId: "test",
	version: "0",
});

const CACHE = {
	ts: Date.now(),
	model: "minimax-text-01",
	kimi: null,
	minimax: {
		wUsed: 1,
		wLimit: 100,
		wResetAt: new Date(Date.now() + 86_400_000).toISOString(),
		hUsed: 8,
		hLimit: 100,
		hResetAt: new Date(Date.now() + 3_600_000).toISOString(),
		hRemaining: "2.45",
	},
};

/** Strip ANSI escape sequences from a string. */
function stripAnsi(s: string): string {
	return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Run the built script with given env (CONTROLS WIDTH) + payload + cache. */
function runWithEnv(env: NodeJS.ProcessEnv): string {
	const result = spawnSync("node", [RENDER], {
		input: PAYLOAD,
		env: {
			...process.env,
			...env,
		},
		encoding: "utf-8",
		timeout: 5000,
	});
	if (result.status !== 0) {
		throw new Error(`script failed (${result.status}): ${result.stderr}`);
	}
	// Strip any leading non-row lines (the script writes one line).
	const lines = result.stdout.split("\n").filter(Boolean);
	// The row is the LAST line (debug logs would be in stderr, but we drop stderr).
	return stripAnsi(lines[lines.length - 1] ?? "");
}

describe("render-row1 end-to-end width detection", () => {
	let tmpDir: string;

	beforeAll(() => {
		if (!existsSync(RENDER)) {
			throw new Error(`Build output not found at ${RENDER}. Run \`pnpm run build\` first.`);
		}
		// Set up a cache file so the script has quota data to render.
		tmpDir = mkdtempSync(join(tmpdir(), "kql-width-"));
		writeFileSync(join(tmpDir, "kimi-quota-line-quota-cache.json"), JSON.stringify(CACHE));
	});

	afterAll(() => {
		if (tmpDir) {
			try {
				rmSync(tmpDir, { recursive: true, force: true });
			} catch {
				// ignore
			}
		}
	});

	const widths = [60, 80, 100, 120, 150, 200, 300];

	for (const width of widths) {
		it(`renders exactly ${width} chars when COLUMNS=${width}`, () => {
			const out = runWithEnv({
				XDG_RUNTIME_DIR: tmpDir,
				COLUMNS: String(width),
				// Force the script to think stdout is not a TTY so it falls
				// through to env detection. (In a real pipe, stdout has no
				// columns — same as our test subprocess.)
			});
			expect(out.length).toBe(width);
			// Right column should land at the very last column.
			expect(out.endsWith("/100") || out.endsWith("/2.45")).toBe(true);
		});
	}

	it("uses default 120 when no width source is available", () => {
		const out = runWithEnv({
			XDG_RUNTIME_DIR: tmpDir,
			// No COLUMNS, stdout is a pipe so process.stdout.columns is undefined,
			// stderr is a pipe so process.stderr.columns is undefined.
		});
		expect(out.length).toBe(120);
	});

	it("respects COLUMNS env over default fallback", () => {
		const out = runWithEnv({
			XDG_RUNTIME_DIR: tmpDir,
			COLUMNS: "175",
		});
		expect(out.length).toBe(175);
	});

	it("ignores COLUMNS=0 and falls back to default", () => {
		const out = runWithEnv({
			XDG_RUNTIME_DIR: tmpDir,
			COLUMNS: "0",
		});
		expect(out.length).toBe(120);
	});

	it("ignores negative COLUMNS and falls back to default", () => {
		const out = runWithEnv({
			XDG_RUNTIME_DIR: tmpDir,
			COLUMNS: "-10",
		});
		expect(out.length).toBe(120);
	});
});
