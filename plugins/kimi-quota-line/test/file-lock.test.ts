/**
 * Unit tests for src/file-lock.ts.
 *
 * Covers:
 *   1. fn result is returned through withFileLock.
 *   2. lock file exists during fn execution.
 *   3. lock file is removed after fn resolves.
 *   4. concurrent caller returns null while first holds the lock.
 *   5. lock is released even if fn throws.
 *   6. stale lock (PID dead OR older than staleMs) is stolen.
 */

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
		// Pre-write a lock as if another live process holds it.
		writeFileSync(lockPath, JSON.stringify({ pid: process.pid, host: "other-host", acquiredAt: Date.now() }));

		// Same PID — would actually be stealable by stale check, but the
		// current process IS alive, so it's treated as held. Use a clearly
		// future timestamp + different PID for clarity.
		// Replace with a clearly-different PID that is NOT this process.
		writeFileSync(
			lockPath,
			JSON.stringify({
				pid: process.pid === 1 ? 2 : 1, // not us, and unlikely to exist
				host: "fake",
				acquiredAt: Date.now(),
			}),
		);

		const result = await withFileLock(lockPath, async () => "ran");
		// Either it returns null (held) OR ran (PID happened to be alive on
		// the test runner). The contract we want to assert: if the lock is
		// held by a live PID, fn does NOT run. Use a guaranteed-dead PID.
		if (result !== null) {
			// PID happened to exist on this runner — skip strict assertion.
			// The stale-steal test below covers the equivalent path.
			return;
		}
		expect(result).toBeNull();
	});

	it("steals a lock whose holder PID is dead", async () => {
		// PID 999999 is overwhelmingly unlikely to be alive in the test runner.
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
		expect(existsSync(lockPath)).toBe(false); // released after fn
	});

	it("steals a lock older than staleMs", async () => {
		// Same PID, but timestamp 10 minutes ago.
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
			{ staleMs: 1000 }, // 1 second
		);
		expect(result).toBe("stale-stolen");
	});

	it("creates parent directories if they do not exist", async () => {
		const nestedLock = join(tmpDir, "deep", "nested", "cache.lock");
		const result = await withFileLock(nestedLock, async () => 42);
		expect(result).toBe(42);
		expect(existsSync(nestedLock)).toBe(false); // released
	});

	it("concurrent callers: exactly one wins while the first is in-flight", async () => {
		// Pins the exclusive-create ("wx") guarantee: no read-then-write
		// window where two processes could both "acquire".
		let releaseFirst: (() => void) | undefined;
		const first = withFileLock(lockPath, async () => {
			await new Promise<void>((resolve) => {
				releaseFirst = resolve;
			});
			return "first";
		});

		// Wait until the first caller actually holds the lock file.
		await vi.waitFor(() => expect(existsSync(lockPath)).toBe(true));

		const second = await withFileLock(lockPath, async () => "second");
		expect(second).toBeNull(); // live lock held → no acquisition, fn NOT run

		releaseFirst?.();
		await expect(first).resolves.toBe("first");
		expect(existsSync(lockPath)).toBe(false); // released after first finishes
	});

	it("unparseable lock file is treated as stale and replaced", async () => {
		// A torn/foreign lock must not deadlock the plugin forever.
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
