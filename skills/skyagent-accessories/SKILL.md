---
name: skyagent-accessories
description: Analyze SkyBlock accessories and upgrade priority with SkyAgent. Use for Magical Power, accessory bag state, duplicates, recombobulation/enrichment signals, missing accessories, and budget-constrained coin-per-MP upgrades.
---

# SkyAgent Accessories

Use this skill for talismans/accessories, Magical Power, and upgrade rankings.

## Tool Routing

- Use `skyblock_accessories` for owned state, active family tiers, duplicates, and MP estimate.
- Use `skyblock_missing_accessories` for missing and cheapest missing candidates.
- Use `skyblock_accessory_upgrades` for budget-constrained coin-per-MP rankings.
- Pair with `skyblock_price` only when inspecting one candidate manually.

## Rules

- Explain MP as estimated unless exact provider metadata is present.
- Do not recommend unresolved or over-budget upgrades as buyable.
- Carry accessory metadata-provider limitations into the answer.
