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

		currentData = { wUsed, wLimit, wResetAt, hUsed, hLimit, hResetAt, hRemaining };
	} catch {
		currentData = null;
	}
}
