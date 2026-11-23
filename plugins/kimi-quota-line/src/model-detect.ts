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

export const KNOWN_PROVIDER_PREFIXES: readonly string[] = [
	"kimi-code",
	"minimax",
	"openrouter",
	"openrouter-2",
	"opencode-go",
	"cline-pass",
];

export const SHORT_LABELS: Readonly<Record<string, string>> = {
	"kimi-code": "Kimi",
	minimax: "MM",
	"opencode-go": "OCG",
	openrouter: "OR",
	"openrouter-2": "OR2",
	"cline-pass": "CP",
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
