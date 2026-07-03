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
- For broad agent passes, bound price fanout with `maxPriceLookups` and `timeoutMs`; request larger limits only when the user explicitly wants a deeper accessory sweep.
- Use `skyblock_networth` when accessory decisions need full sectioned networth, purse/bank context, unknown prices, or the user's total coin position.
- Use `skyblock_item_networth` for accessory-bag item networth, sectioned item networth, or when the user asks about one inventory section's coin value.
- Pair with `skyblock_price` only when inspecting one candidate manually or verifying a surprising candidate price.
- Use `$skyagent-context-engine` before broad Magical Power planning; prefer `skyagent_start` when no startup payload is present so objective summaries, coin position, server status, recent events, provider freshness, and follow-up tools are loaded.
- Use `$skyagent-objectives` when accepted accessory upgrades should become buy-list entries, source-item entries, or snipe targets with target prices and warnings.
- Use `$skyagent-live-progress` when recent purchases, profile refreshes, or provider/cache events may change owned accessories or prices.

## Rules

- Explain MP as estimated unless exact provider metadata is present.
- If accessory output is `partial`, treat cheapest-missing and buyable lists as a bounded first pass and preserve limit, timeout, stale-cache, and missing-price warnings.
- Treat full networth and accessory-bag item networth as conservative because unresolved prices, modifier valuation, and provider confidence can change totals.
- Do not recommend unresolved, missing-price, or over-budget upgrades as buyable.
- Carry accessory metadata-provider limitations, family confidence, family provider freshness, provider authority, fallback chain, and stale-cache warnings into the answer.
- Rank budget-constrained upgrades by resolved coin-per-MP, but preserve prerequisites and duplicate-family rules before recommending a purchase.
- If prices are missing, do not claim a cheapest upgrade or coin-per-MP route; identify the missing price coverage instead.
- If the accessory universe metadata or family/dependency metadata is incomplete, describe missing-accessory and upgrade-chain coverage as partial rather than complete.
- Treat third-party price and metadata providers as uncertain and economy-sensitive.
- Refresh context after accessory purchases before recalculating MP, next upgrades, or readiness.
