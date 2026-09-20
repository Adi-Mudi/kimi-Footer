#!/usr/bin/env node
/**
 * postinstall.mjs — runs after `npm install`.
 *
 * Warns (non-fatal) when the managed copy of this plugin is missing or
 * has a different version than the source. Does NOT install
 * automatically — that would be a side-effecting surprise during
 * dependency installation.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = dirname(HERE);
const HOME = process.env.KIMI_CODE_HOME || join(homedir(), ".kimi-code");
const MANAGED = join(HOME, "plugins", "managed", "kimi-quota-line");

function readVersion(path) {
	try {
		return JSON.parse(readFileSync(path, "utf8")).version;
	} catch {
		return null;
	}
}

const srcVer = readVersion(join(SRC, "kimi.plugin.json"));
const mgrVer = existsSync(join(MANAGED, "kimi.plugin.json")) ? readVersion(join(MANAGED, "kimi.plugin.json")) : null;

if (!mgrVer) {
	console.warn(
		`[kimi-quota-line] managed copy not found at ${MANAGED}.\n` +
			`  Run \`./tools/install.sh\` (or /plugins install ${SRC} inside kimi-code).`,
	);
} else if (srcVer && mgrVer !== srcVer) {
	console.warn(
		`[kimi-quota-line] source is v${srcVer} but managed copy is v${mgrVer}.\n` +
			`  Run \`./tools/install.sh\` to refresh, then /plugins reload.`,
	);
} else {
	console.log(`[kimi-quota-line] postinstall OK (v${srcVer || mgrVer}).`);
}
