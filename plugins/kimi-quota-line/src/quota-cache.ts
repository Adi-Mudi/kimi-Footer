/**
 * Quota cache file I/O.
 *
 * Separate from the git cache (src/git-cache.ts) so the two functions can
 * have independent lock boundaries. Writes are intentionally plain; the
 * call site wraps with `withFileLock` (see hooks/refresh-cache.ts).
 *
 * Paths are computed lazily (on each call) so a runtime change to
 * $XDG_RUNTIME_DIR (e.g. tests setting a tmp dir) takes effect immediately.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { QuotaCache } from "./types.js";

function cacheDir(): string {
	return process.env.XDG_RUNTIME_DIR || "/tmp";
}

/** Path the quota cache file lives at (computed lazily). */
export function quotaCachePath(): string {
	return join(cacheDir(), "kimi-quota-line-quota-cache.json");
}

/** Path the quota cache lock file lives at (computed lazily). */
export function quotaLockPath(): string {
	return `${quotaCachePath()}.lock`;
}

/** Back-compat alias: the lock path evaluated at the current moment. */
export const QUOTA_LOCK_PATH = quotaLockPath();

/** Reads the quota cache. Returns null on any read/parse failure. */
export function readQuotaCache(): QuotaCache | null {
	try {
		const raw = readFileSync(quotaCachePath(), "utf-8");
		return JSON.parse(raw) as QuotaCache;
	} catch {
		return null;
	}
}

/** Writes the quota cache. Throws on I/O failure (caller decides what to do). */
export function writeQuotaCache(data: QuotaCache): void {
	writeFileSync(quotaCachePath(), JSON.stringify(data));
}
