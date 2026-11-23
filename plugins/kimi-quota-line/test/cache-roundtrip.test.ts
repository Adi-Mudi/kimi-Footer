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
		
		expect(cache.kimi).toBeNull(); 
		expect(cache.minimax).toBeNull();
	});

	it("SessionStart fast-path: real kimi payload, no network call", () => {
		
		
		
		
		
		
		
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

		
		
		const realPayload = {
			hook_event_name: "SessionStart", 
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
		
		
		expect(elapsed).toBeLessThan(1500);

		const after = JSON.parse(readFileSync(cachePath, "utf-8"));
		
		
		
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

	it("emits cwd-only line when cache is missing and model is unknown", () => {
		const result = spawnSync("node", [RENDER], {
			env: { ...process.env, XDG_RUNTIME_DIR: tmpDir },
			input: JSON.stringify({ model: "mimo-v2.6-flash-free", cwd: "/tmp/example" }),
			encoding: "utf-8",
			timeout: 5_000,
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toMatch(/\x1b\[38;5;198m/);
		expect(result.stdout).toContain("example");
		expect(result.stdout).not.toContain("W:");
		expect(result.stdout).not.toContain("MM");
	});

	it("shows short+model without metrics when cache missing for a Kimi model", () => {
		const result = spawnSync("node", [RENDER], {
			env: { ...process.env, XDG_RUNTIME_DIR: tmpDir },
			input: JSON.stringify({ model: "kimi-for-coding", cwd: "/tmp/example" }),
			encoding: "utf-8",
			timeout: 5_000,
		});

		expect(result.status).toBe(0);
		expect(
			result.stdout.includes("Kimi") ||
				result.stdout.includes("\x1b[38;5;244m    \x1b[0m") ||
				result.stdout.includes("\x1b[91mKimi\x1b[0m"),
		).toBe(true);
		expect(result.stdout).toContain("kimi-for-coding");
		expect(result.stdout).not.toContain("W:");
		expect(result.stdout).not.toContain("5H:");
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
		
		
		
		const labelVisible =
			result.stdout.includes("Kimi") ||
			result.stdout.includes("\x1b[38;5;244m    \x1b[0m") ||
			result.stdout.includes("\x1b[91mKimi\x1b[0m");
		expect(labelVisible).toBe(true);
		expect(result.stdout).toContain("W:");
		expect(result.stdout).toContain("67%");
		expect(result.stdout).toContain("5H:");
		
		
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
