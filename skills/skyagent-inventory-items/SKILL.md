---
name: skyagent-inventory-items
description: Decode SkyBlock inventory sections and normalize item records with SkyAgent. Use for inventory, armor, equipment, wardrobe, backpacks, accessory bag item dumps, normalized item records, item metadata lookups, raw NBT state, pets, personal vault, and item modifier reasoning.
metadata:
  display_name: "SkyAgent Inventory"
  short_description: "Decode inventories and normalize items."
  default_prompt: "Use $skyagent-inventory-items to inspect my armor and equipment sections."
---

# SkyAgent Inventory/Items

Use this skill when the task depends on item stacks, inventory API state, decoded NBT, normalized item records, or item metadata.

## Tool Routing

- Use `skyblock_inventory` for all supported sections or when the user asks for broad inventory, armor, equipment, wardrobe, backpacks, accessory bag, personal vault, ender chest, or pets context.
- Use `skyblock_inventory_section` for one named section such as `armor`, `equipment`, `wardrobe`, `inventory`, `ender_chest`, `backpacks`, `accessory_bag`, `personal_vault`, or `pets`.
- Use `skyblock_item_dump` only when the user asks for raw decoded NBT, parser debugging, item dumps, accessory bag item dumps, or exact low-level fields.
- Use `skyblock_normalized_items` before item reasoning across sections, upgrade checks, modifier comparisons, or user-facing item summaries.
- Use `skyblock_item_metadata` for NotEnoughUpdates-style item details, display names, rarity, category, NPC sale data, upgrade metadata, provider authority/freshness, or fallback item identity.
- Use `$skyagent-context-engine` first for broad gear, wardrobe, pets, accessories, hidden storage, Museum, or profile-context questions; prefer `skyagent_start` when no startup payload is present so cached context, storage availability, profile completeness, objective summary, server status, events, and follow-up tool hints are available.
- Use `$skyagent-live-progress` when recent inventory/profile refresh events may explain changed gear, pet swaps, purchases, or missing progress.
- Use `$skyagent-objectives` when item findings should become source-item, buy-list, or snipe-target records.
- For damage, Slayer, or money-route advice, inspect hidden context as well as current gear: wardrobe/loadout fallback, backpacks, ender chest, personal vault, pets, accessories, and museum-related item signals before judging readiness or recommending purchases.
- For Museum goals, prefer `skyblock_museum_donation_plan` for donation candidate routing. Use normalized item records and storage section tools as follow-up evidence when the planner reports uncertain or missing item candidates.

## Rules

- Prefer normalized output for recommendations and summaries; request raw decoded debug data only when the user asks for parser details, missing fields, or exact NBT.
- Keep raw decoded NBT behind explicit debug requests.
- Report disabled inventory API, missing sections, or partial profile data as warnings instead of treating them as empty inventories.
- Treat startup `storage` entries as availability and bounded-summary signals; use section tools only when the user goal requires item-level storage detail.
- For corrupt NBT, preserve the affected section/container ID when available, warn clearly, and continue with unaffected sections.
- If item metadata is unavailable, continue with normalized item IDs and mark metadata-backed fields as unavailable.
- Do not infer item modifiers that are not present in normalized records.
- Preserve `metadataProviderFreshness` and `modifierUncertainty` when explaining pets, skins, dyes, gemstones, attributes, enchants, dungeon quality, or Museum eligibility/value.
- Treat `observed_unvalued`, `unsupported_formula`, and `unsupported_modifier_value` fields as explicit uncertainty, not as priced or exact values.
- Refresh context after meaningful item changes before recalculating plans or readiness.
- If a section parser is missing or disabled, use the narrowest available section/raw debug fallback and mark that section as partial instead of treating it as empty.
