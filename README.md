# SkyAgent

SkyAgent is a Codex plugin for Hypixel SkyBlock profile analysis and progression planning.

The goal is to connect Codex to live player data, game reference data, and curated meta knowledge so it can answer questions like:

- What should I do next to reach a specific net worth, skill, dungeon, or Slayer goal?
- Which upgrades give the best return for my current profile?
- What daily and weekly route should I follow with my available play time?
- Which advice is stale after a patch, profile state, or economy change?

## Planned Architecture

- `skills/` contains durable SkyBlock reasoning rules and source-priority guidance.
- `.mcp.json` will expose local tools for Hypixel API calls, wiki search, profile snapshots, and comparison helpers.
- `scripts/` is reserved for MCP server code and data utilities.
- `assets/` is reserved for plugin assets and reference fixtures.

## Data Sources

Initial targets:

- Hypixel API profile and player endpoints.
- Official Hypixel SkyBlock patch notes.
- Hypixel SkyBlock Wiki pages.
- Community meta sources where explicitly enabled.

Source priority should generally be: live API data, official patch notes, official/current wiki pages, leaderboards or logs, then community guides.

