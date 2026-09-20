# kimi-quota-line

A Kimi Code CLI status-line plugin that replaces the first footer line with a sunset-gradient folder + live Kimi/MiniMax quota bars + git details. Built in kimi-native shape (TypeScript + vitest + tsdown + SKILL.md + slash commands).

## What it looks like

```
›› my-project        main • 3 files       Kimi ▮▮▮▮▮▮▮▯▯▯ 67%  5H:▮▮▮▯▯▯▯▯▯▯ 20%/1.00
↑12k ↓3.1k R45k W2k $0.412 41.2%/262k      main • 3 files        kimi-for-coding • high
```

Three columns on the first row:
- **Left**: sunset-gradient folder (`›› <folder>`)
- **Center**: git details — branch in cyan bold (with `[wt]` in worktrees), dim ` • ` separator, bright-red dirty count (`N files`) or `clean`
- **Right**: Kimi or MiniMax quota bars (weekly + 5H)

The bottom row is kimi-code's built-in (context %, session id, version). **kimi-quota-line only replaces the top row.**

## What it is, and what it is not

**Is**:
- A native Kimi Code plugin (`kimi.plugin.json`).
- A port of pi-footer's row 1 visual format (same colors, same bar glyphs, same percent/pace math).
- A no-fork path: keeps working across every official kimi-code release.

