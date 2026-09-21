/**
 * Pure model-name detectors — no I/O, no imports except ./types.js.
 *
 * Split from kimi-fetcher.ts / minimax-fetcher.ts so bin/render-row1.ts
 * never loads the fetcher modules (which read auth.json at module init
 * via getKimiToken() / getMinimaxToken()). The render path must stay
 * free of credential reads.
 *
 * Detection semantics are moved VERBATIM from the fetchers:
 *   - isKimiModel: substring "kimi" OR /^k\d/ (K-family bare ids like
 *     k3-256k, added in v1.3.3).
 *   - isMinimaxModel: substring "minimax".
 *
 * Both fetchers re-export these for backwards compatibility, so existing
 * hook/test imports keep working unchanged.
 */

/**
 * True when the given model id or name identifies a Kimi model.
 * Accepts a plain string (kimi-code StatusLinePayload.model).
 */
export function isKimiModel(modelIdOrName?: string): boolean {
	const id = (modelIdOrName ?? "").toString().toLowerCase();
	if (id.includes("kimi")) return true;
	// Kimi family aliases: k3, k3-256k, k2, k1.5 etc.
	// kimi-code sends bare ids like "k3-256k" when no provider prefix is present.
	return /^k\d/.test(id);
}

/**
 * True when the given model id or name identifies a MiniMax model.
 */
export function isMinimaxModel(modelIdOrName?: string): boolean {
	const id = (modelIdOrName ?? "").toString().toLowerCase();
	return id.includes("minimax");
}
