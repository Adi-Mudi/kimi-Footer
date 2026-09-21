/**
 * Git cache file I/O — mtime-keyed, never TTL-only.
 *
 * The single synchronization point between the 1 s status-line drawer and
 * the filesystem. The cache is valid only while the repo's `.git/HEAD` and
 * `.git/index` mtimes are unchanged AND the entry is younger than a
 * configurable max age (bounds the working-tree blind spot: plain file
 * edits and untracked files do not touch `.git/index` mtime).
 *
 * The age check runs at READ time against the CURRENT mtimes — never a
 * write-time "fresh enough" flag. The v1.3.1 staleness bug (write-time TTL
 * passing a 1 s check on 60 s-old data) is structurally impossible here.
 *
 * Writes are atomic: tmp file + rename, so a crashed or overlapping writer
 * can never leave a torn JSON on the render path.
 */
import { readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface GitCacheEntry {
	/** cwd the entry was captured in (cache is per-repo-checkout). */
	cwd: string;
	/** mtime (ms) of `<gitDir>/HEAD` at capture time. */
	headMtimeMs: number;
	/** mtime (ms) of `<gitDir>/index` at capture time. */
	indexMtimeMs: number;
	/** wall clock at capture time (ms since epoch). */
	capturedAt: number;
	/** branch from `git status --porcelain=v2 --branch` (null = detached). */
	branch: string | null;
	isWorktree: boolean;
	count: number;
}

function cacheDir(): string {
	return process.env.XDG_RUNTIME_DIR || "/tmp";
}

/** Path the git cache file lives at (computed lazily). */
export function gitCachePath(): string {
	return join(cacheDir(), "kimi-quota-line-git-cache.json");
}

/** Reads the git cache. Returns null on any read/parse/shape failure. */
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

/**
 * Writes the git cache atomically: tmp file first, then rename over the
 * target. Readers see either the complete old file or the complete new
 * file — never a torn one. Throws on I/O failure (caller decides).
 */
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
			// temp may not exist if the write never started — best effort
		}
		throw e;
	}
}

/**
 * max-age bounds the working-tree blind spot. Default 2000 ms: plain
 * edits show up within ≤2 s even though they do not touch `.git/index`.
 * Env `KIMI_GIT_MAX_AGE_MS`: 0 = always live (subprocess every
 * render); NaN/negative → default.
 */
export function resolveMaxAgeMs(): number {
	const raw = Number(process.env.KIMI_GIT_MAX_AGE_MS);
	if (!Number.isFinite(raw) || raw < 0) return 2000;
	return raw;
}

/** Current mtimes of a repo's HEAD + index. Null when either is unreadable. */
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

/**
 * Validity = same cwd AND identical HEAD/index mtimes AND age ≤ maxAgeMs.
 * mtime equality gives instant refresh on staging/commit/branch-switch;
 * maxAge covers the working-tree blind spot.
 */
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
