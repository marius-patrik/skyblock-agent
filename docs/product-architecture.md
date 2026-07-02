# SkyAgent Product Architecture

SkyAgent is a local-first product with one installed command, `skyagent`, and several user surfaces over a shared core. The command must remain useful to agents and scripts without a UI, while the human TUI and web app share a local backend.

## Product Shape

Packages:

- `packages/core`: Hypixel clients, profile models, config, cache, item/economy/progression/planning logic, and the LiteLLM-backed LLM gateway contract.
- `packages/gateway`: localhost HTTP/WebSocket backend over `core`.
- `packages/cli`: installed `skyagent` command, process manager, setup, updater, non-interactive commands.
- `packages/tui`: Ink UI that talks to the gateway.
- `packages/web`: React web app that talks to the gateway.
- `packages/mcp`: MCP server using the same core/gateway abstractions.

The CLI is the control plane. It owns setup, diagnostics, gateway lifecycle, web lifecycle, updates, and direct scriptable commands.

Valuation-heavy commands and tools must be bounded for agent use. Networth and accessory pricing surfaces expose item/lookup limits plus timeouts, return `complete` or `partial` valuation status, preserve stale-cache and unknown-price warnings, and keep compact summaries as the planner default. Full item arrays and large debug payloads stay opt-in through explicit detail/debug commands or flags.

## CLI Contract

Non-interactive commands stay stable and call `core` directly by default. They must not require the gateway, TUI, MCP, or web app.

Examples:

```text
skyagent overview [player] [profile]
skyagent inventory [player] [profile]
skyagent networth [player] [profile]
skyagent accessories [player] [profile]
skyagent progression [player] [profile]
skyagent readiness <area> [player] [profile]
skyagent plan <goal> [player] [profile] --budget <coins>
skyagent price <itemId>
skyagent resource <items|skills|collections|...>
skyagent request <v2/path> key=value
```

Agent/script flags:

```text
--json
--no-interactive
--no-open
--profile <id-or-name>
--player <name-or-uuid>
--config <path>
--timeout <ms>
```

Rules:

- stdout is machine-readable result output when `--json` is used.
- stderr is diagnostics/progress.
- nonzero exit codes represent structured failures.
- no browser opens unless a web/open command explicitly asks for it.
- no prompts outside explicitly interactive commands.
- secrets are never printed.

Human workflow commands:

```text
skyagent setup
skyagent doctor
skyagent provider status|config
skyagent tui
skyagent gateway start|stop|restart|status|logs
skyagent web start|stop|restart|status|open
skyagent update check|install
skyagent version
```

## Gateway Contract

The gateway is a local backend for human UIs. It is not required for direct CLI commands.

Requirements:

- Bind to `127.0.0.1` by default.
- Use a generated local bearer token or equivalent local auth secret.
- Persist runtime state under the SkyAgent data directory.
- Record PID, port, token metadata, started-at time, logs path, and version.
- Refuse to print secrets in logs or status output.
- Expose stable JSON APIs consumed by both TUI and web.
- Provide server-sent events for refresh/progress/context updates.

Initial routes:

```text
GET  /health
GET  /version
GET  /config
POST /config
GET  /profiles?player=
GET  /overview?player=&profile=
GET  /inventory?player=&profile=
GET  /networth?player=&profile=
GET  /accessories?player=&profile=
GET  /progression?player=&profile=
GET  /readiness?area=&player=&profile=
GET  /plan
GET  /providers
POST /cache/refresh
GET  /server-status?player=
GET  /context/events?since=&limit=
POST /context/events
GET  /context/stream?since=&limit=
GET  /llm-provider/status
GET  /llm-provider/config
POST /llm-provider/config
```

## LLM Provider Gateway Contract

SkyAgent's product agent runtime is provider-gateway based. It must not shell out to `codex`, `codex exec`, or the Codex CLI session/config store. Codex may be used to develop and review this repository, but runtime agent integration belongs behind SkyAgent's LiteLLM gateway boundary.

LiteLLM is the SkyAgent provider abstraction. The core contract resolves local LiteLLM config and environment overrides, redacts secrets, performs health/status checks, captures provider freshness, maps gateway errors, applies timeout/retry limits, and exposes OpenAI-compatible chat completions and Responses streaming events to agent-facing code.

Local config:

