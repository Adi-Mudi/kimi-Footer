import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { isCacheValid, readGitCache, resolveMaxAgeMs, statGitDir, writeGitCacheAtomic } from "./git-cache.js";
import type { GitInfo } from "./types.js";

interface RawGit {
	branch: string | null;
	isWorktree: boolean;
	count: number;
}

const GIT_TIMEOUT_MS = 300;

interface GitDirDiscovery {
	
	gitDir: string;
	isWorktree: boolean;
}

function discoverGitDir(): GitDirDiscovery | null {
	let dir = process.cwd();
	for (;;) {
		const dotGit = join(dir, ".git");
		let st: import("node:fs").Stats | null = null;
		try {
			st = statSync(dotGit);
		} catch {
			st = null;
		}
		if (st?.isDirectory()) {
			return { gitDir: dotGit, isWorktree: false };
		}
		if (st?.isFile()) {
			try {
				const content = readFileSync(dotGit, "utf-8").trim();
				const m = /^gitdir:\s*(.+)$/m.exec(content);
				if (m?.[1]) {
					const target = m[1].trim();
					const gitDir = isAbsolute(target) ? target : join(dir, target);
					return { gitDir, isWorktree: gitDir.includes("worktrees") };
				}
			} catch {
				
				return null;
			}
		}
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

function parsePorcelain(stdout: string): { branch: string | null; count: number } {
	let branch: string | null = null;
	let count = 0;
	for (const line of stdout.split("\n")) {
		if (line === "") continue;
		if (line.startsWith("# branch.head ")) {
			const head = line.slice("# branch.head ".length).trim();
			if (head && head !== "(detached)" && head !== "(initial)") {
				branch = head;
			}
		} else if (!line.startsWith("#")) {
			const c = line[0];
			if (c === "1" || c === "2" || c === "?") count++;
		}
	}
	return { branch, count };
}

function collectRawGit(): RawGit | null {
	const discovery = discoverGitDir();
	if (!discovery) return null;

	const cwd = process.cwd();
	const now = Date.now();
	const stats = statGitDir(discovery.gitDir);
	const maxAgeMs = resolveMaxAgeMs();

	if (stats) {
		const cached = readGitCache();
		if (
			cached &&
			isCacheValid(
				cached,
				{
					cwd,
					headMtimeMs: stats.headMtimeMs,
					indexMtimeMs: stats.indexMtimeMs,
					now,
				},
				maxAgeMs,
			)
		) {
			return { branch: cached.branch, isWorktree: cached.isWorktree, count: cached.count };
		}
	}

	let stdout: string;
	try {
		stdout = execSync("git --no-optional-locks status --porcelain=v2 --branch", {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "ignore"],
			timeout: GIT_TIMEOUT_MS,
		});
	} catch {
		return null;
	}

	const { branch, count } = parsePorcelain(stdout);

	if (stats) {
		try {
			writeGitCacheAtomic({
				cwd,
				headMtimeMs: stats.headMtimeMs,
				indexMtimeMs: stats.indexMtimeMs,
				capturedAt: now,
				branch,
				isWorktree: discovery.isWorktree,
				count,
			});
		} catch {
			
			
		}
	}

	return { branch, isWorktree: discovery.isWorktree, count };
}

export function getCurrentBranch(): string | null {
	return collectRawGit()?.branch ?? null;
}

export function isInWorktree(): boolean {
	return collectRawGit()?.isWorktree ?? false;
}

export function getUncommittedCount(): number {
	return collectRawGit()?.count ?? 0;
}

export function buildGitDetails(_getBranch: () => string | null): GitInfo | undefined {
	return getGitDetails(null);
}

export function getGitDetails(payloadBranch: string | null = null): GitInfo | undefined {
	const r = collectRawGit();
	const branch = payloadBranch ?? r?.branch ?? null;
	if (!branch) {
		return { branch: "", count: 0, text: "no git repo", isWorktree: false };
	}
	const isWorktree = r?.isWorktree ?? false;
	const count = r?.count ?? 0;
	const branchLabel = isWorktree ? `${branch} [wt]` : branch;
	const text = count > 0 ? `${branchLabel} \u2022 ${count} files` : `${branchLabel} \u2022 clean`;
	return { branch, count, text, isWorktree };
}
