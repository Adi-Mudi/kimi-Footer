import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RequestQuotaData } from "./types.js";

function configPath(): string {
	return join(process.env.KIMI_CODE_HOME || join(homedir(), ".kimi-code"), "config.toml");
}

export function readProviderApiKey(providerId: string): string | null {
	try {
		const raw = readFileSync(configPath(), "utf-8");
		const re = new RegExp(
			`\\[providers\\.${providerId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\][\\s\\S]*?api_key\\s*=\\s*"([^"]+)"`,
		);
		const m = raw.match(re);
		return m?.[1] ?? null;
	} catch {
		return null;
	}
}

interface OpenRouterKeyResponse {
	data?: {
		free_model_daily_requests?: {
			used?: number;
			limit?: number;
			remaining?: number;
		};
	};
}

let currentOpenRouter: RequestQuotaData | null = null;
let currentOpenRouter2: RequestQuotaData | null = null;

export function getOpenRouterData(): RequestQuotaData | null {
	return currentOpenRouter;
}

export function getOpenRouter2Data(): RequestQuotaData | null {
	return currentOpenRouter2;
}

export function isOpenRouterModel(modelIdOrName?: string): boolean {
	const id = (modelIdOrName ?? "").toString().toLowerCase();
	return id.startsWith("openrouter/") || id.includes("openrouter");
}

async function fetchKeyUsage(key: string): Promise<RequestQuotaData | null> {
	const res = await fetch("https://openrouter.ai/api/v1/key", {
		headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
	});
	if (!res.ok) return null;
	const json = (await res.json()) as OpenRouterKeyResponse;
	const d = json.data?.free_model_daily_requests;
	if (!d || typeof d.limit !== "number") return null;
	return {
		used: Number(d.used || 0),
		limit: Number(d.limit || 0),
	};
}

export async function fetchOpenRouterUsage(): Promise<void> {
	const k1 = readProviderApiKey("openrouter");
	if (k1) {
		try {
			currentOpenRouter = await fetchKeyUsage(k1);
		} catch {
			currentOpenRouter = null;
		}
	}
	const k2 = readProviderApiKey("openrouter-2");
	if (k2) {
		try {
			currentOpenRouter2 = await fetchKeyUsage(k2);
		} catch {
			currentOpenRouter2 = null;
		}
	}
}
