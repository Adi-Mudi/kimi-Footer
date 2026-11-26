export function hoursUntilReset(resetAt?: string): number {
	if (!resetAt) return 0;
	try {
		const resetMs = new Date(resetAt).getTime();
		if (Number.isNaN(resetMs)) return 0;
		const diffMs = resetMs - Date.now();
		if (diffMs <= 0) return 0;
		return diffMs / (1000 * 60 * 60);
	} catch {
		return 0;
	}
}

export type StatusColor = "success" | "warning" | "error";

export function weeklyPaceColor(used: number, limit: number, resetAt?: string): StatusColor {
	const WEEK_HOURS = 168;
	const GRACE_HOURS = 2;
	if (limit <= 0) return "success";
	const actualPercent = (used / limit) * 100;
	const elapsedHours = WEEK_HOURS - hoursUntilReset(resetAt);

	if (elapsedHours < GRACE_HOURS || elapsedHours >= WEEK_HOURS) {
		if (actualPercent >= 100) return "error";
		if (actualPercent >= 80) return "warning";
		return "success";
	}

	const expectedPercent = (elapsedHours / WEEK_HOURS) * 100;
	const paceRatio = (actualPercent / expectedPercent) * 100;
	if (paceRatio <= 79) return "success";
	if (paceRatio <= 99) return "warning";
	return "error";
}

export function monthlyPaceColor(used: number, limit: number, resetAt?: string): StatusColor {
	const MONTH_HOURS = 720;
	const GRACE_HOURS = 24;
	if (limit <= 0) return "success";
	const actualPercent = (used / limit) * 100;
	const elapsedHours = MONTH_HOURS - hoursUntilReset(resetAt);

	if (elapsedHours < GRACE_HOURS || elapsedHours >= MONTH_HOURS) {
		if (actualPercent >= 100) return "error";
		if (actualPercent >= 80) return "warning";
		return "success";
	}

	const expectedPercent = (elapsedHours / MONTH_HOURS) * 100;
	const paceRatio = (actualPercent / expectedPercent) * 100;
	if (paceRatio <= 79) return "success";
	if (paceRatio <= 99) return "warning";
	return "error";
}

export function sessionPaceColor(used: number, limit: number, resetAt?: string): StatusColor {
	const WINDOW_HOURS = 5;
	const GRACE_HOURS = 0.25;
	if (limit <= 0) return "success";
	const actualPercent = (used / limit) * 100;
	const elapsedHours = WINDOW_HOURS - hoursUntilReset(resetAt);

	if (elapsedHours < GRACE_HOURS || elapsedHours >= WINDOW_HOURS) {
		if (actualPercent >= 100) return "error";
		if (actualPercent >= 80) return "warning";
		return "success";
	}

	const expectedPercent = (elapsedHours / WINDOW_HOURS) * 100;
	const paceRatio = (actualPercent / expectedPercent) * 100;
	if (paceRatio <= 79) return "success";
	if (paceRatio <= 99) return "warning";
	return "error";
}

export function formatRemaining(resetAt?: string): string {
	if (!resetAt) return "?";
	try {
		const dt = new Date(resetAt);
		const resetMs = dt.getTime();
		if (Number.isNaN(resetMs)) return "?";
		const diffMs = resetMs - Date.now();
		if (diffMs <= 0) return "0.00";
		const totalMinutes = Math.floor(diffMs / 60000);
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;
		return `${hours}.${String(minutes).padStart(2, "0")}`;
	} catch {
		return "?";
	}
}

export function statusFg(status: StatusColor, text: string): string {
	const CODE: Record<StatusColor, string> = {
		success: "\x1b[38;2;40;167;69m",
		warning: "\x1b[38;2;224;168;0m",
		error: "\x1b[38;2;220;53;69m",
	};
	return `${CODE[status]}${text}\x1b[39m`;
}
