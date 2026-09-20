/**
 * MiniMax Token Plan (Coding Plan) usage fetcher.
 * Ported from 01_pi-Footer/.pi/extensions/pi-footer/minimax-fetcher.ts.
 *
 * Adaptations for kimi-code CLI:
 *   - Drops `import type { Model }`.
 *   - isMinimaxModel() accepts a plain string.
 *   - Reads auth.json from $KIMI_CODE_HOME instead of $PI_CODING_AGENT_DIR.
 *
 * Endpoint, status-code mapping, pickRepModel, resetIso, and the cached
 * shape match pi-footer exactly.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { formatRemaining } from "./helpers.js";
import type { QuotaData } from "./types.js";

/* ─── config ─── */
const URL_INTL = "https://api.minimax.io/v1/api/openplatform/coding_plan/remains";
const URL_CN = "https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains";

const STATUS_OK = 0;
const STATUS_INACTIVE = 2062;
const STATUS_BAD_KEY = 1004;
const STATUS_INVALID_KEY = 2049;
const STATUS_WRONG_KEY = 2057;

interface ModelRemains {
	model_name?: string;
	current_interval_total_count?: number | string;
	current_interval_usage_count?: number | string;
	remains_time?: number | string;
	end_time?: number | string;
	current_weekly_total_count?: number | string;
	current_weekly_usage_count?: number | string;
	weekly_remains_time?: number | string;
	weekly_end_time?: number | string;
	current_interval_remaining_percent?: number | string;
	current_weekly_remaining_percent?: number | string;
	current_interval_status?: number | string;
	current_weekly_status?: number | string;
}

interface CodingPlanResponse {
	model_remains?: ModelRemains[] | null;
	base_resp?: { status_code?: number | string; status_msg?: string };
}

/**
 * Retrieves the MiniMax API token from auth.json or environment variables.
 */
export function getMinimaxToken(): string | null {
	try {
		const agentDir = process.env.KIMI_CODE_HOME || join(homedir(), ".kimi-code");
		const authPath = join(agentDir, "auth.json");
		const raw = readFileSync(authPath, "utf-8");
		const auth = JSON.parse(raw) as Record<string, { key?: string }>;
		return auth.minimax?.key || auth["minimax-cn"]?.key || null;
	} catch {
		return process.env.MINIMAX_API_KEY || null;
	}
}

export const MINIMAX_TOKEN = getMinimaxToken();

let currentData: QuotaData | null = null;
let workingHost: string | null = null;

export function getMinimaxData(): QuotaData | null {
	return currentData;
}

/**
 * Converts a number-or-string API field to a number.
 */
export function num(v: unknown): number {
	if (typeof v === "number" && !Number.isNaN(v)) return v;
	if (typeof v === "string") {
		const n = parseFloat(v);
		if (!Number.isNaN(n)) return n;
	}
	return 0;
}

/**
 * True if a model_remains entry carries coding-plan quota.
 */
export function isQuotaModel(name: unknown): boolean {
	if (typeof name !== "string") return false;
	const s = name.trim().toLowerCase();
	return s.startsWith("minimax-m") || s.startsWith("coding-plan") || s === "general";
}

/**
 * True when the given model id or name identifies a MiniMax model.
 */
export function isMinimaxModel(modelIdOrName?: string): boolean {
	const id = (modelIdOrName ?? "").toString().toLowerCase();
	return id.includes("minimax");
}

/**
 * Converts MiniMax reset fields into an ISO string.
 */
export function resetIso(
	remainsMs: number | string | undefined,
	endMs: number | string | undefined,
	capturedAt: number,
): string | undefined {
	const rem = num(remainsMs);
	if (rem > 0) return new Date(capturedAt + rem).toISOString();
	const end = num(endMs);
	if (end > 0) return new Date(end).toISOString();
	return undefined;
}

/**
 * Picks the representative quota entry.
 */
export function pickRepModel(models: ModelRemains[], getTotal: (m: ModelRemains) => number): ModelRemains | null {
	if (models.length === 0) return null;
	const general = models.find((m) => m.model_name?.trim().toLowerCase() === "general");
	if (general) return general;
	const withQuota = models.filter((m) => getTotal(m) > 0);
	const pool = withQuota.length > 0 ? withQuota : models;
	return pool.reduce((best, cur) => (getTotal(cur) > getTotal(best) ? cur : best));
}

async function fetchJson(host: string): Promise<CodingPlanResponse> {
	const res = await fetch(host, {
		headers: { Authorization: `Bearer ${MINIMAX_TOKEN}`, Accept: "application/json" },
	});
	const raw = await res.text();
	try {
		return JSON.parse(raw) as CodingPlanResponse;
	} catch {
		return {};
	}
}

/**
 * Fetches MiniMax Coding Plan usage and caches it.
 * Auto-region: tries intl first, retries cn on auth-region errors.
 */
export async function fetchMinimaxUsage(): Promise<void> {
	if (!MINIMAX_TOKEN) return;
	const capturedAt = Date.now();
	try {
		const hosts = workingHost ? [workingHost] : [URL_INTL, URL_CN];

		let json: CodingPlanResponse | null = null;
		for (const host of hosts) {
			const candidate = await fetchJson(host);
			const status = num(candidate.base_resp?.status_code);
			if (!workingHost && host === URL_INTL && (status === STATUS_BAD_KEY || status === STATUS_INVALID_KEY)) {
				continue;
			}
			if (status === STATUS_OK || status === STATUS_INACTIVE || status === STATUS_WRONG_KEY) {
				workingHost = host;
			}
			json = candidate;
			break;
		}
		if (!json) {
			currentData = null;
			return;
		}

		const status = num(json.base_resp?.status_code);
		if (status !== STATUS_OK) {
			currentData = null;
			return;
		}

		const arr = Array.isArray(json.model_remains) ? json.model_remains : [];
		const quotaModels = arr.filter((m) => isQuotaModel(m.model_name));
		if (quotaModels.length === 0) {
			currentData = null;
			return;
		}

		const weeklyModel = pickRepModel(quotaModels, (m) => num(m.current_weekly_total_count));
		const sessionModel = pickRepModel(quotaModels, (m) => num(m.current_interval_total_count));

		const wTotal = Math.max(0, num(weeklyModel?.current_weekly_total_count));
		const wLimit = wTotal > 0 ? wTotal : 100;
		const wUsed =
			wTotal > 0
				? Math.max(0, num(weeklyModel?.current_weekly_usage_count))
				: Math.max(0, 100 - num(weeklyModel?.current_weekly_remaining_percent));
		const wResetAt = resetIso(weeklyModel?.weekly_remains_time, weeklyModel?.weekly_end_time, capturedAt);

		const hTotal = Math.max(0, num(sessionModel?.current_interval_total_count));
		const hLimit = hTotal > 0 ? hTotal : 100;
		const hUsed =
			hTotal > 0
				? Math.max(0, num(sessionModel?.current_interval_usage_count))
				: Math.max(0, 100 - num(sessionModel?.current_interval_remaining_percent));
		const hResetAt = resetIso(sessionModel?.remains_time, sessionModel?.end_time, capturedAt);
		const hRemaining = formatRemaining(hResetAt);

		currentData = { wUsed, wLimit, wResetAt, hUsed, hLimit, hResetAt, hRemaining };
	} catch {
		currentData = null;
	}
}
