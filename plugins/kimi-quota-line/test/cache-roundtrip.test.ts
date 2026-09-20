/**
 * Integration tests for refresh-cache + render-row1 pipeline.
 *
 * Mocks $XDG_RUNTIME_DIR + $KIMI_CODE_HOME to a temp directory; spawns the
 * built scripts (dist/hooks/*.js + dist/bin/*.js) as subprocesses the same way kimi-code
 * does. Verifies that:
 *   1. refresh-cache writes a valid cache JSON.
 *   2. render-row1 emits a line containing the expected ANSI codes.
 *   3. render-row1 falls back gracefully when the cache is missing.
 *
 * Requires `pnpm build` to have run first.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, "..");
const REFRESH = join(PLUGIN_ROOT, "dist", "hooks", "refresh-cache.js");
const RENDER = join(PLUGIN_ROOT, "dist", "bin", "render-row1.js");

function makeTmpDir(): string {
	return mkdtempSync(join(tmpdir(), "kql-test-"));
}

function envWith(tmpDir: string): NodeJS.ProcessEnv {
	return {
		...process.env,
		KIMI_CODE_HOME: tmpDir,
		XDG_RUNTIME_DIR: tmpDir,
		KIMI_API_KEY: "fake-key-for-test",
		MINIMAX_API_KEY: "fake-key-for-test",
	};
}

describe("refresh-cache", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = makeTmpDir();
		writeFileSync(join(tmpDir, "auth.json"), JSON.stringify({}));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("writes a cache file with valid shape", () => {
		const result = spawnSync("node", [REFRESH], {
			env: envWith(tmpDir),
			input: JSON.stringify({ model: "kimi-for-coding" }),
			encoding: "utf-8",
			timeout: 15_000,
		});

		expect(result.status).toBe(0);
		const cachePath = join(tmpDir, "kimi-quota-line-quota-cache.json");
		expect(existsSync(cachePath)).toBe(true);

		const cache = JSON.parse(readFileSync(cachePath, "utf-8"));
		expect(typeof cache.ts).toBe("number");
		expect(cache).toHaveProperty("kimi");
		expect(cache).toHaveProperty("minimax");
		// v1.3: quota cache no longer carries git. Git lives in its own file.
		expect(cache.kimi).toBeNull(); // failed fetch with fake key
		expect(cache.minimax).toBeNull();
	});

	it("SessionStart fast-path: real kimi payload, no network call", () => {
		// v1.3.3 read payload.event which never matches real kimi payloads
		// (kimi uses hook_event_name per the official Hooks doc). The
		// fast-path was unreachable in production — startup still blocked
		// on API latency. v1.3.3.2 fixed the field name. This test sends
		// the REAL kimi payload shape and verifies the fast-path triggers:
		// exits in <1.5 s and the prior kimi data is preserved (no network
		// refresh).
		const cachePath = join(tmpDir, "kimi-quota-line-quota-cache.json");
		const priorKimi = {
			wUsed: 80,
			wLimit: 120,
			wResetAt: new Date(Date.now() + 86_400_000).toISOString(),
			hUsed: 10,
			hLimit: 50,
			hResetAt: new Date(Date.now() + 3_600_000).toISOString(),
			hRemaining: "0.59",
		};
		const prior = {
			ts: Date.now() - 600_000,
			model: "kimi-for-coding",
			kimi: priorKimi,
			minimax: null,
		};
		writeFileSync(cachePath, JSON.stringify(prior));

		// Real kimi payload shape per
		// https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html
		const realPayload = {
			hook_event_name: "SessionStart", // <-- the discriminator
			session_id: "sess_test",
			session_title: "test",
			client_type: "kimi_code_cli",
			cwd: "/tmp",
			source: "startup",
			model: "kimi-for-coding",
			profile: "default",
		};

		const start = Date.now();
		const result = spawnSync("node", [REFRESH], {
			env: envWith(tmpDir),
			input: JSON.stringify(realPayload),
			encoding: "utf-8",
			timeout: 5_000,
		});
		const elapsed = Date.now() - start;

		expect(result.status).toBe(0);
		// Network path with fake key takes ~2-3 s. Fast-path should be
		// well under 1.5 s.
		expect(elapsed).toBeLessThan(1500);

		const after = JSON.parse(readFileSync(cachePath, "utf-8"));
		// Fast-path keeps the previous provider data — only `ts` and `model`
		// are updated. If kimi got nulled, the fast-path was skipped and the
		// network fetch (which fails with fake key) ran instead.
		expect(after.kimi).toEqual(priorKimi);
		expect(after.minimax).toBeNull();
		expect(after.ts).toBeGreaterThan(prior.ts);
		expect(after.model).toBe("kimi-for-coding");
	});
});

describe("render-row1", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = makeTmpDir();
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("emits cwd-only line when cache is missing", () => {
		const result = spawnSync("node", [RENDER], {
			env: { ...process.env, XDG_RUNTIME_DIR: tmpDir },
			input: JSON.stringify({ model: "kimi-for-coding", cwd: "/tmp/example" }),
			encoding: "utf-8",
			timeout: 5_000,
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toMatch(/\x1b\[38;5;198m/);
		expect(result.stdout).toContain("example");
		expect(result.stdout).not.toContain("Kimi ");
		expect(result.stdout).not.toContain("MM ");
	});

	it("renders quota bars when cache has Kimi data for a Kimi model", () => {
		const cache = {
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
		writeFileSync(join(tmpDir, "kimi-quota-line-quota-cache.json"), JSON.stringify(cache));

		const result = spawnSync("node", [RENDER], {
			env: { ...process.env, XDG_RUNTIME_DIR: tmpDir },
			input: JSON.stringify({ model: "kimi-for-coding", cwd: "/tmp" }),
			encoding: "utf-8",
			timeout: 5_000,
		});

		expect(result.status).toBe(0);
		// 1.3.6: subprocess uses default Date.now() so the label phase is
		// not pinned. Accept EITHER the dim/red label "Kimi " OR the
		// off-phase 5 spaces (in dim grey).
		const labelVisible = result.stdout.includes("Kimi ") || result.stdout.includes("\x1b[38;5;244m     \x1b[0m");
		expect(labelVisible).toBe(true);
		expect(result.stdout).toMatch(/\x1b\[38;2;40;167;69m/);
		expect(result.stdout).toContain("67%");
		// v1.3 compact mode drops the 5H section when 3-col would exceed width
		// (in this test the spawn is unbuffered so default width = 80 → compact).
	});

	it("uses MM label for a MiniMax model", () => {
		const cache = {
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
		writeFileSync(join(tmpDir, "kimi-quota-line-quota-cache.json"), JSON.stringify(cache));

		const result = spawnSync("node", [RENDER], {
			env: { ...process.env, XDG_RUNTIME_DIR: tmpDir },
			input: JSON.stringify({ model: "minimax-text-01", cwd: "/tmp" }),
			encoding: "utf-8",
			timeout: 5_000,
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("MM ");
		expect(result.stdout).not.toContain("Kimi ");
	});
});
