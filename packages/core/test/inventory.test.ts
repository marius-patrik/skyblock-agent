import { gzipSync } from "node:zlib";
import { describe, expect, test } from "bun:test";
import nbt from "prismarine-nbt";
import { decodeHypixelNbt, NbtDecodeError } from "../src/nbt.ts";
import { inventoryFromMember, inventorySectionFromMember } from "../src/inventory.ts";

function item(slot: number, id: string, internalId: string, count = 1, displayName = internalId) {
  return {
    Slot: { type: "byte", value: slot },
    id: { type: "string", value: id },
    Count: { type: "byte", value: count },
    Damage: { type: "short", value: 0 },
    tag: {
      type: "compound",
      value: {
        display: {
          type: "compound",
          value: {
            Name: { type: "string", value: displayName },
          },
        },
        ExtraAttributes: {
          type: "compound",
          value: {
            id: { type: "string", value: internalId },
          },
        },
      },
    },
  };
}

function payload(items) {
  const root = {
    type: "compound",
    name: "",
    value: {
      i: {
        type: "list",
        value: {
          type: "compound",
          value: items,
        },
      },
    },
  };
  return gzipSync(nbt.writeUncompressed(root as any)).toString("base64");
}

describe("NBT decoding", () => {
  test("decodes Hypixel base64 gzipped NBT payloads", async () => {
    const decoded = await decodeHypixelNbt({ data: payload([item(0, "minecraft:stone", "ASPECT_OF_THE_END")]) });

    expect(decoded.parser).toBe("prismarine-nbt");
    expect((decoded.simplified as any).i[0].tag.ExtraAttributes.id).toBe("ASPECT_OF_THE_END");
  });

  test("throws structured errors for corrupt NBT", async () => {
    await expect(decodeHypixelNbt({ data: Buffer.from("not-nbt").toString("base64") })).rejects.toBeInstanceOf(NbtDecodeError);
    await expect(decodeHypixelNbt({ data: Buffer.from("not-nbt").toString("base64") })).rejects.toHaveProperty("code", "corrupt_nbt_payload");
  });
});

