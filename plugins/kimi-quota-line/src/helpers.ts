function parseResetMs(resetAt?: string | number): number | null {
	if (resetAt === undefined || resetAt === null || resetAt === "") return null;
	if (typeof resetAt === "number") {
		if (!Number.isFinite(resetAt)) return null;
		return Math.abs(resetAt) < 1e11 ? resetAt * 1000 : resetAt;
	}
	const s = resetAt.trim();
	if (!s) return null;
	if (/^\d+(\.\d+)?$/.test(s)) {
		const n = Number(s);
		if (!Number.isFinite(n)) return null;
		return n < 1e11 ? n * 1000 : n;
	}
	if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
		const ms = Date.parse(`${s}T00:00:00Z`);
		return Number.isNaN(ms) ? null : ms;
	}
	const ms = new Date(s).getTime();
	return Number.isNaN(ms) ? null : ms;
}

export function hoursUntilReset(resetAt?: string | number): number {
	const resetMs = parseResetMs(resetAt);
	if (resetMs === null) return 0;
	const diffMs = resetMs - Date.now();
	if (diffMs <= 0) return 0;
	return diffMs / (1000 * 60 * 60);
}

export type StatusColor = "success" | "warning" | "error";

function paceColor(
	used: number,
	limit: number,
	windowHours: number,
	graceHours: number,
	resetAt?: string | number,
): StatusColor {
	if (limit <= 0) return "success";
	const actualPercent = (used / limit) * 100;
	if (actualPercent >= 100) return "error";

	const elapsedHours = Math.max(0, Math.min(windowHours, windowHours - hoursUntilReset(resetAt)));

	if (elapsedHours < graceHours || elapsedHours >= windowHours) {
		if (actualPercent >= 80) return "warning";
		return "success";
	}

	const expectedPercent = (elapsedHours / windowHours) * 100;
	const paceRatio = (actualPercent / expectedPercent) * 100;
	if (paceRatio <= 79) return "success";
	if (paceRatio <= 99) return "warning";
	return "error";
}

export function weeklyPaceColor(used: number, limit: number, resetAt?: string | number): StatusColor {
	return paceColor(used, limit, 168, 2, resetAt);
}

export function monthlyPaceColor(used: number, limit: number, resetAt?: string | number): StatusColor {
	return paceColor(used, limit, 720, 24, resetAt);
}

export function sessionPaceColor(used: number, limit: number, resetAt?: string | number): StatusColor {
	return paceColor(used, limit, 5, 0.25, resetAt);
}

export function formatRemaining(resetAt?: string | number): string {
	const resetMs = parseResetMs(resetAt);
	if (resetMs === null) return "?";
	const diffMs = resetMs - Date.now();
	if (diffMs <= 0) return "0.00";
	const totalMinutes = Math.floor(diffMs / 60000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return `${hours}.${String(minutes).padStart(2, "0")}`;
}

export function statusFg(status: StatusColor, text: string): string {
	if (status === "success") return text;
	const CODE: Record<Exclude<StatusColor, "success">, string> = {
		warning: "\x1b[38;2;224;168;0m",
		error: "\x1b[38;2;220;53;69m",
	};
	return `${CODE[status]}${text}\x1b[39m`;
}
