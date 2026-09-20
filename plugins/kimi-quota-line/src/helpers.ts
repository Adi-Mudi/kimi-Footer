/**
 * Pure helper functions for the kimi-quota-line plugin.
 * No TUI imports here — this file is safe to import from unit tests.
 * Verbatim port from 01_pi-Footer/.pi/extensions/pi-footer/helpers.ts.
 */
import { EMPTY, FILLED } from "./types.js";

/**
 * Formats a token count into a human-readable string with k/M suffixes.
 */
export function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

/**
 * Calculates hours remaining until a reset timestamp.
 */
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

/**
 * Determines weekly bar color based on pace ratio (actual vs expected hourly usage).
 */
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

/**
 * Determines session (5H) bar color based on pace ratio.
 */
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

/**
 * Calculates pace delta in hours for the weekly window.
 * Positive = spare hours. Negative = debt. Null when pace cannot be computed.
 */
export function weeklyPaceHours(used: number, limit: number, resetAt?: string): number | null {
	return paceHours(used, limit, resetAt, 168, 2);
}

/**
 * Calculates pace delta in hours for the 5-hour session window.
 */
export function sessionPaceHours(used: number, limit: number, resetAt?: string): number | null {
	return paceHours(used, limit, resetAt, 5, 0.25);
}

function paceHours(
	used: number,
	limit: number,
	resetAt: string | undefined,
	windowHours: number,
	graceHours: number,
): number | null {
	if (limit <= 0) return null;
	const elapsedHours = windowHours - hoursUntilReset(resetAt);
	if (elapsedHours < graceHours || elapsedHours >= windowHours) return null;
	const expectedPercent = (elapsedHours / windowHours) * 100;
	const actualPercent = (used / limit) * 100;
	return ((expectedPercent - actualPercent) / 100) * windowHours;
}

/**
 * Formats pace hours. Near-zero collapses to 0 (no -0.0h artifact).
 */
export function formatPaceHours(h: number): string {
	const v = Math.abs(h) < 0.05 ? 0 : h;
	return `${v.toFixed(1)}h`;
}

/**
 * Status color from simple usage ratio.
 */
export function usageColor(used: number, limit: number): StatusColor {
	const p = limit > 0 ? used / limit : 0;
	if (p > 0.8) return "error";
	if (p > 0.5) return "warning";
	return "success";
}

/**
 * Percentage string from used and limit.
 */
export function pct(used: number, limit: number): string {
	if (limit <= 0) return "0%";
	return `${Math.round((used / limit) * 100)}%`;
}

/**
 * Builds a vertical block bar string representing usage percentage.
 */
export function vbar(used: number, limit: number): string {
	const BAR_SEGMENTS = 10;
	const p = limit > 0 ? used / limit : 0;
	const filled = Math.min(BAR_SEGMENTS, Math.max(0, Math.ceil(p * BAR_SEGMENTS)));
	return FILLED.repeat(filled) + EMPTY.repeat(BAR_SEGMENTS - filled);
}

/**
 * Formats remaining time until a reset timestamp as "hours.minutes".
 */
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

/**
 * Fixed traffic-light status colors (truecolor ANSI, theme-independent).
 */
export function statusFg(status: StatusColor, text: string): string {
	const CODE: Record<StatusColor, string> = {
		success: "\x1b[38;2;40;167;69m", // #28a745 green
		warning: "\x1b[38;2;224;168;0m", // #e0a800 amber
		error: "\x1b[38;2;220;53;69m", // #dc3545 red
	};
	return `${CODE[status]}${text}\x1b[39m`;
}
