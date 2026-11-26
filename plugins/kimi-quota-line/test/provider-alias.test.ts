import { describe, expect, it } from "vitest";
import {
	KNOWN_PROVIDER_PREFIXES,
	SHORT_LABELS,
	fullModelName,
	parseModelAlias,
	resolveActiveProviderId,
	resolveForSession,
	resolveProviderId,
	shortLabelFor,
} from "../src/model-detect.js";
import { PROVIDERS } from "../src/providers.js";
import { BLINK_QUARTER_PERIOD_MS, buildRightZone } from "../bin/render-row1.js";
import type { QuotaCache } from "../src/types.js";

const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");
const DIM = "\x1b[38;5;244m";
const RESET = "\x1b[0m";
const Q = BLINK_QUARTER_PERIOD_MS;

function kimiCache(cacheModel: string | null): QuotaCache {
	return {
		ts: 0,
		model: cacheModel,
		kimi: {
			wUsed: 6,
			wLimit: 100,
			wResetAt: "2026-10-08T20:04:15Z",
			hUsed: 0,
			hLimit: 100,
			hResetAt: "2026-10-06T06:04:15Z",
			hRemaining: "3.18",
		},
		minimax: null,
	};
}

describe("parseModelAlias", () => {
	it("normalizes the SessionStart model OBJECT (managed: stripped)", () => {
		expect(parseModelAlias({ provider: "managed:kimi-code", model: "kimi-for-coding" })).toEqual({
			provider: "kimi-code",
			name: "kimi-for-coding",
		});
	});

	it("splits a provider-prefixed string on the first slash", () => {
		expect(parseModelAlias("cline-pass/kimi-k2")).toEqual({ provider: "cline-pass", name: "kimi-k2" });
		expect(parseModelAlias("openrouter/anthropic/claude-opus-4.8")).toEqual({
			provider: "openrouter",
			name: "anthropic/claude-opus-4.8",
		});
	});

	it("keeps a bare name prefix-less", () => {
		expect(parseModelAlias("kimi-for-coding")).toEqual({ provider: null, name: "kimi-for-coding" });
	});
});

describe("resolveProviderId + short labels", () => {
	it("resolves all 7 known prefixes", () => {
		expect(resolveProviderId("kimi-code")).toBe("kimi-code");
		expect(resolveProviderId("minimax")).toBe("minimax");
		expect(resolveProviderId("openrouter")).toBe("openrouter");
		expect(resolveProviderId("openrouter-2")).toBe("openrouter-2");
		expect(resolveProviderId("opencode-go")).toBe("opencode-go");
		expect(resolveProviderId("cline-pass")).toBe("cline-pass");
		expect(resolveProviderId("zai-coding-plan")).toBe("zai-coding-plan");
	});

	it("returns null for unknown prefixes", () => {
		expect(resolveProviderId("kilo")).toBeNull();
		expect(resolveProviderId("cline")).toBeNull();
		expect(resolveProviderId("zai")).toBeNull();
		expect(resolveProviderId("zhipu")).toBeNull();
	});

	it("maps short labels for locked design", () => {
		expect(shortLabelFor("kimi-code")).toBe("Kimi");
		expect(shortLabelFor("minimax")).toBe("MM");
		expect(shortLabelFor("opencode-go")).toBe("OPC-G");
		expect(shortLabelFor("openrouter")).toBe("OR");
		expect(shortLabelFor("openrouter-2")).toBe("OR2");
		expect(shortLabelFor("cline-pass")).toBe("CL-P");
		expect(shortLabelFor("zai-coding-plan")).toBe("ZAI");
		expect(shortLabelFor(null)).toBeNull();
	});

	it("SHORT_LABELS covers every known prefix", () => {
		for (const p of KNOWN_PROVIDER_PREFIXES) {
			expect(SHORT_LABELS[p]).toBeTruthy();
		}
	});
});

describe("fullModelName", () => {
	it("uses payload name after first slash", () => {
		expect(fullModelName("openrouter/anthropic/claude-opus-4.8")).toBe("anthropic/claude-opus-4.8");
		expect(fullModelName("opencode-go/mimo-v2.6-flash")).toBe("mimo-v2.6-flash");
	});

	it("never truncates long names", () => {
		const long = "x".repeat(80);
		expect(fullModelName(`openrouter/${long}`)).toBe(long);
	});
});

describe("registry aliasPrefixes stay in sync", () => {
	it("every registry prefix appears in the pure table and vice versa", () => {
		const fromRegistry = PROVIDERS.flatMap((p) => p.aliasPrefixes).sort();
		expect([...KNOWN_PROVIDER_PREFIXES].sort()).toEqual(fromRegistry);
	});

	it("shortLabel on registry matches SHORT_LABELS", () => {
		for (const p of PROVIDERS) {
			for (const prefix of p.aliasPrefixes) {
				expect(SHORT_LABELS[prefix]).toBe(p.shortLabel);
			}
		}
	});
});

