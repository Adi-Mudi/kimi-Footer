export function isKimiModel(modelIdOrName?: string): boolean {
	const id = (modelIdOrName ?? "").toString().toLowerCase();
	if (id.includes("kimi")) return true;
	return /^k\d/.test(id);
}

export function isMinimaxModel(modelIdOrName?: string): boolean {
	const id = (modelIdOrName ?? "").toString().toLowerCase();
	return id.includes("minimax");
}

export function isOpenCodeGoModel(modelIdOrName?: string): boolean {
	const id = (modelIdOrName ?? "").toString().toLowerCase();
	return id.includes("opencode-go");
}

export function isOpenRouterModel(modelIdOrName?: string): boolean {
	const id = (modelIdOrName ?? "").toString().toLowerCase();
	return id.startsWith("openrouter/") || id.includes("openrouter");
}

export function isClineModel(modelIdOrName?: string): boolean {
	const id = (modelIdOrName ?? "").toString().toLowerCase();
	return id.startsWith("cline-pass/") || id.startsWith("cline/") || id.includes("cline-pass");
}

export function isZaiModel(modelIdOrName?: string): boolean {
	const id = (modelIdOrName ?? "").toString().toLowerCase();
	return id.startsWith("zai-coding-plan/") || id.includes("zai-coding-plan");
}

export const KNOWN_PROVIDER_PREFIXES: readonly string[] = [
	"kimi-code",
	"minimax",
	"openrouter",
	"openrouter-2",
	"opencode-go",
	"cline-pass",
	"zai-coding-plan",
];

export const SHORT_LABELS: Readonly<Record<string, string>> = {
	"kimi-code": "Kimi",
	minimax: "MM",
	"opencode-go": "OPC-G",
	openrouter: "OR",
	"openrouter-2": "OR2",
	"cline-pass": "CL-P",
	"zai-coding-plan": "ZAI",
};

export const SHORT_LABEL_WIDTH = 4;

export interface ModelAlias {
	
	provider: string | null;
	
	name: string;
}

export function parseModelAlias(input: unknown): ModelAlias {
	if (input && typeof input === "object") {
		const rec = input as Record<string, unknown>;
		const providerRaw = typeof rec.provider === "string" ? rec.provider.replace(/^managed:/, "") : "";
		const name = typeof rec.model === "string" ? rec.model : "";
		return { provider: providerRaw || null, name };
	}
	if (typeof input === "string") {
		const slash = input.indexOf("/");
		if (slash > 0) {
			const provider = input.slice(0, slash).replace(/^managed:/, "");
			return { provider: provider || null, name: input.slice(slash + 1) };
		}
		return { provider: null, name: input };
	}
	return { provider: null, name: "" };
}

export function resolveProviderId(prefix: string): string | null {
	const p = prefix.toLowerCase();
	return KNOWN_PROVIDER_PREFIXES.find((k) => k.toLowerCase() === p) ?? null;
}

export function shortLabelFor(providerId: string | null): string | null {
	if (!providerId) return null;
	return SHORT_LABELS[providerId] ?? null;
}

export function fullModelName(
	payloadModel: string,
	cacheModel?: string | null,
): string {
	const payloadAlias = parseModelAlias(payloadModel);
	if (payloadAlias.name) return payloadAlias.name;
	const cacheAlias = parseModelAlias(cacheModel ?? null);
	if (cacheAlias.name) return cacheAlias.name;
	return payloadModel;
}

function bareNameProviderId(name: string): string | null {
	const bare = parseModelAlias(name).name;
	if (isKimiModel(bare)) return "kimi-code";
	if (isMinimaxModel(bare)) return "minimax";
	return null;
}

export function resolveActiveProviderId(
	payloadModel: string,
	cacheModel: string | null | undefined,
): string | null {
	const payloadAlias = parseModelAlias(payloadModel);
	const cacheAlias = parseModelAlias(cacheModel ?? null);
	const payloadId = payloadAlias.provider ? resolveProviderId(payloadAlias.provider) : null;
	const cacheId = cacheAlias.provider ? resolveProviderId(cacheAlias.provider) : null;

	if (payloadId) return payloadId;
	if (cacheId) {
		const nameId = bareNameProviderId(payloadAlias.name || payloadModel);
		
		
		
		
		const DIRECT = new Set(["kimi-code", "minimax"]);
		if (nameId && nameId !== cacheId && DIRECT.has(cacheId) && DIRECT.has(nameId)) {
			return nameId;
		}
		return cacheId;
	}
	if (payloadAlias.provider || cacheAlias.provider) return null;
	return bareNameProviderId(payloadModel);
}

