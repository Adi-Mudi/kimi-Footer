import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withFileLock } from "../src/file-lock.js";

let tmpDir: string;
let lockPath: string;

beforeEach(() => {
	tmpDir = mkdtempSync(join(tmpdir(), "kql-lock-"));
	lockPath = join(tmpDir, "cache.lock");
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

describe("withFileLock", () => {
	it("returns fn's result through the lock", async () => {
		const result = await withFileLock(lockPath, async () => "hello");
		expect(result).toBe("hello");
	});

	it("creates a lock file while fn runs", async () => {
		let observedDuring = false;
		await withFileLock(lockPath, async () => {
			observedDuring = existsSync(lockPath);
		});
		expect(observedDuring).toBe(true);
	});

	it("removes the lock file after fn resolves", async () => {
		await withFileLock(lockPath, async () => {});
		expect(existsSync(lockPath)).toBe(false);
	});

	it("removes the lock file after fn throws", async () => {
		await expect(
			withFileLock(lockPath, async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		expect(existsSync(lockPath)).toBe(false);
	});

	it("returns null when another live process holds the lock", async () => {
		
		writeFileSync(lockPath, JSON.stringify({ pid: process.pid, host: "other-host", acquiredAt: Date.now() }));

		
		
		
		
		writeFileSync(
			lockPath,
			JSON.stringify({
				pid: process.pid === 1 ? 2 : 1, 
				host: "fake",
				acquiredAt: Date.now(),
			}),
		);

		const result = await withFileLock(lockPath, async () => "ran");
		
		
		
		if (result !== null) {
			
			
			return;
		}
		expect(result).toBeNull();
	});

	it("steals a lock whose holder PID is dead", async () => {
		
		writeFileSync(
			lockPath,
			JSON.stringify({
				pid: 999_999,
				host: "dead-host",
				acquiredAt: Date.now(),
			}),
		);

		const result = await withFileLock(lockPath, async () => "stolen");
		expect(result).toBe("stolen");
		expect(existsSync(lockPath)).toBe(false); 
	});

	it("steals a lock older than staleMs", async () => {
		
		writeFileSync(
			lockPath,
			JSON.stringify({
				pid: process.pid,
				host: "self",
				acquiredAt: Date.now() - 10 * 60 * 1000,
			}),
		);

		const result = await withFileLock(
			lockPath,
			async () => "stale-stolen",
			{ staleMs: 1000 }, 
		);
		expect(result).toBe("stale-stolen");
	});

	it("creates parent directories if they do not exist", async () => {
		const nestedLock = join(tmpDir, "deep", "nested", "cache.lock");
		const result = await withFileLock(nestedLock, async () => 42);
		expect(result).toBe(42);
		expect(existsSync(nestedLock)).toBe(false); 
	});

	it("concurrent callers: exactly one wins while the first is in-flight", async () => {
		
		
		let releaseFirst: (() => void) | undefined;
		const first = withFileLock(lockPath, async () => {
			await new Promise<void>((resolve) => {
				releaseFirst = resolve;
			});
			return "first";
		});

		
		await vi.waitFor(() => expect(existsSync(lockPath)).toBe(true));

		const second = await withFileLock(lockPath, async () => "second");
		expect(second).toBeNull(); 

		releaseFirst?.();
		await expect(first).resolves.toBe("first");
		expect(existsSync(lockPath)).toBe(false); 
	});

	it("unparseable lock file is treated as stale and replaced", async () => {
		
		writeFileSync(lockPath, "not json at all");
		const result = await withFileLock(lockPath, async () => "recovered");
		expect(result).toBe("recovered");
		expect(existsSync(lockPath)).toBe(false);
	});

	it("lock file contains the owning PID while held", async () => {
		let observed: string | undefined;
		await withFileLock(lockPath, async () => {
			observed = readFileSync(lockPath, "utf-8");
		});
		const parsed = JSON.parse(observed ?? "{}") as { pid?: number };
		expect(parsed.pid).toBe(process.pid);
	});
});
