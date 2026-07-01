---
name: skyagent-progression
description: Inspect SkyBlock progression sections, XP curves, weight estimates, and activity readiness with SkyAgent. Use for skills, Dungeons, Slayer, Mining/HotM, Garden, Bestiary, Collections, Crimson Isle/Kuudra, Rift, Trophy Fishing, Pets, Essence, currencies, unlocks, and readiness.
---

# SkyAgent Progression

Use this skill when the user asks where their profile stands or whether they are ready for an activity.

## Tool Routing

- Use `skyblock_profile_section` for one section.
- Use `skyblock_progression` for all section summaries.
- Use `skyblock_weight` for labeled weight estimates and unsupported exact Senither/Lily status.
- Use `skyblock_readiness` for `dungeons`, `slayer`, `kuudra`, `garden`, or `mining`.

## Rules

- Preserve source fields, formulas/tables, warnings, and assumptions.
- Treat readiness and weight as heuristics unless exact maintained formulas are bundled.
- Distinguish missing API data from real zero progress.
