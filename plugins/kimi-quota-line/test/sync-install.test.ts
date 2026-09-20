/**
 * sync-install.test.ts — unit + integration tests for tools/sync-to-managed.mjs
 * and tools/install.sh.
 *
 * Strategy: spawn the script as a subprocess with KIMI_CODE_HOME pointed at a
 * tmp directory. The script mutates the tmp HOME in place, so we can assert
 * on the resulting tui.toml / installed.json without touching the real
 * ~/.kimi-code.
 *
 * Why subprocess and not direct import: sync-to-managed.mjs is a plain Node
 * script with side effects at top level (it calls main() unconditionally).
 * Subprocess execution keeps tests hermetic.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const PLUGIN_ROOT = join(import.meta.dirname, "..");
const SYNC = join(PLUGIN_ROOT, "tools", "sync-to-managed.mjs");
const INSTALL = join(PLUGIN_ROOT, "tools", "install.sh");

const SRC_VERSION: string = (() => {
	try {
		const m = JSON.parse(readFileSync(join(PLUGIN_ROOT, "kimi.plugin.json"), "utf8"));
		return m.version;
	} catch {
		return "1.3.2";
	}
})();

function makeTmpHome(): string {
	const dir = join(tmpdir(), `kimi-quota-line-sync-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function writeJson(path: string, data: unknown): void {
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

let home: string;

beforeEach(() => {
	home = makeTmpHome();
});

afterEach(() => {
	if (existsSync(home)) rmSync(home, { recursive: true, force: true });
});

function runSync(): ReturnType<typeof spawnSync> {
	return spawnSync("node", [SYNC], {
		env: { ...process.env, KIMI_CODE_HOME: home },
		encoding: "utf8",
	});
}

describe("sync-to-managed.mjs — tui.toml patching", () => {
	it("rewrites dist/scripts/ → dist/bin/ when the plugin path is present", () => {
		const tui = join(home, "tui.toml");
		writeFileSync(
			tui,
			`[status_line]\ncommand = "node ${home}/plugins/managed/kimi-quota-line/dist/scripts/render-row1.js "\n`,
		);
		const result = runSync();
		expect(result.status).toBe(0);
		const after = readFileSync(tui, "utf8");
		expect(after).toContain("dist/bin/render-row1.js");
		expect(after).not.toContain("dist/scripts/render-row1.js");
	});

	it("rewrites dist/hooks/ → dist/bin/ when the plugin path is present", () => {
		const tui = join(home, "tui.toml");
		writeFileSync(
			tui,
			`[status_line]\ncommand = "node ${home}/plugins/managed/kimi-quota-line/dist/hooks/render-row1.js "\n`,
		);
		const result = runSync();
		expect(result.status).toBe(0);
		const after = readFileSync(tui, "utf8");
		expect(after).toContain("dist/bin/render-row1.js");
		expect(after).not.toContain("dist/hooks/render-row1.js");
	});

	it("is a no-op when the current path is already dist/bin/", () => {
		const tui = join(home, "tui.toml");
		const original = `[status_line]\ncommand = "node ${home}/plugins/managed/kimi-quota-line/dist/bin/render-row1.js"\n`;
		writeFileSync(tui, original);
		const result = runSync();
		expect(result.status).toBe(0);
		const after = readFileSync(tui, "utf8");
		expect(after).toBe(original);
	});

	it("does not touch tui.toml entries for other plugins", () => {
		const tui = join(home, "tui.toml");
		const otherPath = "/some/other/managed/other-plugin/dist/scripts/foo.js";
		const original = `[status_line]\ncommand = "node ${otherPath}"\n`;
		writeFileSync(tui, original);
		const result = runSync();
		expect(result.status).toBe(0);
		const after = readFileSync(tui, "utf8");
		expect(after).toBe(original);
	});

	it("does nothing when tui.toml does not exist", () => {
		// No setup. runSync should still succeed.
		const result = runSync();
		expect(result.status).toBe(0);
		expect(existsSync(join(home, "tui.toml"))).toBe(false);
	});
});

describe("sync-to-managed.mjs — installed.json bumping", () => {
	function writeInstalled(extra: unknown[] = []): void {
		writeJson(join(home, "plugins", "installed.json"), {
			version: 1,
			plugins: [
				{
					id: "kimi-quota-line",
					root: `${home}/plugins/managed/kimi-quota-line`,
					source: "local-path",
					enabled: true,
					installedAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
					originalSource: PLUGIN_ROOT,
				},
				{
					id: "other-plugin",
					root: "/some/other/path",
					source: "github",
					enabled: true,
					installedAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
				...extra,
			],
		});
	}

	it("bumps updatedAt and version for kimi-quota-line; preserves other entries", () => {
		writeInstalled();
		const result = runSync();
		expect(result.status).toBe(0);
		const reg = readJson<{ plugins: Array<Record<string, unknown>> }>(join(home, "plugins", "installed.json"));
		const ours = reg.plugins.find((p) => p.id === "kimi-quota-line");
		const other = reg.plugins.find((p) => p.id === "other-plugin");
		expect(ours).toBeDefined();
		expect(other).toBeDefined();
		expect(ours?.version).toBe(SRC_VERSION); // current source version
		expect(typeof ours?.updatedAt).toBe("string");
		expect(ours?.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
		expect(ours?.installedAt).toBe("2026-01-01T00:00:00.000Z");
		// Other entries untouched.
		expect(other?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
	});

	it("is a no-op when kimi-quota-line is not in installed.json", () => {
		writeJson(join(home, "plugins", "installed.json"), {
			version: 1,
			plugins: [
				{
					id: "other-plugin",
					root: "/some/other/path",
					source: "github",
					enabled: true,
				},
			],
		});
		const result = runSync();
		expect(result.status).toBe(0);
		const reg = readJson<{ plugins: Array<Record<string, unknown>> }>(join(home, "plugins", "installed.json"));
		expect(reg.plugins[0].updatedAt).toBeUndefined();
	});

	it("is a no-op when installed.json does not exist", () => {
		const result = runSync();
		expect(result.status).toBe(0);
		expect(existsSync(join(home, "plugins", "installed.json"))).toBe(false);
	});
});

describe("sync-to-managed.mjs — copies the source into the managed dir", () => {
	it("creates the managed dir with the manifest and docs", () => {
		// We do NOT run `npm run build` here. The plugin source ships without
		// dist/ unless built. We just verify the sync script copies whatever
		// exists in SRC to DST, excluding dev-only files.
		const result = runSync();
		expect(result.status).toBe(0);
		const managed = join(home, "plugins", "managed", "kimi-quota-line");
		expect(existsSync(join(managed, "kimi.plugin.json"))).toBe(true);
		expect(existsSync(join(managed, "README.md"))).toBe(true);
		expect(existsSync(join(managed, "skills"))).toBe(true);
		expect(existsSync(join(managed, "commands"))).toBe(true);
		// Dev-only dirs excluded.
		expect(existsSync(join(managed, "test"))).toBe(false);
		expect(existsSync(join(managed, "tools"))).toBe(false);
		expect(existsSync(join(managed, "node_modules"))).toBe(false);
	});
});

describe("install.sh — one-shot installer (bash only)", () => {
	const hasBash = (() => {
		const r = spawnSync("bash", ["-c", "true"]);
		return r.status === 0;
	})();

	it.skipIf(!hasBash)("builds and syncs when kimi CLI is absent from PATH", () => {
		// Strip kimi from PATH so the script's command -v probe fails and
		// it falls through to the sync step.
		const pathNoKimi = (process.env.PATH || "")
			.split(":")
			.filter((p) => {
				const probe = spawnSync("which", ["kimi"], {
					env: { ...process.env, PATH: p },
					encoding: "utf8",
				});
				return probe.status !== 0;
			})
			.join(":");
		const result = spawnSync("bash", [INSTALL], {
			cwd: PLUGIN_ROOT,
			env: { ...process.env, KIMI_CODE_HOME: home, PATH: pathNoKimi },
			encoding: "utf8",
		});
		expect(result.status).toBe(0);
		const managed = join(home, "plugins", "managed", "kimi-quota-line");
		expect(existsSync(join(managed, "kimi.plugin.json"))).toBe(true);
		expect(existsSync(join(managed, "dist", "bin", "render-row1.js"))).toBe(true);
	});

	it.skipIf(!hasBash)("still syncs the managed copy when a fake kimi is on PATH (prints hint, falls through)", () => {
		// Stub a fake `kimi` that is on PATH so the script prints the
		// /plugins install hint AND runs the sync step. Exercises both
		// branches together.
		const stubDir = join(home, "stub-bin");
		mkdirSync(stubDir, { recursive: true });
		writeFileSync(join(stubDir, "kimi"), "#!/bin/sh\necho 'kimi stub'\nexit 0\n", { mode: 0o755 });
		const newPath = `${stubDir}:${process.env.PATH || ""}`;
		const result = spawnSync("bash", [INSTALL], {
			cwd: PLUGIN_ROOT,
			env: { ...process.env, KIMI_CODE_HOME: home, PATH: newPath },
			encoding: "utf8",
		});
		expect(result.status).toBe(0);
		const out = result.stdout + result.stderr;
		expect(out).toMatch(/\/plugins install/);
		const managed = join(home, "plugins", "managed", "kimi-quota-line");
		expect(existsSync(join(managed, "kimi.plugin.json"))).toBe(true);
	});
});

describe("postinstall.mjs — stale-managed warning", () => {
	const POSTINSTALL = join(PLUGIN_ROOT, "tools", "postinstall.mjs");

	function runPostinstall(): ReturnType<typeof spawnSync> {
		return spawnSync("node", [POSTINSTALL], {
			env: { ...process.env, KIMI_CODE_HOME: home },
			encoding: "utf8",
		});
	}

	it("warns when the managed copy is missing", () => {
		const result = runPostinstall();
		expect(result.status).toBe(0);
		const out = String(result.stdout ?? "") + String(result.stderr ?? "");
		expect(out).toMatch(/managed copy not found/i);
	});

	it("warns when the source version differs from the managed version", () => {
		// Source ships the current SRC_VERSION; we write v0.0.1 to the managed copy.
		mkdirSync(join(home, "plugins", "managed", "kimi-quota-line"), {
			recursive: true,
		});
		writeJson(join(home, "plugins", "managed", "kimi-quota-line", "kimi.plugin.json"), {
			name: "kimi-quota-line",
			version: "0.0.1",
		});
		const result = runPostinstall();
		expect(result.status).toBe(0);
		const out = String(result.stdout ?? "") + String(result.stderr ?? "");
		const re = new RegExp(`source is v${SRC_VERSION.replace(/\./g, "\\.")} but managed copy is v0\\.0\\.1`, "i");
		expect(out).toMatch(re);
	});

	it("prints OK when versions match", () => {
		mkdirSync(join(home, "plugins", "managed", "kimi-quota-line"), {
			recursive: true,
		});
		writeJson(join(home, "plugins", "managed", "kimi-quota-line", "kimi.plugin.json"), {
			name: "kimi-quota-line",
			version: SRC_VERSION,
		});
		const result = runPostinstall();
		expect(result.status).toBe(0);
		const out = String(result.stdout ?? "") + String(result.stderr ?? "");
		expect(out).toMatch(/postinstall OK/i);
	});
});
