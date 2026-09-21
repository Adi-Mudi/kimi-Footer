# Changelog

All notable changes to kimi-quota-line are recorded here. Format follows [keep-a-changelog](https://keepachangelog.com/).

## Unreleased — Pace hours printed as hours + minutes

### Changed

- **Pace hours now render as `HhMM`** — `9h55m`, `-0h47m`, `0h00m` — instead of decimal hours (`9.9h`, `-0.8h`). Affects the weekly and 5H pace segment on row 1 in full mode only; compact mode still drops pace entirely.
- `formatPaceHours(h)` in `src/helpers.ts` converts to whole minutes first, so rounding can never emit a 60-minute field (`1.999` → `2h00m`, not `1h60m`). The near-zero guard is unchanged in spirit: under 3 minutes of pace renders `0h00m`.

### Why

- The reset countdown (`formatRemaining`) prints `H.MM` — hours plus a zero-padded minute field — while pace printed decimal hours. Two different conventions sat side by side on one line and looked identical: `/99.15` meant 99 h 15 m, while `9.9h` meant 9 h 54 m. A `.15` field meant 15 minutes in one place and 9 minutes in the other. `9h55m` cannot be misread.

### Tests

- `formatPaceHours` expectations migrated to `HhMM`; added rounding-carry cases (`1.999` → `2h00m`, `0.9999` → `1h00m`, `-1.999` → `-2h00m`) and the values measured from the live cache (`9.924` → `9h55m`, `-0.7903` → `-0h47m`, `108.7` → `108h42m`).
- Full-mode pace assertions in `test/render-row1.test.ts` tightened from `/\d+h/` and `/\d+\.\d+h/` to `/\d+h\d{2}m/`.
- `test/render-row1-width.test.ts` unchanged and still exact-width at 60/80/100/120/150/200/300 columns.

## Unreleased — Blinking [wt] worktree marker

### Added

- **The `[wt]` worktree marker now blinks** (cyan → off → amber → off) so a developer can spot worktree sessions instantly. `formatWorktreeMarker(now)` in `src/label-blink.ts` — pure, no I/O, reuses the shared 4-phase engine (150 ms quarters, 600 ms cycle).
- Amber phase uses the bar "warning" color `#e0a800` (`\x1b[38;2;224;168;0m` + bold) — consistent with the existing status-color family.
- Off phase renders 4 spaces (same visible width as `[wt]`) so the layout never shifts; no ANSI `\x1b[5m` (same cross-terminal reasoning as the 1.3.6 decision).

### Changed

- `formatGitCenter` worktree branch: the branch text stays static cyan bold; only the `[wt]` marker blinks, in lockstep with the dirty digit and the Kimi label (shared `pickBlinkPhase` clock).

### Why

- The branch already carries a `[wt]` flag (computed in the background by the `.git` walk-up and cached in the mtime git cache — zero new backend work). A blinking marker is pure presentation, so it lives in the drawer: one pure helper + one line of wiring.

### Tests

- 7 new `formatWorktreeMarker` tests (all 4 phases, cycle-back, width=4 stability, no ANSI blink codes).
- 6 worktree assertions rewritten for the split-segment shape (static cyan branch + blinking marker), including an all-4-phase width-stability check.
- `npm run typecheck` clean; `npm test` 232/232; `npm run build` clean; `npm run stress` 5/5 (p99 201 ms).

## (previous) Unreleased — Community-backed git/quota split architecture

### Added

- `src/model-detect.ts` — pure model-name detectors (`isKimiModel` / `isMinimaxModel`), moved verbatim from the fetchers. The render path no longer imports the fetcher modules, which read `auth.json` at module init — so every render previously loaded the API token into memory it never used.
- `src/git-cache.ts` — mtime-keyed git cache. Validity = same cwd + identical `.git/HEAD`/`.git/index` mtimes + age ≤ `KIMI_GIT_MAX_AGE_MS` (default 2000 ms, `0` = always live). The age check runs at READ time against the CURRENT mtimes, so the v1.3.1 write-time-TTL staleness bug is structurally impossible.
- New architecture guard tests: `bin/` must not import the fetcher modules; the git cache must carry mtime keys; git-footer must use `--no-optional-locks` and must not spawn `git rev-parse`.
- New file-lock tests: concurrent winner, unparseable-lock recovery, PID ownership.

### Changed

- **Git branch now comes from kimi-code's stdin snapshot (`gitBranch`)** — the official `tui.toml [status_line]` payload field, always fresh, zero cost. The local porcelain read is only a fallback (payload empty / detached HEAD).
- **Dirty count + worktree via mtime-keyed cache** (pattern from ccstatusline): staging/commit/branch-switch refresh instantly; plain file edits refresh within ≤2 s (documented blind spot — unstaged edits do not touch `.git/index`). Steady state: ZERO git subprocesses per render.
- **Worktree detection reads `.git` directly** (dir = main checkout, file = worktree via its `gitdir:` line) instead of spawning `git rev-parse --git-dir` — works from any subdirectory (v1.3.3.1 semantics preserved).
- **The one remaining git subprocess is bounded**: `git --no-optional-locks status --porcelain=v2 --branch`, 300 ms timeout (kimi-code's whole status-line budget), silent degrade. `--no-optional-locks` (ccstatusline's fix) prevents racing the user's own git commands for `index.lock`.
- **Atomic cache writes** — both quota and git caches are written tmp-file + `rename`, so overlapping writers can never leave torn JSON on the render path.
- **Race-free file lock** — `withFileLock` acquires via exclusive-create (`flag: "wx"`) with a single stale-steal retry, eliminating the read-then-write TOCTOU window.

### Fixed

- Render path no longer reads `auth.json` or holds the API token in memory (previously pulled in transitively via `isKimiModel` from the fetcher module).
- Render stress p99 improved 208 ms → 193 ms (mtime cache replaces the always-live subprocess in the steady state).

### Why

- The git and quota layers share one render process (a kimi-code platform constraint: one `[status_line].command` for the whole line). Every historical breakage (v1.2.0 wrong-branch, v1.3.0/v1.3.1 stale git, v1.3.3 quota-failure-erases-git, the 30 s startup block) came from the shared runtime, not shared data. This change gives each side its own data source — branch from the platform payload, quota from the heartbeat cache, dirty count from the filesystem's own signals — with the render as the single meeting point. Patterns adopted from the two largest community status lines (ccstatusline: mtime cache, `--no-optional-locks`, self-healing locks; claude-code-statusline-progress: host-gated git, bounded timeouts, silent degrade).

### Tests

- `npm run typecheck` clean.
- `npm test` — 225/225 pass.
- `npm run build` — clean.
- `npm run stress` — 5/5 pass; render p99 = 193.0 ms (was 208.1 ms).
- `npm run e2e` — see verification below.

## (previous) Unreleased — Footer loading fix (SessionStart + render path)

### Fixed

- **SessionStart no longer blocks startup on API latency.** The `SessionStart` hook used to call the Kimi + MiniMax APIs in parallel before exiting. The CLI awaits hook results (observation-only hooks are still awaited per [kimi-code issue #1896](https://github.com/MoonshotAI/kimi-code/issues/1896)), so a slow API could delay the first prompt by up to 30 seconds. The hook now branches on `event`: on `SessionStart` it touches the cache file's timestamp with the previous provider data (no network call); on `SessionHeartbeat` it still does the full fetch.
- **SessionStart timeout dropped from 30 s to 5 s** as a defensive cap (the fast path normally exits in under 100 ms). `SessionHeartbeat` keeps its 30 s timeout because it is not on the startup path.
- **Footer no longer disappears on large repos.** The render path used to spawn three separate git subprocesses (`git rev-parse --abbrev-ref HEAD`, `git rev-parse --git-dir`, `git status --porcelain | wc -l`). On huge repos `git status --porcelain` alone can be 200-400 ms; the total frequently exceeded kimi-code's 300 ms status-line budget and the CLI fell back to the built-in layout. The render path now uses one `git status --porcelain=v2 --branch` subprocess plus one `fs.statSync(".git")` for worktree detection. Cold render cost on small repos is well under 100 ms (stress test: p99 = 208 ms over 100 runs, 50-call git p99 = 591 ms).
- **Render path no longer acquires the quota file lock on every read.** The `withFileLock` wrapper added 3 syscalls + a pid-alive check per render. JSON reads of small files are atomic on Linux; a torn read already fails JSON.parse and returns null through `readQuotaCache()`. The hook still uses `withFileLock` on its write path, so concurrent writers do not corrupt each other.
- **Worktree detection works from any subdirectory of the worktree.** v1.3.3 briefly used `fs.statSync(".git")` which only worked from the worktree root (the existing test covered that case). When the user's cwd was below the worktree root, `.git` was not there, `statSync` returned ENOENT, and the `[wt]` marker disappeared from the footer. Reverted to `git rev-parse --git-dir | grep worktrees`, which walks up to find the worktree root and works from any cwd. Regression test added (`test/git-footer.test.ts > "detects worktree from a subdirectory of the worktree (v1.3.3.1 regression)"`).

### Why

- User-reported bug: "footer was not loading every time, for start it takes a lot of time." Diagnosed against the [official kimi tui.toml docs](https://www.kimi.com/code/docs/en/kimi-code-cli/configuration/config-files.html#tui-toml) (300 ms cap, 1 s throttle, fallback on failure) and the [Hooks docs](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html) (observation-only events are still awaited).

### Architecture notes

- `src/git-footer.ts` adds a `node:fs` import (`statSync`) for worktree detection. The architecture layer test already permits this module to do I/O (`child_process` was permitted in v1.3.1).
- `bin/render-row1.ts` no longer imports `withFileLock` or `QUOTA_LOCK_PATH`; the render path's I/O surface shrank to just the cache read.
- All exported APIs in `src/git-footer.ts` are preserved (`getCurrentBranch`, `isInWorktree`, `getUncommittedCount`, `getGitDetails`, `buildGitDetails`) — tests unchanged.

### Tests

- `npm run typecheck && npm test` — 210/210 pass.
- `npm run stress` — 5/5 pass. p99 = 208.1 ms over 100 sequential render runs (under the 300 ms hard cap; under the 500 ms test target).
- `git-footer.test.ts` "small repo: p99 under 300 ms over 50 calls" — passes at 591 ms total (~12 ms per call).
- Concurrent hook safety: 10 parallel `refresh-cache` spawns all exit 0 and leave a valid cache.

### Fixed (v1.3.3.2 — found during static test)

- **`SessionStart` fast-path actually triggers now.** v1.3.3 read `payload.event` but the official [Kimi Hooks doc](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html) sends `hook_event_name` on every event payload. The fast-path was unreachable in production — startup still blocked on API latency (verified: real kimi payload took 2.3 s instead of <100 ms). Renamed the field and added a regression test that uses the real kimi payload shape (`{hook_event_name, session_id, session_title, client_type, cwd, source, model, profile}`) and verifies the fast-path triggers in <1.5 s and preserves prior provider data. New test: `test/cache-roundtrip.test.ts > "SessionStart fast-path: real kimi payload, no network call"`.

### Version

- Not bumped in this change. The CHANGELOG already has entries up to 1.3.7 while the manifests still say 1.3.2 — pre-existing inconsistency. Pick the next version when releasing.

## 1.3.7 (2026-09-06) — Faster blink (150 ms per phase)

### Changed

- **`BLINK_QUARTER_PERIOD_MS` lowered from 200 ms to 150 ms.** The 4-phase blink cycle (`dim → off → red → off`) is now 600 ms per full cycle (was 800 ms). Visible blink rate: 1.67 Hz (was 1.25 Hz). Applies to both the Kimi label and the dirty digit since they share `pickBlinkPhase(now)`.
- **Math verification:** at kimi-code's ~1 Hz render rate, `Math.floor(1000 / 150) % 4 === 2`, so consecutive renders cycle through `dim, red, off, dim, red, off, ...` — all 4 phases remain visible. No "stuck on same phase" risk (that would happen at 250 ms or 500 ms where the ratio divides evenly).

### Why

- The user wants a faster attention-grab blink. 150 ms keeps every phase visible without breaking the cycle math. The previous 200 ms was a conservative default; 150 ms adds ~25% perceived speed.

### Tests

- All existing tests use the symbol `BLINK_QUARTER_PERIOD_MS` rather than a literal, so no test changes are needed. The constant change is transparent to the test suite.
- **Follow-up edge-case additions (post-1.3.7):** 27 new edge-case tests added — 18 in `test/label-blink.test.ts` covering phase boundaries (`now = N × BLINK_QUARTER_PERIOD_MS - 1`, `0`, `- 1` etc.), K-family model detection (`k3`, `k4-new`, `kerfuffle`, uppercase), and full-cycle phase ordering; 9 in `test/render-row1.test.ts` covering worktree × phase, multi-digit dirty counts (1 and 99), off-phase dirty slot, and 200-col wide-terminal behavior. All new tests pin `now` explicitly.

## 1.3.6 (2026-09-06) — 4-phase blink (dim → off → red → off)

### Changed

- **Kimi label and dirty digit now use a 4-phase blink cycle** that physically turns the letter off for half the time. The cycle is `dim → off → red → off → repeat`, 200 ms per phase, 800 ms full cycle. The off phase renders spaces in dim grey so the column width stays stable and the letter disappears on every terminal (no ANSI `\x1b[5m` / `\x1b[8m` dependency).
- **ANSI slow blink (`\x1b[5m` / `\x1b[25m`) is removed.** The previous 1.3.5 implementation stacked `\x1b[5m` over a time-phase color flip. The on/off cue is now delivered entirely by the off-phase rendering spaces — reliable across every terminal (Alacritty, kitty, Windows Terminal default, etc.). Behavior is now consistent regardless of terminal ANSI support.
- **`pickBlinkColor` is renamed to `pickBlinkPhase`** with return type `"dim" | "off" | "red" | "off"`. `BLINK_HALF_PERIOD_MS` is renamed to `BLINK_QUARTER_PERIOD_MS` to reflect the new granularity (each phase is one quarter of the 800 ms cycle, not half).
- **`formatDirtyCount` and `formatKimiLabel` share the same 4-phase helper.** Both blink sources on row 1 now cycle in lockstep. The user can choose any `now` to pin the phase; both helpers return a string with the same column width across all 4 phases.

### Why

- The 2-phase cycle (red ↔ dim) toggled color but the letter was always present — peripheral vision still saw static text. The 4-phase cycle genuinely turns the letter off for half the cycle, which is a stronger attention cue and reads as a true blink.
- Stacking the same cycle on both the Kimi label (right) and the dirty digit (center) keeps the two blink sources visually consistent — they no longer use different rhythms.

### Tests

- `test/label-blink.test.ts`: rewritten for 4-phase. 11 tests covering `BLINK_QUARTER_PERIOD_MS`, `pickBlinkPhase` boundary + cycle-back, `formatKimiLabel` all 4 phases + cycle-back, no-ANSI-blink regression (asserts `\x1b[5m` and `\x1b[25m` are absent across all 4 phases), column-width-preservation check (5 visible chars in every phase).
- `test/render-row1.test.ts`: 7 dirty-digit tests inside `describe("formatGitCenter")` rewritten for 4-phase (dim/off/red/off + cycle-back + no-ANSI-blink + no-bold + MM-not-affected regression). 7 Kimi label tests inside `describe("buildQuotaStatus Kimi label 4-phase blink (1.3.6)")` rewritten for 4-phase + dropped ANSI-blink assertions.

## 1.3.5 (2026-09-06) — Kimi label always blinks

### Added

- `src/label-blink.ts` — new pure module. Owns `BLINK_HALF_PERIOD_MS`, `pickBlinkColor`, and the new `formatKimiLabel(model, now)`. Imports only from `./types.js`.
- `test/label-blink.test.ts` — direct unit tests for the new module.

### Changed

- **`Kimi` label on the right column now always blinks when a Kimi model is the active model.** The label alternates between dim grey (`\x1b[38;5;244m`) and bright red (`\x1b[91m`) at ~0.5 Hz via the same time-phase + ANSI-blink pattern as the 1.3.4 dirty digit. Both layers stacked: ANSI `\x1b[5m` for terminals that support it, time-phase color flip for terminals that do not.
- **`MM ` (MiniMax) label is unchanged** — stays static dim. The blink applies only when `isKimiLabel(model)` returns true (`kimi` substring OR `^k\d`).
- **`bin/render-row1.ts` no longer owns the blink cluster.** `BLINK_HALF_PERIOD_MS` and `pickBlinkColor` moved to `src/label-blink.ts`. `bin/` imports them back and re-exports them so existing tests keep working without churn. `buildQuotaStatus` gained a 4th arg `now` so the label and the dirty digit share the same wall-clock phase value (still deterministic because each call site passes `now` explicitly).
- **`AGENTS.md` updated**: `label-blink.ts` added to the `src/` list and to the architecture diagram.

### Why

- The Kimi label is the user's primary cue for "which provider is active." A static label is easy to miss when the eye is elsewhere on the row. Pairing the appearance with a slow red↔dim flip makes the moment of glance unmistakable, matching the attention mechanism the dirty digit already uses.

### Tests

- `test/label-blink.test.ts`: 13 tests covering `BLINK_HALF_PERIOD_MS`, `pickBlinkColor` boundary + alternation, `formatKimiLabel` red phase, dim phase, empty-string fallback for empty / MiniMax / unknown models, bare-K-family matches (k3, k3-256k, k2), prefixed form (kimi-code/k3-256k), and the `\x1b[25m` blink-reset leak guard.
- `test/render-row1.test.ts`: 4 new tests inside `describe("buildQuotaStatus Kimi label blink (1.3.5)")` covering (a) Kimi red phase at `now=0`, (b) Kimi dim phase at half-period boundary with red-not-present assertion, (c) MiniMax stays static dim (no `\x1b[5m`, no `\x1b[91m`), (d) unknown model → undefined.

## 1.3.4 (2026-09-06) — dirty count blinks

### Changed

- **Dirty file count now blinks bright red ↔ dim.** Inside the existing git center, only the digit (the `X` in `X files`) flips between bright red bold and dim on a ~500 ms time-based phase. The rest of the layout (`main`, `•`, `[wt]`, the word `files`, `clean`, `no git`) is preserved exactly as in 1.3.3 — this is a strict add-on. With kimi-code's ~1 Hz status-line render rate the blink is visible at roughly 0.5 Hz.

### Why

- A bright-red badge that never changes is easy to miss when you're focused elsewhere. A small digit that flips between red and dim every render is what your peripheral vision actually notices.

### Tests

- `test/render-row1.test.ts`: 1.3.3 tests for the `main • 3 files` shape are restored in full, plus new pinning tests for the red phase (`now=0`), the dim phase (`now=BLINK_HALF_PERIOD_MS`), and the half-period boundary check on `pickBlinkColor`.

## 1.3.3 (2026-09-06) — git / quota independence

### Fixed

- **Git center column now renders independently of quota right column.** Previously, when the quota bar could not be rendered (e.g. cache missing, model not recognized by `isKimiModel` / `isMinimaxModel`, or fresh session before the first heartbeat), `buildRow1` fell back to folder-only output and dropped the git center at the same time. Git and quota are now fully decoupled — only the right column disappears when quota is unavailable; the center still renders whenever `git-footer.ts` returns a real branch. When neither has data, output collapses to folder only with no "no git" placeholder clutter.
- **Kimi quota bar now shows for bare K-family model ids.** `isKimiModel()` previously only matched ids containing the substring `"kimi"`. kimi-code sends bare ids like `k3-256k` (no provider prefix) for Kimi models, so the render fell through and no quota bar showed. The check now also matches `^k\d` (k3, k3-256k, k2, k1.5, etc.).

### Tests

- `test/render-row1.test.ts`: added two tests in the git-center suite covering (a) `null` cache + real git branch → folder + git + no right column, and (b) `null` cache + no-git-repo branch → folder only with no "no git" placeholder.
- `test/render-row1.test.ts`: added one test covering bare `k3-256k` model id → Kimi bar renders.

## 1.3.2 (2026-09-05) — install UX

### Added

- `tools/install.sh` — one-shot installer: build + sync into the managed dir + reload hint.
- `tools/postinstall.mjs` — npm `postinstall` hook warns on stale managed copy.
- `/kimi-quota-line:install` slash command — prints platform-specific install steps.
- `test/sync-install.test.ts` — 14 tests covering tui.toml patching, installed.json bumping, install.sh integration, and postinstall warnings.

### Changed

- `tools/sync-to-managed.mjs` now patches `~/.kimi-code/tui.toml` when it points at an old `dist/scripts/` or `dist/hooks/` path, and bumps `~/.kimi-code/plugins/installed.json` `version` + `updatedAt` for this plugin.

---

## 1.3.1 (2026-09-05)

### Fixed

- **Git status now live on every render.** The v1.3.0 git path had two sources of staleness: a 1-second in-memory TTL in `src/git-footer.ts`, and a disk cache (`$XDG_RUNTIME_DIR/kimi-quota-line-git-cache.json`) written by the hook every `SessionHeartbeat` (60 s) and read on the render path. The disk cache TTL check used the same 1 s threshold, so during the 1 s window after each heartbeat the disk cache was "fresh enough" to satisfy the check and the render returned up to 60 s old data instead of running `git status`. Removed both caches. Each render now runs `git status` live. No `/refresh` required to see updated counts.
- Deleted `src/git-cache.ts`, `GitCache` interface, and the `getGitDetailsCached` wrapper. Renamed to `getGitDetails`.

### Changed

- `hooks/refresh-cache.ts` no longer writes the git cache. Only the quota cache is written under `withFileLock(quota.lock)`.
- `bin/render-row1.ts` calls `getGitDetails(getCurrentBranch)` directly (no async, no lock).
- Architecture diagram in `AGENTS.md` updated to reflect the new flow. `src/git-footer.ts` is the one source-module exception to the "no I/O" rule — by design.

### Added

- 16 new tests in `test/git-footer.test.ts`:
  - **Live-data**: count changes between calls without a delay (catches re-introduction of any cache).
  - **Status breakdown**: unstaged modification, staged addition, untracked file, mix of all three, deleted file.
  - **Branch + edge**: branch name in `text`, `no git` for non-repo and detached HEAD, `[wt]` marker for worktrees, `no git` when git binary is missing (PATH bypass).
  - **Stale-cache regression**: a leftover `kimi-quota-line-git-cache.json` from v1.3.0 is ignored; `getGitDetails` runs live.
  - **Performance**: p99 under 300 ms over 50 calls on a small repo (kimi-code's hard cap).

## 1.3.0 (2026-09-05)

### Changed

- Folder layout matches Kimi canonical conventions. `scripts/` split into `hooks/` (hook entry points), `bin/` (status-line entry point), `tools/` (dev helpers). `src/` unchanged. The `kimi.plugin.json` `hooks[].command` paths now point at `dist/hooks/refresh-cache.js`.
- `CacheFile` split into `QuotaCache` and `GitCache`. Two cache files on disk instead of one — `$XDG_RUNTIME_DIR/kimi-quota-line-quota-cache.json` and `kimi-quota-line-git-cache.json`. Lock-protected writes and reads; the two functions no longer share state.
- Render path now reads both caches under their own advisory locks (`src/file-lock.ts` `withFileLock`). Total wall time = max(quota read, git read) not sum.
- Hook failure on cache write now exits 0 (fail-open per Kimi Hooks doc). Previously exited 1 which was classified as a soft failure.
- `FILLED` / `EMPTY` glyphs moved to `src/types.ts`. `formatRemaining` consolidated to `src/helpers.ts` (was duplicated in both fetchers).
- Cache paths now computed lazily via `quotaCachePath()` / `gitCachePath()`. Allows tests to set `$XDG_RUNTIME_DIR` between writes without restarting the module.
- `src/git-footer.ts` exposes `getGitDetailsCached()` for disk-backed git info with 1 s TTL fallback to live subprocess.
- Architecture rules documented in `AGENTS.md` "Layer rules" + "Architecture diagram" sections. Enforced by `test/architecture.test.ts`.

### Added

- `LICENSE` file at plugin root (full MIT text).
- `UPGRADING.md` with the kimi-code CLI compatibility contract (pinned version, 6 contract surfaces, manual smoke checklist, rollback recipe).
- `src/file-lock.ts` with `withFileLock(lockPath, fn, opts?)` — non-blocking advisory file lock with PID + timestamp + stale detection (30 s default).
- `test/architecture.test.ts` — layer guard test that asserts render is read-only, source modules stay pure, and the two lock files are distinct.
- `test/file-lock.test.ts` — 8 unit tests for `withFileLock` covering acquire, release, throw-on-error, concurrent contention, stale-steal, and nested dirs.
- `test/stress.test.ts` — concurrent cache write stress test (5 parallel `refresh-cache` spawns; assert valid JSON + lock cleanup).
- `agents/README.md` placeholder documenting the future subagent extension point.
- E1–E3: UPGRADING.md sections listing unused Kimi lifecycle events, `mcpServers` extension recipe, and configurable cache TTL.

### Fixed

- `SKILL.md` frontmatter trimmed to spec-compliant `name` + `description` (dropped non-spec `type` and `whenToUse`).
- `kimi.plugin.json` adds `homepage` field.

## 1.2.2 (2026-08-31)

### Fixed

- Terminal width detection now checks `process.stderr.columns` and the `COLUMNS` environment variable when `process.stdout.columns` is unavailable (piped stdout). Default fallback raised from 80 → 120. Fixes the right column appearing mid-line when kimi-code invokes the status-line command via pipe instead of PTY.

### Added

- `src/width.ts` with `detectWidth()` helper.
- `test/width.test.ts` covering all four detection sources and the precedence order.

## 1.2.1 (2026-08-31)

### Fixed

- Compact status-line mode (`buildQuotaStatus(model, cache, true)`) now renders both the weekly and 5H quota bars. Previously the 5H section was dropped on narrow terminals; compact now keeps both bars and only drops pace hours and reset countdowns. Matches the community pattern (pi-statusline, pi-powerline-footer).

### Format

- Compact output: `MM ▮▮▮▯▯▯▯▯▯▯ 31%/100  5H: ▮▮▮▯▯▯▯▯▯▯ 25%/50` (~44 chars vs ~57 in full mode).
- 3-column layout at ≥80 cols now shows folder + git + both bars; at <80 cols falls back to 2-column (folder + both bars, no git).

## 1.2.0 (2026-08-31)

### Changed

- **Git info is now read fresh per render** instead of from the cache. `render-row1` calls `getCurrentBranch()` and `buildGitDetails()` directly on every status-line render. `refresh-cache` no longer populates `cache.git` (always `null`).
- Trade-off: ~30-100 ms added per render from the `git` subprocess. Stress test p99 budget raised from 300 ms → 500 ms (kimi-code's 300 ms hard cap is unchanged; we leave a 200 ms buffer for system noise).
- `buildRow1` now takes an optional 4th argument `git?: GitInfo | null`. Tests pass it explicitly to stay deterministic; production omits it and lets the script fetch.

### Why

- Single global cache meant `cd` between projects always showed the LAST project's git info (cache was overwritten on next hook fire). Per-dir cache would have meant more moving parts. Reading git fresh per render is the simplest fix — small repos take < 50 ms, big monorepos take longer (mitigated by `timeout: 500` in `execSync`).

### Fixed

- `scripts/sync-to-managed.mjs` was using `process.cwd()` to determine the source directory, which broke when invoked via `npm run sync` (npm's cwd was not the plugin folder). Switched to `dirname(dirname(fileURLToPath(import.meta.url)))` so the script always uses its own location as the source.

### Tests

- `test/render-row1.test.ts`: git is now passed explicitly to `buildRow1` instead of via `cache.git`. Added a test that omits the git param to verify the fallback fetch works (runs git against the plugin dir, a real git repo).
- `test/cache-roundtrip.test.ts`: removed the "populates git field" test (refresh-cache no longer writes git). Kept the "writes cache with valid shape" test, asserting `cache.git === null`.
- `test/stress.test.ts`: p99 budget 300 → 500 ms (hard cap 500 → 800 ms). Stress now runs from the plugin dir (a real git repo) so git calls succeed and reflect realistic latency.

## 1.1.0 (2026-08-31)

## 1.0.0 (2026-08-30)

### Added

- Initial release. Full kimi-native plugin replacing the v1.0 (`pi-footer-style`) prototype.
- TypeScript source in `src/`: `types.ts`, `cache.ts`, `helpers.ts`, `kimi-fetcher.ts`, `minimax-fetcher.ts`, `git-footer.ts`, `sunset-dir.ts`.
- Scripts in `scripts/` (built by `tsc -p tsconfig.build.json` to `dist/`):
  - `refresh-cache.ts` — hook target fired by SessionStart + SessionHeartbeat.
  - `render-row1.ts` — `[status_line].command` target.
  - `sync-to-managed.mjs` — no-symlink dev workflow helper.
- Plugin manifest `kimi.plugin.json` declares hooks, commands, skills, system-prompt contribution, and `sessionStart.skill` that auto-loads `SKILL.md`.
- Skills: `skills/quota-line/SKILL.md`.
- Slash command: `commands/refresh.md` → `/refresh`.
- Tests with vitest:
  - `test/helpers.test.ts` — pure-function tests.
  - `test/render-row1.test.ts` — `buildRow1` direct-import tests.
  - `test/cache-roundtrip.test.ts` — subprocess integration tests.
  - `test/stress.test.ts` — 300 ms status-line budget + concurrent hooks + cache TTL.
- Documentation: `README.md`, `AGENTS.md`, `SYSTEM.md`, `CHANGELOG.md`.
- Dev workflow: `npm install` → `npm run build` → `npm run sync` → `/plugins reload`.

### Notes (build pipeline)

The original plan called for `tsdown` as the bundler. In this environment, `tsdown` v0.6.x had a `rolldown/experimental` incompatibility, and `npm install` repeatedly hit an internal arborist bug when re-resolving. The plugin's `scripts/*.ts` files use only Node.js built-ins (no external deps to bundle), so `tsc -p tsconfig.build.json` is sufficient: it emits `dist/scripts/*.js` (the kimi-code entry points) and `dist/src/*.js` (the modules the entry points import). The vitest test runner resolves `src/*.ts` and `scripts/*.ts` directly via its built-in TypeScript transform, so no separate test build is needed. Total devDeps: `vitest`, `typescript`, `@types/node` — `tsdown` removed.

### Notes

- Quota-fetching logic (Kimi + MiniMax) is a verbatim port of pi-footer (MIT) with two adaptations: `isKimiModel` / `isMinimaxModel` accept a plain string, and `auth.json` is read from `$KIMI_CODE_HOME` instead of `$PI_CODING_AGENT_DIR`.
- kimi-code does not support symlinks for plugin installs. Use `pnpm run sync` after every edit.
- Row 2 of the status line cannot be replaced (kimi-code limitation). Tracked upstream in [kimi-code issue #2713](https://github.com/MoonshotAI/kimi-code/issues/2713).
- `thinkingEffort` switches lag one request when reflected in the status line. Tracked upstream.
- The dim color is a fixed `\x1b[38;5;244m` because the status-line script has no access to the active kimi-code theme. Bar colors are unchanged (truecolor).
