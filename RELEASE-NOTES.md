# Release Notes

Per-version notes for the kimi-quota-line plugin. The CHANGELOG inside the
plugin tracks the full commit history; this file gives a user-facing summary
per release.

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