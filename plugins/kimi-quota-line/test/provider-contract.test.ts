import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRightZone } from "../bin/render-row1.js";
import {
	KNOWN_PROVIDER_PREFIXES,
	fullModelName,
	resolveForSession,
	resolveProviderId,
	shortLabelFor,
} from "../src/model-detect.js";
import type { QuotaCache } from "../src/types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, "..");
const FIXTURE_PATH = join(HERE, "fixtures", "config.sample.toml");
const REFRESH = join(PLUGIN_ROOT, "dist", "hooks", "refresh-cache.js");
const RENDER = join(PLUGIN_ROOT, "dist", "bin", "render-row1.js");

const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

interface ParsedConfig {
	providers: string[];
	models: Array<{ key: string; provider: string; model: string; displayName: string }>;
	modelIndex: Record<string, string>;
}

function parseFixtureConfig(raw: string): ParsedConfig {
	const providers: string[] = [];
	const models: Array<{ key: string; provider: string; model: string; displayName: string }> = [];
	const modelIndex: Record<string, string> = {};

	let section: "none" | "provider" | "model" = "none";
	let key = "";
	let provider = "";
	let model = "";
	let displayName = "";

	const flush = () => {
		if (section === "model" && provider) {
			const cleanProv = provider.replace(/^managed:/, "");
			models.push({ key, provider: cleanProv, model, displayName });
			if (key && !modelIndex[key]) modelIndex[key] = cleanProv;
			if (displayName && !modelIndex[displayName]) modelIndex[displayName] = cleanProv;
			if (model && !modelIndex[model]) modelIndex[model] = cleanProv;
		}
	};

	for (const line of raw.split(/\r?\n/)) {
		const header = line.match(/^\[([^\]]+)\]/);
		if (header) {
			flush();
			const h = header[1];
			const pMatch = h.match(/^providers\.(?:"([^"]+)"|'([^']+)'|(.+))$/);
			const mMatch = h.match(/^models\.(?:"([^"]+)"|'([^']+)'|(.+))$/);
			if (pMatch) {
				section = "provider";
				providers.push((pMatch[1] ?? pMatch[2] ?? pMatch[3]).replace(/^managed:/, ""));
			} else if (mMatch) {
				section = "model";
				key = mMatch[1] ?? mMatch[2] ?? mMatch[3];
			} else {
				section = "none";
			}
			provider = "";
			model = "";
			displayName = "";
			continue;
		}
		if (section !== "model") continue;
		const p = line.match(/^\s*provider\s*=\s*"([^"]+)"/)?.[1];
		if (p) provider = p;
		const m = line.match(/^\s*model\s*=\s*"([^"]+)"/)?.[1];
		if (m) model = m;
		const d = line.match(/^\s*display_name\s*=\s*"([^"]+)"/)?.[1];
		if (d) displayName = d;
	}
	flush();
	return { providers, models, modelIndex };
}

const FIXTURE_RAW = readFileSync(FIXTURE_PATH, "utf-8");
const PARSED = parseFixtureConfig(FIXTURE_RAW);

function fullCache(): QuotaCache {
	return {
		ts: Date.now(),
		model: "openrouter/z-ai/glm-5.3-flash",
		kimi: { wUsed: 10, wLimit: 100, wResetAt: undefined, hUsed: 5, hLimit: 100, hResetAt: undefined, hRemaining: "" },
		minimax: { wUsed: 20, wLimit: 100, wResetAt: undefined, hUsed: 8, hLimit: 100, hResetAt: undefined, hRemaining: "" },
		openrouter: { used: 42, limit: 1000 },
		openrouter2: { used: 99, limit: 1000 },
		opencodeGo: { wUsed: 7, wLimit: 100, wResetAt: undefined, hUsed: 3, hLimit: 100, hResetAt: undefined, hRemaining: "" },
		cline: {
			mUsed: 40,
			mLimit: 100,
			mResetAt: undefined,
			wUsed: 15,
			wLimit: 100,
			wResetAt: undefined,
			hUsed: 2,
			hLimit: 100,
			hResetAt: undefined,
			hRemaining: "",
		},
		zai: null,
		modelIndex: PARSED.modelIndex,
	};
}

describe("golden resolveForSession matrix (populated colliding modelIndex)", () => {
	const cache = fullCache();

	it.each([
		["kimi-code/k3", "kimi-code"],
		["minimax/minimax-m3", "minimax"],
		["openrouter/z-ai/glm-5.3-flash", "openrouter"],
		["openrouter-2/z-ai/glm-5.3-flash", "openrouter-2"],
		["opencode-go/glm-5.3-flash", "opencode-go"],
		["cline-pass/cline-pass/glm-5.3-flash", "cline-pass"],
		["zai-coding-plan/glm-5.3-flash", "zai-coding-plan"],
		["managed:zai-coding-plan/glm-5.3-flash", "zai-coding-plan"],
	])("known prefix %s resolves to %s", (payload, expected) => {
		expect(resolveForSession(payload, cache, null)).toBe(expected);
	});

	it.each([
		"zai/GLM-5.3-Flash",
		"zaa/GLM-5.3-Flash",
		"zhipu/GLM-5.3-Flash",
		"ZAI/glm-5.3-flash",
		"Zhipu/GLM-5.3-Flash",
		"kilo/GLM-5.3-Flash",
		"kilo/kimi-k2",
		"kilo/Kimi K3.1 Pro",
		"cline/MiMo-V2.6-Flash",
		"managed:unknown-prov/glm-5.3-flash",
	])("unknown prefix %s resolves to null BEFORE modelIndex (never hijacks OR/Kimi/OPC-G)", (payload) => {
		expect(resolveForSession(payload, cache, null)).toBeNull();
		const raw = buildRightZone(payload, cache, true, 0) ?? "";
		expect(raw).toBe(`\x1b[38;5;244m${fullModelName(payload)}\x1b[0m`);
	});

	it("preserves exact vendor-namespaced OpenRouter model IDs in modelIndex", () => {
		expect(resolveForSession("nvidia/nemotron-3-ultra-550b-a55b:free", cache, null)).toBe("openrouter");
		expect(resolveForSession("z-ai/glm-5.3-flash", cache, null)).toBe("openrouter");
	});

	it("same-model session disambiguates openrouter-2 over openrouter on vendor/model", () => {
		const c: QuotaCache = {
			...cache,
			sessions: {
				s1: { model: "openrouter-2/z-ai/glm-5.3-flash", provider: "openrouter-2", updatedAt: Date.now() },
			},
		};
		expect(resolveForSession("z-ai/glm-5.3-flash", c, "s1")).toBe("openrouter-2");
	});

	it("renders ZAI label for zai-coding-plan without leaking OR Req metrics", () => {
		const line = strip(buildRightZone("zai-coding-plan/glm-5.3-flash", cache, true, 0) ?? "");
		expect(line).toMatch(/^ZAI {3}glm-5\.3-flash$/);
		expect(line).not.toContain("OR");
		expect(line).not.toContain("Req:");
	});
});

