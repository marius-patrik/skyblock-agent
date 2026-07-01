---
name: skyagent-progression
description: Inspect SkyBlock progression sections and XP curves with SkyAgent. Use for skills, Catacombs, Slayer, Bestiary, Collections, Minions, Museum, Garden, Mining/HotM, Crimson Isle/Kuudra, Rift, Trophy Fishing, Pets, Essence, currencies, unlocks, source fields, formulas, and missing-data limits.
metadata:
  display_name: "SkyAgent Progression"
  short_description: "Summarize profile progression."
  default_prompt: "Use $skyagent-progression to check my Dungeons and Mining readiness."
---

# SkyAgent Progression

Use this skill when the user asks where their profile stands, wants SkyCrypt-style section summaries, or needs profile progress broken down by game system.

## Tool Routing

- Use `skyblock_profile_section` for one section: `skills`, `dungeons`/`catacombs`, `slayer`, `bestiary`, `collections`, `minions`, `museum`, `garden`, `mining`/`hotm`, `crimson_isle`/`kuudra`, `rift`, `trophy_fishing`, `pets`, `essence`, `currencies`, or `unlocks`.
- Use `skyblock_progression` for all section summaries, cross-section comparisons, source-field provenance, and missing-data warnings.
- Route Senither/Lily-style weight, unsupported exact formulas, or activity readiness to `$skyagent-readiness-weight`.

## Rules

- Preserve source fields, formula/table provenance, warnings, and assumptions.
- Name the XP curve or summary formula used for skills, Catacombs, Slayer, HotM, Garden, or section summaries when present.
- Distinguish missing API data from real zero progress.
- Treat absent sections, disabled APIs, and partial profile payloads as missing data, not as proof the user has no progress.
- Verify current external meta before making patch-sensitive claims about Dungeons, Slayer, Kuudra, Garden, Mining, or Rift priorities.