describe("resolveActiveProviderId", () => {
	it("known payload prefix wins", () => {
		expect(resolveActiveProviderId("kimi-code/kimi-for-coding", null)).toBe("kimi-code");
		expect(resolveActiveProviderId("openrouter/openai/gpt-6-sol", null)).toBe("openrouter");
		expect(resolveActiveProviderId("opencode-go/mimo-v2.6-flash", null)).toBe("opencode-go");
		expect(resolveActiveProviderId("cline-pass/cline-pass/muse", null)).toBe("cline-pass");
	});

	it("mid-session switch follows payload bare name of a different known provider", () => {
		expect(resolveActiveProviderId("MiniMax-M3", "kimi-code/k3-256k")).toBe("minimax");
	});

	it("unknown prefix never falls through to bare-name bars", () => {
		expect(resolveActiveProviderId("kilo/kimi-k2", null)).toBeNull();
		expect(resolveActiveProviderId("kilo/kimi-k2", "kimi-code/k3-256k")).toBe("kimi-code");
	});

	it("bare kimi name under gateway cache stays on gateway (wrong-subscription)", () => {
		expect(resolveActiveProviderId("kimi-k2", "cline-pass/kimi-k2")).toBe("cline-pass");
		expect(resolveActiveProviderId("kimi-k2", "openrouter/moonshotai/kimi-k3")).toBe("openrouter");
	});

	it("bare-name override only between direct providers (kimi ↔ minimax)", () => {
		expect(resolveActiveProviderId("MiniMax-M3", "kimi-code/k3-256k")).toBe("minimax");
		expect(resolveActiveProviderId("kimi-k3", "minimax/minimax-m3")).toBe("kimi-code");
	});

	it("bare-name detection when no prefix", () => {
		expect(resolveActiveProviderId("kimi-for-coding", null)).toBe("kimi-code");
		expect(resolveActiveProviderId("k3-256k", null)).toBe("kimi-code");
		expect(resolveActiveProviderId("minimax-text-01", null)).toBe("minimax");
		expect(resolveActiveProviderId("mimo-v2.6-flash-free", null)).toBeNull();
		expect(resolveActiveProviderId("", null)).toBeNull();
	});
});

describe("buildRightZone end-to-end", () => {
	it("cline-pass session serving a kimi-named model -> CL-P + full model, NO wrong metrics", () => {
		const line = buildRightZone("cline-pass/kimi-k2", kimiCache("cline-pass/kimi-k2"), true, 0);
		const visible = strip(line ?? "");
		expect(visible).toContain("CL-P");
		expect(visible).toContain("kimi-k2");
		expect(visible).not.toContain("W:");
		expect(visible).not.toContain("5H:");
		expect(visible).not.toContain("%");
	});

	it("bare kimi name under cline-pass session stays on CL-P (wrong-subscription guard)", () => {
		const cache: QuotaCache = {
			...kimiCache("cline-pass/kimi-k2"),
			sessions: { s1: { model: "cline-pass/kimi-k2", provider: "cline-pass", updatedAt: 1 } },
		};
		const line = buildRightZone("kimi-k2", cache, true, 0, "s1");
		const visible = strip(line ?? "");
		expect(visible).toContain("CL-P");
		expect(visible).toContain("kimi-k2");
		expect(visible).not.toContain("W:");
		expect(visible).not.toContain("Kimi");
	});

	it("kimi session + kimi data -> Kimi + W + 5H", () => {
		const line = buildRightZone("kimi-for-coding", kimiCache("kimi-code/kimi-for-coding"), true, 0);
		const visible = strip(line ?? "");
		expect(visible).toContain("Kimi");
		expect(visible).toContain("W:");
		expect(visible).toContain("5H:");
	});

	it("Kimi short blinks across phases; model stays visible", () => {
		const visible = strip(buildRightZone("kimi-for-coding", kimiCache("kimi-code/x"), true, 0) ?? "");
		const blank = strip(buildRightZone("kimi-for-coding", kimiCache("kimi-code/x"), true, Q) ?? "");
		const red = strip(buildRightZone("kimi-for-coding", kimiCache("kimi-code/x"), true, Q * 2) ?? "");
		expect(visible).toContain("Kimi");
		expect(red).toContain("Kimi");
		expect(blank).not.toContain("Kimi");
		expect(blank).toContain("kimi-for-coding");
		expect(blank.length).toBe(visible.length);
	});

	it("unknown provider prefix without cache -> dim model only", () => {
		const line = buildRightZone("kilo/unknown-model", null, true, 0);
		expect(line).toBe(`${DIM}unknown-model${RESET}`);
	});
});

