---
description: One-shot installer — build, sync into the kimi-code managed dir, and print the reload hint.
---

Print the exact install steps for the current platform:

- **macOS / Linux**:
  ```bash
  cd "$REPO_ROOT/plugins/kimi-quota-line"
  ./tools/install.sh
  /plugins reload
  ```
- **Windows (PowerShell)**:
  ```powershell
  cd "$REPO_ROOT\plugins\kimi-quota-line"
  .\tools\install.sh   # bash must be on PATH (Git Bash or WSL)
  /plugins reload
  ```

`$REPO_ROOT` is the directory that contains this plugin. The script
builds the dist, then either runs the kimi CLI's `/plugins install`
or copies the source into `~/.kimi-code/plugins/managed/kimi-quota-line/`.

After running, restart kimi-code (or `/reload`) so the new
`[status_line]` config takes effect.