import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { QuotaCache } from "./types.js";

function cacheDir(): string {
	return process.env.XDG_RUNTIME_DIR || "/tmp";
}

export function quotaCachePath(): string {
	return join(cacheDir(), "kimi-quota-line-quota-cache.json");
}

export function quotaLockPath(): string {
	return `${quotaCachePath()}.lock`;
}

export const QUOTA_LOCK_PATH = quotaLockPath();

export function readQuotaCache(): QuotaCache | null {
	try {
		const raw = readFileSync(quotaCachePath(), "utf-8");
		return JSON.parse(raw) as QuotaCache;
	} catch {
		return null;
	}
}

export function writeQuotaCache(data: QuotaCache): void {
	const target = quotaCachePath();
	const tmp = `${target}.tmp-${process.pid}`;
	try {
		writeFileSync(tmp, JSON.stringify(data));
		renameSync(tmp, target);
	} catch (e) {
		try {
			unlinkSync(tmp);
		} catch {
			
		}
		throw e;
	}
}
