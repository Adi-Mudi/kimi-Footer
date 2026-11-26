export const BLINK_QUARTER_PERIOD_MS = 150;

export type BlinkPhase = "dim" | "off" | "red" | "off";

export function pickBlinkPhase(now: number = Date.now()): BlinkPhase {
	const phase = Math.floor(now / BLINK_QUARTER_PERIOD_MS) % 4;
	if (phase === 0) return "dim";
	if (phase === 2) return "red";
	return "off";
}

const DIM = "\x1b[38;5;244m";
const RED = "\x1b[91m";
const RESET = "\x1b[0m";

const CYAN_BOLD = "\x1b[96m\x1b[1m";
const AMBER_BOLD = "\x1b[38;2;224;168;0m\x1b[1m";
const OFF_ALL = "\x1b[22m\x1b[39m";

export function formatProviderLabel(short: string, now: number = Date.now()): string {
	const width = Math.max(short.length, 4);
	const padded = short.padEnd(width);
	if (short === "Kimi") {
		const phase = pickBlinkPhase(now);
		if (phase === "dim") return `${DIM}${padded}${RESET}`;
		if (phase === "red") return `${RED}${padded}${RESET}`;
		return `${DIM}${" ".repeat(width)}${RESET}`;
	}
	return `${DIM}${padded}${RESET}`;
}

export function formatBlinkingSegment(text: string, now: number = Date.now()): string {
	const phase = pickBlinkPhase(now);
	if (phase === "off") return `${DIM}${" ".repeat(text.length)}${RESET}`;
	return `${DIM}${text}${RESET}`;
}

const WT_MARKER = "[wt]";
const WT_BLANK = "    ";

export function formatWorktreeMarker(now: number = Date.now()): string {
	const phase = pickBlinkPhase(now);
	if (phase === "dim") return `${CYAN_BOLD}${WT_MARKER}${OFF_ALL}`;
	if (phase === "red") return `${AMBER_BOLD}${WT_MARKER}${OFF_ALL}`;
	return `${DIM}${WT_BLANK}${RESET}`;
}
