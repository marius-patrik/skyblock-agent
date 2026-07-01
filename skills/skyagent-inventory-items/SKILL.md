---
name: skyagent-inventory-items
description: Decode SkyBlock inventory sections and normalize item records with SkyAgent. Use for armor, equipment, wardrobe, inventory, ender chest, backpacks, accessory bag, personal vault, pets, raw item dumps, NBT state, item metadata, and item modifier reasoning.
---

# SkyAgent Inventory/Items

Use this skill when the task depends on item stacks or inventory API state.

## Tool Routing

- Use `skyblock_inventory` for all supported sections.
- Use `skyblock_inventory_section` for one section.
- Use `skyblock_item_dump` when debugging raw decoded item records.
- Use `skyblock_normalized_items` before item reasoning across sections.
- Use `skyblock_item_metadata` for NotEnoughUpdates-style item details.

## Rules

- Keep raw decoded NBT behind explicit debug requests.
- Report missing or disabled inventory API sections as warnings.
- Do not infer item modifiers that are not present in normalized records.