```text
skyagent provider config set provider litellm
skyagent provider config set base-url http://127.0.0.1:4000
skyagent provider config set model skyagent-codex
skyagent provider config set api-key <virtual-key>
skyagent provider config set rate-limit-rpm 60
skyagent provider config set rate-limit-tpm 120000
skyagent provider config set budget-usd 5
skyagent provider config set budget-window daily
skyagent provider status --json
```

Environment overrides:

```text
SKYAGENT_LLM_PROVIDER=litellm
SKYAGENT_LITELLM_BASE_URL=http://127.0.0.1:4000
SKYAGENT_LLM_MODEL=skyagent-codex
SKYAGENT_LITELLM_API_KEY=<virtual-key>
SKYAGENT_LLM_TIMEOUT_MS=30000
SKYAGENT_LLM_MAX_RETRIES=1
```

The HTTP gateway may update non-secret provider config and metadata, but it must not persist provider API keys. Provider API keys are configured through environment variables, direct CLI, or MCP tool calls where the local user/agent explicitly supplies the secret.

Concrete model providers must be configured behind LiteLLM rather than added as parallel SkyAgent runtime backends. Agent runtime code should depend on the SkyAgent LiteLLM gateway contract: resolved config, redacted public config, health/status metadata, auth-source reporting, configured and observed budget/rate-limit metadata, streamed `text_delta` and tool-call events, and explicit retryable/non-retryable errors.

## Context Event Contract

The context engine stores bounded `skyagent.contextEvent` records with source, timestamp, optional player/profile identity, payload, freshness, provider provenance, and monotonic sequence IDs for reconnects. Initial producers include Hypixel server/status checks, profile snapshot refreshes, provider/cache status changes, CLI/MCP/gateway explicit events, and later objective progress. `skyagent context watch` streams newline-delimited events by default and keeps `--once` for deterministic agent/test reads. CLI explicit events are persisted to `context-events.ndjson` under SkyAgent home so separate CLI invocations can reconnect and read them.

Hypixel server status reads and monitoring share the same reusable core producer. They emit `hypixel.server_status_change` when API availability, online state, session fields, or warning codes change, so CLI, MCP, gateway, and monitor callers all feed the same context stream. Long-running polling is started by host surfaces through `createServerStatusMonitor`; direct status reads remain non-interactive and emit the same change contract when state changes. Local input/configuration failures report `api.available: null`; provider/network failures report `api.available: false`; successful status responses include online state plus game type, mode, and map.

Provider status reads emit `provider.cache_status` and `provider.cache_status_change`. The gateway provider route and agent context bootstrap both use this producer so cache/provider changes are visible to context watchers.

### Future Minecraft Mod Telemetry Ingress

The future Fabric Minecraft mod is deferred implementation work. When approved later, it should act only as another local producer of typed context events, specifically typed `skyagent.contextEvent` records. It should not bypass the context engine, write objective files directly, expose a public server, or require exposing the gateway publicly outside `127.0.0.1`.

Expected auth/localhost boundaries:

- The mod connects only to the existing localhost gateway or another explicitly configured loopback endpoint.
- The mod authenticates with the same generated local bearer token or a derived short-lived session token; tokens must stay out of logs, chat, screenshots, objectives, and event payloads.
- The gateway keeps ownership of persistence, sequence IDs, context history limits, and fanout to CLI/MCP/TUI/web consumers.
- The mod should send typed events with source `{ kind: "minecraft-mod", id: <mod-instance-id>, transport: "localhost" }`, player/profile identity when known, freshness timestamps, and provenance such as `modId`, `minecraftVersion`, and `sessionId`.
- Terminal passthrough is a local session event stream only. It must not open remote shell access, expose arbitrary command execution to public networks, or run without explicit local user setup.

Example future event types cover location, inventory delta, purse delta, active objective progress, chat-derived SkyBlock signals, and terminal passthrough/session events:

```json
{
  "type": "minecraft.location_update",
  "source": { "kind": "minecraft-mod", "id": "skyagent-fabric", "transport": "localhost" },
  "payload": {
    "sessionId": "local-session-id",
    "world": "SkyBlock",
    "server": "hypixel",
    "location": { "area": "Crystal Hollows", "x": 512, "y": 92, "z": -318 },
    "biomeOrZone": "Mithril Deposits"
  }
}
```

