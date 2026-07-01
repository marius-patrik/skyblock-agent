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
- `packages/tui` contains the future interactive terminal UI surface and depends on `@skyagent/core`.
- `packages/web` contains the future Bun + Rsbuild + React + TypeScript + shadcn/ui web app surface and depends on `@skyagent/core`.
- `scripts/skyagent.ts` and `scripts/mcp-server.ts` are compatibility wrappers for the root binary and plugin manifest.
- `assets/` is reserved for plugin assets and reference fixtures.

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
bun .\scripts\skyagent.ts normalize-items
bun .\scripts\skyagent.ts networth
bun .\scripts\skyagent.ts item-networth --section armor
bun .\scripts\skyagent.ts accessories
bun .\scripts\skyagent.ts missing-accessories
bun .\scripts\skyagent.ts accessory-upgrades --budget 10000000
bun .\scripts\skyagent.ts section skills
bun .\scripts\skyagent.ts progression
bun .\scripts\skyagent.ts weight
bun .\scripts\skyagent.ts readiness dungeons
bun .\scripts\skyagent.ts plan f7 --budget 10000000
bun .\scripts\skyagent.ts next-upgrades --budget 10000000
bun .\scripts\skyagent.ts item HYPERION
bun .\scripts\skyagent.ts price ENCHANTED_DIAMOND
bun .\scripts\skyagent.ts lbin HYPERION
bun .\scripts\skyagent.ts price-history HYPERION 30d
bun .\scripts\skyagent.ts skycrypt YourMinecraftName
bun .\scripts\skyagent.ts resource items
bun .\scripts\skyagent.ts bazaar
bun .\scripts\skyagent.ts firesales
bun .\scripts\skyagent.ts memory add "Working toward F7 completion" goal dungeon
```

## Package Commands

```powershell
bun run typecheck
bun run tui
bun .\scripts\skyagent.ts tui
bun run dev:web
bun run build:web
```

## TUI

Launch the interactive terminal UI with:

```powershell
bun .\scripts\skyagent.ts tui
```

The TUI opens directly into config/status, profile selection, profile overview, raw API/debug launcher, and advanced-section status screens. It uses keyboard navigation (`up`/`down` or `j`/`k` for screens, `left`/`right` or `h`/`l` for lists, `enter`, `r`, `q`) and never prints API key values. The initial implementation uses Node `readline` primitives instead of a rendering dependency to keep Windows Terminal, VS Code terminal, and GitHub Actions smoke behavior predictable. CI can initialize the same entry point without live credentials through:

```powershell
bun .\scripts\skyagent.ts tui --smoke
```

## Data Sources

Initial targets:

- Hypixel API profile and player endpoints.
- Official Hypixel SkyBlock patch notes.
- Hypixel SkyBlock Wiki pages.
- Community meta sources where explicitly enabled.

Source priority should generally be: live API data, official patch notes, official/current wiki pages, leaderboards or logs, then community guides.

## API Notes

Hypixel v2 uses the `API-Key` request header for authenticated endpoints. Rate-limit details are returned in `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers. SkyBlock item and inventory payloads can contain base64 encoded gzipped NBT data; SkyAgent decodes supported inventory sections through `packages/core/src/nbt.ts` and `packages/core/src/inventory.ts`, then normalizes item stacks through `packages/core/src/items.ts`.

Item metadata uses the NotEnoughUpdates item repository as an optional provider. Outputs include provider source, URL, fetch time, cache status, and warnings when metadata is unavailable.

Price results use Hypixel Bazaar for Bazaar products and CoflNet-compatible endpoints for LBIN/history. Bounded Hypixel active-auction scans can expose partial `candidatePrice` metadata for auctionable items, but only complete scans or direct providers populate resolved `price`. Outputs include provider method, confidence, cache status, stale status, fallback chain, and warnings.

Networth results combine purse, bank, and sectioned inventory item totals. Items without resolved prices are reported under `unknownPrices` and do not contribute to totals; partial auction candidates remain advisory. Current networth behavior is intentionally conservative: item modifiers and cosmetic/value add-ons are preserved in output but not independently valued until provider-specific support lands.

Accessory results inspect the accessory bag, estimate Magical Power, detect duplicates and recombobulation/enrichment signals, and rank missing-accessory upgrades by coin per Magical Power when accessory metadata and resolved prices are available. Missing-accessory coverage depends on the configured accessory metadata provider and is explicit when the full universe is unavailable.

Progression results provide SkyCrypt-style profile sections for skills, Dungeons, Slayer, Mining/HotM, Garden, Bestiary, Collections, Minions, Museum, Crimson Isle/Kuudra, Rift, Trophy Fishing, Pets, Essence, currencies, and unlocks. Each section reports source fields, computed summaries, warnings for missing API data, and formula/table provenance. Section aliases include `hotm`, `kuudra`, `farming`, `trophy_fish`, and `important_unlocks`.

Weight and readiness results are conservative. Exact Senither/Lily formulas are reported as unsupported until maintained formula tables are bundled; SkyAgent returns a clearly labeled estimate with inputs, formulas, assumptions, freshness, and warnings. Readiness supports `dungeons`, `slayer`, `kuudra`, `garden`, and `mining`.

Planner results compose profile sections, networth, accessory upgrades, readiness, config, and local memories into deterministic recommendations. Each recommendation includes a reason, expected impact, cost or time estimate, prerequisites, source freshness, uncertainty, and warnings.

See `docs/parity.md` for the current gap between SkyAgent and SkyCrypt/SkyHelper-style tools, `docs/parity-spec.md` for the detailed missing-parity implementation spec, and `docs/networth-comparison.md` for networth comparison-smoke notes.

## CI

GitHub Actions runs `bun run ci` on pushes to `main` and pull requests targeting `main`. The CI checks TypeScript, runs the no-key CLI smoke test, and validates the plugin manifest plus the Hypixel SkyBlock skill packaging.

Pull requests also run Codex autoreview in the Docker image defined by `.github/codex-review.Dockerfile` when the repository secret `CODEX_AUTH_JSON` is configured from a Codex OAuth `auth.json` file. The review workflow uses `pull_request_target`, builds the review image from trusted base-branch files, then checks out the PR head with credentials disabled into a separate workspace for read-only review. To allow a PR to merge automatically after CI and Codex review pass, add the `automerge` label and include a closing issue reference such as `Closes #123` in the PR body. Automerge uses squash merge and never uses admin bypass.
