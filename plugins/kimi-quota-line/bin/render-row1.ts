#!/usr/bin/env node
/**
 * render-row1.ts — kimi-code [status_line].command target.
 *
 * Invoked by kimi-code's status-line runner with StatusLinePayload on stdin
 * and KIMI_CODE_STATUS_LINE=1 in env. Must complete in <300ms.
 *
 * Renders pi-footer's row 1 verbatim: sunset-gradient folder (left) + Kimi
 * or MiniMax quota bars (right). Falls back to cwd-only if no quota data is
 * available. Pure buildRow1 is exported so test/ can import it directly.
 */
import { pathToFileURL } from "node:url";
import { getGitDetails } from "../src/git-footer.js";
import {
	formatPaceHours,
	formatRemaining,
	pct,
	sessionPaceColor,
	sessionPaceHours,
	statusFg,
	vbar,
	weeklyPaceColor,
	weeklyPaceHours,
} from "../src/helpers.js";
import { formatKimiLabel, formatWorktreeMarker, pickBlinkPhase } from "../src/label-blink.js";
import { isKimiModel, isMinimaxModel } from "../src/model-detect.js";
import { readQuotaCache } from "../src/quota-cache.js";
import { styledCwd } from "../src/sunset-dir.js";
import type { GitInfo, QuotaCache, QuotaData, StatusLinePayload } from "../src/types.js";
import { detectWidth } from "../src/width.js";

/* Fixed dim color: 256-palette #808080. The status-line script has no
 * access to the active kimi-code theme at runtime; pi-footer's
 * theme.fg("dim", …) resolves to a theme token, but here we emit a single
 * fixed ANSI color. Documented intentional difference from pi-footer. */
const DIM = "\x1b[38;5;244m";
const RED = "\x1b[91m";
const RESET = "\x1b[0m";
const dim = (t: string): string => `${DIM}${t}${RESET}`;

async function readStdin(): Promise<Partial<StatusLinePayload>> {
	return new Promise((resolve) => {
		let buf = "";
		const stream = process.stdin;
		if (!stream?.readable) {
			resolve({});
			return;
		}
		stream.setEncoding("utf-8");
		stream.on("data", (chunk: string) => {
			buf += chunk;
		});
		stream.on("end", () => {
			try {
				resolve(buf.trim() ? (JSON.parse(buf) as Partial<StatusLinePayload>) : {});
			} catch {
				resolve({});
			}
		});
		stream.on("error", () => resolve({}));
		setTimeout(() => resolve({}), 200).unref?.();
	});
}