describe("provider-config contract against config.sample.toml", () => {
	const cache = fullCache();

	it("every [providers.*] id in fixture is either KNOWN with shortLabel or resolves unknown/null", () => {
		expect(PARSED.providers.length).toBeGreaterThanOrEqual(5);
		for (const prov of PARSED.providers) {
			const pid = resolveProviderId(prov);
			if (KNOWN_PROVIDER_PREFIXES.includes(prov)) {
				expect(pid).toBe(prov);
				expect(shortLabelFor(pid)).toBeTruthy();
				expect(resolveForSession(`${prov}/glm-5.3-flash`, cache, null)).toBe(prov);
			} else {
				expect(pid).toBeNull();
				expect(resolveForSession(`${prov}/glm-5.3-flash`, cache, null)).toBeNull();
			}
		}
	});

	it("every [models.*] entry prefixed by its [providers.*] resolves to its own provider", () => {
		for (const m of PARSED.models) {
			expect(resolveForSession(`${m.provider}/${m.model}`, cache, null)).toBe(m.provider);
		}
	});
});

describe("subprocess E2E with 5-provider config.sample.toml", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "kql-contract-"));
		writeFileSync(join(tmpDir, "config.toml"), FIXTURE_RAW, "utf-8");
		writeFileSync(join(tmpDir, "auth.json"), JSON.stringify({}), "utf-8");
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("refresh-cache builds full colliding modelIndex and render-row1 prevents zai->OR hijack", () => {
		const env = { ...process.env, KIMI_CODE_HOME: tmpDir, XDG_RUNTIME_DIR: tmpDir };
		const start = spawnSync("node", [REFRESH], {
			env,
			input: JSON.stringify({
				hook_event_name: "SessionStart",
				session_id: "sess_zai",
				model: { provider: "zai-coding-plan", model: "glm-5.3-flash" },
			}),
			encoding: "utf-8",
			timeout: 5_000,
		});
		expect(start.status).toBe(0);

		const cachePath = join(tmpDir, "kimi-quota-line-quota-cache.json");
		const diskCache = JSON.parse(readFileSync(cachePath, "utf-8")) as QuotaCache;
		diskCache.openrouter = { used: 42, limit: 1000 };
		diskCache.opencodeGo = {
			wUsed: 7,
			wLimit: 100,
			wResetAt: undefined,
			hUsed: 3,
			hLimit: 100,
			hResetAt: undefined,
			hRemaining: "",
		};
		writeFileSync(cachePath, JSON.stringify(diskCache));

		const renderZaiPrefix = spawnSync("node", [RENDER], {
			env,
			input: JSON.stringify({ model: "zai/GLM-5.3-Flash", cwd: "/tmp/proj", sessionId: "sess_zai" }),
			encoding: "utf-8",
			timeout: 5_000,
		});
		expect(renderZaiPrefix.status).toBe(0);
		const zaiUnknownOut = strip(renderZaiPrefix.stdout);
		expect(zaiUnknownOut).toContain("GLM-5.3-Flash");
		expect(zaiUnknownOut).not.toContain("OR");
		expect(zaiUnknownOut).not.toContain("Req:");

		const renderZaiKnown = spawnSync("node", [RENDER], {
			env,
			input: JSON.stringify({
				model: "zai-coding-plan/glm-5.3-flash",
				cwd: "/tmp/proj",
				sessionId: "sess_zai",
			}),
			encoding: "utf-8",
			timeout: 5_000,
		});
		expect(renderZaiKnown.status).toBe(0);
		const zaiKnownOut = strip(renderZaiKnown.stdout);
		expect(zaiKnownOut).toContain("ZAI");
		expect(zaiKnownOut).toContain("glm-5.3-flash");
		expect(zaiKnownOut).not.toContain("OR");
		expect(zaiKnownOut).not.toContain("Req:");

		const renderSwitched = spawnSync("node", [RENDER], {
			env,
			input: JSON.stringify({ model: "opencode-go/mimo-v2.6-flash", cwd: "/tmp/proj", sessionId: "sess_zai" }),
			encoding: "utf-8",
			timeout: 5_000,
		});
		expect(renderSwitched.status).toBe(0);
		const switchedOut = strip(renderSwitched.stdout);
		expect(switchedOut).toContain("OPC-G");
		expect(switchedOut).toContain("W:7%");
		expect(switchedOut).not.toContain("ZAI");
	});
});
