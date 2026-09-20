#!/usr/bin/env bash
# install.sh — one-shot installer for kimi-quota-line.
#
# Steps:
#   1. Build the plugin (tsc -p tsconfig.build.json → dist/).
#   2. Try the kimi CLI's /plugins install path first. If the CLI is not on
#      PATH or does not expose the subcommand, fall back to the sync script
#      (copies files into the managed dir + patches tui.toml + bumps
#      installed.json).
#   3. Print the next step (/plugins reload or restart).
#
# Usage:
#   ./tools/install.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

echo "[1/3] Building plugin..."
npx tsc -p tsconfig.build.json

echo "[2/3] Installing into kimi-code..."
if command -v kimi >/dev/null 2>&1; then
	# The CLI does not yet expose a non-interactive /plugins install in all
	# builds. We print the command for the user to run inside kimi-code and
	# also fall through to the sync script so the managed copy is refreshed
	# immediately. The sync script is idempotent and safe to run.
	echo "  kimi CLI detected. Run this inside kimi-code to register:"
	echo "    /plugins install $HERE"
	echo "  (we will also sync the managed copy below)"
fi

echo "[2/3] Syncing into managed dir..."
node ./tools/sync-to-managed.mjs

echo "[3/3] Done. Run /plugins reload (or restart kimi-code) to activate."