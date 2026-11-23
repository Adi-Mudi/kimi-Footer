#!/usr/bin/env node
import { withFileLock } from "../src/file-lock.js";

import { QUOTA_LOCK_PATH, readQuotaCache, writeQuotaCache } from "../src/quota-cache.js";
import { parseModelAlias } from "../src/model-detect.js";
import { PROVIDERS } from "../src/providers.js";
import type { QuotaCache } from "../src/types.js";

interface HookPayload {
	hook_event_name?: unknown;
	model?: unknown;
	session_id?: unknown;
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

function emptyCacheSlots(): Omit<QuotaCache, "ts" | "model"> {
	return {
		kimi: null,
		minimax: null,
		openrouter: null,
		openrouter2: null,
		opencodeGo: null,
		cline: null,
	};
}

async function main(): Promise<void> {
	const payload = await readStdin();
	const alias = parseModelAlias(payload.model);
	const normalized = alias.provider && alias.name ? `${alias.provider}/${alias.name}` : alias.name || null;

	
	if (payload.hook_event_name === "SessionStart") {
		const existing = readQuotaCache();
		const sid = typeof payload.session_id === "string" && payload.session_id ? payload.session_id : null;
		const sessions = { ...(existing?.sessions ?? {}) };
		const now = Date.now();
		if (sid) {
			const alias = parseModelAlias(payload.model);
			const prov = alias.provider ? alias.provider : null;
			sessions[sid] = { model: normalized, provider: prov, updatedAt: now };
			for (const [k, v] of Object.entries(sessions)) {
				if (now - (v?.updatedAt ?? 0) > 24 * 60 * 60 * 1000) delete sessions[k];
			}
		}
		const cache: QuotaCache = {
			ts: now,
			model: normalized,
			...emptyCacheSlots(),
			kimi: existing?.kimi ?? null,
			minimax: existing?.minimax ?? null,
			openrouter: existing?.openrouter ?? null,
			openrouter2: existing?.openrouter2 ?? null,
			opencodeGo: existing?.opencodeGo ?? null,
			cline: existing?.cline ?? null,
			sessions,
		};
		try {
			await withFileLock(QUOTA_LOCK_PATH, async () => {
				writeQuotaCache(cache);
			});
		} catch {
			
		}
		process.exit(0);
	}

	await Promise.allSettled(PROVIDERS.map((p) => p.fetch()));

	const existing = readQuotaCache();
	const cache: QuotaCache = {
		ts: Date.now(),
		model: normalized ?? existing?.model ?? null,
		...emptyCacheSlots(),
		sessions: existing?.sessions,
	};
	for (const p of PROVIDERS) {
		const key = p.cacheKey;
		const data = p.getData();
		if (data !== null && data !== undefined) {
			cache[key] = data as never;
		} else if (existing) {
			cache[key] = (existing as unknown as Record<string, unknown>)[key] as never;
		}
	}

	try {
		await withFileLock(QUOTA_LOCK_PATH, async () => {
			writeQuotaCache(cache);
		});
	} catch (e) {
		console.error("[kimi-quota-line] quota cache write failed:", (e as Error)?.message ?? e);
		process.exit(0);
	}
}

main().catch((e) => {
	console.error("[kimi-quota-line] refresh-cache fatal:", (e as Error)?.message ?? e);
	process.exit(1);
});
