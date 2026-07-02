---
name: skyagent-live-progress
description: Use SkyAgent context events and live-progress streams for Hypixel SkyBlock sessions. Use for session-start hooks, context stream reads, context watch, explicit event emission, Hypixel server-status changes, provider/cache status changes, profile refresh events, and future Minecraft mod telemetry.
metadata:
  display_name: "SkyAgent Live Progress"
  short_description: "Read context event streams."
  default_prompt: "Use $skyagent-live-progress to check recent SkyBlock context events."
---

# SkyAgent Live Progress

Use this skill when an answer should account for recent session progress, refresh events, provider changes, or future live telemetry.

## Tool Routing

- Use `skyagent_start` through `$skyagent-context-engine` when a session should create the startup marker; it persists an `agent.session_start` event for reconnect and audit flows.
- Use `skyagent_context_events` to read recent bounded context events for deterministic follow-up analysis; prefer the `since` cursor returned by `skyagent_start` when continuing the same session.
- Use `skyagent_context_watch` when the session needs a stream of progress, refresh, `provider.cache_status`, `provider.cache_status_change`, or server-status events.
- Use `skyagent_context_event_emit` when Codex, CLI, MCP, gateway, or a future producer needs to add an explicit event.
- Use `skyagent_server_status` when online state, SkyBlock session mode/map, Hypixel API availability, or status warnings matter; status changes should appear as `hypixel.server_status_change` events.
- Use `skyagent_context_refresh` after meaningful profile-changing events so the context capsule reflects current profile state.
- Route durable progress and work-item changes to `$skyagent-objectives`.
- Route compact session bootstrap to `$skyagent-context-engine`.

## Event Handling

- Prefer event sequence IDs or `since` cursors for reconnects.
- Treat `agent.session_start` as the boundary for the current agent run and use its payload to avoid repeating setup/profile/status checks.
- Treat `provider.cache_status` and `provider.cache_status_change` events as freshness signals, not as proof that profile state changed.
- Treat explicit agent events as notes unless they are backed by a tool result, live profile refresh, or user confirmation.
- Future Minecraft mod telemetry should enter through the same event contract with provenance fields such as `modId`, `minecraftVersion`, `sessionId`, `world`, `location`, `inventoryDelta`, and `objectiveProgress`.

## Rules

- Do not assume live streams are available. Fall back to cached events or context refresh when needed.
- Preserve event source, timestamp, player/profile identity, provider provenance, freshness, warnings, and sequence ID.
- Use live progress to avoid asking the user to restate progress that is already present in the stream.
- Do not implement Minecraft mod behavior from this skill; only consume events that already exist.
- Do not store secrets in emitted events or event payloads.
