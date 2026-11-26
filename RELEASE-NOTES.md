# Release Notes

Per-version notes for the kimi-quota-line plugin. The CHANGELOG inside the
plugin tracks the full commit history; this file gives a user-facing summary
per release.

---

## v1.3.5-clinepass — 2026-11-27 — CL-P quota, /model switch & ZAI

**Tag**: `v1.3.5-clinepass` · **Branch**: `dev` · **PRs**: #4, #5, #6, #7

### Highlights

- **PR #4 (`feat/cline-pass-quota`) — CL-P usage-limits metrics (`M:%` → `W:%` → `5H:%`):**
  - `src/cline-fetcher.ts` fetches `https://api.cline.bot/api/v1/users/me/plan/usage-limits` (4 s timeout, 60 s cooldown on 401/403/404/429/bad JSON, `percentUsed` clamped 0–100, missing windows omitted).
  - `src/helpers.ts` parses date-only `YYYY-MM-DD`, ISO datetime, and epoch seconds/ms in `hoursUntilReset`, enforces `"error"` first at `>= 100%`, and clamps elapsed hours into `[0, windowHours]`.
  - `bin/render-row1.ts` renders `CL-P` metrics (`M:%` → `W:%` → `5H:%`) gated by `limit > 0` and caps `< 100%` rounding at `99%`.
- **PR #5 (`fix/model-switch-stale-provider`) — Dynamic `/model` switch resolution:**
  - `resolveForSession` ignores stale `sessions[sid]` when `payload.model` bare/tail name differs and never falls back to stale `cache.model` on `modelIndex` miss; case-insensitive `modelIndex` lookup.
  - `buildModelIndex` strips `^managed:` and indexes section key, `display_name`, and `model` ID; `refresh-cache` updates `sessions[sid]` on any hook carrying `session_id` + `model`.
- **PR #6 (`fix/unknown-provider-label`) — Unknown-prefix guard + `ZAI` + matrix/contract tests:**
  - Rejects unknown provider prefixes (`zai/`, `zaa/`, `zhipu/`, `kilo/`) before `modelIndex` lookup so colliding `display_name`s never hijack `OR` `Req:`, while preserving exact `vendor/model` ID hits.
  - Registers `zai-coding-plan` → `ZAI` in `KNOWN_PROVIDER_PREFIXES`, `SHORT_LABELS`, and `PROVIDERS`.
  - Adds sanitized 5-provider `test/fixtures/config.sample.toml` and `test/provider-contract.test.ts` (golden matrix, `[providers.*]`/`[models.*]` contract, subprocess E2E).
- **PR #7 (`fix/theme-success-color`) — Dim theme `#6e7681` success color:**
  - `statusFg("success")` emits dim theme `#6e7681` (`\x1b[38;2;110;118;129m`), keeping amber warning and red error.

### Verification

- typecheck PASS · build PASS · unit 243/243 (15/15 files; `git-footer.test.ts` excluded for global `core.hooksPath`) · stress 5/5

---

## v1.3.4-monthly — 2026-11-26 — Monthly quota (M:)

**Tag**: `v1.3.4-monthly` · **Branch**: `dev` · **PR**: #3

### Highlights

- Optional monthly metric `M:%` when the provider reports it.
- Order when present: `M:%` → `W:%` → `5H:%`. Hidden when absent.
- Kimi: parses `usages.limit_month_total` / `limit_month_code`.
- OpenCode Go: keeps `usage.monthly` (was discarded).
- `monthlyPaceColor` — 720 h window, 24 h grace.
- OpenRouter / MiniMax / CL-P unchanged.
- Live verify: `OPC-G  mimo-v2.6-flash  M:38%  W:29%  5H:1%`.

### Verification

- typecheck PASS · unit 198/198 (git-footer env-excluded) · stress 5/5 · build PASS
- Plugin AGENTS.md / README / CHANGELOG updated

---

## v1.3.3-multisession — 2026-11-24 — Multi-session provider + labels

**Tag**: `v1.3.3-multisession` · **Branch**: `main`

### Highlights

- Each kimi CLI session shows its **own** active model/provider (no more shared OPC-G).
- `modelIndex` from `config.toml` (`display_name` / model id → provider).
- Session-scoped cache: `sessions[sessionId]` + `resolveForSession`.
- Status payload accepts `session_id` or `sessionId`.
- Short labels: `OPC-G` (was OCG), `CL-P` (was CP).
- Key badges: `Err:key` (red), `Err:api` (amber).
- Live Herdr verify: `OR  Nemotron 3 Ultra (free)  Req: 217/1000`.

### Verification

- Tests 217/217 · stress 5/5 · typecheck/build green
- Issue #2 closed · Discussion #1 updated

---

## v1.3.2-gitlive — 2026-09-05 — Install UX

**Tag**: `v1.3.2-gitlive` · **Commit**: `89087cb` (merge) · **Branch**: `main`

