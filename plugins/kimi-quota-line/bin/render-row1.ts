#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { getGitDetails } from "../src/git-footer.js";
import { sessionPaceColor, statusFg, weeklyPaceColor } from "../src/helpers.js";
import { formatProviderLabel, formatWorktreeMarker, pickBlinkPhase } from "../src/label-blink.js";
import { fullModelName, resolveActiveProviderId, shortLabelFor } from "../src/model-detect.js";
import { readQuotaCache } from "../src/quota-cache.js";
import { styledCwd } from "../src/sunset-dir.js";
import type { GitInfo, QuotaCache, QuotaData, RequestQuotaData, StatusLinePayload } from "../src/types.js";
import { detectWidth } from "../src/width.js";

export { BLINK_QUARTER_PERIOD_MS, pickBlinkPhase } from "../src/label-blink.js";

const DIM = "\x1b[38;5;244m";
const RESET = "\x1b[0m";
const dim = (t: string): string => `${DIM}${t}${RESET}`;

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

function usedPct(d: QuotaData, which: "w" | "h"): number {
	const used = which === "w" ? d.wUsed : d.hUsed;
	const limit = which === "w" ? d.wLimit : d.hLimit;
	if (limit <= 0) return 0;
	return Math.round((used / limit) * 100);
}

function reqColor(r: RequestQuotaData): "success" | "warning" | "error" {
	if (r.limit <= 0) return "success";
	const ratio = r.used / r.limit;
	if (ratio <= 0.8) return "success";
	if (ratio <= 0.95) return "warning";
	return "error";
}

function metricsFor(
	providerId: string | null,
	cache: QuotaCache | null,
): string | undefined {
	if (!providerId || !cache) return undefined;

	if (providerId === "kimi-code" && cache.kimi) {
		const d = cache.kimi;
		const wColor = weeklyPaceColor(d.wUsed, d.wLimit, d.wResetAt);
		const hColor = sessionPaceColor(d.hUsed, d.hLimit, d.hResetAt);
		return `${statusFg(wColor, `W:${usedPct(d, "w")}%`)}  ${statusFg(hColor, `5H:${usedPct(d, "h")}%`)}`;
	}
	if (providerId === "minimax" && cache.minimax) {
		const d = cache.minimax;
		const wColor = weeklyPaceColor(d.wUsed, d.wLimit, d.wResetAt);
		const hColor = sessionPaceColor(d.hUsed, d.hLimit, d.hResetAt);
		return `${statusFg(wColor, `W:${usedPct(d, "w")}%`)}  ${statusFg(hColor, `5H:${usedPct(d, "h")}%`)}`;
	}
	if (providerId === "opencode-go" && cache.opencodeGo) {
		const d = cache.opencodeGo;
		const wColor = weeklyPaceColor(d.wUsed, d.wLimit, d.wResetAt);
		const hColor = sessionPaceColor(d.hUsed, d.hLimit, d.hResetAt);
		return `${statusFg(wColor, `W:${usedPct(d, "w")}%`)}  ${statusFg(hColor, `5H:${usedPct(d, "h")}%`)}`;
	}
	if (providerId === "openrouter" && cache.openrouter) {
		const r = cache.openrouter;
		return statusFg(reqColor(r), `Req: ${r.used}/${r.limit}`);
	}
	if (providerId === "openrouter-2" && cache.openrouter2) {
		const r = cache.openrouter2;
		return statusFg(reqColor(r), `Req: ${r.used}/${r.limit}`);
	}
	
	return undefined;
}

export function buildRightZone(
	payloadModel: string,
	cache: QuotaCache | null,
	withMetrics: boolean = true,
	now: number = Date.now(),
): string | undefined {
	if (!payloadModel) return undefined;

	const providerId = resolveActiveProviderId(payloadModel, cache?.model ?? null);
	const short = shortLabelFor(providerId);
	const model = fullModelName(payloadModel, cache?.model ?? null);
	if (!short && !model) return undefined;

	const metrics = withMetrics ? metricsFor(providerId, cache) : undefined;

	if (!short) {
		return metrics ? `${dim(model)}  ${metrics}` : dim(model);
	}

	const shortStr = formatProviderLabel(short, now);
	const modelStr = dim(model);
	if (metrics) return `${shortStr}  ${modelStr}  ${metrics}`;
	return `${shortStr}  ${modelStr}`;
}

export function formatGitCenter(git: GitInfo | null, now: number = Date.now()): string {
	if (!git?.branch) {
		return `\x1b[2mno git\x1b[22m`;
	}

	if (git.isWorktree) {
		const head = `\x1b[96m\x1b[1m${git.branch}\x1b[22m\x1b[39m ${formatWorktreeMarker(now)}`;
		if (git.count > 0) {
			return `${head} \x1b[2m•\x1b[22m ${formatDirtyCount(git.count, now)}`;
		}
		return `${head} \x1b[2m• clean\x1b[22m`;
	}

	if (git.count > 0) {
		return `\x1b[2m${git.branch} • \x1b[22m${formatDirtyCount(git.count, now)}`;
	}
	return `\x1b[2m${git.branch} • clean\x1b[22m`;
}

function formatDirtyCount(n: number, now: number = Date.now()): string {
	const digit = String(n);
	const phase = pickBlinkPhase(now);
	if (phase === "dim") return `${DIM}${digit}${RESET}${dim(" files")}`;
	if (phase === "red") return `\x1b[91m${digit}${RESET}${dim(" files")}`;
	return `${DIM} ${RESET}${dim(" files")}`;
}

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

	const rightFull = buildRightZone(payload.model || "", cache, true, now);
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

	const layout3Col = (rightStr: string): string | null => {
		if (!center) return null;
		const rightW = visibleWidth(rightStr);
		const gap = 2;
		const contentWidth = leftW + gap + centerW + gap + rightW;
		const rightPad = width - contentWidth;
		if (rightPad < 0) return null;
		return `${left}${" ".repeat(gap)}${center}${" ".repeat(gap + rightPad)}${rightStr}`;
	};

	const fullLayout = layout3Col(rightFull);
	if (fullLayout !== null) return fullLayout;

	
	const rightNoMetrics = buildRightZone(payload.model || "", cache, false, now);
	if (rightNoMetrics) {
		const noMetLayout = layout3Col(rightNoMetrics);
		if (noMetLayout !== null) return noMetLayout;
	}

	
	const rightFinal = rightNoMetrics ?? rightFull;
	const rightW = visibleWidth(rightFinal);
	if (center && centerW > 0) {
		const gap = 2;
		const contentW = centerW + gap + rightW;
		if (contentW <= width) {
			const pad = " ".repeat(Math.max(0, width - contentW));
			return `${center}${" ".repeat(gap)}${pad}${rightFinal}`;
		}
	}

	if (rightW <= width) {
		const pad = " ".repeat(Math.max(0, width - rightW));
		return `${rightFinal}${pad}`;
	}

	
	return rightFinal.slice(0, width);
}

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

async function main(): Promise<void> {
	const partial = await readStdin();
	const width = detectWidth();
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

	const git: GitInfo | null = getGitDetails(payload.gitBranch || null) ?? null;
	const line = buildRow1(payload, quotaCache, width, git);
	process.stdout.write(line);
}

const isMain = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);
if (isMain) {
	main().catch(() => {
		process.stdout.write("");
		process.exit(0);
	});
}