```json
{
  "type": "minecraft.inventory_delta",
  "source": { "kind": "minecraft-mod", "id": "skyagent-fabric", "transport": "localhost" },
  "payload": {
    "inventoryDelta": [
      { "itemId": "ENCHANTED_HARD_STONE", "displayName": "Enchanted Hard Stone", "countDelta": 8 },
      { "itemId": "ENCHANTED_DIAMOND", "displayName": "Enchanted Diamond", "countDelta": -1 }
    ],
    "purseDelta": 12500,
    "reason": "pickup_or_sale"
  }
}
```

```json
{
  "type": "minecraft.objective_progress",
  "source": { "kind": "minecraft-mod", "id": "skyagent-fabric", "transport": "localhost" },
  "payload": {
    "objectiveProgress": {
      "objectiveId": "obj_hotm_route",
      "taskId": "task_powder_grind",
      "metric": "powder_mined",
      "delta": 2400,
      "current": 184000,
      "target": 250000
    }
  }
}
```

```json
{
  "type": "minecraft.chat_signal",
  "source": { "kind": "minecraft-mod", "id": "skyagent-fabric", "transport": "localhost" },
  "payload": {
    "signal": "skyblock_drop_or_completion",
    "chatDerived": true,
    "rawTextRedacted": true,
    "summary": "Completed commission",
    "confidence": "medium"
  }
}
```

```json
{
  "type": "minecraft.terminal_session",
  "source": { "kind": "minecraft-mod", "id": "skyagent-fabric", "transport": "localhost" },
  "payload": {
    "terminal": {
      "sessionId": "local-terminal-session",
      "event": "opened",
      "surface": "in_game_overlay",
      "passthrough": "local_gateway_only"
    }
  }
}
```

The agent should treat mod events as useful live context, not authoritative profile truth. Important purchase, inventory, purse, or progression claims should still be reconciled through Hypixel API/profile snapshots when possible before updating durable objectives or making high-cost recommendations.

No `packages/mcmod` or Fabric implementation is added by this contract. Mod implementation is deferred until explicit user instruction and a dedicated implementation issue.

## Objective Store

Durable agent work items live in `objectives.json` under SkyAgent home. A normalized item model covers objectives, tasks/todos, buy-list entries, source-list entries, and snipe targets with stable IDs, status transitions, item IDs, target prices, budgets, priority, source provider, freshness, and warnings. CLI and MCP surfaces expose create/list/update/complete/delete operations, and context capsules include a compact live objective summary even when profile data is loaded from cache.

Planner output separates recommendations into immediate actions, todo candidates, buy-list candidates, source-item candidates, snipe targets, and skip guidance. Planning can read cached context/objective summaries when requested, and it creates or updates objective records only behind explicit persistence flags.

Minecraft mod telemetry is reserved as a future producer through provenance metadata and the event ingress contract only. Expected future fields include `modId`, `minecraftVersion`, `sessionId`, `world`, `location`, `inventoryDelta`, `purseDelta`, active objective progress through `objectiveProgress`, chat-derived SkyBlock signals, and terminal passthrough/session events; this repo slice does not implement the Fabric mod.

## Agent Skillset Contract

The broad `$hypixel-skyblock` skill should route session-scale analysis through `$skyagent-context-engine` first, then `$skyagent-objectives` and `$skyagent-live-progress` when durable work items or recent events may change the answer. Narrow skills should keep their domain-specific tools, but reference the context, objective, and event-stream skills when profile cache, todo/buy/source/snipe state, or live progress changes matter.

The transcript-derived behavior contract lives in `docs/agent-behavior.md` and `packages/core/src/behavior-playbook.ts`. It requires compact startup context before broad analysis, fallback from MCP to CLI before claiming a missing capability, bounded raw extraction only when summaries are unavailable, Museum-specific extraction before generic progression, and complete gear/pet/accessory/freshness checks before damage or Slayer purchases.

Skill additions and behavior changes require `bun run validate:skill` and a plugin manifest cachebuster bump so local Codex plugin installs can reload the updated skillset.

The current public-readiness gap matrix lives in `docs/public-readiness-gaps.md`. It is the issue-owned source for remaining 2.0 blockers, important parity gaps, docs-only drift, and explicitly deferred web or Minecraft mod work.

## TUI And Web

