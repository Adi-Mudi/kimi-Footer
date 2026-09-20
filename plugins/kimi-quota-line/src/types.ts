/**
 * Shared TypeScript interfaces used across src/, hooks/, bin/, and test/.
 */

/** Shape returned by both kimi-fetcher and minimax-fetcher (per pi-footer convention). */
export interface QuotaData {
	wUsed: number;
	wLimit: number;
	wResetAt: string | undefined;
	hUsed: number;
	hLimit: number;
	hResetAt: string | undefined;
	hRemaining: string;
}

export interface GitInfo {
	branch: string;
	count: number;
	text: string;
	isWorktree: boolean;
}

/** Cache file written by refresh-cache, read by render-row1. */
export interface CacheFile {
	ts: number;
	model: string | null;
	kimi: QuotaData | null;
	minimax: QuotaData | null;
	git: GitInfo | null;
}

/**
 * Quota cache (one file, written by hooks/refresh-cache.ts, read by
 * bin/render-row1.ts). The only disk cache the plugin uses since v1.3.1;
 * git data is read live from `git status` on every render.
 */
export interface QuotaCache {
	ts: number;
	model: string | null;
	kimi: QuotaData | null;
	minimax: QuotaData | null;
}

/** Payload kimi-code passes to the status_line.command via stdin. */
export interface StatusLinePayload {
	model: string;
	cwd: string;
	gitBranch: string | null;
	permissionMode: string;
	planMode: boolean;
	contextUsage: number;
	contextTokens: number;
	maxContextTokens: number;
	sessionId: string;
	version: string;
}

/**
 * Bar glyphs used by helpers.ts to render quota bars.
 * Provider-neutral; live in types.ts so they are not tied to a specific fetcher.
 */
export const FILLED = "▮";
export const EMPTY = "▯";
