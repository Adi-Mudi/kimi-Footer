import { readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface GitCacheEntry {
	
	cwd: string;
	
	headMtimeMs: number;
	
	indexMtimeMs: number;
	
	capturedAt: number;
	
	branch: string | null;
	isWorktree: boolean;
	count: number;
}

function cacheDir(): string {
	return process.env.XDG_RUNTIME_DIR || "/tmp";
}

export function gitCachePath(): string {
	return join(cacheDir(), "kimi-quota-line-git-cache.json");
}

export function readGitCache(): GitCacheEntry | null {
	try {
		const raw = readFileSync(gitCachePath(), "utf-8");
		const parsed = JSON.parse(raw) as Partial<GitCacheEntry>;
		if (
			typeof parsed.cwd !== "string" ||
			typeof parsed.headMtimeMs !== "number" ||
			typeof parsed.indexMtimeMs !== "number" ||
			typeof parsed.capturedAt !== "number" ||
			typeof parsed.count !== "number" ||
			typeof parsed.isWorktree !== "boolean"
		) {
			return null;
		}
		return parsed as GitCacheEntry;
	} catch {
		return null;
	}
}

export function writeGitCacheAtomic(entry: GitCacheEntry): void {
	const target = gitCachePath();
	const tmp = `${target}.tmp-${process.pid}`;
	try {
		writeFileSync(tmp, JSON.stringify(entry));
		renameSync(tmp, target);
	} catch (e) {
		try {
			unlinkSync(tmp);
		} catch {
			
		}
		throw e;
	}
}

export function resolveMaxAgeMs(): number {
	const raw = Number(process.env.KIMI_GIT_MAX_AGE_MS);
	if (!Number.isFinite(raw) || raw < 0) return 2000;
	return raw;
}

export function statGitDir(gitDir: string): { headMtimeMs: number; indexMtimeMs: number } | null {
	try {
		const head = statSync(join(gitDir, "HEAD"));
		const index = statSync(join(gitDir, "index"));
		return {
			headMtimeMs: Math.floor(head.mtimeMs),
			indexMtimeMs: Math.floor(index.mtimeMs),
		};
	} catch {
		return null;
	}
}

export function isCacheValid(
	entry: GitCacheEntry,
	current: { cwd: string; headMtimeMs: number; indexMtimeMs: number; now: number },
	maxAgeMs: number,
): boolean {
	if (entry.cwd !== current.cwd) return false;
	if (entry.headMtimeMs !== current.headMtimeMs) return false;
	if (entry.indexMtimeMs !== current.indexMtimeMs) return false;
	return current.now - entry.capturedAt <= maxAgeMs;
}
