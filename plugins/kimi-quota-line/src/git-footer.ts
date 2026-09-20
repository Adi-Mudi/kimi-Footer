/**
 * Git footer details — branch name + uncommitted file count.
 *
 * TWO GIT CALLS per render (v1.3.3). We use
 * `git status --porcelain=v2 --branch` to get branch info + the change
 * count in one subprocess, plus `git rev-parse --git-dir` to detect
 * worktrees (works from any cwd, including subdirectories of the
 * worktree). v1.3.3.1 reverted a v1.3.3 attempt to use
 * `fs.statSync(".git")` instead — that broke worktree detection in
 * subdirectories because `.git` is only at the worktree root.
 *
 * Total cold cost is well under the 300 ms status-line budget even on
 * huge repos. v1.3.2 used three separate git calls and could push the
 * total over the cap on large repos; v1.3.3 + v1.3.3.1 keep the
 * reduction but restore correct worktree semantics.
 *
 * LIVE DATA ONLY. Each render runs git fresh. No in-memory cache, no
 * disk cache. Kimi-code already throttles the status line to once per
 * second (see the [config-files doc](https://www.kimi.com/code/docs/en/
 * kimi-code-cli/configuration/config-files.html#tui-toml)), so there
 * is never more than one render in flight; caching would only hide
 * live edits from the developer.
 *
 * Three exported wrappers (`getCurrentBranch`, `isInWorktree`,
 * `getUncommittedCount`) remain as thin facades over `collectRawGit()`
 * so existing tests + call sites are unchanged. Each pays both git
 * calls on its own; the render path goes through `getGitDetails` /
 * `buildGitDetails` which calls `collectRawGit()` once and shares the
 * result.
 */
import { execSync } from "node:child_process";
import type { GitInfo } from "./types.js";

interface RawGit {
	branch: string | null;
	isWorktree: boolean;
	count: number;
}

const PORCELAIN_TIMEOUT_MS = 500;

/**
 * One pass at git: branch + dirty count + worktree flag.
 * Returns null when not in a git repo or git is unavailable.
 */
function collectRawGit(): RawGit | null {
	let stdout: string;
	try {
		stdout = execSync("git status --porcelain=v2 --branch", {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "ignore"],
			timeout: PORCELAIN_TIMEOUT_MS,
		});
	} catch {
		return null;
	}

	let branch: string | null = null;
	let count = 0;
	for (const line of stdout.split("\n")) {
		if (line === "") continue;
		if (line.startsWith("# branch.head ")) {
			// `# branch.head main` on a branch; `# branch.head (detached)`
			// on detached HEAD; `# branch.head (initial)` on unborn.
			const head = line.slice("# branch.head ".length).trim();
			if (head && head !== "(detached)" && head !== "(initial)") {
				branch = head;
			}
		} else if (!line.startsWith("#")) {
			// v2 entries start with '1' (changed), '2' (renamed/copied),
			// '?' (untracked). '!' (ignored) is intentionally not counted.
			const c = line[0];
			if (c === "1" || c === "2" || c === "?") count++;
		}
	}

	let isWorktree = false;
	try {
		// `git rev-parse --git-dir` walks up from cwd to find the worktree
		// root and returns either `.git` (main checkout) or
		// `/path/to/main/.git/worktrees/<name>` (worktree). Checking for
		// the `worktrees` segment is the canonical worktree test from any
		// cwd. fs.statSync(".git") was tried in v1.3.3 but breaks when
		// cwd is a subdirectory of the worktree.
		const gitDir = execSync("git rev-parse --git-dir", {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "ignore"],
			timeout: PORCELAIN_TIMEOUT_MS,
		}).trim();
		isWorktree = gitDir.includes("worktrees");
	} catch {
		isWorktree = false;
	}

	return { branch, isWorktree, count };
}

/**
 * Reads the current git branch via the shared `collectRawGit()`.
 * Returns null when not in a git repo, in detached HEAD, or on error.
 */
export function getCurrentBranch(): string | null {
	return collectRawGit()?.branch ?? null;
}

/**
 * Checks if the current directory is inside a git worktree, via
 * `git rev-parse --git-dir` — the canonical way to detect worktrees
 * from any cwd (the main checkout returns `.git`; a worktree returns
 * a path containing `/worktrees/`).
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
 * Builds git details for the footer. Always live — no caching. The
 * `getBranch` argument is preserved for backwards compatibility with the
 * render-row1 call site; the actual branch is read from the shared
 * `collectRawGit()` result so we never spawn git twice.
 */
export function buildGitDetails(_getBranch: () => string | null): GitInfo | undefined {
	const r = collectRawGit();
	if (!r?.branch) {
		return { branch: "", count: 0, text: "no git repo", isWorktree: false };
	}
	const branchLabel = r.isWorktree ? `${r.branch} [wt]` : r.branch;
	const text = r.count > 0 ? `${branchLabel} \u2022 ${r.count} files` : `${branchLabel} \u2022 clean`;
	return { branch: r.branch, count: r.count, text, isWorktree: r.isWorktree };
}

/**
 * Renders git details live on every call. This is the function the render
 * path calls. The `getBranch` argument is accepted for backwards
 * compatibility with existing call sites but is not used internally.
 */
export function getGitDetails(getBranch: () => string | null = getCurrentBranch): GitInfo | undefined {
	return buildGitDetails(getBranch);
}
