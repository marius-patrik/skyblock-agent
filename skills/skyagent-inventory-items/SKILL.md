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
- Use `skyblock_item_metadata` for NotEnoughUpdates-style item details, display names, rarity, category, NPC sale data, upgrade metadata, or fallback item identity.

## Rules

- Prefer normalized output for recommendations and summaries; request raw decoded debug data only when the user asks for parser details, missing fields, or exact NBT.
- Keep raw decoded NBT behind explicit debug requests.
- Report disabled inventory API, missing sections, or partial profile data as warnings instead of treating them as empty inventories.
- For corrupt NBT, preserve the affected section/container ID when available, warn clearly, and continue with unaffected sections.
- If item metadata is unavailable, continue with normalized item IDs and mark metadata-backed fields as unavailable.
- Do not infer item modifiers that are not present in normalized records.
