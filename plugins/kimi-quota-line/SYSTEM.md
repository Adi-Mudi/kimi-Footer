# System prompt contribution — kimi-quota-line

The kimi-quota-line plugin displays Kimi/MiniMax quota info on the first status-line row. The quota data lives at `$XDG_RUNTIME_DIR/kimi-quota-line-cache.json` (fallback `/tmp/kimi-quota-line-cache.json`).

When the user asks about quota, remaining tokens, or weekly pace, the `/refresh` slash command forces an immediate cache refresh — otherwise the cache updates on `SessionHeartbeat` (every 60 s).

The active provider is determined by the current model id/name (anything containing "kimi" → Kimi; "minimax" → MiniMax Coding Plan). If no data is in the cache for the active provider, the status line shows the folder name only — that means the corresponding API key is missing or the API call failed.
