---
description: Refresh the quota cache for kimi-quota-line
---

Run this Bash command to refresh the quota cache immediately instead of waiting for the next SessionHeartbeat (every 60 s):

```
node "$KIMI_PLUGIN_ROOT/dist/hooks/refresh-cache.js"
```

Then briefly tell the user the cache was refreshed. If the command exits non-zero, report the error and check `$XDG_RUNTIME_DIR/kimi-quota-line-cache.json` (or `/tmp/kimi-quota-line-cache.json`).
