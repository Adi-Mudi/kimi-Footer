# agents/

This directory is intentionally empty. It exists as the canonical extension point for [plugin subagents](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html#plugin-agents) per the official Kimi Plugins doc.

If a future contributor wants the agent itself to answer quota questions (not just render them in the status line), the subagent file goes here. Example shape:

```
agents/
├── quota-advisor.md
└── quota-formula-explainer.md
```

Discovery is automatic — Kimi picks up any `.md` file in this directory when the plugin is enabled and registers it as a subagent.

This directory is part of the managed copy that ships with the plugin (it has no dev-only content), so `tools/sync-to-managed.mjs` does NOT exclude it.

## Why no agents today

The plugin's job is rendering — showing the user their remaining quota in the status line. Answering questions about the quota would duplicate work the main agent already does well. Add a subagent here only if there is a concrete workflow that benefits from a focused role (e.g., a "quota advisor" subagent that runs before the user starts a long session and proactively warns about low budget).
