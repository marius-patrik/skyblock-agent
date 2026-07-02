# SkyAgent Product Architecture

SkyAgent is a local-first product with one installed command, `skyagent`, and several user surfaces over a shared core. The command must remain useful to agents and scripts without a UI, while the human TUI and web app share a local backend.

## Product Shape

Packages:

- `packages/core`: Hypixel clients, profile models, config, cache, item/economy/progression/planning logic.
- `packages/gateway`: localhost HTTP/WebSocket backend over `core`.
- `packages/cli`: installed `skyagent` command, process manager, setup, updater, non-interactive commands.
- `packages/tui`: Ink UI that talks to the gateway.
- `packages/web`: React web app that talks to the gateway.
- `packages/mcp`: MCP server using the same core/gateway abstractions.

The CLI is the control plane. It owns setup, diagnostics, gateway lifecycle, web lifecycle, updates, and direct scriptable commands.

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
POST /plan
GET  /providers
POST /cache/refresh
GET  /server-status?player=
GET  /context/events?since=&limit=
POST /context/events
GET  /context/stream?since=&limit=
```

## Context Event Contract

The context engine stores bounded `skyagent.contextEvent` records with source, timestamp, optional player/profile identity, payload, freshness, provider provenance, and monotonic sequence IDs for reconnects. Initial producers include Hypixel server/status checks, profile snapshot refreshes, provider/cache status changes, CLI/MCP/gateway explicit events, and later objective progress. `skyagent context watch` streams newline-delimited events by default and keeps `--once` for deterministic agent/test reads. CLI explicit events are persisted to `context-events.ndjson` under SkyAgent home so separate CLI invocations can reconnect and read them.

Hypixel server status reads and monitoring share the same reusable core producer. They emit `hypixel.server_status_change` when API availability, online state, session fields, or warning codes change, so CLI, MCP, gateway, and monitor callers all feed the same context stream. Long-running polling is started by host surfaces through `createServerStatusMonitor`; direct status reads remain non-interactive and emit the same change contract when state changes. Local input/configuration failures report `api.available: null`; provider/network failures report `api.available: false`; successful status responses include online state plus game type, mode, and map.

Provider status reads emit `provider.cache_status` and `provider.cache_status_change`. The gateway provider route and agent context bootstrap both use this producer so cache/provider changes are visible to context watchers.

Minecraft mod telemetry is reserved as a future producer through provenance metadata only. Expected future fields include `modId`, `minecraftVersion`, `sessionId`, `world`, `location`, `inventoryDelta`, and `objectiveProgress`; this repo slice does not implement the Fabric mod.

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
