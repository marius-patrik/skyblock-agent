# SkyAgent

SkyAgent is a Codex plugin for Hypixel SkyBlock profile analysis and progression planning.

The goal is to connect Codex to live player data, game reference data, and curated meta knowledge so it can answer questions like:

- What should I do next to reach a specific net worth, skill, dungeon, or Slayer goal?
- Which upgrades give the best return for my current profile?
- What daily and weekly route should I follow with my available play time?
- Which advice is stale after a patch, profile state, or economy change?

## Architecture

- `skills/` contains durable SkyBlock reasoning rules and source-priority guidance.
- `.mcp.json` exposes local tools for Hypixel API calls, profile data, public SkyBlock resources, and persistent SkyAgent notes.
- `scripts/skyagent.ts` is the Bun-powered CLI.
- `scripts/mcp-server.ts` is the Bun-powered MCP server used by Codex.
- `assets/` is reserved for plugin assets and reference fixtures.
- Future web app work should use Bun, Rsbuild, React, TypeScript, and shadcn/ui.

## Local Setup

Use an environment variable for the API key when possible:

```powershell
$env:HYPIXEL_API_KEY = "your-key"
```

Or store it in the SkyAgent user config:

```powershell
bun .\scripts\skyagent.ts config set api-key your-key
bun .\scripts\skyagent.ts config set username YourMinecraftName
```

SkyAgent stores config and memories outside the repo:

- Windows default: `%APPDATA%\skyagent`
- Override: `SKYAGENT_HOME`

## CLI Examples

```powershell
bun .\scripts\skyagent.ts config get
bun .\scripts\skyagent.ts resolve YourMinecraftName
bun .\scripts\skyagent.ts profiles
bun .\scripts\skyagent.ts profiles-summary
bun .\scripts\skyagent.ts overview
bun .\scripts\skyagent.ts skycrypt YourMinecraftName
bun .\scripts\skyagent.ts resource items
bun .\scripts\skyagent.ts bazaar
bun .\scripts\skyagent.ts firesales
bun .\scripts\skyagent.ts memory add "Working toward F7 completion" goal dungeon
```

## Data Sources

Initial targets:

- Hypixel API profile and player endpoints.
- Official Hypixel SkyBlock patch notes.
- Hypixel SkyBlock Wiki pages.
- Community meta sources where explicitly enabled.

Source priority should generally be: live API data, official patch notes, official/current wiki pages, leaderboards or logs, then community guides.

## API Notes

Hypixel v2 uses the `API-Key` request header for authenticated endpoints. Rate-limit details are returned in `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers. SkyBlock item and inventory payloads can contain base64 encoded gzipped NBT data; decoding that is intentionally left for a later parser module.

See `docs/parity.md` for the current gap between SkyAgent and SkyCrypt/SkyHelper-style tools.

## CI

GitHub Actions runs `bun run ci` on pushes to `main` and pull requests targeting `main`. The CI checks TypeScript, runs the no-key CLI smoke test, and validates the plugin manifest plus the Hypixel SkyBlock skill packaging.
