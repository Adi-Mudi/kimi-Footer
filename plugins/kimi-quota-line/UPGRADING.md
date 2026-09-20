# UPGRADING

This page documents the kimi-code CLI compatibility contract for the `kimi-quota-line` plugin. Read this before bumping the kimi-code CLI version or pulling a major release of kimi-code.

## Pinned kimi-code CLI version

The plugin is currently tested against **kimi-code CLI 0.41.x**. Newer versions should work as long as the six contract surfaces below stay stable. Older versions are unsupported.

## The 6 contract surfaces

A future kimi-code release can break this plugin if any of these change. Check the [kimi-code changelog](https://www.kimi.com/code/docs/en/kimi-code-cli/release-notes/changelog.html) before bumping.

1. **Hook event names** — `SessionStart` and `SessionHeartbeat` are declared in `kimi.plugin.json`. Kimi renamed or removed events would silently stop our cache refresh. The full event list is in the [Hooks doc](https://www.kimi-cli.com/en/customization/hooks.html).
2. **`systemPromptPath` semantics** — we point at `./SYSTEM.md`. Kimi reads this file on plugin install/reload. If Kimi changes the read timing or the path resolution, our system prompt contribution breaks.
3. **Slash command shape** — `commands/refresh.md` uses the frontmatter `description:` field and `$KIMI_PLUGIN_ROOT` env var. If Kimi switches to a different command file shape or env var name, the `/refresh` command stops working.
4. **`[status_line].command` contract** — kimi-code invokes the status-line command with a JSON payload on stdin and `KIMI_CODE_STATUS_LINE=1` in env. It enforces a 300 ms wall-clock budget. Any change to payload shape, env var, or budget silently breaks our footer.
5. **`KIMI_PLUGIN_ROOT` env var** — passed to hook processes per the [Plugins doc](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html). We use it in `commands/refresh.md`.
6. **Auth path `$KIMI_CODE_HOME/auth.json`** — both fetchers read this file. If Kimi moves to a different auth location, our quota fetches silently fail and the bar hides.

## Manual smoke checklist

Run this end-to-end after any kimi-code version bump. It catches the 6 contract surfaces above in one pass.

1. Clean install: remove `~/.kimi-code/plugins/managed/kimi-quota-line/` and `~/.kimi-code/installed.json` entries for this plugin.
2. From this repo root: `cd plugins/kimi-quota-line && npm install && npm run build`.
3. Install: `/plugins install /absolute/path/to/plugins/kimi-quota-line`.
4. Activate: `/plugins enable kimi-quota-line` then `/plugins reload`.
5. Confirm no diagnostic warnings: `/plugins info kimi-quota-line`.
6. Watch the cache: in another shell, run `watch -n 1 'cat $XDG_RUNTIME_DIR/quota-cache.json 2>/dev/null || cat /tmp/kimi-quota-line-cache.json'`. Within 60 s of opening kimi-code the file must appear and `ts` must keep updating (heartbeat).
7. Force refresh: type `/refresh`. The cache `ts` must jump forward immediately.
8. Confirm the status line: the first footer line must show three columns — sunset folder, git details, quota bars. Both `Kimi` and `MM ` labels must render correctly for their respective models.
9. Confirm the second footer line: still kimi-code's built-in (context %, session id, version). If row 2 changes, the kimi-code issue #2713 has been resolved and we can revisit.
10. Confirm row 1 timing: no visible lag on `cd` between repos; no torn JSON in the cache file.

If any step fails, do not ship the upgrade. Revert to the previous kimi-code version and file an issue.

## Rollback recipe

If the new kimi-code release breaks this plugin, revert in this order:

1. Revert the kimi-code CLI: follow the upstream rollback for your install method.
2. Inside the plugin, no code change is needed — the plugin still targets the previous contract.
3. From this repo: `npm run build && npm run sync`.
4. In kimi-code: `/plugins reload`.
5. Repeat the manual smoke checklist above.

If a code change is needed because a contract surface actually changed, do it on a branch off the previous release tag. Do not patch in main without a CHANGELOG entry.

## Future extension points

- Hooks: 2 of 13 Kimi lifecycle events are used today (`SessionStart` and `SessionHeartbeat`, both wired in `kimi.plugin.json`). The other 11 are documented below as extension points.
- Subagents: `agents/` directory is a placeholder. Future work may add subagent files there.
- MCP tools: `mcpServers` in `kimi.plugin.json` is unused. Future work may expose `get_quota` / `refresh_quota` as MCP tools.
- Cache TTL: hard-coded today (60 s quota via SessionHeartbeat, 1 s git in-memory). Future work may expose TTL via the `interface` block in the manifest.

### Lifecycle events used by this plugin

Kimi Code CLI supports 13 lifecycle events. The plugin currently uses 2:

| Event | Used? | One-line use case if added |
| --- | --- | --- |
| `PreToolUse` | No | Read-only plugin — no need to inspect tool calls. |
| `PostToolUse` | No | Same. |
| `PostToolUseFailure` | No | Same. |
| `UserPromptSubmit` | Maybe future | Detect "what's my quota" prompts and pre-warm the cache before the user sees stale data. |
| `Stop` | No | Not relevant to a status-line plugin. |
| `StopFailure` | No | Same. |
| `SessionStart` | Yes (already used) | Pre-warm quota + git caches on session open. |
| `SessionEnd` | Maybe future | Clean up the worktree-specific git cache when the user closes the session. |
| `SubagentStart` | No | No subagents today. |
| `SubagentStop` | No | Same. |
| `PreCompact` | Maybe future | Preserve the last-known quota state across compaction so the bar does not disappear briefly. |
| `PostCompact` | Maybe future | Same. |
| `Notification` | Maybe future | Surface a warning when the weekly quota hits the amber/red threshold (today the bar shows the color but no alert fires). |
| `SessionHeartbeat` | Yes (already used) | Refresh the cache every 60 s so the bar stays accurate without hitting the API per render. |

If you add any of these, declare them in the `hooks` array of `kimi.plugin.json` and create a new entry point under `hooks/<event>.ts`. Reuse `src/quota-cache.ts`, `src/git-cache.ts`, and `src/file-lock.ts` — do not duplicate lock logic.

Adding more hooks does not require changes to the AGENTS.md layer rules — the same rule applies (hooks do I/O, render stays read-only).

### MCP tool exposure (`mcpServers`)

If a future feature wants the agent itself to query quota (not just render it), add an `mcpServers` entry to `kimi.plugin.json` per the [Plugins doc](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html#mcp-servers-in-plugins). The plugin would expose `get_quota` and `refresh_quota` as MCP tools. The implementation would reuse the same `src/quota-cache.ts` and `src/kimi-fetcher.ts` / `src/minimax-fetcher.ts` modules. No new logic — just a thin MCP wrapper around the existing functions.

### Cache TTL configuration

Cache TTL is hard-coded today: 60 s for the quota cache (driven by `SessionHeartbeat` firing every 60 s) and 1 s for the git cache (in-memory TTL in `src/git-footer.ts` and disk TTL in `src/git-cache.ts`). If a future contributor wants to make this configurable, expose a setting via the `interface` block of `kimi.plugin.json` and read it through the hook path:

```jsonc
"interface": {
    "displayName": "Kimi Quota Line",
    "settings": [
        { "key": "QUOTA_TTL_MS", "default": 60000, "description": "..." }
    ]
}
```

Then the hook reads `process.env.KIMI_QUOTA_TTL_MS` (or similar) and uses it instead of the hard-coded 60 s. Recommended default: keep 60 s — kimi-code's `SessionHeartbeat` fires on this cadence and tighter TTL just costs API calls.