export function sessionCacheModel(
	cache: { sessions?: Record<string, { model: string | null; provider?: string | null; updatedAt?: number }> } | null | undefined,
	sessionId: string | null | undefined,
): string | null {
	if (!sessionId || !cache?.sessions) return null;
	const e = cache.sessions[sessionId];
	if (!e) return null;
	const model = e.model ?? null;
	if (e.provider && model && !model.includes("/")) return `${e.provider}/${model}`;
	return model;
}

function tailName(name: string): string {
	const idx = name.lastIndexOf("/");
	return idx >= 0 ? name.slice(idx + 1) : name;
}

function sameModelName(a: string, b: string): boolean {
	const aa = parseModelAlias(a).name.trim().toLowerCase();
	const bb = parseModelAlias(b).name.trim().toLowerCase();
	if (!aa || !bb) return false;
	if (aa === bb) return true;
	const ta = tailName(aa);
	const tb = tailName(bb);
	return Boolean(ta && tb && ta === tb);
}

function lookupModelIndex(
	modelIndex: Record<string, string> | undefined,
	payloadModel: string,
	parsedName: string,
): string | null {
	if (!modelIndex) return null;
	const candidates = [parsedName, payloadModel, tailName(parsedName || payloadModel)]
		.map((s) => s.trim())
		.filter(Boolean);
	for (const key of candidates) {
		const exact = modelIndex[key];
		if (exact) {
			const pid = resolveProviderId(exact.replace(/^managed:/, ""));
			if (pid) return pid;
		}
	}
	const lowerMap = new Map<string, string>();
	for (const [k, v] of Object.entries(modelIndex)) {
		const lk = k.trim().toLowerCase();
		if (lk && !lowerMap.has(lk)) lowerMap.set(lk, v);
	}
	for (const key of candidates) {
		const hit = lowerMap.get(key.toLowerCase());
		if (hit) {
			const pid = resolveProviderId(hit.replace(/^managed:/, ""));
			if (pid) return pid;
		}
	}
	return null;
}

function lookupModelIndexExact(
	modelIndex: Record<string, string> | undefined,
	payloadModel: string,
): string | null {
	if (!modelIndex) return null;
	const target = payloadModel.trim();
	if (!target) return null;
	const exact = modelIndex[target];
	if (exact) {
		const pid = resolveProviderId(exact.replace(/^managed:/, ""));
		if (pid) return pid;
	}
	const lower = target.toLowerCase();
	for (const [k, v] of Object.entries(modelIndex)) {
		if (k.trim().toLowerCase() === lower) {
			const pid = resolveProviderId(v.replace(/^managed:/, ""));
			if (pid) return pid;
		}
	}
	return null;
}

export function resolveForSession(
	payloadModel: string,
	cache: { model?: string | null; sessions?: Record<string, { model: string | null; provider?: string | null; updatedAt?: number }>; modelIndex?: Record<string, string> } | null | undefined,
	sessionId: string | null | undefined,
): string | null {
	const a = parseModelAlias(payloadModel);
	const fromSession = sessionCacheModel(cache, sessionId);
	if (a.provider) {
		const pid = resolveProviderId(a.provider);
		if (pid) return pid;
		if (fromSession) {
			const s = parseModelAlias(fromSession);
			if (s.provider && s.name.trim().toLowerCase() === payloadModel.trim().toLowerCase()) {
				const sid = resolveProviderId(s.provider);
				if (sid) return sid;
			}
		}
		return lookupModelIndexExact(cache?.modelIndex, payloadModel);
	}
	if (fromSession && sameModelName(payloadModel, fromSession)) {
		const s = parseModelAlias(fromSession);
		if (s.provider) {
			const sid = resolveProviderId(s.provider);
			if (sid) return sid;
		}
		return resolveActiveProviderId(payloadModel, fromSession);
	}
	const idxPid = lookupModelIndex(cache?.modelIndex, payloadModel, a.name);
	if (idxPid) return idxPid;
	return bareNameProviderId(payloadModel);
}
