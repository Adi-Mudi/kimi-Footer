# E2E Testing Reference

This page explains how to do end-to-end testing of the `kimi-quota-line` plugin. It maps **every item from `UPGRADING.md`'s "Manual smoke checklist"** to either:

- **Programmatic coverage**: a `vitest` test that runs the same code path without needing a live kimi-code TUI, OR
- **Manual run**: a step only verifiable by a human looking at the actual kimi-code UI.

It also documents the single-command E2E runner (`npm run e2e`) and the mandatory pre-commit gate.

## Sources

| Source | URL | What it prescribed |
| --- | --- | --- |
| Plugin `AGENTS.md` — "When you change something" | (in-repo, line 105) | 5-step verification: typecheck → test → build → stress → CHANGELOG |
| Plugin `UPGRADING.md` — "Manual smoke checklist" | (in-repo, line 20) | 10-step end-to-end test after any kimi-code CLI bump |
| Official kimi-code Plugins doc | https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins | Plugin lifecycle; **no prescribed E2E pattern** — they describe what a plugin does, not how to test it |

This plugin's E2E strategy comes from **`UPGRADING.md`** since it is the authoritative in-repo source for a 10-step checklist that catches the 6 contract surfaces. The official kimi-code doc confirms lifecycle but does not add E2E guidance.

## UPGRADING.md checklist → coverage matrix

