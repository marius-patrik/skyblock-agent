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
- `packages/core` contains shared Hypixel/Mojang API clients, profile helpers, config, memories, and future parsers/calculators.
- `packages/cli` contains the Bun-powered JSON CLI command implementation.
- `packages/mcp` contains the Bun-powered MCP server used by Codex.
- `scripts/skyagent.ts` and `scripts/mcp-server.ts` are compatibility wrappers for the root binary and plugin manifest.
- `assets/` is reserved for plugin assets and reference fixtures.
- Future TUI work should add a package that depends on `@skyagent/core`.
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
bun .\scripts\skyagent.ts inventory
bun .\scripts\skyagent.ts inventory-section armor
bun .\scripts\skyagent.ts item-dump --section accessory_bag
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

Hypixel v2 uses the `API-Key` request header for authenticated endpoints. Rate-limit details are returned in `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers. SkyBlock item and inventory payloads can contain base64 encoded gzipped NBT data; SkyAgent decodes supported inventory sections through `packages/core/src/nbt.ts` and `packages/core/src/inventory.ts`.

See `docs/parity.md` for the current gap between SkyAgent and SkyCrypt/SkyHelper-style tools, and `docs/parity-spec.md` for the detailed missing-parity implementation spec.

## CI

GitHub Actions runs `bun run ci` on pushes to `main` and pull requests targeting `main`. The CI checks TypeScript, runs the no-key CLI smoke test, and validates the plugin manifest plus the Hypixel SkyBlock skill packaging.

Pull requests also run Codex autoreview in the Docker image defined by `.github/codex-review.Dockerfile` when the repository secret `CODEX_AUTH_JSON` is configured from a Codex OAuth `auth.json` file. The review workflow uses `pull_request_target`, builds the review image from trusted base-branch files, then checks out the PR head with credentials disabled into a separate workspace for read-only review. To allow a PR to merge automatically after CI and Codex review pass, add the `automerge` label and include a closing issue reference such as `Closes #123` in the PR body. Automerge uses squash merge and never uses admin bypass.
