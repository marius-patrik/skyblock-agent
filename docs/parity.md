# SkyBlock Tool Parity

SkyAgent covers official Hypixel API transport, profile context, inventory parsing, item normalization, economy estimates, progression sections, planning primitives, and local agent surfaces. It is still not at full SkyCrypt or Discord bot feature parity.

For the detailed implementation spec and future issue slices, see `docs/parity-spec.md`.
For the current 2.0 public-readiness gap map and owning issues, see `docs/public-readiness-gaps.md`.

## Covered

- Mojang username to UUID resolution.
- Hypixel v2 raw request escape hatch.
- Player, status, SkyBlock profiles, profile by ID, museum, garden, player bingo.
- Public SkyBlock resources: collections, skills, items, election, bingo.
- Public economy/event surfaces: Bazaar, auctions, ended auctions, fire sales.
- Compact profile summaries, selected member extraction, overview metadata, and SkyCrypt URL generation.
- Local config and memory storage outside the repo.
- Inventory decoding for base64 gzipped NBT fields, including current and legacy inventory sections, wardrobe/loadout armor, backpacks, accessory bag, personal vault, and pets when exposed by the profile payload.
- Deterministic item normalization for common SkyBlock item records, including IDs, rarity/category/count, reforges, enchantments, attributes, gemstones, dungeon modifiers, recombobulation, pet info, metadata provider provenance, provider freshness, and modifier/pet/skin/dye/Museum uncertainty.
- Conservative sectioned networth for purse, bank, and resolved direct item prices, with unknown prices, price-provider freshness, item metadata freshness, modifier uncertainty, and assumptions surfaced.
- Accessory bag analysis with duplicate detection, recombobulation/enrichment signals, estimated Magical Power, missing accessories when metadata is available, provider-backed family confidence, incomplete family-chain warnings, and price-driven coin-per-MP upgrade ranking.
- Shared progression section framework with skill, Catacombs, Slayer XP curves plus sections for skills, Dungeons, Slayer, Mining/HotM, Garden, Bestiary, Collections, Minions, Museum, Crimson Isle/Kuudra, Rift, Trophy Fishing, Pets, Essence, currencies, and unlocks. Outputs include source fields, missing-data warnings, formulas/tables, and provenance.
- Weight and readiness estimators for broad profile comparison and dungeons, Slayer, Kuudra, Garden, and Mining readiness. Exact Senither/Lily formulas are explicitly marked unsupported until maintained formula tables are bundled.
- Deterministic goal planner and next-upgrade output that compose networth, accessory upgrades, readiness, memories/config context, source freshness, assumptions, warnings, and route candidates for money, farming/Garden, Dungeon, Kuudra, and budgeted upgrade/source goals.
- Recommendation-grade pet and wardrobe/loadout normalization for agent context: pets expose stable type, tier, XP, active state, held item, skin, candy count, source path, and explicit missing level-formula warnings; wardrobe output distinguishes true wardrobe contents from loadout armor fallback with loadout slot, armor slot, current/unknown state, partial-loadout warnings, and source metadata.

## Missing for SkyCrypt-Style Parity

- SkyCrypt/SkyHelper-grade networth calculation, including maintained value providers for modifiers, pet levels, skins, dyes, museum, and miscellaneous valuables. SkyAgent now exposes uncertainty for these fields but still does not price them independently.
- SkyHelper-grade missing accessories when a full maintained accessory universe is unavailable.
- Compact startup context that includes all hidden storage, sacks, Museum signals, profile availability flags, and coop/member provenance.
- Full SkyCrypt/SkyHelper-grade Museum donation planning for every special case and maintained donatable item table. SkyAgent now has conservative owned/hidden/missing candidate routing, but unsupported eligibility/value cases remain warning-backed.
- Full profile-viewer depth inside each progression section, including detailed SkyCrypt-grade UI breakdowns, per-floor dungeon badges, exact Garden milestone tables, full Museum item valuation, and richer Crimson Isle/Rift objective readiness.
- Exact Senither/Lily weight parity and maintained reference-formula synchronization.
- Full DPS simulation, party-finder acceptance modeling, and maintained volatile meta thresholds for specific Slayer bosses/tiers, Dungeon floors, Kuudra tiers, and damage goals.
- Deep goal-specific route optimization with exact gear, pet, class, party-finder, profit-rate, farming crop, and time-to-complete models. SkyAgent has conservative route modules for money, farming, Dungeon, and Kuudra, but exact optimization and current meta thresholds remain unsupported without maintained providers.
- Historical price sources and full lowest-BIN search beyond bounded auction-page scans.

