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
- `packages/core` contains shared Hypixel/Mojang API clients, profile helpers, config, memories, LLM provider routing, and parsers/calculators.
- `packages/cli` contains the Bun-powered JSON CLI command implementation.
- `packages/mcp` contains the Bun-powered MCP server used by Codex.
- `packages/gateway` contains the local-only HTTP backend and persistent LiteLLM-backed agent runtime.
- `packages/tui` contains the Ink interactive terminal UI surface and attaches to the gateway.
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

## LiteLLM Provider Gateway

SkyAgent's product agent runtime is provider-gateway based. It must not shell out to the Codex CLI as its backend. LiteLLM is the SkyAgent LLM abstraction boundary: SkyAgent talks to the local LiteLLM/OpenAI-compatible gateway, and concrete model/provider routing lives behind LiteLLM.

Configure a local LiteLLM proxy:

```powershell
bun .\scripts\skyagent.ts provider config set provider litellm
bun .\scripts\skyagent.ts provider config set base-url http://127.0.0.1:4000
bun .\scripts\skyagent.ts provider config set model skyagent-codex
bun .\scripts\skyagent.ts provider config set api-key sk-local-virtual-key
bun .\scripts\skyagent.ts provider config set rate-limit-rpm 60
bun .\scripts\skyagent.ts provider config set rate-limit-tpm 120000
bun .\scripts\skyagent.ts provider config set budget-usd 5
bun .\scripts\skyagent.ts provider config set budget-window daily
bun .\scripts\skyagent.ts provider status --json
```

Environment variables override stored provider config when present:

```powershell
$env:SKYAGENT_LLM_PROVIDER = "litellm"
$env:SKYAGENT_LITELLM_BASE_URL = "http://127.0.0.1:4000"
$env:SKYAGENT_LLM_MODEL = "skyagent-codex"
$env:SKYAGENT_LITELLM_API_KEY = "sk-local-virtual-key"
```

Provider status redacts tokens and auth material. The HTTP gateway can write non-secret provider metadata, but provider API keys must be set through environment variables, CLI, or MCP. SkyAgent-side agent code should depend on the LiteLLM gateway contract: resolved config, redacted public config, health/status metadata, configured budget/rate-limit metadata, OpenAI-compatible chat completions and Responses streaming events, timeout/retry behavior, and explicit provider freshness/errors. Provider-specific adapters, keys, model aliases, and routing policy belong in LiteLLM.

## CLI Examples

```powershell
bun .\scripts\skyagent.ts version
bun .\scripts\skyagent.ts doctor
bun .\scripts\skyagent.ts start --json
bun .\scripts\skyagent.ts config get
bun .\scripts\skyagent.ts provider status
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

`skyagent start` starts or reuses the local gateway on `127.0.0.1`, triggers the SkyAgent session-start hook, builds the profile context capsule, records the session-start context event, and returns persistent-agent readiness for CLI, TUI, MCP, and future web clients. Direct non-interactive commands such as `inventory`, `plan`, `price`, and `objective` remain available without going through the TUI.

## Package Commands

```powershell
bun run typecheck
bun run tui
bun .\scripts\skyagent.ts tui
bun run dev:web
bun run build:web
```

## Standalone Install And Release Artifacts

Build the current host executable for CI or local smoke checks:

```powershell
bun run build:release -- --current
```

Build all supported release targets:

```powershell
bun run build:release
```

Release artifacts are written under `dist/release/<target>/` for:

- `windows-x64`
- `linux-x64`
- `darwin-x64`
- `darwin-arm64`

Unix release builds require the `zip` CLI, and Unix installs require `unzip`.

Release automation dry-runs on pull requests and publishes only on pushes to `main`. The release workflow computes the next pride-version tag from the latest `vX.Y.Z` tag and the merged PR labels:

- `release:patch`
- `release:minor`
- `release:major`

Every published release includes the standalone archives, `SHA256SUMS.txt`, and `update.json`.

Standalone installs can update from GitHub Releases:

```powershell
skyagent update check --json
skyagent update install --json
skyagent update install --version 1.0.0 --json
```

Install from a release archive on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\install\install.ps1 -Archive .\dist\release\skyagent-windows-x64.zip
```

Install from a release archive on macOS/Linux:

```sh
SKYAGENT_ARCHIVE=./dist/release/skyagent-linux-x64.zip sh ./install/install.sh
```

The installers place `skyagent` in a user-local bin directory, update PATH when possible, then run `skyagent version` and `skyagent doctor`.

## TUI

Launch the interactive terminal UI with:

```powershell
bun .\scripts\skyagent.ts tui
```

The TUI opens into an agent chat surface backed by the same local gateway session as `skyagent start`. Non-chat screens cover config/status, profile selection, profile overview, inventory sections, pets/wardrobe/current gear, accessories and Magical Power, networth, progression/readiness, providers/server status, context events, objectives, and an explicit raw API/debug launcher. Use `r` to refresh the active screen, `enter` to select/run the active action, `up`/`down` or `j`/`k` for screens, `left`/`right` or `h`/`l` for lists, and `q` to quit.

The TUI starts or attaches to the local gateway automatically. If setup is incomplete, the status/profile screens show setup guidance without printing API key values. CI can initialize the same entry point without live credentials through:

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

See `docs/parity.md` for the current gap between SkyAgent and SkyCrypt/SkyHelper-style tools, `docs/public-readiness-gaps.md` for the 2.0 public-readiness issue map, `docs/parity-spec.md` for the detailed missing-parity implementation spec, and `docs/networth-comparison.md` for networth comparison-smoke notes.

## CI

GitHub Actions runs `bun run ci` on pushes to `main` and pull requests targeting `main`. The CI checks TypeScript, runs the no-key CLI smoke test, and validates the plugin manifest plus the Hypixel SkyBlock skill packaging.

Pull requests also run Codex autoreview in the Docker image defined by `.github/codex-review.Dockerfile` when the repository secret `CODEX_AUTH_JSON` is configured from a Codex OAuth `auth.json` file. The review workflow uses `pull_request_target`, builds the review image from trusted base-branch files, then checks out the PR head with credentials disabled into a separate workspace for read-only review. To allow a PR to merge automatically after CI and Codex review pass, add the `automerge` label and include a closing issue reference such as `Closes #123` in the PR body. Automerge uses squash merge and never uses admin bypass.

Automerge also publishes the GitHub Release for the merged `main` commit after the squash merge succeeds. This is intentional: pushes created by the workflow token do not reliably trigger a separate `push` release workflow, while manually merged PRs still publish through the normal Release workflow on `main`.
