/**
 * Terminal width detection for the status-line script.
 *
 * Order of preference:
 *   1. process.stdout.columns  — set when stdout is a TTY or PTY.
 *   2. process.stderr.columns  — some hosts set stderr even when stdout is piped.
 *   3. process.env.COLUMNS     — explicit env var set by shells/hosts.
 *   4. Final fallback          — caller-supplied (default 120, modern-terminal friendly).
 *
 * Returns 0 only if all sources are unset AND no fallback is supplied; callers
 * typically always pass a fallback so width is always positive.
 */
export function detectWidth(fallback: number = 120): number {
	const fromStdout = process.stdout.columns;
	if (typeof fromStdout === "number" && fromStdout > 0) return fromStdout;

	const fromStderr = process.stderr.columns;
	if (typeof fromStderr === "number" && fromStderr > 0) return fromStderr;

	const envCols = Number.parseInt(process.env.COLUMNS ?? "", 10);
	if (Number.isFinite(envCols) && envCols > 0) return envCols;

	return fallback;
}
