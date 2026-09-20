/**
 * Kimi API usage fetcher — keeps cached data and exposes current values.
 * Ported from 01_pi-Footer/.pi/extensions/pi-footer/kimi-fetcher.ts.
 *
 * Adaptations for kimi-code CLI:
 *   - Drops `import type { Model }` from @earendil-works/pi-coding-agent.
 *   - isKimiModel() accepts a plain string (id or name).
 *   - Reads auth.json from $KIMI_CODE_HOME instead of $PI_CODING_AGENT_DIR.
 *
 * No runtime behavior change: endpoint URL, token loader, response parsing,
 * error handling, and the cached shape match pi-footer exactly.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { formatRemaining } from "./helpers.js";
import type { QuotaData } from "./types.js";

interface KimiUsageResponse {
	usage?: Record<string, unknown>;
	limits?: Array<{
		window?: { duration?: number | string; timeUnit?: string };
		detail?: Record<string, unknown>;
	}>;
}

/**
 * Retrieves the Kimi API token from auth.json or environment variables.
 */
export function getKimiToken(): string | null {
	try {
		const agentDir = process.env.KIMI_CODE_HOME || join(homedir(), ".kimi-code");
		const authPath = join(agentDir, "auth.json");
		const raw = readFileSync(authPath, "utf-8");
		const auth = JSON.parse(raw) as Record<string, { key?: string }>;
		return auth["kimi-coding"]?.key || auth.kimi?.key || null;
	} catch {
		return process.env.KIMI_API_KEY || process.env.KIMI_AUTH_TOKEN || null;
	}
}

export const TOKEN = getKimiToken();

let currentData: QuotaData | null = null;

export function getKimiData(): QuotaData | null {
	return currentData;
}

/**
 * Extracts the reset timestamp from a usage data object.
 */
function getResetAt(data: Record<string, unknown> | undefined): string | undefined {
	if (!data) return undefined;
	const keys = ["reset_at", "resetAt", "reset_time", "resetTime"];
	for (const key of keys) {
		const val = data[key];
		if (typeof val === "string") return val;
	}
	return undefined;
}

/**
 * True when the given model id or name identifies a Kimi model.
 * Accepts a plain string (kimi-code StatusLinePayload.model).
 */
export function isKimiModel(modelIdOrName?: string): boolean {
	const id = (modelIdOrName ?? "").toString().toLowerCase();
	if (id.includes("kimi")) return true;
	// Kimi family aliases: k3, k3-256k, k2, k1.5 etc.
	// kimi-code sends bare ids like "k3-256k" when no provider prefix is present.
	return /^k\d/.test(id);
}

/**
 * Fetches Kimi usage and caches it. Never throws.
 */
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

		currentData = { wUsed, wLimit, wResetAt, hUsed, hLimit, hResetAt, hRemaining };
	} catch {
		currentData = null;
	}
}