This release makes installing and upgrading the plugin user-friendly. The
hardening work from v1.3.0/v1.3.1 stays intact; what changed is the
onboarding story.

### Highlights

- One-shot installer (`./tools/install.sh`) replaces a 3-4 step manual flow.
- A stale `tui.toml` path (e.g. `dist/scripts/render-row1.js`) is now
  auto-rewritten to the current `dist/bin/render-row1.js` on every sync.
- The plugin's entry in `~/.kimi-code/plugins/installed.json` gets its
  `version` and `updatedAt` bumped automatically, so kimi-code picks up
  upgrades without manual registry edits.
- `npm install` warns (non-fatally) when the managed copy is missing or
  behind the source.
- A new slash command `/kimi-quota-line:install` prints platform-specific
  install steps from inside kimi-code.

### What's New

| Item | Where | Purpose |
| --- | --- | --- |
| `tools/install.sh` | plugin repo | Build + sync + reload hint in one command |
| `tools/postinstall.mjs` | plugin repo | Warns on stale managed copy after `npm install` |
| `/kimi-quota-line:install` | kimi-code slash | Prints platform-specific install steps |
| `test/sync-install.test.ts` | plugin repo | 14 new tests for the install path |

### What's Changed

- `tools/sync-to-managed.mjs` now:
  - Rewrites `~/.kimi-code/tui.toml` if it points at an old
    `dist/scripts/` or `dist/hooks/` render-row1.js path
  - Bumps `~/.kimi-code/plugins/installed.json` `version` and `updatedAt`
    for this plugin
- `package.json` gained a `postinstall` script that calls
  `tools/postinstall.mjs`.
- README "Install" section now points to `./tools/install.sh` and the
  slash command.
- AGENTS.md "Commands" section documents the new wrapper.
- Plugin and package version bumped to `1.3.2`.
- Tag convention: `v0.1.0-mvp` (stage marker) → `v1.3.2-gitlive` (project-specific).

### What's Fixed (carried from v1.3.1)

The v1.3.1 git-status bug is now part of the stable baseline:

- `bin/render-row1.ts` runs `git status` live on every call (no disk cache,
  no 1-second TTL).
- Status breakdown now includes: unstaged modification, staged addition,
  untracked file, mix, deleted file.
- Branch + edge cases: `[wt]` marker for worktrees, `no git` for non-repo
  and detached HEAD, `no git` when the git binary is missing on the PATH.
- A leftover `kimi-quota-line-git-cache.json` from v1.3.0 is ignored on
  read so old installs do not show stale data.
- p99 under 300 ms over 50 calls on a small repo (kimi-code's hard cap).

### Installation

```bash
cd /absolute/path/to/01_kimi-Footer/plugins/kimi-quota-line
./tools/install.sh
```

Or, from inside kimi-code:

```
/kimi-quota-line:install
```

Or, the manual path (unchanged from v1.3.1):

```
/plugins install /absolute/path/to/01_kimi-Footer/plugins/kimi-quota-line
/plugins reload
```

### Upgrade Path (existing installs)

If you installed v1.3.0 or v1.3.1 manually:

1. Pull the latest source on the `main` branch.
2. Run `./tools/install.sh` — it builds, syncs, and patches `tui.toml`
   and `installed.json`.
3. Run `/plugins reload` (or restart kimi-code).

The plugin will not auto-migrate an outdated `dist/scripts/render-row1.js`
in your `[status_line]` config — `tools/sync-to-managed.mjs` does that now,
on the next sync.

### Verification

- `npm run typecheck` — clean.
- `npm test` — 136/136 passing (was 122; +14 new in `test/sync-install.test.ts`).
- `npm run stress` — 5/5 passing; p99 latency 271 ms (well below 500 ms).
- `npm run build` — clean; `dist/{bin,hooks,src}` only, no `dist/scripts/`
  leftover from v1.3.0.

### Known Limitations (unchanged)

- Row 2 of the status line is fixed (kimi-code built-in). Tracked in
  [kimi-code #2713](https://github.com/MoonshotAI/kimim-code/issues/2713).
- `/effort` switches lag one request.
- The dim color is a fixed `\x1b[38;5;244m` (status-line script has no
  theme access at runtime).

---

## v1.3.1 — 2026-09-05 — Git status live on every render

See `plugins/kimi-quota-line/CHANGELOG.md` for the full commit list. Key fix:
the disk git cache was up to 60 s stale. Dropped. Live `git status` per render.

## v1.3.0 — 2026-09-05 — Folder restructure, architecture hardening

Folder restructure (`scripts/` → `bin/`, `hooks/`, `tools/`), layer rules
test, file-lock helper, cache split. See CHANGELOG for the full commit list.

## v0.1.0-mvp — 2026-08-30 — Initial plugin import + 1.2.1/1.2.2 fixes

First installable cut of kimi-quota-line. Ported from pi-footer. Tag:
`v0.1.0-mvp`.