describe("inventory extraction", () => {
  test("extracts current inventory API sections", async () => {
    const member = {
      inventory: {
        inv_contents: { data: payload([item(3, "minecraft:diamond_sword", "HYPERION", 1, "Hyperion")]) },
        inv_armor: { data: payload([item(0, "minecraft:leather_chestplate", "SUPERIOR_DRAGON_CHESTPLATE")]) },
      },
    };

    const inventory = await inventoryFromMember(member);
    const main = inventory.sections.find((section) => section.section === "inventory")!;
    const armor = inventory.sections.find((section) => section.section === "armor")!;

    expect(main.available).toBe(true);
    expect(main.items[0].internalId).toBe("HYPERION");
    expect(main.items[0].slot).toBe(3);
    expect(main.items[0].raw).toBeUndefined();
    expect(armor.items[0].internalId).toBe("SUPERIOR_DRAGON_CHESTPLATE");
    expect(inventory.itemCount).toBe(2);
  });

  test("keeps raw decoded item data behind debugRaw", async () => {
    const section = await inventorySectionFromMember({
      inventory: {
        inv_contents: { data: payload([item(0, "minecraft:stick", "ASPECT_OF_THE_END")]) },
      },
    }, "inventory", { debugRaw: true });

    expect(section.items[0].raw.tag.ExtraAttributes.id).toBe("ASPECT_OF_THE_END");
    expect((section as any).decoded.i[0].tag.ExtraAttributes.id).toBe("ASPECT_OF_THE_END");
  });

  test("extracts legacy member-level sections", async () => {
    const section = await inventorySectionFromMember({
      inv_contents: { data: payload([item(0, "minecraft:stick", "ASPECT_OF_THE_END")]) },
    }, "inventory");

    expect(section.available).toBe(true);
    expect(section.sourcePath).toBe("inv_contents");
    expect(section.items[0].internalId).toBe("ASPECT_OF_THE_END");
  });

  test("extracts legacy misspelled equipment sections", async () => {
    const section = await inventorySectionFromMember({
      equippment_contents: { data: payload([item(0, "minecraft:leather_boots", "SHADOW_ASSASSIN_BOOTS")]) },
    }, "equipment");

    expect(section.available).toBe(true);
    expect(section.sourcePath).toBe("equippment_contents");
    expect(section.items[0].internalId).toBe("SHADOW_ASSASSIN_BOOTS");
  });

  test("extracts backpack payload maps and keeps container IDs", async () => {
    const section = await inventorySectionFromMember({
      inventory: {
        backpack_contents: {
          backpack_0: { data: payload([item(0, "minecraft:gold_ingot", "ENCHANTED_GOLD")]) },
          backpack_1: { data: payload([item(1, "minecraft:coal", "ENCHANTED_COAL", 8)]) },
        },
      },
    }, "backpacks");

    expect(section.available).toBe(true);
    expect(section.itemCount).toBe(2);
    expect(section.items.map((stack) => stack.containerId)).toEqual(["backpack_0", "backpack_1"]);
    expect(section.warnings).toEqual([]);
  });

  test("extracts backpack payload arrays and keeps index container IDs", async () => {
    const section = await inventorySectionFromMember({
      backpack_contents: [
        { data: payload([item(0, "minecraft:gold_ingot", "ENCHANTED_GOLD")]) },
        { data: payload([item(1, "minecraft:coal", "ENCHANTED_COAL", 8)]) },
      ],
    }, "backpacks");

    expect(section.available).toBe(true);
    expect(section.itemCount).toBe(2);
    expect(section.items.map((stack) => stack.containerId)).toEqual(["0", "1"]);
    expect(section.warnings).toEqual([]);
  });

  test("extracts personal vault contents", async () => {
    const section = await inventorySectionFromMember({
      inventory: {
        personal_vault_contents: { data: payload([item(4, "minecraft:gold_sword", "MIDAS_SWORD", 1, "Midas' Sword")]) },
      },
    }, "personal_vault");

    expect(section.available).toBe(true);
    expect(section.sourcePath).toBe("inventory.personal_vault_contents");
    expect(section.itemCount).toBe(1);
    expect(section.items[0]).toMatchObject({
      internalId: "MIDAS_SWORD",
      displayName: "Midas' Sword",
      sourcePath: "inventory.personal_vault_contents",
      slot: 4,
    });
  });

  test("extracts current accessory bag from the inventory bag map talisman payload", async () => {
    const section = await inventorySectionFromMember({
      inventory: {
        bag_contents: {
          sacks_bag: { data: payload([item(0, "minecraft:wheat", "WHEAT")]) },
          talisman_bag: { data: payload([item(1, "minecraft:skull", "BAT_ARTIFACT")]) },
        },
      },
    }, "accessory_bag");

    expect(section.available).toBe(true);
    expect(section.sourcePath).toBe("inventory.bag_contents.talisman_bag");
    expect(section.itemCount).toBe(1);
    expect(section.items[0].internalId).toBe("BAT_ARTIFACT");
  });

  test("extracts current loadout armor as wardrobe data", async () => {
    const section = await inventorySectionFromMember({
      loadout: {
        armor: {
          "1": {
            id: 1,
            HELMET: { data: payload([item(0, "minecraft:skull", "NECRON_HELMET")]) },
            CHESTPLATE: { data: payload([item(0, "minecraft:leather_chestplate", "NECRON_CHESTPLATE")]) },
            LEGGINGS: { data: payload([item(0, "minecraft:leather_leggings", "NECRON_LEGGINGS")]) },
            BOOTS: { data: payload([item(0, "minecraft:leather_boots", "NECRON_BOOTS")]) },
          },
        },
      },
    }, "wardrobe");

    expect(section.available).toBe(true);
    expect(section.sourcePath).toBe("loadout.armor");
    expect((section as any).sourceKind).toBe("loadout_armor_fallback");
    expect((section as any).currentLoadoutFallback).toBe(true);
    expect(section.itemCount).toBe(4);
    expect(section.items.map((stack) => stack.containerId)).toEqual(["1:HELMET", "1:CHESTPLATE", "1:LEGGINGS", "1:BOOTS"]);
    expect(section.items.map((stack) => stack.loadoutSlot)).toEqual(["1", "1", "1", "1"]);
    expect(section.items.map((stack) => stack.internalId)).toEqual(["NECRON_HELMET", "NECRON_CHESTPLATE", "NECRON_LEGGINGS", "NECRON_BOOTS"]);
    expect(section.items[0]).toMatchObject({
      wardrobeSource: "loadout_armor_fallback",
      current: null,
      loadoutSlot: "1",
      armorSlot: "HELMET",
    });
    expect(section.warnings).toContainEqual(expect.objectContaining({ code: "current_loadout_unknown" }));
  });

  test("extracts direct wardrobe payloads as true wardrobe contents", async () => {
    const section = await inventorySectionFromMember({
      inventory: {
        wardrobe_contents: { data: payload([item(0, "minecraft:skull", "NECRON_HELMET")]) },
      },
    }, "wardrobe");

    expect(section.available).toBe(true);
    expect(section.sourcePath).toBe("inventory.wardrobe_contents");
    expect((section as any).sourceKind).toBe("wardrobe_contents");
    expect((section as any).currentLoadoutFallback).toBe(false);
    expect(section.items[0]).toMatchObject({
      internalId: "NECRON_HELMET",
      wardrobeSource: "wardrobe_contents",
      current: false,
    });
  });

  test("extracts direct loadout armor piece maps as wardrobe data", async () => {
    const section = await inventorySectionFromMember({
      loadout: {
        armor: {
          HELMET: { data: payload([item(0, "minecraft:skull", "NECRON_HELMET")]) },
          CHESTPLATE: { data: payload([item(0, "minecraft:leather_chestplate", "NECRON_CHESTPLATE")]) },
          LEGGINGS: { data: payload([item(0, "minecraft:leather_leggings", "NECRON_LEGGINGS")]) },
          BOOTS: { data: payload([item(0, "minecraft:leather_boots", "NECRON_BOOTS")]) },
        },
      },
    }, "wardrobe");

    expect(section.available).toBe(true);
    expect(section.itemCount).toBe(4);
    expect(section.items.map((stack) => stack.containerId)).toEqual(["HELMET", "CHESTPLATE", "LEGGINGS", "BOOTS"]);
    expect(section.items.map((stack) => stack.armorSlot)).toEqual(["HELMET", "CHESTPLATE", "LEGGINGS", "BOOTS"]);
    expect(section.warnings).toEqual([]);
  });

  test("extracts direct loadout armor payload lists as wardrobe data", async () => {
    const section = await inventorySectionFromMember({
      loadout: {
        armor: [
          { data: payload([item(0, "minecraft:skull", "NECRON_HELMET")]) },
          { data: payload([item(0, "minecraft:leather_chestplate", "NECRON_CHESTPLATE")]) },
          { data: payload([item(0, "minecraft:leather_leggings", "NECRON_LEGGINGS")]) },
          { data: payload([item(0, "minecraft:leather_boots", "NECRON_BOOTS")]) },
        ],
      },
    }, "wardrobe");

    expect(section.available).toBe(true);
    expect(section.itemCount).toBe(4);
    expect(section.items.map((stack) => stack.containerId)).toEqual(["0", "1", "2", "3"]);
    expect(section.items.map((stack) => stack.loadoutSlot)).toEqual([null, null, null, null]);
    expect(section.items.map((stack) => stack.armorSlot)).toEqual(["HELMET", "CHESTPLATE", "LEGGINGS", "BOOTS"]);
    expect(section.warnings).toEqual([]);
  });

  test("warns when current loadout armor data is partial", async () => {
    const section = await inventorySectionFromMember({
      loadout: {
        armor: {
          "1": {
            id: 1,
            HELMET: { data: payload([item(0, "minecraft:skull", "NECRON_HELMET")]) },
            CHESTPLATE: { data: payload([item(0, "minecraft:leather_chestplate", "NECRON_CHESTPLATE")]) },
          },
        },
      },
    }, "wardrobe");

    expect(section.available).toBe(true);
    expect(section.itemCount).toBe(2);
    expect(section.warnings).toContainEqual({
      code: "partial_loadout_armor",
      message: "Loadout armor slot 1 is missing LEGGINGS, BOOTS.",
      sourcePath: "loadout.armor.1",
      missingPieces: ["LEGGINGS", "BOOTS"],
    });
  });

  test("preserves warnings for corrupt backpack payloads", async () => {
    const section = await inventorySectionFromMember({
      inventory: {
        backpack_contents: {
          backpack_0: { data: payload([item(0, "minecraft:gold_ingot", "ENCHANTED_GOLD")]) },
          backpack_1: { data: Buffer.from("bad").toString("base64") },
        },
      },
    }, "backpacks");

    expect(section.itemCount).toBe(1);
    expect(section.items[0].containerId).toBe("backpack_0");
    expect(section.warnings[0].code).toBe("corrupt_nbt_payload");
    expect(section.warnings[0].sourcePath).toBe("inventory.backpack_contents.backpack_1");
  });

  test("decodes hidden storage sections and preserves present-empty state", async () => {
    const member = {
      inventory: {
        inv_contents: { data: payload([item(0, "minecraft:stone", "STONE")]) },
        ender_chest_contents: { data: payload([item(0, "minecraft:ender_pearl", "ENDER_PEARL")]) },
        backpack_contents: {
          backpack_0: { data: payload([item(0, "minecraft:gold_ingot", "ENCHANTED_GOLD")]) },
        },
        personal_vault_contents: { data: payload([]) },
      },
    };

    const inventory = await inventorySectionFromMember(member, "inventory");
    const enderChest = await inventorySectionFromMember(member, "ender_chest");
    const backpacks = await inventorySectionFromMember(member, "backpacks");
    const personalVault = await inventorySectionFromMember(member, "personal_vault");

    expect(inventory).toMatchObject({ available: true, itemCount: 1, sourcePath: "inventory.inv_contents" });
    expect(enderChest).toMatchObject({ available: true, itemCount: 1, sourcePath: "inventory.ender_chest_contents" });
    expect(backpacks).toMatchObject({ available: true, itemCount: 1, sourcePath: "inventory.backpack_contents" });
    expect(personalVault).toMatchObject({ available: true, itemCount: 0, sourcePath: "inventory.personal_vault_contents" });
    expect(personalVault.warnings).toEqual([]);
  });

  test("classifies hidden storage corrupt, unsupported, and missing states with warnings", async () => {
    const corrupt = await inventorySectionFromMember({
      inventory: {
        ender_chest_contents: { data: Buffer.from("bad").toString("base64") },
      },
    }, "ender_chest");
    const unsupported = await inventorySectionFromMember({
      inventory: {
        backpack_contents: { unexpected: { item: "not-nbt" } },
      },
    }, "backpacks");
    const missing = await inventorySectionFromMember({}, "personal_vault");

    expect(corrupt).toMatchObject({ available: true, itemCount: 0 });
    expect(corrupt.warnings).toContainEqual(expect.objectContaining({
      code: "corrupt_nbt_payload",
      sourcePath: "inventory.ender_chest_contents",
    }));
    expect(unsupported).toMatchObject({ available: true, itemCount: 0 });
    expect(unsupported.warnings).toContainEqual(expect.objectContaining({ code: "unsupported_section_shape" }));
    expect(unsupported.warnings[0].sourcePath).toBeUndefined();
    expect(missing).toMatchObject({ available: false, itemCount: 0 });
    expect(missing.warnings).toContainEqual(expect.objectContaining({ code: "missing_section" }));
  });

  test("treats present empty pet lists as available empty data", async () => {
    const section = await inventorySectionFromMember({ pets: [] }, "pets");

    expect(section.available).toBe(true);
    expect(section.itemCount).toBe(0);
    expect(section.warnings).toEqual([]);
  });

  test("extracts current pets_data pets as pet inventory items", async () => {
    const section = await inventorySectionFromMember({
      pets_data: {
        pets: [
          { type: "GOLDEN_DRAGON", tier: "LEGENDARY", exp: 1_000_000, active: true, heldItem: "PET_ITEM_TIER_BOOST" },
        ],
      },
    }, "pets");

    expect(section.available).toBe(true);
    expect(section.sourcePath).toBe("pets_data.pets");
    expect(section.itemCount).toBe(1);
    expect(section.items[0]).toMatchObject({
      internalId: "GOLDEN_DRAGON",
      petType: "GOLDEN_DRAGON",
      displayName: "LEGENDARY GOLDEN DRAGON",
      tier: "LEGENDARY",
      rarity: "LEGENDARY",
      xp: 1_000_000,
      level: null,
      levelSource: null,
      active: true,
      heldItem: "PET_ITEM_TIER_BOOST",
      sourcePath: "pets_data.pets",
      extraAttributes: {
        tier: "LEGENDARY",
        heldItem: "PET_ITEM_TIER_BOOST",
      },
    });
    expect(section.warnings).toContainEqual(expect.objectContaining({
      code: "pet_level_formula_unavailable",
      sourcePath: "pets_data.pets.0.exp",
    }));
  });

  test("extracts legacy pet records with stable fields", async () => {
    const section = await inventorySectionFromMember({
      pets: [
        { type: "ROCK", tier: "RARE", exp: 10, active: false, held_item: "PET_ITEM_IRON_CLAWS", skin: "COBBLESTONE", candy_used: 1 },
      ],
    }, "pets");

    expect(section.available).toBe(true);
    expect(section.sourcePath).toBe("pets");
    expect(section.items[0]).toMatchObject({
      internalId: "ROCK",
      petType: "ROCK",
      displayName: "RARE ROCK",
      tier: "RARE",
      xp: 10,
      active: false,
      heldItem: "PET_ITEM_IRON_CLAWS",
      skin: "COBBLESTONE",
      candyUsed: 1,
      level: null,
    });
  });

  test("reports missing section warnings for disabled or partial inventory APIs", async () => {
    const section = await inventorySectionFromMember({}, "wardrobe");

    expect(section.available).toBe(false);
    expect(section.itemCount).toBe(0);
    expect(section.warnings[0].code).toBe("missing_section");
  });

  test("reports corrupt payload warnings without throwing from section extraction", async () => {
    const section = await inventorySectionFromMember({
      inventory: {
        inv_contents: { data: Buffer.from("bad").toString("base64") },
      },
    }, "inventory");

    expect(section.available).toBe(true);
    expect(section.itemCount).toBe(0);
    expect(section.warnings[0].code).toBe("corrupt_nbt_payload");
  });
});
