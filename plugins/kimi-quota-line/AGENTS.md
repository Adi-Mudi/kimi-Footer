# AGENTS.md — kimi-quota-line

Guidance for AI sessions working in this directory.

## Layout

- `kimi.plugin.json` — plugin manifest (manifest field reference: kimi-code Plugins doc)
- `src/` — TypeScript source modules. Mostly pure; one I/O exception noted below.
  - `types.ts` — shared interfaces (`QuotaData`, `CacheFile`, `QuotaCache`, `StatusLinePayload`, `GitInfo`)
  - `quota-cache.ts` — quota cache file read/write (lock-protected at call sites)
  - `file-lock.ts` — `withFileLock` advisory file lock helper
  - `helpers.ts` — bar / pace / color formatting (port of pi-footer `helpers.ts`)
  - `label-blink.ts` — pure ANSI blink helpers (`BLINK_HALF_PERIOD_MS`, `pickBlinkColor`, `formatKimiLabel`). Imports only from `./types.js`.
  - `kimi-fetcher.ts` — Kimi API fetch + module-level `currentData`
  - `minimax-fetcher.ts` — MiniMax Coding Plan fetch + module-level `currentData`, auto-region
  - `git-footer.ts` — git branch + dirty count. Spawns `git` subprocesses on every call. **No cache, no lock** (v1.3.1).
  - `sunset-dir.ts` — sunset gradient folder styling
  - `width.ts` — terminal width detection
- `hooks/` — entry points invoked by kimi-code, built to `dist/hooks/` by `tsc`.
  - `refresh-cache.ts` — hook target (SessionStart + SessionHeartbeat). Writes only the quota cache.
- `bin/` — entry point invoked by `tui.toml [status_line].command`, built to `dist/bin/`.
  - `render-row1.ts` — status-line renderer (reads quota cache + calls `getGitDetails` live)
- `tools/` — dev workflow helpers, no Kimi runtime role.
  - `sync-to-managed.mjs` — no-symlink dev workflow helper
- `skills/quota-line/SKILL.md` — auto-loaded at session start
- `commands/refresh.md` — `/refresh` slash command
- `SYSTEM.md` — system-prompt contribution loaded while plugin is enabled
- `test/` — vitest suites
- `dist/` — built output (gitignored; do not edit)

## Layer rules

The plugin splits into five layers. Each has a single direction of responsibility. Import direction: source modules depend on `types.ts` only. Entry points (`hooks/`, `bin/`) depend on source modules. Skills and commands are markdown.

| Layer | Role | Imports from | Imported by |
| --- | --- | --- | --- |
| Skills | Markdown knowledge loaded by the agent | nothing | Kimi runtime |
| Commands | Markdown slash commands invoked by the user | nothing | Kimi runtime |
| Hooks | Entry points fired by Kimi lifecycle events | source modules | Kimi runtime |
| Bin | Entry point invoked by `tui.toml [status_line].command` | source modules | kimi-code TUI |
| Tools | `.mjs` helpers used by the dev loop only | nothing | local dev workflow |
| Source | Pure modules (no I/O) | `types.ts` only | hooks + bin + tests |

The four hard rules below are enforced by `test/architecture.test.ts` (see Phase D9). Do not violate them; the test will fail in CI.

1. **Render is read-only.** `bin/render-row1.ts` must not call `fetch`, must not write files, must not open network sockets. It reads the cache and stdin only.
2. **Hooks do I/O.** `hooks/refresh-cache.ts` may call APIs, write caches, block up to 30 s. It is the only layer that talks to Kimi/MiniMax.
3. **Source modules stay pure — except `git-footer.ts`.** Anything in `src/` (except `src/quota-cache.ts` and `src/file-lock.ts`) must not import `node:fs`, `node:child_process`, or `fetch`. The ONE exception is `src/git-footer.ts`, which spawns `git` subprocesses by design — that is the v1.3.1 fix for live git status. Other source modules must remain importable from unit tests without side effects.
4. **Skills and commands are markdown only.** No executable code lives under `skills/` or `commands/`.

## Architecture diagram

