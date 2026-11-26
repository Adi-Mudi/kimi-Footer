import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("getCurrentBranch", () => {
	let tmpDir: string;
	let originalCwd: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		tmpDir = mkdtempSync(join(tmpdir(), "kql-git-"));
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns null when not in a git repo", async () => {
		process.chdir(tmpDir);
		
		
		const { getCurrentBranch } = await import("../src/git-footer.js");
		expect(getCurrentBranch()).toBeNull();
	});

	it("returns the branch name when inside a git repo", async () => {
		
		spawnSync("git", ["init", "-b", "test-branch", tmpDir], { stdio: "ignore" });
		
		spawnSync("git", ["-C", tmpDir, "config", "user.email", "test@test.local"], { stdio: "ignore" });
		spawnSync("git", ["-C", tmpDir, "config", "user.name", "Test"], { stdio: "ignore" });
		
		writeFileSync(join(tmpDir, "README.md"), "test");
		spawnSync("git", ["-C", tmpDir, "add", "."]);
		spawnSync("git", ["-C", tmpDir, "commit", "-m", "init"], { stdio: "ignore" });
		process.chdir(tmpDir);

		const { getCurrentBranch } = await import("../src/git-footer.js");
		expect(getCurrentBranch()).toBe("test-branch");
	});
});

describe("isInWorktree", () => {
	let tmpDir: string;
	let originalCwd: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		tmpDir = mkdtempSync(join(tmpdir(), "kql-wt-"));
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns false when not in a git repo", async () => {
		process.chdir(tmpDir);
		const { isInWorktree } = await import("../src/git-footer.js");
		expect(isInWorktree()).toBe(false);
	});
});

function makeRepoWithCommit(branch = "main"): { tmpDir: string; originalCwd: string } {
	const originalCwd = process.cwd();
	const tmpDir = mkdtempSync(join(tmpdir(), "kql-live-"));
	spawnSync("git", ["init", "-b", branch, tmpDir], { stdio: "ignore" });
	spawnSync("git", ["-C", tmpDir, "config", "user.email", "test@test.local"], { stdio: "ignore" });
	spawnSync("git", ["-C", tmpDir, "config", "user.name", "Test"], { stdio: "ignore" });
	writeFileSync(join(tmpDir, "README.md"), "init");
	spawnSync("git", ["-C", tmpDir, "add", "."]);
	spawnSync("git", ["-C", tmpDir, "commit", "-m", "init"], { stdio: "ignore" });
	process.chdir(tmpDir);
	return { tmpDir, originalCwd };
}

describe("getGitDetails (live mode, maxAge=0) — the v1.3.1 fix, configurable", () => {
	let tmpDir: string;
	let originalCwd: string;

	beforeEach(() => {
		({ tmpDir, originalCwd } = makeRepoWithCommit());
		
		process.env.KIMI_GIT_MAX_AGE_MS = "0";
	});

	afterEach(() => {
		process.chdir(originalCwd);
		delete process.env.KIMI_GIT_MAX_AGE_MS;
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns count=1 after a file is modified (live data on first call)", async () => {
		const { getGitDetails } = await import("../src/git-footer.js");
		
		expect(getGitDetails()?.count).toBe(0);
		
		writeFileSync(join(tmpDir, "README.md"), "modified");
		
		expect(getGitDetails()?.count).toBe(1);
	});

	it("two consecutive calls without changes return the same count", async () => {
		const { getGitDetails } = await import("../src/git-footer.js");
		writeFileSync(join(tmpDir, "a.txt"), "x");
		const c1 = getGitDetails()?.count;
		const c2 = getGitDetails()?.count;
		expect(c1).toBe(1);
		expect(c2).toBe(1);
	});

	it("regression: with maxAge=0 every call is live (no TTL may hide changes)", async () => {
		
		
		
		
		const { getGitDetails } = await import("../src/git-footer.js");
		writeFileSync(join(tmpDir, "a.txt"), "x");
		expect(getGitDetails()?.count).toBe(1);
		
		writeFileSync(join(tmpDir, "a.txt"), "y");
		writeFileSync(join(tmpDir, "b.txt"), "z");
		expect(getGitDetails()?.count).toBe(2);
	});

	it("count returns to 0 after git commit", async () => {
		const { getGitDetails } = await import("../src/git-footer.js");
		writeFileSync(join(tmpDir, "a.txt"), "x");
		expect(getGitDetails()?.count).toBe(1);
		spawnSync("git", ["-C", tmpDir, "add", "."]);
		spawnSync("git", ["-C", tmpDir, "commit", "-m", "w"], { stdio: "ignore" });
		expect(getGitDetails()?.count).toBe(0);
	});

	it("stale git-cache with wrong mtimes is IGNORED (mtime is the guard)", async () => {
		
		const cacheDir = process.env.XDG_RUNTIME_DIR || "/tmp";
		const cachePath = join(cacheDir, "kimi-quota-line-git-cache.json");
		writeFileSync(
			cachePath,
			JSON.stringify({
				cwd: tmpDir,
				headMtimeMs: 111_111_111,
				indexMtimeMs: 111_111_111,
				capturedAt: Date.now(),
				branch: "fake-branch",
				isWorktree: false,
				count: 999,
			}),
		);
		try {
			
			writeFileSync(join(tmpDir, "a.txt"), "x");
			const { getGitDetails } = await import("../src/git-footer.js");
			const r = getGitDetails();
			
			expect(r?.count).toBe(1);
			expect(r?.branch).not.toBe("fake-branch");
		} finally {
			
			rmSync(cachePath, { force: true });
		}
	});
});

