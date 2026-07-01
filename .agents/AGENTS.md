# SkyAgent Repo Rules

## Scope

This repository builds a Codex plugin, CLI, and MCP server for Hypixel SkyBlock profile analysis.

Future web app work should use Bun, Rsbuild, React, TypeScript, and shadcn/ui. Defer additional framework, state, styling, deployment, and database choices until the web app requirements are clear.

## Source Priority

- Prefer official Hypixel API data and official Hypixel docs for endpoint behavior.
- Prefer live profile data over assumptions.
- Treat SkyCrypt, SkyHelper, NotEnoughUpdates, CoflNet, Bazaar trackers, and Discord bot behavior as parity references, not authoritative game truth.
- Verify meta-sensitive claims with current sources before making strong recommendations.

## Secrets and User Data

- Do not commit API keys, profile snapshots, cache files, or personal config.
- Read `HYPIXEL_API_KEY` before any stored config key.
- Store local config and memories outside the repo through `scripts/lib/store.ts`.
- Do not print API key values in CLI or MCP responses.
- Keep `.env.example` placeholder-only.

## Architecture

- Prefer TypeScript over JavaScript whenever possible.
- Keep transport/API code in `scripts/lib/hypixel.ts`.
- Keep user config and memory persistence in `scripts/lib/store.ts`.
- Keep profile-level extraction and SkyCrypt-style viewer helpers in `scripts/lib/profile.ts`.
- Keep CLI command wiring in `scripts/skyagent.ts`.
- Keep MCP tool schemas and dispatch in `scripts/mcp-server.ts`.
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
- Do not implement directly on `main`.
- Create a corresponding GitHub issue before starting each slice of work.
- The issue must include the exact spec and acceptance criteria for that slice.
- Do each slice on a feature/dev branch named for the issue, such as `dev/issue-12-short-topic`.
- Land each slice to `main` through a PR from the dev branch.
- The PR must close the corresponding issue on merge.
- Main should receive one commit per slice. Use a single focused commit on the branch or squash-merge the PR.
- Add the `automerge` label only when a PR is intended to merge automatically after CI and Codex autoreview pass.
- Codex autoreview uses the GitHub secret `CODEX_AUTH_JSON`, containing Codex OAuth `auth.json`; do not use `OPENAI_API_KEY` for this repo's Codex CI review.
- Keep the Codex autoreview runtime bundled in `.github/codex-review.Dockerfile` instead of installing Codex ad hoc in the workflow.
- Commit focused changes with concise messages.
- Push completed repo-rule, plugin, CLI, MCP, and skill changes to the dev branch, then open a PR.
