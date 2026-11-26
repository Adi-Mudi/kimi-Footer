import type { QuotaData } from "./types.js";
import { formatRemaining } from "./helpers.js";
import { readProviderApiKey } from "./openrouter-fetcher.js";

interface Meter {
	status?: string;
	percent?: number;
	resetsAt?: string;
}

interface OpenCodeGoUsageResponse {
	usage?: {
		rolling?: Meter;
		weekly?: Meter;
		monthly?: Meter;
	};
}

let currentData: QuotaData | null = null;

export function getOpenCodeGoData(): QuotaData | null {
	return currentData;
}

export function isOpenCodeGoModel(modelIdOrName?: string): boolean {
	const id = (modelIdOrName ?? "").toString().toLowerCase();
	return id.includes("opencode-go");
}

function meterToPair(m: Meter | undefined): { used: number; limit: number; resetAt: string | undefined } {
	const pct = Number(m?.percent ?? 0);
	return {
		used: Math.max(0, Math.min(100, pct)),
		limit: 100,
		resetAt: m?.resetsAt,
	};
}

export async function fetchOpenCodeGoUsage(): Promise<void> {
	const key = readProviderApiKey("opencode-go");
	if (!key) {
		currentData = null;
		return;
	}
	try {
		const res = await fetch("https://opencode.ai/inference/go/v1/usage", {
			headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
		});
		if (!res.ok) {
			currentData = null;
			return;
		}
		const json = (await res.json()) as OpenCodeGoUsageResponse;
		const w = meterToPair(json.usage?.weekly);
		const h = meterToPair(json.usage?.rolling);
		const mRaw = json.usage?.monthly;
		const monthly =
			mRaw && typeof mRaw.percent === "number"
				? {
						mUsed: meterToPair(mRaw).used,
						mLimit: 100,
						mResetAt: mRaw.resetsAt,
					}
				: {};
		currentData = {
			wUsed: w.used,
			wLimit: w.limit,
			wResetAt: w.resetAt,
			hUsed: h.used,
			hLimit: h.limit,
			hResetAt: h.resetAt,
			hRemaining: formatRemaining(h.resetAt),
			...monthly,
		};
	} catch {
		currentData = null;
	}
}
