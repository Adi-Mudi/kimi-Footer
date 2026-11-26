export function detectWidth(fallback: number = 120): number {
	const fromStdout = process.stdout.columns;
	if (typeof fromStdout === "number" && fromStdout > 0) return fromStdout;

	const fromStderr = process.stderr.columns;
	if (typeof fromStderr === "number" && fromStderr > 0) return fromStderr;

	const envCols = Number.parseInt(process.env.COLUMNS ?? "", 10);
	if (Number.isFinite(envCols) && envCols > 0) return envCols;

	return fallback;
}
