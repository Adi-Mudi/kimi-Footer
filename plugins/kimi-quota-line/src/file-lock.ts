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

function tryCreateLock(lockPath: string, owned: LockContent): boolean {
	try {
		writeFileSync(lockPath, JSON.stringify(owned), { flag: "wx" });
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
		
		
	}
}

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

	const owned: LockContent = {
		pid: process.pid,
		host: hostname(),
		acquiredAt: Date.now(),
	};

	
	if (!tryCreateLock(lockPath, owned)) {
		
		const existing = readLock(lockPath);
		if (existing && !isLockStale(existing, staleMs)) {
			return null; 
		}
		
		
		
		try {
			unlinkSync(lockPath);
		} catch {
			
		}
		if (!tryCreateLock(lockPath, owned)) {
			return null;
		}
	}

	try {
		return await fn();
	} finally {
		releaseLock(lockPath, owned);
	}
}