/** Visible (printed) width of an ANSI-colored string. */
export function visibleWidth(s: string): number {
	const stripped = s.replace(/\x1b\[[0-9;]*m/g, "");
	let w = 0;
	for (const ch of stripped) {
		const code = ch.codePointAt(0) ?? 0;
		const wide =
			(code >= 0x1100 && code <= 0x115f) ||
			(code >= 0x2e80 && code <= 0x303e) ||
			(code >= 0x3041 && code <= 0x33ff) ||
			(code >= 0x3400 && code <= 0x4dbf) ||
			(code >= 0x4e00 && code <= 0x9fff) ||
			(code >= 0xa000 && code <= 0xa4cf) ||
			(code >= 0xac00 && code <= 0xd7a3) ||
			(code >= 0xf900 && code <= 0xfaff) ||
			(code >= 0xfe30 && code <= 0xfe4f) ||
			(code >= 0xff00 && code <= 0xff60) ||
			(code >= 0xffe0 && code <= 0xffe6);
		w += wide ? 2 : 1;
	}
	return w;
}

/**
 * Build the quota status string for the right side of row 1.
 * Mirrors pi-footer's buildQuotaStatus() byte-for-byte.
 *
 * When `compact` is true (used on narrow terminals), drops the pace hours
 * (`9h55m`) and the reset countdown (`/5.06`) so the right column fits in
 * ~33 chars instead of ~59 — leaves room for the git center on 80-col
 * terminals. Bars and percentages are preserved (the most important info).
 */
export function buildQuotaStatus(
	model: string,
	cache: QuotaCache | null,
	compact: boolean = false,
	now: number = Date.now(),
): string | undefined {
	let label: string;
	let data: QuotaData | null;
	if (cache?.kimi && isKimiModel(model)) {
		label = "Kimi ";
		data = cache.kimi;
	} else if (cache?.minimax && isMinimaxModel(model)) {
		label = "MM ";
		data = cache.minimax;
	} else {
		return undefined;
	}
	if (!data) return undefined;

	const { wUsed, wLimit, wResetAt, hUsed, hLimit, hResetAt, hRemaining } = data;
	const wColor = weeklyPaceColor(wUsed, wLimit, wResetAt);
	const hColor = sessionPaceColor(hUsed, hLimit, hResetAt);
	const wPace = weeklyPaceHours(wUsed, wLimit, wResetAt);
	const hPace = sessionPaceHours(hUsed, hLimit, hResetAt);

	const wBar = statusFg(wColor, vbar(wUsed, wLimit));
	const wPct = statusFg(wColor, pct(wUsed, wLimit));
	const hBar = statusFg(hColor, vbar(hUsed, hLimit));
	const hPct = statusFg(hColor, pct(hUsed, hLimit));

	// Kimi label blinks; MiniMax (and any future provider) stays static dim.
	// formatKimiLabel returns "" for non-Kimi models, so we must NOT use it
	// as a drop-in for `dim(label)` — we pick per-provider here.
	const labelStr = label === "Kimi " ? formatKimiLabel(model, now) : dim(label);

	if (compact) {
		// Drop pace hours (e.g. "9h55m ") and reset countdowns (e.g. "/5.06").
		// Keep label + weekly bar + pct/limit + "5H:" + 5H bar + pct/limit
		// so the user can see both bars on narrow terminals. Format:
		// "MM ▮▮▮▯▯▯▯▯▯▯ 31%/100  5H: ▮▮▮▯▯▯▯▯▯▯ 25%/50" — ~44 chars vs ~57 in full mode.
		return `${labelStr}${wBar} ${wPct}${dim("/")}${String(wLimit)}${dim("  5H:")}${hBar}${dim(" ")}${hPct}${dim("/")}${String(hLimit)}`;
	}

	const wRemaining = formatRemaining(wResetAt);
	const wPaceSeg =
		wPace === null
			? ""
			: `${wColor === "success" ? dim(formatPaceHours(wPace)) : statusFg(wColor, formatPaceHours(wPace))}${dim(" ")}`;
	const hPaceSeg =
		hPace === null
			? ""
			: `${hColor === "success" ? dim(formatPaceHours(hPace)) : statusFg(hColor, formatPaceHours(hPace))}${dim(" ")}`;
	return `${labelStr}${wPaceSeg}${wBar}${dim(" ")}${wPct}${dim("/")}${dim(wRemaining)}${dim("  5H:")}${hPaceSeg}${hBar}${dim(" ")}${hPct}${dim("/")}${dim(hRemaining)}`;
}

// BLINK_QUARTER_PERIOD_MS + pickBlinkPhase live in src/label-blink.ts since 1.3.6.
// Re-exported here so existing tests that import from render-row1.ts
// keep working without churn.
export {
	BLINK_QUARTER_PERIOD_MS,
	pickBlinkPhase,
} from "../src/label-blink.js";

/**
 * Render the dirty count segment using the 4-phase blink cycle (1.3.6).
 * " files" stays static dim throughout; only the digit is gated by phase.
 *
 * Phase → output (digit `"3"`):
 *   dim:  ${DIM}3${RESET}  files
 *   off:  ${DIM} ${RESET}  files  ← space instead of "3"
 *   red:  ${RED}3${RESET}  files
 *   off:  ${DIM} ${RESET}  files
 *
 * Why spaces in the off phase:
 *   - Stable column width (the digit slot is always 1 visible char or
 *     1 space, never zero).
 *   - No ANSI blink dependency — works on Alacritty, kitty, Windows
 *     Terminal default, everything.
 *   - " files" never carries blink, so the digit-off → spaces transition
 *     makes the whole "3 files" string look like "  files" briefly.
 */
function formatDirtyCount(n: number, now: number = Date.now()): string {
	const digit = String(n);
	const phase = pickBlinkPhase(now);
	if (phase === "dim") return `${DIM}${digit}${RESET}${dim(" files")}`;
	if (phase === "red") return `${RED}${digit}${RESET}${dim(" files")}`;
	return `${DIM} ${RESET}${dim(" files")}`;
}

/**
 * Format the git details for line 1's center column.
 *
 * Shape (preserved from 1.3.3):
 *   - Worktree branch: cyan bold, then a blinking [wt] marker
 *     (cyan → off → amber → off, same 4-phase clock as the digit)
 *   - Non-worktree branch: dim
 *   - Dirty count: digit blinks red ↔ dim; the word " files" stays static dim
 *   - Separator " • ": dim
 *   - Clean: dim "clean"
 *   - No git repo: dim "no git" placeholder
 *
 * 1.3.4 add-on: the dirty digit blinks via pickBlinkColor. The rest of
 * the layout is unchanged.
 */
export function formatGitCenter(git: GitInfo | null, now: number = Date.now()): string {
	if (!git?.branch) {
		return `\x1b[2mno git\x1b[22m`;
	}

	if (git.isWorktree) {
		// Branch stays static cyan bold; only the [wt] marker blinks
		// (cyan → off → amber → off, shared 4-phase clock).
		const head = `\x1b[96m\x1b[1m${git.branch}\x1b[22m\x1b[39m ${formatWorktreeMarker(now)}`;
		if (git.count > 0) {
			return `${head} \x1b[2m\u2022\x1b[22m ${formatDirtyCount(git.count, now)}`;
		}
		return `${head} \x1b[2m\u2022 clean\x1b[22m`;
	}

	if (git.count > 0) {
		return `\x1b[2m${git.branch} \u2022 \x1b[22m${formatDirtyCount(git.count, now)}`;
	}
	return `\x1b[2m${git.branch} \u2022 clean\x1b[22m`;
}

/**
 * Build the complete row 1 string for the given payload + cache + width.
 * Three-column layout: folder (left) | git details (center) | quota bars (right).
 *
 * Git info is fetched fresh per call (via `getCurrentBranch()` and the
 * `buildGitDetails` cache) so the center column always reflects the current
 * cwd. The kimi/minimax cache is still read from disk because it would
 * otherwise require API calls per render.
 *
 * Tests can pass an explicit `git` value to avoid spawning git subprocesses.
 * Tests can also pass `now` to pin the red↔dim color cycle phase for the
 * dirty center digit. In production both are omitted; defaults to live data.
 * Pure function aside from that git call.
 */
export function buildRow1(
	payload: StatusLinePayload,
	cache: QuotaCache | null,
	width: number,
	git?: GitInfo | null,
	now: number = Date.now(),
): string {
	const left = styledCwd(payload.cwd || "/");
	const gitInfo = git !== undefined ? git : (getGitDetails(payload.gitBranch || null) ?? null);
	const center = formatGitCenter(gitInfo, now);

	// Git center is independent of quota. When quota is unavailable,
	// only the right column drops — the center still renders (real branch
	// OR the "no git" placeholder). Fall back to folder-only only when
	// the center cannot fit OR there is nothing to say at all.
	const rightFull = buildQuotaStatus(payload.model || "", cache, false, now);
	if (!rightFull) {
		const leftW = visibleWidth(left);
		if (center && center.trim().length > 0) {
			const centerW = visibleWidth(center);
			if (leftW + 2 + centerW <= width) {
				const pad = " ".repeat(Math.max(0, width - leftW - centerW));
				return `${left}  ${center}${pad}`;
			}
		}
		return leftW <= width ? left : left.slice(0, width);
	}

	const leftW = visibleWidth(left);
	const centerW = center ? visibleWidth(center) : 0;

	// Layout: left-justified three-column with a fixed small gap (2 spaces)
	// between each pair. Folder + git pack on the LEFT side; bars float on
	// the RIGHT (rightPad fills the space between center and bars).
	const layout3Col = (rightStr: string): string | null => {
		if (!center) return null;
		const rightW = visibleWidth(rightStr);
		const gap = 2;
		const contentWidth = leftW + gap + centerW + gap + rightW;
		const rightPad = width - contentWidth;
		if (rightPad < 0) return null; // doesn't fit
		return left + " ".repeat(gap) + center + " ".repeat(gap + rightPad) + rightStr;
	};

	// Try three-column with FULL right first.
	const fullLayout = layout3Col(rightFull);
	if (fullLayout !== null) return fullLayout;

	// Try three-column with COMPACT right (drops pace hours + reset).
	const rightCompact = buildQuotaStatus(payload.model || "", cache, true, now);
	if (rightCompact) {
		const compactLayout = layout3Col(rightCompact);
		if (compactLayout !== null) return compactLayout;
	}

	// Center doesn't fit (or no center): two-column layout with whatever right we have.
	const rightFinal = rightCompact ?? rightFull;
	const rightW = visibleWidth(rightFinal);
	if (leftW + 2 + rightW <= width) {
		const pad = " ".repeat(Math.max(0, width - leftW - rightW));
		return left + pad + rightFinal;
	}

	// Need to truncate left.
	const avail = Math.max(0, width - 2 - rightW);
	const truncLeft = avail > 0 ? left.slice(0, avail) : "";
	return `${truncLeft} ${rightFinal}`;
}

async function main(): Promise<void> {
	const partial = await readStdin();
	const width = detectWidth();

	// Read the quota cache directly. JSON reads of small files are atomic on
	// Linux; a torn read would already fail JSON.parse inside readQuotaCache
	// and return null. The hook still holds the file lock for its WRITE
	// path, so concurrent writers do not corrupt each other. Skipping the
	// lock on the read path saves 5-15 ms of syscalls per render.
	const quotaCache: QuotaCache | null = readQuotaCache();

	const payload: StatusLinePayload = {
		model: partial.model ?? "",
		cwd: partial.cwd ?? process.cwd(),
		gitBranch: partial.gitBranch ?? null,
		permissionMode: partial.permissionMode ?? "",
		planMode: partial.planMode ?? false,
		contextUsage: partial.contextUsage ?? 0,
		contextTokens: partial.contextTokens ?? 0,
		maxContextTokens: partial.maxContextTokens ?? 0,
		sessionId: partial.sessionId ?? "",
		version: partial.version ?? "",
	};

	// Git: branch comes from kimi-code's official stdin snapshot field
	// `gitBranch` (always fresh, zero cost). Worktree + dirty count come
	// from the mtime-keyed cache via getGitDetails — one bounded
	// `--no-optional-locks` subprocess only when the repo internals changed.
	const git: GitInfo | null = getGitDetails(payload.gitBranch || null) ?? null;

	const line = buildRow1(payload, quotaCache, width, git);
	process.stdout.write(line);
}

/* Run main() only when this file is invoked directly, not when imported by tests. */
const isMain = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);
if (isMain) {
	main().catch(() => {
		process.stdout.write("");
		process.exit(0);
	});
}
