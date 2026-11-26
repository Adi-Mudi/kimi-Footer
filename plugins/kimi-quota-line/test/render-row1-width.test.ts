import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, "..");
const RENDER = join(PLUGIN_ROOT, "dist", "bin", "render-row1.js");

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

function stripAnsi(s: string): string {
	return s.replace(/\x1b\[[0-9;]*m/g, "");
}

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
	
	const lines = result.stdout.split("\n").filter(Boolean);
	
	return stripAnsi(lines[lines.length - 1] ?? "");
}

describe("render-row1 end-to-end width detection", () => {
	let tmpDir: string;

	beforeAll(() => {
		if (!existsSync(RENDER)) {
			throw new Error(`Build output not found at ${RENDER}. Run \`pnpm run build\` first.`);
		}
		
		tmpDir = mkdtempSync(join(tmpdir(), "kql-width-"));
		writeFileSync(join(tmpDir, "kimi-quota-line-quota-cache.json"), JSON.stringify(CACHE));
	});

	afterAll(() => {
		if (tmpDir) {
			try {
				rmSync(tmpDir, { recursive: true, force: true });
			} catch {
				
			}
		}
	});

	const widths = [60, 80, 100, 120, 150, 200, 300];

	for (const width of widths) {
		it(`renders exactly ${width} chars when COLUMNS=${width}`, () => {
			const out = runWithEnv({
				XDG_RUNTIME_DIR: tmpDir,
				COLUMNS: String(width),
				
				
				
			});
			expect(out.length).toBe(width);
			
			expect(out.includes("MM") || out.includes("minimax-text-01") || out.includes("W:") || out.includes("Req")).toBe(true);
		});
	}

	it("uses default 120 when no width source is available", () => {
		const out = runWithEnv({
			XDG_RUNTIME_DIR: tmpDir,
			
			
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
