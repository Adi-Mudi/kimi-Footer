#!/usr/bin/env node
import { withFileLock } from "../src/file-lock.js";
/**
 * refresh-cache.ts — plugin hook target.
 *
 * Runs from SessionStart and SessionHeartbeat hooks. Fetches Kimi and MiniMax
 * usage in parallel (each is error-tolerant internally) and writes the quota
 * cache to $XDG_RUNTIME_DIR/kimi-quota-line-quota-cache.json (fallback
 * /tmp/...). Wraps the write in `withFileLock` so concurrent hook fires
 * (e.g. /refresh racing the heartbeat) cannot produce a torn JSON.
 *
 * Git data is NOT cached here since v1.3.1 — the render path runs git
 * status live on every call.
 *
 * Failure-tolerant per-provider: one provider failing does not block the other.
 * On any cache-write failure the script exits 0 (fail-open per the Kimi Hooks
 * doc: exit 0 = allow, exit 2 = block, other = log-only). The session
 * continues with the previous cache (or no cache); the missing bar is hidden.
 */
import { fetchKimiUsage, getKimiData } from "../src/kimi-fetcher.js";
import { fetchMinimaxUsage, getMinimaxData } from "../src/minimax-fetcher.js";
import { QUOTA_LOCK_PATH, readQuotaCache, writeQuotaCache } from "../src/quota-cache.js";
import type { QuotaCache } from "../src/types.js";

interface HookPayload {
	// `hook_event_name` is the discriminator on every Kimi hook payload
	// per the official docs:
	// https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html
	hook_event_name?: unknown;
	model?: unknown;
}

async function readStdin(): Promise<HookPayload> {
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
				resolve(buf.trim() ? (JSON.parse(buf) as HookPayload) : {});
			} catch {
				resolve({});
			}
		});
		stream.on("error", () => resolve({}));
		setTimeout(() => resolve({}), 1000).unref?.();
	});
}

async function main(): Promise<void> {
	const payload = await readStdin();
	const model = typeof payload.model === "string" ? payload.model : null;

	// SessionStart must NOT block on network latency. The CLI awaits this
	// hook result (see MoonshotAI/kimi-code#1896) before showing the prompt,
	// so any API call here adds its full RTT to startup. Only the heartbeat
	// (every 60 s) refreshes quota data; SessionStart just touches the cache
	// file's mtime / timestamp so the render path knows it has been seen.
	//
	// The discriminator field is `hook_event_name` (every Kimi payload has
	// it). v1.3.3 read `payload.event` which never matches real kimi
	// payloads — fast-path was dead code. v1.3.3.2 fixed it.
	if (payload.hook_event_name === "SessionStart") {
		const existing = readQuotaCache();
		const cache: QuotaCache = {
			ts: Date.now(),
			model,
			kimi: existing?.kimi ?? null,
			minimax: existing?.minimax ?? null,
		};
		try {
			await withFileLock(QUOTA_LOCK_PATH, async () => {
				writeQuotaCache(cache);
			});
		} catch {
			// Best effort; render falls back to folder-only if the write fails.
		}
		process.exit(0);
	}

	await Promise.allSettled([fetchKimiUsage(), fetchMinimaxUsage()]);

	const cache: QuotaCache = {
		ts: Date.now(),
		model,
		kimi: getKimiData(),
		minimax: getMinimaxData(),
	};

	try {
		await withFileLock(QUOTA_LOCK_PATH, async () => {
			writeQuotaCache(cache);
		});
	} catch (e) {
		console.error("[kimi-quota-line] quota cache write failed:", (e as Error)?.message ?? e);
		// Fail-open: cache write is best-effort. Per Kimi Hooks doc, exit 0
		// = allow (stdout context) and other codes = log-only. The session
		// continues with the previous cache (or no cache). Do NOT exit 1.
		process.exit(0);
	}

	// Git data is no longer cached here — v1.3.1 made git status live on
	// every render. The render path runs `git status` directly; no cache,
	// no lock, no staleness.
}

main().catch((e) => {
	console.error("[kimi-quota-line] refresh-cache fatal:", (e as Error)?.message ?? e);
	process.exit(1);
});
