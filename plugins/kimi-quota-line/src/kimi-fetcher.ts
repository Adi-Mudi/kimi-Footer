import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { formatRemaining } from "./helpers.js";
import type { QuotaData } from "./types.js";

function readHomeFile(name: string): string | null {
	try {
		const dir = process.env.KIMI_CODE_HOME || join(homedir(), ".kimi-code");
		return readFileSync(join(dir, name), "utf-8");
	} catch {
		return null;
	}
}

function authKeyFrom(names: string[]): string | null {
	for (const file of ["auth.json", "auth.json.reset"]) {
		const raw = readHomeFile(file);
		if (!raw) continue;
		try {
			const obj = JSON.parse(raw) as Record<string, { key?: string }>;
			for (const n of names) {
				const k = obj[n]?.key;
				if (k) return k;
			}
		} catch {
		}
	}
	return null;
}

interface KimiUsageResponse {
	usage?: Record<string, unknown>;
	limits?: Array<{
		window?: { duration?: number | string; timeUnit?: string };
		detail?: Record<string, unknown>;
	}>;
	usages?: Record<string, { used_ratio?: number; reset_time?: string }>;
}

export function getKimiToken(): string | null {
	return authKeyFrom(["kimi-coding", "kimi"]) || process.env.KIMI_API_KEY || process.env.KIMI_AUTH_TOKEN || null;
}

export const TOKEN = getKimiToken();

let currentData: QuotaData | null = null;

export function getKimiData(): QuotaData | null {
	return currentData;
}

function getResetAt(data: Record<string, unknown> | undefined): string | undefined {
	if (!data) return undefined;
	const keys = ["reset_at", "resetAt", "reset_time", "resetTime"];
	for (const key of keys) {
		const val = data[key];
		if (typeof val === "string") return val;
	}
	return undefined;
}

export { isKimiModel } from "./model-detect.js";

export async function fetchKimiUsage(): Promise<void> {
	if (!TOKEN) return;
	try {
		const res = await fetch("https://api.kimi.com/coding/v1/usages", {
			headers: { Authorization: `Bearer ${TOKEN}` },
		});
		if (!res.ok) return;
		const data = (await res.json()) as KimiUsageResponse;
		if (!data?.usage) return;
		const wUsed = Number(data.usage.used || 0);
		const wLimit = Number(data.usage.limit || 1);
		const wResetAt = getResetAt(data.usage);
		const window = data.limits?.[0];
		const hUsed = Number(window?.detail?.used || 0);
		const hLimit = Number(window?.detail?.limit || 1);
		const hResetAt = getResetAt(window?.detail);
		const hRemaining = formatRemaining(hResetAt);
		const monthBucket = data.usages?.limit_month_total ?? data.usages?.limit_month_code;
		const mRatio = Number(monthBucket?.used_ratio);
		const monthly =
			Number.isFinite(mRatio) && mRatio >= 0
				? {
						mUsed: Math.round(mRatio * 10000) / 100,
						mLimit: 100,
						mResetAt: monthBucket?.reset_time,
					}
				: {};
		currentData = { wUsed, wLimit, wResetAt, hUsed, hLimit, hResetAt, hRemaining, ...monthly };
	} catch {
		currentData = null;
	}
}
