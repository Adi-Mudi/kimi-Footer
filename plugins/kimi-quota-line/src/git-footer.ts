/**
 * Git footer details — branch name + uncommitted file count.
 *
 * COMMUNITY ARCHITECTURE (mtime-keyed cache, bounded git):
 *
 * Branch: prefers kimi-code's stdin payload field `gitBranch` — the
 * official tui.toml [status_line] snapshot includes it. The local
 * porcelain read is only a fallback (payload empty / detached HEAD).
 *
 * Worktree + dirty count: ONE bounded subprocess,
 * `git --no-optional-locks status --porcelain=v2 --branch`, run ONLY when
 * the mtime-keyed disk cache (src/git-cache.ts) is invalid. The cache key
 * is the cwd plus the mtime of `.git/HEAD` and `.git/index`:
 *   - staging, committing, branch switches touch those files → instant
 *     refresh on the next render;
 *   - plain file edits / untracked files do NOT touch them → the count
 *     may be up to maxAgeMs old (default 2000 ms, env
 *     KIMI_GIT_MAX_AGE_MS, 0 = always live). This bounded
 *     blind spot is the documented trade-off — ccstatusline ships the
 *     same TTL + mtime combination.
 *
 * The age check runs at READ time against the CURRENT mtimes — never a
 * write-time "fresh enough" flag. The v1.3.1 staleness bug (write-time
 * TTL passing a 1 s check on 60 s-old data) is structurally impossible.
 *
 * Worktree detection: walk up from cwd to `.git`. A `.git` DIRECTORY is a
 * main checkout; a `.git` FILE is a linked worktree whose `gitdir:` line
 * points into `<main>/.git/worktrees/<name>` (works from any
 * subdirectory — the v1.3.3.1 semantics). No `git rev-parse` subprocess.
 *
 * `--no-optional-locks` keeps the status line from ever racing the user's
 * own git commands for `.git/index.lock` (ccstatusline's fix).
 *
 * Cold cost: one subprocess bounded at 300 ms (kimi-code's entire
 * status-line budget); steady state: zero subprocesses.
 */
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
	/** Directory that holds HEAD + index for the current checkout. */
	gitDir: string;
	isWorktree: boolean;
}

/**
 * Walks up from cwd looking for `.git`.
 * - `.git` directory → main checkout.
 * - `.git` file → linked worktree (or submodule); its `gitdir:` line
 *   points at the real git dir. A path containing `worktrees` is a linked
 *   worktree; submodule git dirs (`.git/modules/...`) are not.
 * Returns null when no `.git` exists anywhere up the tree.
 */
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
				// unreadable .git file → treat as no repo
				return null;
			}
		}
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

/**
 * Parses `git status --porcelain=v2 --branch` output.
 * Branch rules (unchanged since v1.3.3): `# branch.head <name>` on a
 * branch; `(detached)` and `(initial)` → null. Count: v2 entries starting
 * with '1' (changed), '2' (renamed/copied), '?' (untracked); '!'
 * (ignored) is intentionally not counted.
 */
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

/**
 * One pass at git: branch + dirty count + worktree flag.
 * Consults the mtime cache first; runs the bounded subprocess only on a
 * cache miss. Returns null when not in a git repo or git is unavailable.
 */
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
			// best effort — a failed cache write only costs the next render
			// one extra subprocess
		}
	}

	return { branch, isWorktree: discovery.isWorktree, count };
}

/**
 * Reads the current git branch via the shared `collectRawGit()`.
 * Returns null when not in a git repo, in detached HEAD, or on error.
 */
export function getCurrentBranch(): string | null {
	return collectRawGit()?.branch ?? null;
}

/**
 * Checks if the current directory is inside a git worktree, via the
 * `.git` file walk-up (no subprocess). Main checkout → false.
 */
export function isInWorktree(): boolean {
	return collectRawGit()?.isWorktree ?? false;
}

/**
 * Runs git status and counts uncommitted files (staged + unstaged +
 * untracked). Ignored files are intentionally not counted.
 */
export function getUncommittedCount(): number {
	return collectRawGit()?.count ?? 0;
}

/**
 * Builds git details for the footer. The `_getBranch` argument is
 * preserved for backwards compatibility with old call sites but is not
 * used; branch resolution now prefers the kimi-code stdin payload.
 */
export function buildGitDetails(_getBranch: () => string | null): GitInfo | undefined {
	return getGitDetails(null);
}

/**
 * Renders git details. `payloadBranch` is kimi-code's stdin snapshot
 * field `gitBranch` (official, always fresh) and wins over the local
 * read; the porcelain branch is the fallback (payload empty or detached
 * HEAD). Repo-ness and worktree flag come from the local discovery.
 */
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
