import type { QuotaData } from "./types.js";
import { readProviderApiKey } from "./openrouter-fetcher.js";

let currentData: QuotaData | null = null;

export function getClineData(): QuotaData | null {
	return currentData;
}

export function isClineModel(modelIdOrName?: string): boolean {
	const id = (modelIdOrName ?? "").toString().toLowerCase();
	return id.startsWith("cline-pass/") || id.startsWith("cline/") || id.includes("cline-pass");
}

export async function fetchClineUsage(): Promise<void> {
	const key = readProviderApiKey("cline-pass");
	if (!key) {
		currentData = null;
		return;
	}
	try {
		const res = await fetch("https://api.cline.bot/api/v1/users/me/plan", {
			headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
		});
		if (!res.ok) {
			currentData = null;
			return;
		}
		currentData = null;
	} catch {
		currentData = null;
	}
}
