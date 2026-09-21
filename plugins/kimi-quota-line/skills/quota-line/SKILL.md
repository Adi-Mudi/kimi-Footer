---
name: quota-line
description: Display Kimi/MiniMax quota on the kimi-code status line. Use when the user asks about remaining quota, usage, weekly pace, 5-hour window status for Kimi or MiniMax models, or references the status line / footer directly.
---

# Kimi Quota Line

This plugin replaces the first footer line of kimi-code with three columns:

- **Left**: sunset-gradient folder path (magenta ›, orange ›, white folder name).
- **Center**: git details — branch in cyan bold, `[wt]` marker in worktrees **blinking** cyan → off → amber (shared 4-phase clock), dim ` • ` separator, bright-red blinking dirty file count or `clean`.
- **Right**: a live quota bar for the active provider (Kimi or MiniMax). Bars use the same traffic-light colors as pi-footer's status line (#28a745 green, #e0a800 amber, #dc3545 red). The weekly bar is pace-aware — red means "slow down now", not "almost full".

The second footer line is unchanged (kimi-code's built-in: context %, session id, version, hints).

## What lives where

| Path | Purpose |
| --- | --- |
| `kimi.plugin.json` | Plugin manifest. Declares hooks and commands. |
| `systemPromptPath` → `SYSTEM.md` | Optional system-prompt contribution loaded while the plugin is enabled. |
| `skills/quota-line/SKILL.md` | This file. Auto-loaded at session start. |
| `commands/refresh.md` | The `/refresh` slash command. |
| `dist/hooks/refresh-cache.js` | Hook target. Runs on SessionStart and SessionHeartbeat. Refreshes the cache. |
| `dist/bin/render-row1.js` | Status-line target. Invoked by `[status_line].command` in `tui.toml`. |

The cache file lives at `$XDG_RUNTIME_DIR/kimi-quota-line-cache.json` (fallback `/tmp/kimi-quota-line-cache.json`).

## How to act on quota questions

When the user asks about quota:

1. If they want a fresh snapshot, suggest `/refresh` (this plugin's slash command) to force a cache update immediately, otherwise wait for the next SessionHeartbeat (every 60 s).
2. The cache is the source of truth at runtime. Its `kimi` / `minimax` fields hold `{ wUsed, wLimit, wResetAt, hUsed, hLimit, hResetAt, hRemaining }`. Pick the provider matching the active model.
3. Pace interpretation: a weekly bar in the green-amber range means usage is at or below the time-elapsed pace. Red means usage is more than 100% of expected pace.

## Token setup

The plugin reads API keys in this order:

1. `$KIMI_CODE_HOME/auth.json` — Kimi: `kimi-coding.key` or `kimi.key`. MiniMax: `minimax.key` or `minimax-cn.key`.
2. Environment: `KIMI_API_KEY` (or `KIMI_AUTH_TOKEN`), `MINIMAX_API_KEY`.

Missing key for a provider → that provider's bar is hidden. No error, no crash.

## Known limitations

- Row 2 of the status line cannot be replaced — kimi-code's built-in stays. Tracked in kimi-code issue #2713.
- `/effort` switches (thinking level) lag one request when reflected in the status line. Tracked upstream.
- The dim color is a fixed `\x1b[38;5;244m` — the script has no access to the active theme. Bar colors are unchanged (truecolor).

## Dev workflow (no symlinks)

kimi-code does not support symlinks for plugin installs. Use `pnpm run sync` (this plugin's helper script) to copy the source into `$KIMI_CODE_HOME/plugins/managed/kimi-quota-line/` after every edit, then run `/plugins reload`.

## Attribution

Logic ported from pi-footer (MIT) for the pi coding agent.
