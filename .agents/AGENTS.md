# SkyAgent Repo Rules

## Scope

This repository builds a Codex plugin, CLI, and MCP server for Hypixel SkyBlock profile analysis.

## Source Priority

- Prefer official Hypixel API data and official Hypixel docs for endpoint behavior.
- Prefer live profile data over assumptions.
- Treat SkyCrypt, SkyHelper, NotEnoughUpdates, CoflNet, Bazaar trackers, and Discord bot behavior as parity references, not authoritative game truth.
- Verify meta-sensitive claims with current sources before making strong recommendations.

## Secrets and User Data

- Do not commit API keys, profile snapshots, cache files, or personal config.
- Read `HYPIXEL_API_KEY` before any stored config key.
- Store local config and memories outside the repo through `scripts/lib/store.mjs`.
- Do not print API key values in CLI or MCP responses.
- Keep `.env.example` placeholder-only.

## Architecture

- Keep transport/API code in `scripts/lib/hypixel.mjs`.
- Keep user config and memory persistence in `scripts/lib/store.mjs`.
- Keep profile-level extraction and SkyCrypt-style viewer helpers in `scripts/lib/profile.mjs`.
- Keep CLI command wiring in `scripts/skyagent.mjs`.
- Keep MCP tool schemas and dispatch in `scripts/mcp-server.mjs`.
- Add new parser/calculator modules under `scripts/lib/` before expanding CLI/MCP wiring.

## API and Tool Design

- Every high-value CLI operation should have a matching MCP tool.
- Keep `hypixel_request` as an escape hatch, but add named abstractions for common SkyBlock workflows.
- Return JSON from CLI commands.
- MCP tool responses should be JSON text content.
- Prefer compact summaries for planning workflows and raw payload access for debugging.

## Parity Roadmap

- Track SkyCrypt/SkyHelper parity gaps in `docs/parity.md`.
- Inventory/NBT parsing, item normalization, pricing, networth, missing accessories, and profile section extractors are separate layers.
- Do not present derived calculations as complete until their data provider and assumptions are documented.

## Validation

Run before committing:

```powershell
npm run check
python C:\Users\patrik\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py C:\Users\patrik\projects\skyagent
python C:\Users\patrik\.codex\skills\.system\skill-creator\scripts\quick_validate.py C:\Users\patrik\projects\skyagent\skills\hypixel-skyblock
```

After plugin manifest or tool-surface changes, update the plugin cachebuster and reinstall:

```powershell
python C:\Users\patrik\.codex\skills\.system\plugin-creator\scripts\update_plugin_cachebuster.py C:\Users\patrik\projects\skyagent
codex plugin add skyagent@personal
```

## Git

- Keep `main` deployable.
- Commit focused changes with concise messages.
- Push completed repo-rule, plugin, CLI, MCP, and skill changes to `origin/main`.

