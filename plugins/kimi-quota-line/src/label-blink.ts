/**
 * Pure blink helpers for the status-line label and dirty digit.
 *
 * Imports only from types.ts (per AGENTS.md layer rules — src/ must not
 * import node:fs, node:child_process, or fetch).
 *
 * 4-phase blink cycle (1.3.6):
 *   phase 0: dim grey letter visible
 *   phase 1: letter off (5 spaces, dim grey — preserves column width)
 *   phase 2: bright red letter visible
 *   phase 3: letter off (5 spaces, dim grey)
 *
 * Each phase lasts BLINK_QUARTER_PERIOD_MS (150 ms by default — 1.3.7).
 * Full cycle = 600 ms.
 *
 * The previous 2-phase cycle (red ↔ dim) is replaced because the
 * letter was always present — only the color changed. The 4-phase
 * cycle physically turns the letter off for half the cycle, which
 * is a stronger attention cue.
 *
 * ANSI \x1b[5m (slow blink) is intentionally NOT used here. The
 * on/off cue is delivered by the space-rendering off-phase, which
 * works on every terminal. ANSI blink is unreliable across modern
 * terminals (Alacritty, kitty, Windows Terminal default all ignore
 * it) and was redundant with the off-phase anyway.
 */

export const BLINK_QUARTER_PERIOD_MS = 150;

/**
 * Pick the current phase of the 4-phase blink cycle.
 * Returns a deterministic value of the wall clock — tests pass `now`
 * explicitly, production defaults to Date.now().
 */
export type BlinkPhase = "dim" | "off" | "red" | "off";

export function pickBlinkPhase(now: number = Date.now()): BlinkPhase {
	const phase = Math.floor(now / BLINK_QUARTER_PERIOD_MS) % 4;
	if (phase === 0) return "dim";
	if (phase === 2) return "red";
	return "off";
}

/**
 * True when the given model id or name identifies a Kimi model.
 * Mirrors the detection in src/kimi-fetcher.ts (single condition here
 * so the label helper has no dependency on the fetcher).
 */
function isKimiLabel(model: string | undefined): boolean {
	const id = (model ?? "").toString().toLowerCase();
	if (id.includes("kimi")) return true;
	return /^k\d/.test(id);
}

const DIM = "\x1b[38;5;244m";
const RED = "\x1b[91m";
const RESET = "\x1b[0m";

const KIMI_LABEL = "Kimi ";
const BLANK_5 = "     ";

/**
 * Format the Kimi label with the 4-phase blink cycle.
 *
 * Returns an empty string when the model is not a Kimi model, so the
 * caller can do `formatKimiLabel(model, now) || dim(label)` and let
 * MiniMax / unknown fall through to the existing static path.
 *
 * Phase → output:
 *   dim  → `${DIM}Kimi ${RESET}`  (visible dim grey)
 *   off  → `${DIM}     ${RESET}`  (5 spaces — letter is invisible)
 *   red  → `${RED}Kimi ${RESET}`   (visible bright red)
 *   off  → `${DIM}     ${RESET}`  (5 spaces — letter is invisible)
 *
 * The off-phase renders SPACES (not an empty string) so the column
 * width stays stable. The layout does not shift between phases.
 */
export function formatKimiLabel(model: string, now: number = Date.now()): string {
	if (!isKimiLabel(model)) return "";
	const phase = pickBlinkPhase(now);
	if (phase === "dim") return `${DIM}${KIMI_LABEL}${RESET}`;
	if (phase === "red") return `${RED}${KIMI_LABEL}${RESET}`;
	return `${DIM}${BLANK_5}${RESET}`;
}

const WT_MARKER = "[wt]";
const WT_BLANK = "    "; // 4 spaces — same visible width as "[wt]"
const CYAN_BOLD = "\x1b[96m\x1b[1m";
const AMBER_BOLD = "\x1b[38;2;224;168;0m\x1b[1m"; // bar warning color #e0a800
const OFF_ALL = "\x1b[22m\x1b[39m";

/**
 * Format the [wt] worktree marker with the shared 4-phase blink cycle
 * (cyan → off → amber → off). Same clock as the dirty digit and the
 * Kimi label, so every blink source on row 1 cycles in lockstep.
 *
 * Phase → output:
 *   dim  → cyan bold [wt]      (the familiar look)
 *   off  → 4 dim spaces        (invisible, column width preserved)
 *   red  → amber bold [wt]     (#e0a800 — the bar "warning" family)
 *   off  → 4 dim spaces
 *
 * The off-phase renders SPACES so the column width stays stable, and
 * ANSI \x1b[5m is never used (same reasons as the Kimi label).
 * Resets with bold-off + fg-off (\x1b[22m\x1b[39m) so the marker
 * composes cleanly inside formatGitCenter's colored segments.
 */
export function formatWorktreeMarker(now: number = Date.now()): string {
	const phase = pickBlinkPhase(now);
	if (phase === "dim") return `${CYAN_BOLD}${WT_MARKER}${OFF_ALL}`;
	if (phase === "red") return `${AMBER_BOLD}${WT_MARKER}${OFF_ALL}`;
	return `${DIM}${WT_BLANK}${RESET}`;
}
