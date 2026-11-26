import { fetchKimiUsage, getKimiData, isKimiModel } from "./kimi-fetcher.js";
import { fetchMinimaxUsage, getMinimaxData, isMinimaxModel } from "./minimax-fetcher.js";
import {
	fetchOpenRouterUsage,
	getOpenRouter2Data,
	getOpenRouterData,
	isOpenRouterModel,
} from "./openrouter-fetcher.js";
import { fetchOpenCodeGoUsage, getOpenCodeGoData, isOpenCodeGoModel } from "./opencode-go-fetcher.js";
import { fetchClineUsage, getClineData, isClineModel } from "./cline-fetcher.js";
import { isZaiModel } from "./model-detect.js";
import type { QuotaCache, QuotaData, RequestQuotaData } from "./types.js";

export interface QuotaProvider {
	readonly id: string;
	readonly cacheKey: keyof Omit<QuotaCache, "ts" | "model">;
	readonly matches: (model: string) => boolean;
	readonly fetch: () => Promise<void>;
	readonly getData: () => QuotaData | RequestQuotaData | null;
	readonly aliasPrefixes: readonly string[];
	readonly shortLabel: string;
	readonly hasUsageApi?: boolean;
}

export const kimiProvider: QuotaProvider = {
	id: "kimi",
	cacheKey: "kimi",
	matches: isKimiModel,
	fetch: fetchKimiUsage,
	getData: getKimiData,
	aliasPrefixes: ["kimi-code"],
	shortLabel: "Kimi",
};

export const minimaxProvider: QuotaProvider = {
	id: "minimax",
	cacheKey: "minimax",
	matches: isMinimaxModel,
	fetch: fetchMinimaxUsage,
	getData: getMinimaxData,
	aliasPrefixes: ["minimax"],
	shortLabel: "MM",
};

export const openrouterProvider: QuotaProvider = {
	id: "openrouter",
	cacheKey: "openrouter",
	matches: isOpenRouterModel,
	fetch: fetchOpenRouterUsage,
	getData: getOpenRouterData,
	aliasPrefixes: ["openrouter"],
	shortLabel: "OR",
};

export const openrouter2Provider: QuotaProvider = {
	id: "openrouter-2",
	cacheKey: "openrouter2",
	matches: () => false,
	fetch: async () => {},
	getData: getOpenRouter2Data,
	aliasPrefixes: ["openrouter-2"],
	shortLabel: "OR2",
};

export const opencodeGoProvider: QuotaProvider = {
	id: "opencode-go",
	cacheKey: "opencodeGo",
	matches: isOpenCodeGoModel,
	fetch: fetchOpenCodeGoUsage,
	getData: getOpenCodeGoData,
	aliasPrefixes: ["opencode-go"],
	shortLabel: "OPC-G",
};

export const clineProvider: QuotaProvider = {
	id: "cline-pass",
	cacheKey: "cline",
	matches: isClineModel,
	fetch: fetchClineUsage,
	getData: getClineData,
	aliasPrefixes: ["cline-pass"],
	shortLabel: "CL-P",
};

export const zaiProvider: QuotaProvider = {
	id: "zai-coding-plan",
	cacheKey: "zai",
	matches: isZaiModel,
	fetch: async () => {},
	getData: () => null,
	aliasPrefixes: ["zai-coding-plan"],
	shortLabel: "ZAI",
	hasUsageApi: false,
};

export const PROVIDERS: readonly QuotaProvider[] = [
	kimiProvider,
	minimaxProvider,
	openrouterProvider,
	openrouter2Provider,
	opencodeGoProvider,
	clineProvider,
	zaiProvider,
];

export function providerForAliasPrefix(prefix: string): QuotaProvider | undefined {
	const p = prefix.toLowerCase();
	return PROVIDERS.find((entry) => entry.aliasPrefixes.some((a) => a.toLowerCase() === p));
}
