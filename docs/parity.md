# SkyBlock Tool Parity

SkyAgent currently covers official Hypixel API transport and light profile-viewer abstractions. It is not yet at SkyCrypt or Discord bot feature parity.

For the detailed implementation spec and future issue slices, see `docs/parity-spec.md`.

## Covered

- Mojang username to UUID resolution.
- Hypixel v2 raw request escape hatch.
- Player, status, SkyBlock profiles, profile by ID, museum, garden, player bingo.
- Public SkyBlock resources: collections, skills, items, election, bingo.
- Public economy/event surfaces: Bazaar, auctions, ended auctions, fire sales.
- Compact profile summaries, selected member extraction, overview metadata, and SkyCrypt URL generation.
- Local config and memory storage outside the repo.
- Conservative sectioned networth for purse, bank, and resolved direct item prices, with unknown prices and assumptions surfaced.
- Accessory bag analysis with duplicate detection, recombobulation/enrichment signals, estimated Magical Power, missing accessories when metadata is available, and price-driven coin-per-MP upgrade ranking.
- Shared progression section framework with skill, Catacombs, Slayer XP curves plus sections for skills, Dungeons, Slayer, Mining/HotM, Garden, Bestiary, Collections, Minions, Museum, Crimson Isle/Kuudra, Rift, Trophy Fishing, Pets, Essence, currencies, and unlocks. Outputs include source fields, missing-data warnings, formulas/tables, and provenance.

## Missing for SkyCrypt-Style Parity

- Inventory decoding for base64 gzipped NBT fields.
- Item normalization, enchantments, attributes, reforges, gemstones, stars, dungeon quality, and item lore parsing.
- Armor, equipment, weapons, wardrobe, inventory, ender chest, backpack, vault, and accessory bag section views.
- SkyCrypt/SkyHelper-grade networth calculation, including modifier, pet-level, skin, dye, museum, and miscellaneous valuables.
- SkyHelper-grade missing accessories when a full maintained accessory universe is unavailable.
- Full profile-viewer depth inside each progression section, including detailed SkyCrypt-grade UI breakdowns, per-floor dungeon badges, exact Garden milestone tables, full Museum item valuation, and richer Crimson Isle/Rift objective readiness.
- Weight calculations such as Senither/Lily-style weight.
- Historical price sources and full lowest-BIN search beyond bounded auction-page scans.

## Current Networth Limits

- Direct item IDs are valued through the price provider layer; unresolved prices are listed under `unknownPrices` and excluded from totals.
- Purse and bank are included.
- Inventory sections are separated for armor, equipment, wardrobe, inventory, ender chest, backpacks, accessory bag, personal vault, and pets when exposed by the Hypixel profile payload.
- Item modifiers, pet levels, skins, dyes, attributes, enchantments, gemstones, recombobulation, and museum state are preserved as assumptions/context but are not independently valued yet.
- Results include provider freshness and confidence metadata and should be treated as estimates, not authoritative SkyCrypt/SkyHelper replacements.

## Current Accessory Limits

- Magical Power is estimated from accessory rarity and recombobulation state unless provider metadata supplies an exact MP value.
- Missing accessories require accessory universe metadata. When no full provider is configured, SkyAgent reports owned accessory state and a structured warning instead of inventing missing items.
- Upgrade rankings include only resolved prices; unknown and partial candidate prices are surfaced but excluded from budget rankings.
- Accessory family/upgrade-chain handling depends on explicit provider metadata. Hypixel item resources do not expose upgrade-chain families, so those IDs are treated as their own families until a richer maintained provider is configured.
- Budget rankings recommend only the next missing MP step per accessory family until provider metadata can model cumulative chain dependencies.

## Common Tool Signals

- SkyCrypt presents profile viewer sections such as stats, skills, armor, weapons, accessories, and uses Hypixel API, NotEnoughUpdates data, and SkyHelper Networth.
- SkyHelper-style bots commonly expose networth, item networth, profile lookup by user/profile, and utility endpoints such as Fetchur.
- Discord bot lists commonly advertise networth, missing accessories/talismans, stat optimization, bazaar prices, lowest BIN, auctions, minions, timers, updates, profile stats, skills, Dungeons, and Slayer.

## Next Implementation Layers

1. Add an inventory/NBT parser and section extractors.
2. Add item metadata from NotEnoughUpdates or another maintained item dataset.
3. Add price providers for Bazaar, lowest BIN, and optional third-party historical prices.
4. Add networth and missing-accessory calculators.
5. Deepen implemented profile modules with exact SkyCrypt/SkyHelper formulas, maintained metadata tables, readiness scoring, and weight calculations.
