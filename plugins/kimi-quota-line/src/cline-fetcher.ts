import type { QuotaData } from "./types.js";
import { readProviderApiKey } from "./openrouter-fetcher.js";

const USAGE_LIMITS_URL = "https://api.cline.bot/api/v1/users/me/plan/usage-limits";
const FETCH_TIMEOUT_MS = 4000;
const COOLDOWN_MS = 60_000;

let currentData: QuotaData | null = null;
let cooldownUntil = 0;

interface ClineLimit {
	type?: string;
	percentUsed?: number | string;
	resetsAt?: string | null;
}

interface ClineUsageLimitsResponse {
	success?: boolean;
	data?: { limits?: ClineLimit[] };
}

export function getClineData(): QuotaData | null {
	return currentData;
}

export function isClineModel(modelIdOrName?: string): boolean {
	const id = (modelIdOrName ?? "").toString().toLowerCase();
	return id.startsWith("cline-pass/") || id.startsWith("cline/") || id.includes("cline-pass");
}

function clampPercent(v: unknown): number | null {
	const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
	if (!Number.isFinite(n)) return null;
	return Math.max(0, Math.min(100, n));
}

function resetIso(v: string | null | undefined): string | undefined {
	if (!v) return undefined;
	return v;
}

function windowPair(limit: ClineLimit | undefined): {
	used: number;
	limit: number;
	resetAt: string | undefined;
} | null {
	if (!limit) return null;
	const pct = clampPercent(limit.percentUsed);
	if (pct === null) return null;
	return { used: pct, limit: 100, resetAt: resetIso(limit.resetsAt) };
}

export async function fetchClineUsage(): Promise<void> {
	if (Date.now() < cooldownUntil) return;
	const key = readProviderApiKey("cline-pass");
	if (!key) {
		currentData = null;
		return;
	}
	try {
		const res = await fetch(USAGE_LIMITS_URL, {
			headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 429) {
			cooldownUntil = Date.now() + COOLDOWN_MS;
			currentData = null;
			return;
		}
		if (!res.ok) {
			currentData = null;
			return;
		}
		const text = await res.text();
		let json: ClineUsageLimitsResponse;
		try {
			json = JSON.parse(text) as ClineUsageLimitsResponse;
		} catch {
			cooldownUntil = Date.now() + COOLDOWN_MS;
			currentData = null;
			return;
		}
		if (json.success === false) {
			currentData = null;
			return;
		}
		const limits = Array.isArray(json.data?.limits) ? json.data.limits : [];
		const byType = new Map<string, ClineLimit>();
		for (const entry of limits) {
			if (entry?.type) byType.set(entry.type, entry);
		}
		const m = windowPair(byType.get("monthly"));
		const w = windowPair(byType.get("weekly"));
		const h = windowPair(byType.get("five_hour"));
		if (!m && !w && !h) {
			currentData = null;
			return;
		}
		currentData = {
			wUsed: w?.used ?? 0,
			wLimit: w?.limit ?? 0,
			wResetAt: w?.resetAt,
			hUsed: h?.used ?? 0,
			hLimit: h?.limit ?? 0,
			hResetAt: h?.resetAt,
			hRemaining: "",
			mUsed: m?.used,
			mLimit: m?.limit,
			mResetAt: m?.resetAt,
		};
	} catch {
		currentData = null;
	}
}
