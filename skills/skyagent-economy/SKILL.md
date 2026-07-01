---
name: skyagent-economy
description: Analyze SkyBlock prices, auctions, Bazaar data, lowest BIN, price history, and networth with SkyAgent. Use for coin values, item valuation, sectioned networth, unknown prices, provider freshness, and market uncertainty.
---

# SkyAgent Economy

Use this skill when the user asks about coins, prices, networth, Bazaar, auctions, or market freshness.

## Tool Routing

- Use `skyblock_price` for one item price with fallback chain.
- Use `skyblock_lowest_bin` for auctionable item LBIN.
- Use `skyblock_price_history` for historical CoflNet-compatible context.
- Use `skyblock_bazaar`, `skyblock_auctions`, `skyblock_auction`, `skyblock_auctions_ended`, and `skyblock_firesales` for live economy surfaces.
- Use `skyblock_networth` for full sectioned networth.
- Use `skyblock_item_networth` for one inventory section.

## Rules

- Treat `candidatePrice` as partial unless `price` is non-null.
- Carry provider freshness, confidence, fallback chain, and warnings into recommendations.
- Do not invent prices for unknown or unsupported items.