The Ink TUI and React web app should use the same gateway client package or shared API schema. UI state should be local to each surface, but data fetching, errors, auth headers, and result contracts should be shared.

The current Ink TUI is an interim direct-core UI. It must be adapted to start or connect to the gateway before it is considered product-complete.

Expected TUI behavior:

- `skyagent tui` ensures the gateway is available, then renders the Ink app.
- If setup is incomplete, TUI routes to setup state instead of failing with raw API errors.
- Profile selector, overview, debug, advanced sections, and future screens all use gateway APIs.
- `skyagent tui --smoke` remains deterministic JSON for CI.

Expected web behavior:

- `skyagent web start` ensures gateway and web server are available, stores process state, and opens a browser unless `--no-open` is provided.
- `skyagent web stop` stops only SkyAgent-managed processes.
- `skyagent web open` opens the current server URL or starts it when requested.
- The web app should not require users to run Bun manually.

## Setup Flow

`skyagent setup` is the interactive onboarding flow. It should also support non-interactive flags later.

Flow:

1. Detect install path, current version, and data directory.
2. Ask for Minecraft username.
3. Resolve and store UUID.
4. Configure Hypixel API key or OAuth/auth mode when available.
5. Fetch profiles and choose selected profile.
6. Run a lightweight API/provider check.
7. Print next commands.

Stored config stays in the SkyAgent data directory, with secrets either environment-first or stored using the best available platform secret storage when implemented.

## Installer

The install flow must be cross-platform and standalone. Users should not manually create PATH entries, run `bun link`, or understand the repo layout.

Artifacts:

```text
skyagent-windows-x64.zip
skyagent-macos-arm64.tar.gz
skyagent-macos-x64.tar.gz
skyagent-linux-x64.tar.gz
checksums.txt
latest.json
```

Install locations:

```text
Windows: %LOCALAPPDATA%\SkyAgent\bin
macOS:   ~/Library/Application Support/SkyAgent/bin
Linux:   ~/.local/share/skyagent/bin
```

Installer responsibilities:

- download or unpack the release artifact,
- place the standalone launcher/executable in the install directory,
- add the install directory to user PATH when possible,
- verify `skyagent version` and `skyagent doctor`,
- never require users to install Bun manually.

## Auto Update

The updater reads GitHub Releases, not the `main` branch.

Commands:

```text
skyagent update check
skyagent update install
skyagent update install --version <version>
```

Flow:

1. Read current installed version.
2. Fetch release metadata from GitHub Releases.
3. Select the latest compatible artifact.
4. Download artifact and checksums.
5. Verify checksum.
6. Replace executable/launcher atomically.
7. Restart managed gateway/web processes if requested.

## Releases And Versioning

Every merge to `main` creates a GitHub Release.

Base public version:

```text
1.0.0
```

Version policy, using project "pride versioning":

- Patch bump is the default for any merge.
- Minor bump is for meaningful product/capability improvements.
- Major bump happens only when explicitly requested by the user as a version milestone.

PR labels control the bump:

```text
release:patch  default when no release label is present
release:minor  meaningful improvement
release:major  explicit milestone only
```

Release workflow responsibilities:

- determine next version from latest tag and PR labels,
- create tag `vX.Y.Z`,
- create GitHub Release,
- build cross-platform artifacts,
- publish checksums,
- publish update metadata used by `skyagent update`.

## Implementation Sequence

1. #55: Add this architecture contract and issue map.
2. #56: Add `packages/gateway` with local HTTP server, auth token, health/version/config/profile overview routes, and tests.
3. #57: Add CLI gateway process manager: start/stop/status/logs.
4. #58: Adapt Ink TUI to connect through the gateway.
5. #59: Add web lifecycle commands: start/stop/status/open.
6. [#66](https://github.com/marius-patrik/skyagent/issues/66): Polish the web app UX, SkyBlock theming, and licensed resource-pack item rendering.
7. #60: Add interactive `skyagent setup`.
8. #61: Add standalone build and cross-platform install scripts.
9. #62: Add GitHub Release automation and pride-version labels.
10. #63: Add CLI auto-updater against GitHub Releases.
11. #64: Expand gateway APIs for inventory, networth, accessories, progression, readiness, planner, and provider status.

Each implementation slice must have an issue, feature branch, single squashed commit, PR, passing CI, passing Codex Review, and merge to `main`.