describe("getGitDetails (default maxAge — mtime invalidation)", () => {
	let tmpDir: string;
	let originalCwd: string;

	beforeEach(() => {
		delete process.env.KIMI_GIT_MAX_AGE_MS; 
		({ tmpDir, originalCwd } = makeRepoWithCommit());
	});

	afterEach(() => {
		process.chdir(originalCwd);
		delete process.env.KIMI_GIT_MAX_AGE_MS;
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("staged change invalidates instantly via index mtime", async () => {
		const { getGitDetails } = await import("../src/git-footer.js");
		expect(getGitDetails()?.count).toBe(0); 
		writeFileSync(join(tmpDir, "new.txt"), "new");
		spawnSync("git", ["-C", tmpDir, "add", "new.txt"]); 
		expect(getGitDetails()?.count).toBe(1); 
	});

	it("commit invalidates instantly via HEAD + index mtime", async () => {
		const { getGitDetails } = await import("../src/git-footer.js");
		writeFileSync(join(tmpDir, "a.txt"), "x");
		expect(getGitDetails()?.count).toBe(1); 
		spawnSync("git", ["-C", tmpDir, "add", "."]);
		spawnSync("git", ["-C", tmpDir, "commit", "-m", "w"], { stdio: "ignore" });
		expect(getGitDetails()?.count).toBe(0); 
	});

	it("unstaged edit within maxAge serves the cached count (documented blind spot)", async () => {
		process.env.KIMI_GIT_MAX_AGE_MS = "60000"; 
		const { getGitDetails } = await import("../src/git-footer.js");
		expect(getGitDetails()?.count).toBe(0); 
		
		
		
		writeFileSync(join(tmpDir, "a.txt"), "x");
		expect(getGitDetails()?.count).toBe(0); 
	});

	it("same edit is fresh once maxAge is set to 0 (always-live mode)", async () => {
		process.env.KIMI_GIT_MAX_AGE_MS = "60000";
		const { getGitDetails } = await import("../src/git-footer.js");
		expect(getGitDetails()?.count).toBe(0);
		writeFileSync(join(tmpDir, "a.txt"), "x");
		expect(getGitDetails()?.count).toBe(0); 
		process.env.KIMI_GIT_MAX_AGE_MS = "0"; 
		expect(getGitDetails()?.count).toBe(1); 
	});
});

describe("getGitDetails status breakdown", () => {
	let tmpDir: string;
	let originalCwd: string;

	beforeEach(() => {
		({ tmpDir, originalCwd } = makeRepoWithCommit());
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("counts an unstaged modification of a tracked file", async () => {
		const { getGitDetails } = await import("../src/git-footer.js");
		writeFileSync(join(tmpDir, "README.md"), "edited");
		expect(getGitDetails()?.count).toBe(1);
	});

	it("counts a staged addition (git add a new file)", async () => {
		const { getGitDetails } = await import("../src/git-footer.js");
		writeFileSync(join(tmpDir, "new.txt"), "new");
		spawnSync("git", ["-C", tmpDir, "add", "new.txt"]);
		expect(getGitDetails()?.count).toBe(1);
	});

	it("counts an untracked file (no git add)", async () => {
		const { getGitDetails } = await import("../src/git-footer.js");
		writeFileSync(join(tmpDir, "loose.txt"), "loose");
		expect(getGitDetails()?.count).toBe(1);
	});

	it("counts a mix: modified + staged + untracked", async () => {
		const { getGitDetails } = await import("../src/git-footer.js");
		
		writeFileSync(join(tmpDir, "README.md"), "edited");
		
		writeFileSync(join(tmpDir, "staged.txt"), "staged");
		spawnSync("git", ["-C", tmpDir, "add", "staged.txt"]);
		
		writeFileSync(join(tmpDir, "loose.txt"), "loose");
		expect(getGitDetails()?.count).toBe(3);
	});

	it("counts a deleted tracked file", async () => {
		const { getGitDetails } = await import("../src/git-footer.js");
		spawnSync("git", ["-C", tmpDir, "rm", "README.md"]);
		expect(getGitDetails()?.count).toBe(1);
	});
});

describe("getGitDetails branch + edge", () => {
	let tmpDir: string;
	let originalCwd: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		tmpDir = mkdtempSync(join(tmpdir(), "kql-edge-"));
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns the current branch name in `text`", async () => {
		({ tmpDir, originalCwd } = makeRepoWithCommit("feature-x"));
		const { getGitDetails } = await import("../src/git-footer.js");
		const r = getGitDetails();
		expect(r?.branch).toBe("feature-x");
		expect(r?.text).toContain("feature-x");
		expect(r?.text).toContain("clean");
	});

	it("returns 'no git' when not in a git repo", async () => {
		process.chdir(tmpDir);
		const { getGitDetails } = await import("../src/git-footer.js");
		const r = getGitDetails();
		expect(r?.branch).toBe("");
		expect(r?.count).toBe(0);
		expect(r?.text).toBe("no git repo");
		expect(r?.isWorktree).toBe(false);
	});

	it("returns 'no git' on detached HEAD", async () => {
		({ tmpDir, originalCwd } = makeRepoWithCommit("main"));
		const sha = spawnSync("git", ["-C", tmpDir, "rev-parse", "HEAD"], { encoding: "utf-8" }).stdout.trim();
		spawnSync("git", ["-C", tmpDir, "checkout", "--detach", sha], { stdio: "ignore" });
		const { getGitDetails } = await import("../src/git-footer.js");
		const r = getGitDetails();
		expect(r?.text).toBe("no git repo");
	});

	it("adds [wt] marker when in a worktree", async () => {
		({ tmpDir, originalCwd } = makeRepoWithCommit("main"));
		const wtDir = mkdtempSync(join(tmpdir(), "kql-wt-"));
		spawnSync("git", ["-C", tmpDir, "worktree", "add", "-b", "wt-branch", wtDir], { stdio: "ignore" });
		process.chdir(wtDir);
		try {
			const { getGitDetails } = await import("../src/git-footer.js");
			const r = getGitDetails();
			expect(r?.isWorktree).toBe(true);
			expect(r?.branch).toBe("wt-branch");
			expect(r?.text).toContain("[wt]");
		} finally {
			process.chdir(originalCwd);
			rmSync(wtDir, { recursive: true, force: true });
		}
	});

	it("detects worktree from a subdirectory of the worktree (v1.3.3.1 regression)", async () => {
		
		
		
		
		
		
		({ tmpDir, originalCwd } = makeRepoWithCommit("main"));
		const wtDir = mkdtempSync(join(tmpdir(), "kql-wt-subdir-"));
		spawnSync("git", ["-C", tmpDir, "worktree", "add", "-b", "wt-sub", wtDir], { stdio: "ignore" });
		const subDir = join(wtDir, "src", "deep");
		mkdirSync(subDir, { recursive: true });
		process.chdir(subDir);
		try {
			const { getGitDetails } = await import("../src/git-footer.js");
			const r = getGitDetails();
			expect(r?.isWorktree).toBe(true);
			expect(r?.branch).toBe("wt-sub");
			expect(r?.text).toContain("[wt]");
		} finally {
			process.chdir(originalCwd);
			rmSync(wtDir, { recursive: true, force: true });
		}
	});

	it("returns 'no git' when git binary is missing (PATH bypass)", async () => {
		({ tmpDir, originalCwd } = makeRepoWithCommit("main"));
		
		const originalPath = process.env.PATH;
		process.env.PATH = "";
		try {
			const { getGitDetails } = await import("../src/git-footer.js");
			const r = getGitDetails();
			expect(r?.text).toBe("no git repo");
		} finally {
			process.env.PATH = originalPath;
		}
	});
});

describe("getGitDetails performance", () => {
	let tmpDir: string;
	let originalCwd: string;

	beforeEach(() => {
		({ tmpDir, originalCwd } = makeRepoWithCommit());
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("small repo: p99 under 300 ms over 50 calls (kimi-code hard cap)", async () => {
		const { getGitDetails } = await import("../src/git-footer.js");
		const N = 50;
		const latencies: number[] = [];
		for (let i = 0; i < N; i++) {
			const start = performance.now();
			getGitDetails();
			latencies.push(performance.now() - start);
		}
		latencies.sort((a, b) => a - b);
		const p99 = latencies[Math.floor(N * 0.99)];
		expect(p99).toBeLessThan(300);
	});
});
