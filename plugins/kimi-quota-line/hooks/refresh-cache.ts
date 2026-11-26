#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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
		zai: null,
	};
}


function buildModelIndex(): Record<string, string> {
	const index: Record<string, string> = {};
	try {
		const dir = process.env.KIMI_CODE_HOME || join(homedir(), ".kimi-code");
		const raw = readFileSync(join(dir, "config.toml"), "utf-8");
		let inModels = false;
		let sectionKey: string | undefined;
		let prov = "";
		let display: string | undefined;
		let modelId: string | undefined;
		const flush = (): void => {
			if (!inModels || !prov) return;
			if (sectionKey && !index[sectionKey]) index[sectionKey] = prov;
			if (display && !index[display]) index[display] = prov;
			if (modelId && !index[modelId]) index[modelId] = prov;
		};
		for (const line of raw.split(/\r?\n/)) {
			const header = line.match(/^\[([^\]]+)\]/);
			if (header) {
				flush();
				const mKey = header[1].match(/^models\.(?:"([^"]+)"|'([^']+)'|(.+))$/);
				inModels = Boolean(mKey);
				sectionKey = mKey ? (mKey[1] ?? mKey[2] ?? mKey[3]) : undefined;
				prov = "";
				display = undefined;
				modelId = undefined;
				continue;
			}
			if (!inModels) continue;
			const p = line.match(/^\s*provider\s*=\s*"([^"]+)"/)?.[1];
			if (p) prov = p.replace(/^managed:/, "");
			const d = line.match(/^\s*display_name\s*=\s*"([^"]+)"/)?.[1];
			if (d) display = d;
			const m = line.match(/^\s*model\s*=\s*"([^"]+)"/)?.[1];
			if (m) modelId = m;
		}
		flush();
	} catch {
	}
	return index;
}

function updateSessionsMap(
	existingSessions: QuotaCache["sessions"],
	sid: string,
	provider: string | null,
	model: string | null,
	now: number,
): NonNullable<QuotaCache["sessions"]> {
	const sessions = { ...(existingSessions ?? {}) };
	sessions[sid] = { model, provider, updatedAt: now };
	for (const [k, v] of Object.entries(sessions)) {
		if (now - (v?.updatedAt ?? 0) > 24 * 60 * 60 * 1000) delete sessions[k];
	}
	return sessions;
}

async function main(): Promise<void> {
	const payload = await readStdin();
	const alias = parseModelAlias(payload.model);
	const normalized = alias.provider && alias.name ? `${alias.provider}/${alias.name}` : alias.name || null;
	const sid = typeof payload.session_id === "string" && payload.session_id ? payload.session_id : null;

	
	if (payload.hook_event_name === "SessionStart") {
		const existing = readQuotaCache();
		const now = Date.now();
		const sessions = sid
			? updateSessionsMap(existing?.sessions, sid, alias.provider ? alias.provider : null, normalized, now)
			: { ...(existing?.sessions ?? {}) };
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
			zai: existing?.zai ?? null,
			sessions,
			modelIndex: buildModelIndex(),
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
	const now = Date.now();
	const sessions =
		sid && normalized
			? updateSessionsMap(existing?.sessions, sid, alias.provider ? alias.provider : null, normalized, now)
			: existing?.sessions;
	const cache: QuotaCache = {
		ts: now,
		model: normalized ?? existing?.model ?? null,
		...emptyCacheSlots(),
		sessions,
		modelIndex: buildModelIndex(),
	};
	const keyStatus: Record<string, "ok" | "key" | "api"> = {};
	for (const p of PROVIDERS) {
		const key = p.cacheKey;
		const data = p.getData();
		if (data !== null && data !== undefined) {
			cache[key] = data as never;
			if (p.hasUsageApi !== false) keyStatus[p.aliasPrefixes[0] ?? p.id] = "ok";
		} else {
			if (existing) {
				cache[key] = (existing as unknown as Record<string, unknown>)[key] as never;
			}
			if (p.hasUsageApi !== false) keyStatus[p.aliasPrefixes[0] ?? p.id] = "key";
		}
	}
	cache.keyStatus = keyStatus;

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
