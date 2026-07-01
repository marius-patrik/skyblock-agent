---
name: skyagent-accessories
description: Analyze SkyBlock networth-adjacent accessories and upgrade priority with SkyAgent. Use for networth, item networth, Magical Power, accessory bag state, duplicates, recombobulation/enrichment signals, missing accessories, budget-constrained coin-per-MP upgrades, missing prices, and provider uncertainty.
metadata:
  display_name: "SkyAgent Accessories"
  short_description: "Rank Magical Power upgrades."
  default_prompt: "Use $skyagent-accessories to find my best accessory upgrades under budget."
---

# SkyAgent Accessories

Use this skill for talismans/accessories, Magical Power, accessory-bag state, networth context, missing accessories, and budget-constrained upgrade rankings.

## Tool Routing

- Use `skyblock_accessories` for owned state, active family tiers, duplicates, recombobulation/enrichment signals, ignored duplicates, and MP estimate.
- Use `skyblock_missing_accessories` for missing accessories, family coverage, unresolved candidates, and cheapest missing candidates.
- Use `skyblock_accessory_upgrades` for budget-constrained coin-per-MP rankings and buyable upgrade lists.
- Use `skyblock_networth` when accessory decisions need full sectioned networth, purse/bank context, unknown prices, or the user's total coin position.
- Use `skyblock_item_networth` for accessory-bag item networth, sectioned item networth, or when the user asks about one inventory section's coin value.
- Pair with `skyblock_price` only when inspecting one candidate manually or verifying a surprising candidate price.

## Rules

- Explain MP as estimated unless exact provider metadata is present.
- Treat full networth and accessory-bag item networth as conservative because unresolved prices, modifier valuation, and provider confidence can change totals.
- Do not recommend unresolved, missing-price, or over-budget upgrades as buyable.
- Carry accessory metadata-provider limitations, provider confidence, fallback chain, and stale-cache warnings into the answer.
- Rank budget-constrained upgrades by resolved coin-per-MP, but preserve prerequisites and duplicate-family rules before recommending a purchase.
- If prices are missing, do not claim a cheapest upgrade or coin-per-MP route; identify the missing price coverage instead.
- If the accessory universe metadata is incomplete, describe missing-accessory coverage as partial rather than complete.
- Treat third-party price and metadata providers as uncertain and economy-sensitive.
