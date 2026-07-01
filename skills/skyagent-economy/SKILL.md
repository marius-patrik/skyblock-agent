---
name: skyagent-economy
description: Analyze SkyBlock prices, auctions, Bazaar data, lowest BIN, price history, provider freshness, stale-cache behavior, and networth with SkyAgent. Use for coin values, item valuation, sectioned networth, item networth, unknown prices, third-party uncertainty, and market volatility.
---

# SkyAgent Economy

Use this skill when the user asks about coins, prices, networth, Bazaar, auctions, LBIN, price history, provider confidence, stale caches, third-party uncertainty, or volatile markets.

## Tool Routing

- Use `skyblock_price` for one item price with provider confidence, fallback chain, cache status, stale status, and warnings.
- Use `skyblock_lowest_bin` for auctionable item LBIN and bounded Hypixel auction-scan candidates.
- Use `skyblock_price_history` for historical CoflNet-compatible context, trend checks, and volatility context.
- Use `skyblock_bazaar`, `skyblock_auctions`, `skyblock_auction`, `skyblock_auctions_ended`, and `skyblock_firesales` for live economy surfaces.
- Use `skyblock_networth` for full sectioned networth, purse/bank/item totals, unknown prices, assumptions, and provider freshness.
- Use `skyblock_item_networth` for one inventory section such as armor, equipment, wardrobe, backpacks, accessory bag, or pets.

## Rules

- Treat `candidatePrice` as partial unless `price` is non-null.
- Carry provider freshness, confidence, fallback chain, cache status, stale status, and warnings into recommendations.
- Call out third-party uncertainty for CoflNet-compatible LBIN/history and any community/provider-derived data.
- Treat prices as volatile; avoid strong buy/sell timing claims without recent provider data and history.
- Do not invent prices for unknown or unsupported items.
- Do not add unknown prices into networth totals; list them as missing value coverage instead.
- When provider data is stale or low confidence, describe the value as advisory rather than definitive.
- For budget-sensitive advice, compare resolved price against the stated budget and exclude unresolved or over-budget items from buyable recommendations.