Runtime data flow. Lock boundaries are explicit so future contributors know where concurrency is controlled.

```
SessionStart / SessionHeartbeat
          │
          ▼
hooks/refresh-cache.ts  ──(fetch)──▶  Kimi API
          │                            MiniMax API
          ▼
$XDG_RUNTIME_DIR/
  quota-cache.json        ◀── withFileLock(quota.lock)
          │
          ▼
bin/render-row1.ts  ──(read)──▶  quota-cache  (read-only)
          │
          ├─▶  src/label-blink.ts  ──(formatKimiLabel)──▶  Kimi label blink
          │
          └─▶  src/git-footer.ts  ──(live)──▶  git status --porcelain | wc -l
                                                       git rev-parse --abbrev-ref HEAD
                                                       git rev-parse --git-dir
          │
          ▼
stdout → kimi-code TUI row 1
```

The render path is the strictest: from `bin/render-row1.ts` downward, only `readQuotaCache` and `readStdin` touch the outside world, both are bounded reads. `src/git-footer.ts` spawns `git` subprocesses on every call — that is intentional (v1.3.1 fix): kimi-code throttles the status line to once per second, so caching adds staleness without saving work. Everything else in `src/` is pure and runs in well under the 300 ms status-line budget.

The only disk cache is the quota cache. Git data is read live from `git status` on every render. The `withFileLock(quota.lock)` boundary protects the quota cache write; there is no lock for git.

## Commands

```bash
npm install            # one time (or pnpm install if available)
npm run typecheck      # tsc --noEmit
npm test               # vitest run (full suite)
npm run stress         # vitest run test/stress.test.ts only
npm run build          # tsc -p tsconfig.build.json → dist/
npm run sync           # cp source → $KIMI_CODE_HOME/plugins/managed/kimi-quota-line/ (+ patch tui.toml, bump installed.json)
./tools/install.sh     # one-shot: build + sync + reload hint
npm run test:watch
npm run build:watch
```

After `npm run sync`, open kimi-code and run `/plugins reload`.

## Golden rules

1. **Real imports only.** Never write tests against re-implemented copies of functions. Tests import the actual `src/*.ts` and `scripts/*.ts` modules.
2. **Fixed status colors are intentional.** Bars use `statusFg()` truecolor (`#28a745` / `#e0a800` / `#dc3545`). Do NOT swap them for theme tokens — see the dim color note below for the one accepted deviation.
3. **Dim color is a fixed ANSI gray (`\x1b[38;5;244m`).** The status-line script has no access to the active kimi-code theme at runtime, so we emit a single color. Bar colors stay truecolor.
4. **No real network, no real secrets in tests.** Tests mock `fetch` via subprocess (`spawnSync`); they use fake keys; they redirect `$XDG_RUNTIME_DIR` and `$KIMI_CODE_HOME` to tmp dirs.
5. **`src/` stays pure — except for git.** Anything that touches stdin/stdout/filesystem stays in `hooks/`, `bin/`, `tools/`, or the dedicated cache modules (`src/quota-cache.ts`). `src/helpers.ts`, `src/sunset-dir.ts`, and the fetchers must remain importable from tests with no side effects. `src/git-footer.ts` is the one exception — it spawns `git` subprocesses by design (v1.3.1 fix).
6. **TypeScript everywhere.** No `.js` or `.mjs` source except the dev-only `scripts/sync-to-managed.mjs` (which is plain Node and needs no build).
7. **Build before testing subprocess code.** `cache-roundtrip.test.ts` and `stress.test.ts` spawn `dist/scripts/*.js`. Run `npm run build` after any change to `scripts/*.ts`.
8. **Module imports use `.js` extensions** even for `.ts` files (NodeNext ESM resolution).

## When you change something

1. Run `pnpm typecheck` — must be clean.
2. Run `npm test` — all green or stop. (Stress test excluded; runs separately via `npm run stress` to avoid system-noise flakes.)
3. If you changed `scripts/*.ts`, run `npm run build`.
4. Run `npm run stress` — all green or stop.
5. Update `CHANGELOG.md` (Added/Fixed/Changed) in the same change.