describe("resolveForSession", () => {
	it("uses matching session model and never falls back to stale cache.model on miss", () => {
		const cache = {
			model: "kimi-code/kimi-k3.1-pro",
			sessions: {
				s1: { model: "openrouter/openai/gpt-6-sol", provider: "openrouter", updatedAt: 1 },
			},
		};
		expect(resolveForSession("gpt-6-sol", cache, "s1")).toBe("openrouter");
		expect(resolveForSession("gpt-6-sol", cache, "missing")).toBeNull();
	});

	it("payload prefix wins over session", () => {
		const cache = {
			model: "kimi-code/x",
			sessions: { s1: { model: "openrouter/openai/gpt-6-sol", provider: "openrouter", updatedAt: 1 } },
		};
		expect(resolveForSession("openrouter-2/openai/gpt-6-sol", cache, "s1")).toBe("openrouter-2");
	});

	it("ignores stale session when mid-session switch changes model to bare kimi name", () => {
		const cache = {
			model: "openrouter/openai/gpt-6-sol",
			sessions: { s1: { model: "openrouter/openai/gpt-6-sol", provider: "openrouter", updatedAt: 1 } },
		};
		expect(resolveForSession("kimi-k3.1-pro", cache, "s1")).toBe("kimi-code");
	});

	it("mid-session switch from CL-P to bare display name resolves via case-insensitive modelIndex", () => {
		const cache: QuotaCache = {
			ts: 0,
			model: "cline-pass/cline-pass/muse-spark-1.3",
			kimi: null,
			minimax: null,
			cline: {
				mUsed: 40,
				mLimit: 100,
				mResetAt: undefined,
				wUsed: 10,
				wLimit: 100,
				wResetAt: undefined,
				hUsed: 5,
				hLimit: 100,
				hResetAt: undefined,
				hRemaining: "",
			},
			opencodeGo: {
				wUsed: 7,
				wLimit: 100,
				wResetAt: undefined,
				hUsed: 3,
				hLimit: 100,
				hResetAt: undefined,
				hRemaining: "",
			},
			sessions: {
				s1: { model: "cline-pass/cline-pass/muse-spark-1.3", provider: "cline-pass", updatedAt: 1 },
			},
			modelIndex: {
				"mimo-v2.6-flash": "opencode-go",
			},
		};
		expect(resolveForSession("MiMo-V2.6-Flash", cache, "s1")).toBe("opencode-go");
		const visible = strip(buildRightZone("MiMo-V2.6-Flash", cache, true, 0, "s1") ?? "");
		expect(visible).toContain("OPC-G");
		expect(visible).toContain("W:7%");
		expect(visible).not.toContain("CL-P");
	});

	it("never falls back to stale cache.model when switched to unknown model", () => {
		const cache = {
			model: "cline-pass/cline-pass/muse-spark-1.3",
			sessions: {
				s1: { model: "cline-pass/cline-pass/muse-spark-1.3", provider: "cline-pass", updatedAt: 1 },
			},
			modelIndex: {
				"mimo-v2.6-flash": "opencode-go",
			},
		};
		expect(resolveForSession("some-unknown-model", cache, "s1")).toBeNull();
	});

	it("double-prefix session matches bare tail and prefixed forms, rejects unknown prefix", () => {
		const cache = {
			model: "cline-pass/cline-pass/muse-spark-1.3",
			sessions: {
				s1: { model: "cline-pass/cline-pass/muse-spark-1.3", provider: "cline-pass", updatedAt: 1 },
			},
		};
		expect(resolveForSession("muse-spark-1.3", cache, "s1")).toBe("cline-pass");
		expect(resolveForSession("cline-pass/muse-spark-1.3", cache, "s1")).toBe("cline-pass");
		expect(resolveForSession("cline-pass/cline-pass/muse-spark-1.3", cache, "s1")).toBe("cline-pass");
		expect(resolveForSession("kilo/kimi-k2", cache, "s1")).toBeNull();
	});
});

describe("resolveForSession modelIndex", () => {
	const cache = {
		model: "opencode-go/mimo-v2.6-flash",
		sessions: {},
		modelIndex: {
			"Nemotron 3 Ultra (free)": "managed:openrouter",
			"nvidia/nemotron-3-ultra-550b-a55b:free": "openrouter",
			"mimo-v2.6-flash": "opencode-go",
		},
	};

	it("maps display name case-insensitively and strips managed:", () => {
		expect(resolveForSession("Nemotron 3 Ultra (free)", cache, null)).toBe("openrouter");
		expect(resolveForSession("nemotron 3 ultra (free)", cache, null)).toBe("openrouter");
	});

	it("maps model id to provider", () => {
		expect(resolveForSession("nvidia/nemotron-3-ultra-550b-a55b:free", cache, null)).toBe("openrouter");
	});

	it("ignores stale session on different model, keeps matching session over modelIndex", () => {
		const stale = {
			...cache,
			sessions: { s1: { model: "openrouter-2/x", provider: "openrouter-2", updatedAt: 1 } },
		};
		expect(resolveForSession("Nemotron 3 Ultra (free)", stale, "s1")).toBe("openrouter");

		const matching = {
			...cache,
			sessions: {
				s1: { model: "openrouter-2/Nemotron 3 Ultra (free)", provider: "openrouter-2", updatedAt: 1 },
			},
		};
		expect(resolveForSession("Nemotron 3 Ultra (free)", matching, "s1")).toBe("openrouter-2");
	});

	it("payload prefix wins over modelIndex", () => {
		expect(resolveForSession("cline-pass/muse", cache, null)).toBe("cline-pass");
	});
});
