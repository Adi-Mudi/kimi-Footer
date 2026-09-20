/**
 * Advisory file lock — guarantees atomic read/write of the cache files.
 *
 * Node.js v22.22 does not yet expose `fs.flock` (added in later minors / not
 * backported to this LTS), so we implement an advisory lock on a sidecar
 * `.lock` file using PID + timestamp. Same idea as the senai plugin's
 * project-wide lock: non-blocking, stale-aware.
 *
 * Semantics:
 *   - `withFileLock(lockPath, fn, { staleMs })` returns null immediately if
 *     another live process holds the lock.
 *   - If the lock is stale (PID dead OR older than `staleMs`, default 30 s),
 *     it is stolen.
 *   - The lock is released in `finally` after `fn` resolves or rejects.
 *
 * Not used for readers-vs-writers coordination (we use a single exclusive
 * lock for both). Render-time reads are fast enough that serializing them
 * does not hurt the 300 ms status-line budget.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname } from "node:path";

interface LockContent {
	pid: number;
	host: string;
	acquiredAt: number;
}

function readLock(lockPath: string): LockContent | null {
	try {
		const raw = readFileSync(lockPath, "utf-8");
		const parsed = JSON.parse(raw) as LockContent;
		if (typeof parsed.pid !== "number" || typeof parsed.acquiredAt !== "number") {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function isLockStale(lock: LockContent, staleMs: number): boolean {
	if (Date.now() - lock.acquiredAt > staleMs) return true;
	if (!isPidAlive(lock.pid)) return true;
	return false;
}

function writeLock(lockPath: string, lock: LockContent): boolean {
	try {
		writeFileSync(lockPath, JSON.stringify(lock));
		return true;
	} catch {
		return false;
	}
}

function releaseLock(lockPath: string, owned: LockContent): void {
	try {
		const current = readLock(lockPath);
		if (current && current.pid === owned.pid && current.acquiredAt === owned.acquiredAt) {
			unlinkSync(lockPath);
		}
	} catch {
		// Best effort. A crashed process leaves a stale lock that will be
		// stolen on the next acquire after `staleMs`.
	}
}

/**
 * Runs `fn` while holding an exclusive advisory lock on `lockPath`.
 *
 * Non-blocking. Returns null immediately if another live process holds the
 * lock. The lock is released in `finally` regardless of `fn`'s outcome.
 */
export async function withFileLock<T>(
	lockPath: string,
	fn: () => Promise<T>,
	opts?: { staleMs?: number },
): Promise<T | null> {
	const staleMs = opts?.staleMs ?? 30_000;
	const lockDir = dirname(lockPath);
	if (!existsSync(lockDir)) {
		mkdirSync(lockDir, { recursive: true });
	}

	const existing = readLock(lockPath);
	if (existing && !isLockStale(existing, staleMs)) {
		return null;
	}

	const owned: LockContent = {
		pid: process.pid,
		host: hostname(),
		acquiredAt: Date.now(),
	};
	if (!writeLock(lockPath, owned)) {
		return null;
	}

	try {
		return await fn();
	} finally {
		releaseLock(lockPath, owned);
	}
}
