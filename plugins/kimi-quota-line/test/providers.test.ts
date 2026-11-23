import { describe, expect, it } from "vitest";
import { fetchKimiUsage, getKimiData } from "../src/kimi-fetcher.js";
import { fetchMinimaxUsage, getMinimaxData } from "../src/minimax-fetcher.js";
import {
	PROVIDERS,
	clineProvider,
	kimiProvider,
	minimaxProvider,
	opencodeGoProvider,
	openrouter2Provider,
	openrouterProvider,
} from "../src/providers.js";
import type { QuotaCache } from "../src/types.js";

describe("provider registry", () => {
	it("lists providers in fixed cache-key order", () => {
		expect(PROVIDERS.map((p) => p.id)).toEqual([
			"kimi",
			"minimax",
			"openrouter",
			"openrouter-2",
			"opencode-go",
			"cline-pass",
		]);
	});

	it("wraps the existing fetcher functions without moving them", () => {
		expect(kimiProvider.fetch).toBe(fetchKimiUsage);
		expect(kimiProvider.getData).toBe(getKimiData);
		expect(minimaxProvider.fetch).toBe(fetchMinimaxUsage);
		expect(minimaxProvider.getData).toBe(getMinimaxData);
	});

	it("cacheKey maps onto the matching QuotaCache field", () => {
		expect(kimiProvider.cacheKey).toBe("kimi");
		expect(minimaxProvider.cacheKey).toBe("minimax");
		expect(openrouterProvider.cacheKey).toBe("openrouter");
		expect(openrouter2Provider.cacheKey).toBe("openrouter2");
		expect(opencodeGoProvider.cacheKey).toBe("opencodeGo");
		expect(clineProvider.cacheKey).toBe("cline");
	});

	it("shortLabel matches locked design", () => {
		expect(kimiProvider.shortLabel).toBe("Kimi");
		expect(minimaxProvider.shortLabel).toBe("MM");
		expect(openrouterProvider.shortLabel).toBe("OR");
		expect(openrouter2Provider.shortLabel).toBe("OR2");
		expect(opencodeGoProvider.shortLabel).toBe("OPC-G");
		expect(clineProvider.shortLabel).toBe("CL-P");
	});

	it("aliasPrefixes cover all known prefixes", () => {
		const prefixes = PROVIDERS.flatMap((p) => p.aliasPrefixes).sort();
		expect(prefixes).toEqual([
			"cline-pass",
			"kimi-code",
			"minimax",
			"opencode-go",
			"openrouter",
			"openrouter-2",
		]);
	});

	it("matches delegates to detectors", () => {
		expect(kimiProvider.matches("kimi-for-coding")).toBe(true);
		expect(kimiProvider.matches("K3-256k")).toBe(true);
		expect(minimaxProvider.matches("minimax-m2")).toBe(true);
		expect(opencodeGoProvider.matches("opencode-go/kimi-k3")).toBe(true);
		expect(openrouterProvider.matches("openrouter/anthropic/claude-opus-4.8")).toBe(true);
		expect(clineProvider.matches("cline-pass/cline-pass/muse")).toBe(true);
	});

	it("heartbeat assembly fills provider fields in order", () => {
		const cache = {
			ts: 1,
			model: "m",
			kimi: null,
			minimax: null,
			openrouter: null,
			openrouter2: null,
			opencodeGo: null,
			cline: null,
		} as QuotaCache;
		const filled: string[] = [];
		for (const p of PROVIDERS) {
			const key = p.cacheKey;
			const data = p.getData();
			if (data !== null && data !== undefined) {
				(cache as unknown as Record<string, unknown>)[key] = data;
			}
			filled.push(key);
		}
		expect(filled).toEqual(["kimi", "minimax", "openrouter", "openrouter2", "opencodeGo", "cline"]);
		expect(Object.keys(cache)).toEqual([
			"ts",
			"model",
			"kimi",
			"minimax",
			"openrouter",
			"openrouter2",
			"opencodeGo",
			"cline",
		]);
	});
});