| # | UPGRADING.md step | Programmatic? | How / Where |
| --- | --- | --- | --- |
| 1 | Clean install: remove managed copy + installed.json entry | **Manual** | Touch kimi-code state. Run `rm -rf ~/.kimi-code/plugins/managed/kimi-quota-line/` then `/plugins info kimi-quota-line` should show "not installed". |
| 2 | `npm install && npm run build` | **Programmatic** | `npm test` builds transitively. `test/cache-roundtrip.test.ts` and `test/sync-install.test.ts` both require `npm run build` to have run. |
| 3 | Install via `/plugins install <path>` | **Manual** | Touches kimi-code's `installed.json`. Verified post-install by `/plugins list` showing the entry. |
| 4 | Activate: `/plugins enable` + `/plugins reload` | **Manual + Programmatic** | Manual: `/plugins reload`. Programmatic equivalent: `test/sync-install.test.ts` "bumps updatedAt and version for kimi-quota-line" simulates this. |
| 5 | `/plugins info kimi-quota-line` shows no warnings | **Manual** | Touches live kimi-code. |
| 6 | Cache file appears within 60 s and `ts` updates on heartbeat | **Programmatic** | `test/cache-roundtrip.test.ts` "writes a cache file with valid shape" + `test/stress.test.ts` "concurrent hook safety" verify the cache write path under contention. |
| 7 | `/refresh` jumps `ts` forward immediately | **Programmatic** | `test/cache-roundtrip.test.ts` spawns the real `refresh-cache.js` with fake keys. |
| 8 | Status line shows 3 columns (folder + git + quota) and labels match model | **Programmatic** | `test/cache-roundtrip.test.ts` has 3 tests: missing-cache, Kimi label, MM label. Spawns the real `dist/bin/render-row1.js` with realistic stdin. |
| 9 | Row 2 unchanged (kimi-code built-in context %, session id, version) | **Manual** | Only verifiable by looking at the actual kimi-code TUI. Documented as a [kimi-code limitation issue #2713](https://github.com/MoonshotAI/kimi-code/issues/2713). |
| 10 | No torn JSON in the cache, no visible lag on `cd` between repos | **Programmatic + Manual** | Programmatic: `test/stress.test.ts` "concurrent cache write safety" ensures no torn JSON. Manual: lag-on-cd is human-eye. |

**Coverage: 6 of 10 steps are fully programmatic. 4 require a human looking at the live TUI.**

## The 6 contract surfaces (mandatory to keep stable)

`UPGRADING.md` line 8 lists the six surfaces a future kimi-code release could break. The plan covers them in `test/architecture.test.ts` and the surrounding files:

| # | Surface | Pinned by | Pinned in test |
| --- | --- | --- | --- |
| 1 | Hook event names (`SessionStart`, `SessionHeartbeat`) | `kimi.plugin.json` | `test/sync-install.test.ts` checks the manifest fields survive sync |
| 2 | `systemPromptPath` semantics | `./SYSTEM.md` in manifest | `tools/sync-to-managed.mjs` copies SYSTEM.md into managed dir |
| 3 | Slash command shape (`commands/`, `$KIMI_PLUGIN_ROOT`) | `commands/refresh.md` | `test/sync-install.test.ts` "creates the managed dir with the manifest and docs" |
| 4 | `[status_line].command` contract (JSON stdin + `KIMI_CODE_STATUS_LINE` + 300 ms budget) | `bin/render-row1.ts` | `test/cache-roundtrip.test.ts` (stdin + budget) + `test/render-row1-width.test.ts` (width) |
| 5 | `KIMI_PLUGIN_ROOT` env var in hook processes | `hooks/refresh-cache.ts` | `test/cache-roundtrip.test.ts` spawns with `KIMI_PLUGIN_ROOT` set |
| 6 | `auth.json` location | `src/kimi-fetcher.ts` + `src/minimax-fetcher.ts` | `test/cache-roundtrip.test.ts` writes a fake `auth.json` into `$KIMI_CODE_HOME` |

## Mandatory pre-commit gate

`AGENTS.md` "When you change something" (in-repo, line 105) lists five steps that **must** all pass before a commit is accepted:

1. `npm run typecheck` — must be clean.
2. `npm test` — all green or stop.
3. If you changed `scripts/*.ts`, `npm run build`.
4. `npm run stress` — all green or stop.
5. Update `CHANGELOG.md` in the same change.

These five steps are wrapped in **`npm run e2e`** (added in 1.3.4) so the gate can be invoked with one command.

## Running the full E2E chain

```
npm run e2e
```

This single command runs in sequence:

1. `npm run typecheck` — `tsc --noEmit` (zero errors).
2. `npm test` — full vitest suite (148 tests, ~7 s).
3. `npm run stress` — 5 stress tests including p99 latency budget (~17 s).
4. `npm run build` — `tsc -p tsconfig.build.json` → `dist/`.
5. **E2E smoke**: spawns the **built** `dist/bin/render-row1.js` with realistic stdin and asserts it produces a non-empty row containing the sunset folder ANSI, a branch, and the dirty digit.

Total wall time: ~30 s on this machine.

## Manual smoke checklist (4 steps requiring a human)

After any kimi-code CLI bump, run these in addition to `npm run e2e`:

1. **Clean install.** `rm -rf ~/.kimi-code/plugins/managed/kimi-quota-line/` and remove the entry from `~/.kimi-code/installed.json`. Then reinstall via `/plugins install <path>`.
2. **Watch row 1.** Open kimi-code. The footer must read three columns: sunset folder on the left, git details in the middle (with the new `[5m` blink on the dirty digit), quota bars on the right. Both `Kimi` and `MM` labels must appear for their respective models.
3. **Confirm row 2 unchanged.** The second footer line must still be kimi-code's built-in (context %, session id, version). If it changes, kimi-code issue #2713 has been resolved and we can revisit.
4. **Watch for torn JSON.** `cat $XDG_RUNTIME_DIR/kimi-quota-line-quota-cache.json` in another shell while kimi-code runs. The file must always parse as valid JSON; partial writes indicate `withFileLock` regression.

If any of the four fails, do not ship the upgrade.

## Architecture guard

`test/architecture.test.ts` enforces four hard layer rules from `AGENTS.md` line 30. The test runs on every `npm test` invocation. If a future contributor accidentally:

- Adds `fetch` to `bin/render-row1.ts` (render must be read-only),
- Adds `node:fs` import to a pure `src/*.ts` module,
- Refactors `pickBlinkColor` to wrap blink around ` files` (the leak we fixed in 1.3.4),
- Embeds executable code in `skills/` or `commands/` (markdown only),

…the relevant test fails in CI before the change ships.