**Is not**:
- A fork of kimi-code CLI.
- A replacement for kimi-code's built-in row 2 (token stats, git branch, model display). Row 2 stays built-in.
- A symlink-installable plugin. kimi-code does not support symlinks — see the [Dev workflow](#dev-workflow-no-symlink) section.

## Install

**Step 1. Build the plugin (one time, on this machine):**

```bash
cd /absolute/path/to/01_kimi-Footer/plugins/kimi-quota-line
npm install            # or `pnpm install` if available
npm run build          # tsc -p tsconfig.build.json → dist/
```

**Step 2. Install into kimi-code globally (per-user, applies to all projects):**

Inside kimi-code CLI, run:

```
/plugins install /absolute/path/to/01_kimi-Footer/plugins/kimi-quota-line
```

Replace `/absolute/path/to/01_kimi-Footer/plugins/kimi-quota-line` with the **real** absolute path on your machine. To get it:

```bash
cd /absolute/path/to/01_kimi-Footer/plugins/kimi-quota-line
pwd
```

**Step 3. Reload the plugin catalog:**

```
/plugins reload
```

**Step 4. (Optional) Verify the install:**

```
/plugins list
```

You should see `kimi-quota-line` in the list with a path under `$KIMI_CODE_HOME/plugins/managed/kimi-quota-line/`.

**One-shot alternative** (skip the manual steps):

```bash
cd /absolute/path/to/01_kimi-Footer/plugins/kimi-quota-line
./tools/install.sh
```

The script handles the build, the sync into the managed dir, and patches a stale `tui.toml` path. Inside kimi-code you can also type `/kimi-quota-line:install` to see the exact steps for your platform.

## Configure tui.toml

Add the plugin's status-line script to `~/.kimi-code/tui.toml` (or `$KIMI_CODE_HOME/tui.toml`):

```toml
[status_line]
command = "node ~/.kimi-code/plugins/managed/kimi-quota-line/dist/bin/render-row1.js"
```

Activate:

```
/reload-tui
```

## Token setup

The plugin reads API keys from `$KIMI_CODE_HOME/auth.json` first, then from environment variables.

For Kimi (`usages` endpoint):

```json
{
  "kimi-coding": { "key": "sk-..." }
}
```

OR:

```bash
export KIMI_API_KEY="sk-..."
```

For MiniMax Coding Plan (`coding_plan/remains` endpoint):

```json
{
  "minimax": { "key": "ey..." }
}
```

OR:

```bash
export MINIMAX_API_KEY="ey..."
```

If a provider's key is missing, that provider's bar is hidden — no error, no crash.

## Commands

| Command | Action |
| --- | --- |
| `/refresh` | Run the cache-refresh script immediately (skip the 60-second heartbeat wait) |

## How it works

1. `SessionStart` and `SessionHeartbeat` (every 60 s) hooks fire `dist/hooks/refresh-cache.js`.
2. `refresh-cache.js` calls the Kimi and MiniMax APIs in parallel (each provider is failure-tolerant) and writes a JSON cache to `$XDG_RUNTIME_DIR/kimi-quota-line-cache.json` (fallback `/tmp/kimi-quota-line-cache.json`).
3. kimi-code renders the footer every second (the `[status_line]` throttle). It calls `dist/bin/render-row1.js` with the current `StatusLinePayload` on stdin and `KIMI_CODE_STATUS_LINE=1` in env.
4. `render-row1.js` reads the cache + stdin payload, renders pi-footer's row 1 verbatim, and prints one line to stdout.

The status-line script is capped at **300 ms** by kimi-code. The script only reads a JSON file and does string ops — well under that budget. Live API calls happen in the hook path, not the render path.

## Architecture

```
01_kimi-Footer/
└── plugins/
    └── kimi-quota-line/                 ← plugin source
        ├── kimi.plugin.json             ← manifest (loaded by kimi-code)
        ├── src/                         ← TypeScript source modules
        ├── hooks/                       ← hook entry points (built by tsc)
        ├── bin/                         ← status-line entry point (built by tsc)
        ├── tools/                       ← dev workflow helpers (plain Node)
        ├── test/                        ← vitest suites
        ├── skills/quota-line/SKILL.md   ← auto-loaded at session start
        ├── commands/refresh.md          ← /refresh slash command
        ├── SYSTEM.md                    ← system-prompt contribution
        ├── AGENTS.md                    ← AI-session guidance (layer rules)
        ├── UPGRADING.md                 ← kimi-code CLI version contract
        ├── LICENSE                      ← MIT
        ├── CHANGELOG.md
        ├── package.json                 ← vitest + typescript devDeps
        ├── tsconfig.json
        ├── tsconfig.build.json
        ├── vitest.config.ts
        └── .gitignore

.kimi-code/                              ← user-level kimi-code data
└── plugins/
    └── managed/
        └── kimi-quota-line/             ← kimi-code COPIES source here (no symlink)
            ├── kimi.plugin.json
            ├── dist/hooks/refresh-cache.js
            ├── dist/bin/render-row1.js
            ├── dist/src/*.js
            ├── skills/, commands/, SYSTEM.md, AGENTS.md, README.md, LICENSE, UPGRADING.md, CHANGELOG.md
            └── (dev-only dirs src/, hooks/, bin/, tools/, test/, node_modules/, .git/ excluded)
```

## Dev workflow (no symlink)

kimi-code does **not** support symlinks for plugin installs. Per the [Plugins doc](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html):

> "Local installations are copied to `$KIMI_CODE_HOME/plugins/managed/<id>/`, and the CLI always runs from this managed copy. Editing the original source directory after installation has no effect; you must reinstall."

The dev loop is:

```bash
# Edit source files
npm test              # confirm tests pass
npm run build         # tsc → dist/{hooks,bin}/*.js + dist/src/*.js
# In kimi-code:
/plugins install /absolute/path/to/01_kimi-Footer/plugins/kimi-quota-line  # reinstall
/plugins reload       # pick up the changes
```

For first-time install or a major change, use `/plugins install` (the official path). It copies the source AND registers the plugin in `installed.json`.

`npm run sync` is a thin Node.js script (`tools/sync-to-managed.mjs`) that does only the file-copy step (skips `installed.json`). Use it only when iterating quickly and you don't want to wait for `/plugins install` to finish. After `npm run sync`, run `/plugins reload` to pick up changes — the plugin files are already where kimi-code expects them.

For automatic sync on every save, you can wire up a file watcher (e.g. `fswatch -o . | xargs -n1 -I{} npm run sync`); this is left as a user choice and not bundled to keep dependencies minimal.

## Limitations

- **Row 2 is fixed** — kimi-code's built-in layout (context %, session id, version). Replacing both rows is not currently possible via `[status_line].command`. Tracked in [kimi-code issue #2713](https://github.com/MoonshotAI/kimi-code/issues/2713).
- **`thinkingEffort` switch lags one request** — `/effort` in-session, the status line shows the previous effort until the next request lands. Tracked upstream.
- **Fixed dim color** — pi-footer's `theme.fg("dim", ...)` resolves to the active theme's dim token. This port emits a fixed ANSI gray (`\x1b[38;5;244m`) because the status-line script has no access to kimi-code's theme at runtime. Bar colors (`#28a745` / `#e0a800` / `#dc3545`) are unchanged.
- **1-second status-line throttle** is kimi-code's, not ours. The cache can be fresher than the footer.

## Development

```bash
npm install
npm run typecheck
npm test
npm run stress
npm run build
```

Note: the build step uses `tsc` (not a bundler). All `hooks/*.ts` files compile to `dist/hooks/*.js`; all `bin/*.ts` files compile to `dist/bin/*.js`. The `src/` modules compile to `dist/src/*.js` so that the runtime imports in `dist/hooks/*.js` and `dist/bin/*.js` resolve. Tests are not part of the build output.

| File | Role |
| --- | --- |
| `src/*.ts` | Pure logic. Safe to import from tests. |
| `hooks/refresh-cache.ts` | Hook target. Fetches Kimi + MiniMax in parallel. |
| `bin/render-row1.ts` | Status-line target. Exports `buildRow1` for tests. |
| `tools/sync-to-managed.mjs` | No-symlink dev workflow helper. |
| `test/helpers.test.ts` | vitest unit tests for `src/helpers.ts`. |
| `test/render-row1.test.ts` | vitest tests for `buildRow1` (imported directly). |
| `test/cache-roundtrip.test.ts` | vitest subprocess tests for both scripts. |
| `test/stress.test.ts` | 300 ms budget + concurrent hooks + cache TTL. |

## Attribution

Quota-fetching logic (Kimi + MiniMax) and bar / pace / color formatting are verbatim ports of the corresponding files in `01_pi-Footer/.pi/extensions/pi-footer/` (MIT).

Adaptations for kimi-code CLI:
- `isKimiModel` / `isMinimaxModel` accept a plain string instead of a `Model` object.
- `auth.json` is read from `$KIMI_CODE_HOME` instead of `$PI_CODING_AGENT_DIR`.
- Folder shape follows kimi-code's plugin conventions (`kimi.plugin.json`, `skills/`, `commands/`, `SYSTEM.md`).
- Source rewritten in TypeScript; tests via vitest; build via tsdown.

## License

MIT.