## Current Networth Limits

- Direct item IDs are valued through the price provider layer; unresolved prices are listed under `unknownPrices` and excluded from totals.
- Purse and bank are included.
- Inventory sections are separated for armor, equipment, wardrobe, inventory, ender chest, backpacks, accessory bag, personal vault, and pets when exposed by the Hypixel profile payload.
- Item modifiers, pet XP/level inputs, skins, dyes, attributes, enchantments, gemstones, recombobulation, dungeon quality, and Museum eligibility/value uncertainty are preserved on normalized item and networth records with provider freshness. Combat readiness consumes gear/modifier presence as blockers, but these fields are not independently valued yet.
- Pet XP is preserved, but exact pet level is not derived until a maintained pet XP formula/provider is bundled. Pet networth, pet score, and skin valuation are explicitly marked unsupported/observed-unvalued rather than treated as SkyCrypt/SkyHelper parity.
- Results include provider freshness, provider authority, cache/fetched-at status, confidence metadata, unsupported-value warnings, and should be treated as estimates, not authoritative SkyCrypt/SkyHelper replacements.

## Current Accessory Limits

- Magical Power is estimated from accessory rarity and recombobulation state unless provider metadata supplies an exact MP value.
- Missing accessories require accessory universe metadata. When no full provider is configured, SkyAgent reports owned accessory state and a structured warning instead of inventing missing items.
- Upgrade rankings include only resolved prices; unknown and partial candidate prices are surfaced but excluded from budget rankings.
- Accessory family/upgrade-chain handling depends on explicit provider metadata. Outputs include `familyConfidence`, family provider freshness, and warnings when Hypixel item resources or fallback metadata cannot model upgrade-chain dependencies.
- Budget rankings recommend only the next missing MP step per accessory family until provider metadata can model cumulative chain dependencies.

## Common Tool Signals

- SkyCrypt presents profile viewer sections such as stats, skills, armor, weapons, accessories, and uses Hypixel API, NotEnoughUpdates data, and SkyHelper Networth.
- SkyHelper-style bots commonly expose networth, item networth, profile lookup by user/profile, and utility endpoints such as Fetchur.
- Discord bot lists commonly advertise networth, missing accessories/talismans, stat optimization, bazaar prices, lowest BIN, auctions, minions, timers, updates, profile stats, skills, Dungeons, and Slayer.

## Next Implementation Layers

1. Expand compact startup context with hidden storage, Museum, sacks, coop, and availability signals.
2. Deepen Museum donation planning with maintained donatable item metadata, XP/value tiers, and special-case eligibility.
3. Deepen target-aware readiness with maintained meta thresholds and route-specific alternatives beyond the current gear, pet, accessory, modifier, and budget blocker checks.
4. Deepen route-specific planner modules with maintained profit/time models, crop/contest formulas, and richer source/snipe routing.
5. Add maintained provider adapters for exact pet level formulas, skin/dye value, Museum eligibility/value, accessory dependency chains, and modifier valuation.
6. Keep cross-surface parity tests green so CLI, MCP, gateway, TUI, docs, and skills stay aligned. The current contract inventory lives in `packages/core/src/surface-contracts.ts`, including the dedicated non-chat TUI screens.
