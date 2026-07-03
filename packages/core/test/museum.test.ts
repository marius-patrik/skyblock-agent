import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import nbt from "prismarine-nbt";
import { listObjectiveItems, museumDonationPlanFromContext } from "../src/index.ts";

const uuid = "3206bd83fa494a5e9a1cd165a2728597";
let previousHome: string | undefined;
let tempHome: string;

function item(slot: number, internalId: string, displayName = internalId, options: { museumEligible?: boolean } = {}) {
  const extraAttributes: Record<string, any> = { id: { type: "string", value: internalId } };
  if (options.museumEligible) {
    extraAttributes.museum_eligible = { type: "byte", value: 1 };
  }
  return {
    Slot: { type: "byte", value: slot },
    id: { type: "string", value: "minecraft:skull" },
    Count: { type: "byte", value: 1 },
    Damage: { type: "short", value: 0 },
    tag: {
      type: "compound",
      value: {
        display: { type: "compound", value: { Name: { type: "string", value: displayName } } },
        ExtraAttributes: { type: "compound", value: extraAttributes },
      },
    },
  };
}

function payload(items: any[]) {
  const root = { type: "compound", name: "", value: { i: { type: "list", value: { type: "compound", value: items } } } };
  return gzipSync(nbt.writeUncompressed(root as any)).toString("base64");
}

function context() {
  return {
    uuid,
    profile: {
      profile_id: "profile-1",
      cute_name: "Apple",
      members: { [uuid]: {} },
      museum: {
        members: {
          [uuid]: {
            items: { HYPERION: {} },
            special: {},
            value: 1_000_000,
          },
        },
      },
    },
    member: {
      profile_member_id: uuid,
      inventory: {
        inv_contents: { data: payload([item(0, "LIVID_DAGGER", "Livid Dagger", { museumEligible: true })]) },
        wardrobe_contents: { data: payload([item(0, "NECRON_HELMET", "Necron Helmet", { museumEligible: true })]) },
        ender_chest_contents: { data: payload([item(0, "TERMINATOR", "Terminator", { museumEligible: true })]) },
        backpack_contents: {
          "0": { data: payload([item(0, "SHADOW_FURY", "Shadow Fury", { museumEligible: true })]) },
        },
      },
      player_data: { experience: {} },
    },
    profiles: [],
    rateLimit: null,
  };
}

beforeEach(() => {
  previousHome = process.env.SKYAGENT_HOME;
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "skyagent-museum-test-"));
  process.env.SKYAGENT_HOME = tempHome;
});

afterEach(() => {
  if (previousHome === undefined) {
    delete process.env.SKYAGENT_HOME;
  } else {
    process.env.SKYAGENT_HOME = previousHome;
  }
  fs.rmSync(tempHome, { recursive: true, force: true });
});

describe("museum donation planner", () => {
  test("ranks owned and hidden candidates before buy recommendations", async () => {
    const plan = await museumDonationPlanFromContext(context(), "Museum HYPERION TERMINATOR GIANTS_SWORD", {
      budget: 200_000_000,
      priceProvider: async (itemId: string) => ({
        itemId,
        price: 120_000_000,
        currency: "coins",
        confidence: "medium",
        provider: { source: "test-price", fetchedAt: "1970-01-01T00:00:00.000Z", cacheStatus: "disabled" },
        fallbackChain: ["test"],
        warnings: [],
      }),
    });

    expect(plan.kind).toBe("skyagent.museumDonationPlan");
    expect(plan.museum).toMatchObject({ available: true, donatedCount: 1, sourcePath: "profile.museum.selected_member" });
    expect(plan.alreadyDonated).toContainEqual(expect.objectContaining({ itemId: "HYPERION" }));
    expect(plan.eligibleOwnedCandidates).toEqual([]);
    expect(plan.hiddenOwnedCandidates).toContainEqual(expect.objectContaining({
      itemId: "TERMINATOR",
      kind: "hidden-owned",
      section: "ender_chest",
      sourcePath: "inventory.ender_chest_contents",
    }));
    expect(plan.hiddenOwnedCandidates).not.toContainEqual(expect.objectContaining({ itemId: "SHADOW_FURY" }));
    expect(plan.rankedCandidates).not.toContainEqual(expect.objectContaining({ itemId: "LIVID_DAGGER" }));
    expect(plan.rankedCandidates).not.toContainEqual(expect.objectContaining({ itemId: "NECRON_HELMET" }));
    expect(plan.missingCandidates).toContainEqual(expect.objectContaining({
      itemId: "GIANTS_SWORD",
      price: expect.objectContaining({ price: 120_000_000 }),
    }));
    expect(plan.rankedCandidates.slice(0, 2).map((entry) => entry.kind)).toEqual(["hidden-owned", "missing"]);
    expect(plan.buyListCandidates).toContainEqual(expect.objectContaining({ kind: "buy", itemId: "GIANTS_SWORD", targetPrice: 120_000_000 }));
    expect(plan.snipeCandidates).toContainEqual(expect.objectContaining({ kind: "snipe", itemId: "GIANTS_SWORD" }));
    expect(plan.persistedObjectives).toBeNull();
    expect(listObjectiveItems().items).toEqual([]);
  });

  test("does not invent concatenated target ids for multi-item goals", async () => {
    const plan = await museumDonationPlanFromContext(context(), "Museum HYPERION TERMINATOR GIANTS_SWORD", {
      priceProvider: async (itemId: string) => ({
        itemId,
        price: 120_000_000,
        provider: { source: "test-price", fetchedAt: "1970-01-01T00:00:00.000Z" },
        warnings: [],
      }),
    });

    expect(plan.targetItems).toEqual(["HYPERION", "TERMINATOR", "GIANTS_SWORD"]);
    expect(plan.missingCandidates).not.toContainEqual(expect.objectContaining({ itemId: "HYPERION_TERMINATOR_GIANTS_SWORD" }));
    expect(plan.buyListCandidates).not.toContainEqual(expect.objectContaining({ itemId: "HYPERION_TERMINATOR_GIANTS_SWORD" }));
  });

  test("surfaces missing museum and price lookup limits without inventing values", async () => {
    const base = context();
    delete (base.profile as any).museum;
    const plan = await museumDonationPlanFromContext(base, "Museum GIANTS_SWORD DARK_CLAYMORE", {
      maxPriceLookups: 1,
      priceProvider: async (itemId: string) => ({
        itemId,
        price: null,
        currency: "coins",
        confidence: "none",
        provider: { source: "test-price", fetchedAt: "1970-01-01T00:00:00.000Z", cacheStatus: "unavailable" },
        fallbackChain: ["test"],
        warnings: [{ code: "price_unavailable", message: "No price" }],
      }),
    });

    expect(plan.status).toBe("partial");
    expect(plan.warnings).toContainEqual(expect.objectContaining({ code: "museum_data_missing" }));
    expect(plan.warnings).toContainEqual(expect.objectContaining({ code: "museum_price_lookup_limit_reached" }));
    expect(plan.missingCandidates).toContainEqual(expect.objectContaining({
      itemId: "GIANTS_SWORD",
      price: expect.objectContaining({ price: null }),
      warnings: [expect.objectContaining({ code: "price_unavailable" })],
    }));
    expect(plan.missingCandidates).toContainEqual(expect.objectContaining({
      itemId: "DARK_CLAYMORE",
      price: null,
      warnings: [expect.objectContaining({ code: "price_lookup_skipped" })],
    }));
  });

  test("resolves natural item-name goals into target items", async () => {
    const terminatorPlan = await museumDonationPlanFromContext(context(), "donate a Terminator", {
      priceProvider: async () => {
        throw new Error("owned target should not be priced");
      },
    });

    expect(terminatorPlan.targetItems).toContain("TERMINATOR");
    expect(terminatorPlan.hiddenOwnedCandidates).toContainEqual(expect.objectContaining({ itemId: "TERMINATOR" }));

    const giantSwordPlan = await museumDonationPlanFromContext(context(), "museum giant sword", {
      priceProvider: async (itemId: string) => ({
        itemId,
        price: 120_000_000,
        provider: { source: "test-price", fetchedAt: "1970-01-01T00:00:00.000Z" },
        warnings: [],
      }),
    });

    expect(giantSwordPlan.targetItems).toContain("GIANTS_SWORD");
    expect(giantSwordPlan.missingCandidates).toContainEqual(expect.objectContaining({ itemId: "GIANTS_SWORD" }));
    expect(giantSwordPlan.buyListCandidates).toContainEqual(expect.objectContaining({ itemId: "GIANTS_SWORD" }));
  });

  test("uses endpoint-shaped skyblock museum profile members payload", async () => {
    const base = context();
    delete (base.profile as any).museum;
    const plan = await museumDonationPlanFromContext(base, "Museum TERMINATOR GIANTS_SWORD", {
      museumPayload: {
        body: {
          profile: {
            members: {
              [uuid]: {
                items: { TERMINATOR: {} },
                special: {},
              },
            },
          },
        },
      },
      priceProvider: async (itemId: string) => ({
        itemId,
        price: 120_000_000,
        provider: { source: "test-price", fetchedAt: "1970-01-01T00:00:00.000Z" },
        warnings: [],
      }),
    });

    expect(plan.museum).toMatchObject({ available: true, sourcePath: "skyblock.museum.profile.selected_member" });
    expect(plan.alreadyDonated).toContainEqual(expect.objectContaining({ itemId: "TERMINATOR" }));
    expect(plan.hiddenOwnedCandidates).not.toContainEqual(expect.objectContaining({ itemId: "TERMINATOR" }));
    expect(plan.missingCandidates).toContainEqual(expect.objectContaining({ itemId: "GIANTS_SWORD" }));
  });

  test("uses museum-wrapped endpoint members payload", async () => {
    const base = context();
    delete (base.profile as any).museum;
    const plan = await museumDonationPlanFromContext(base, "Museum TERMINATOR", {
      museumPayload: {
        museum: {
          profile: {
            members: {
              [uuid]: {
                items: { TERMINATOR: {} },
              },
            },
          },
        },
      },
    });

    expect(plan.museum).toMatchObject({ available: true, sourcePath: "skyblock.museum.museum.profile.selected_member" });
    expect(plan.alreadyDonated).toContainEqual(expect.objectContaining({ itemId: "TERMINATOR" }));
    expect(plan.hiddenOwnedCandidates).not.toContainEqual(expect.objectContaining({ itemId: "TERMINATOR" }));
  });

  test("extracts donated ids from nested museum category groups", async () => {
    const base = context();
    delete (base.profile as any).museum;
    const plan = await museumDonationPlanFromContext(base, "Museum TERMINATOR", {
      museumPayload: {
        profile: {
          members: {
            [uuid]: {
              items: {
                weapons: {
                  TERMINATOR: {},
                },
              },
            },
          },
        },
      },
    });

    expect(plan.alreadyDonated).toContainEqual(expect.objectContaining({
      itemId: "TERMINATOR",
      sourcePath: "skyblock.museum.profile.selected_member.items.weapons.TERMINATOR",
    }));
    expect(plan.alreadyDonated).not.toContainEqual(expect.objectContaining({ itemId: "WEAPONS" }));
    expect(plan.hiddenOwnedCandidates).not.toContainEqual(expect.objectContaining({ itemId: "TERMINATOR" }));
  });

  test("does not treat terminal museum metadata objects as donated item ids", async () => {
    const base = context();
    delete (base.profile as any).museum;
    const plan = await museumDonationPlanFromContext(base, "Museum TERMINATOR", {
      museumPayload: {
        profile: {
          members: {
            [uuid]: {
              items: {
                TERMINATOR: {
                  donated_at: 123,
                  metadata: {
                    display_name: "Terminator",
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(plan.alreadyDonated).toContainEqual(expect.objectContaining({ itemId: "TERMINATOR" }));
    expect(plan.alreadyDonated).not.toContainEqual(expect.objectContaining({ itemId: "METADATA" }));
    expect(plan.alreadyDonated).not.toContainEqual(expect.objectContaining({ itemId: "DISPLAY_NAME" }));
  });

  test("routes current loadout armor as visible owned evidence", async () => {
    const base = context();
    delete (base.member.inventory as any).wardrobe_contents;
    (base.member as any).loadout = {
      armor: {
        HELMET: { data: payload([item(0, "NECRON_HELMET", "Necron Helmet", { museumEligible: true })]) },
      },
    };

    const plan = await museumDonationPlanFromContext(base, "Museum NECRON_HELMET", {});

    expect(plan.eligibleOwnedCandidates).toContainEqual(expect.objectContaining({
      itemId: "NECRON_HELMET",
      kind: "eligible-owned",
      section: "wardrobe",
      visibility: "visible",
      sourcePath: "loadout.armor.HELMET",
    }));
  });

  test("routes personal vault items as hidden owned evidence", async () => {
    const base = context();
    (base.member.inventory as any).personal_vault_contents = {
      data: payload([item(4, "MIDAS_SWORD", "Midas' Sword", { museumEligible: true })]),
    };

    const plan = await museumDonationPlanFromContext(base, "Museum MIDAS_SWORD", {
      priceProvider: async () => {
        throw new Error("owned vault target should not be priced");
      },
    });

    expect(plan.hiddenOwnedCandidates).toContainEqual(expect.objectContaining({
      itemId: "MIDAS_SWORD",
      kind: "hidden-owned",
      section: "personal_vault",
      sourcePath: "inventory.personal_vault_contents",
      slot: 4,
      visibility: "hidden",
    }));
    expect(plan.missingCandidates).not.toContainEqual(expect.objectContaining({ itemId: "MIDAS_SWORD" }));
  });

  test("bounds slow price providers with timeout warnings", async () => {
    const plan = await museumDonationPlanFromContext(context(), "Museum GIANTS_SWORD", {
      timeoutMs: 1,
      priceProvider: async () => new Promise((resolve) => setTimeout(() => resolve({ price: 1 }), 50)),
    });

    expect(plan.missingCandidates).toContainEqual(expect.objectContaining({
      itemId: "GIANTS_SWORD",
      price: expect.objectContaining({
        price: null,
        warnings: [expect.objectContaining({ code: "museum_price_timeout" })],
      }),
    }));
  });

  test("keeps owned items with missing eligibility metadata uncertain", async () => {
    const base = context();
    base.member.inventory.inv_contents = { data: payload([item(0, "ASPECT_OF_THE_END", "Aspect of the End")]) };
    (base.member.inventory as any).wardrobe_contents = { data: payload([]) };
    base.member.inventory.ender_chest_contents = { data: payload([]) };
    (base.member.inventory as any).backpack_contents = {};

    const plan = await museumDonationPlanFromContext(base, "Museum ASPECT_OF_THE_END", {
      priceProvider: async () => {
        throw new Error("owned item should not be priced");
      },
    });

    expect(plan.eligibleOwnedCandidates).toEqual([]);
    expect(plan.hiddenOwnedCandidates).toEqual([]);
    expect(plan.uncertainCandidates).toContainEqual(expect.objectContaining({
      itemId: "ASPECT_OF_THE_END",
      warnings: [expect.objectContaining({ code: "museum_eligibility_metadata_missing" })],
    }));
    expect(plan.sourceItemCandidates).not.toContainEqual(expect.objectContaining({ itemId: "ASPECT_OF_THE_END" }));
    expect(plan.buyListCandidates).not.toContainEqual(expect.objectContaining({ itemId: "ASPECT_OF_THE_END" }));
    expect(plan.warnings).toContainEqual(expect.objectContaining({ code: "museum_eligibility_metadata_missing" }));
  });

  test("does not surface unrelated owned items for concrete targets", async () => {
    const base = context();
    base.member.inventory.inv_contents = { data: payload([item(0, "ASPECT_OF_THE_END", "Aspect of the End")]) };
    (base.member.inventory as any).wardrobe_contents = { data: payload([]) };
    base.member.inventory.ender_chest_contents = { data: payload([]) };
    (base.member.inventory as any).backpack_contents = {};

    const plan = await museumDonationPlanFromContext(base, "Museum GIANTS_SWORD", {
      priceProvider: async (itemId: string) => ({
        itemId,
        price: 1,
        provider: { source: "test-price", fetchedAt: "1970-01-01T00:00:00.000Z" },
        warnings: [],
      }),
    });

    expect(plan.missingCandidates).toContainEqual(expect.objectContaining({ itemId: "GIANTS_SWORD" }));
    expect(plan.uncertainCandidates).not.toContainEqual(expect.objectContaining({ itemId: "ASPECT_OF_THE_END" }));
    expect(plan.rankedCandidates).not.toContainEqual(expect.objectContaining({ itemId: "ASPECT_OF_THE_END" }));
  });

  test("surfaces broad owned items when target items are unspecified", async () => {
    const base = context();
    base.member.inventory.inv_contents = { data: payload([item(0, "ASPECT_OF_THE_END", "Aspect of the End")]) };
    (base.member.inventory as any).wardrobe_contents = { data: payload([]) };
    base.member.inventory.ender_chest_contents = { data: payload([]) };
    (base.member.inventory as any).backpack_contents = {};

    const plan = await museumDonationPlanFromContext(base, "Museum", {
      priceProvider: async () => {
        throw new Error("unspecified target should not be priced");
      },
    });

    expect(plan.targetItems).toEqual([]);
    expect(plan.uncertainCandidates).toContainEqual(expect.objectContaining({
      itemId: "ASPECT_OF_THE_END",
      sourcePath: "inventory.inv_contents",
      warnings: [expect.objectContaining({ code: "museum_eligibility_metadata_missing" })],
    }));
    expect(plan.warnings).toContainEqual(expect.objectContaining({ code: "museum_target_items_unspecified" }));
  });

  test("rejects unsafe bound options before price lookup", async () => {
    await expect(museumDonationPlanFromContext(context(), "Museum GIANTS_SWORD", {
      maxPriceLookups: Number.NaN,
    })).rejects.toThrow("maxPriceLookups must be a finite number");
    await expect(museumDonationPlanFromContext(context(), "Museum GIANTS_SWORD", {
      maxPriceLookups: 1.5,
    })).rejects.toThrow("maxPriceLookups must be an integer");

    await expect(museumDonationPlanFromContext(context(), "Museum GIANTS_SWORD", {
      timeoutMs: Number.POSITIVE_INFINITY,
    })).rejects.toThrow("timeoutMs must be a finite number");
  });

  test("persists objective records only when explicitly requested", async () => {
    const plan = await museumDonationPlanFromContext(context(), "Museum GIANTS_SWORD", {
      persistObjectives: true,
      priceProvider: async (itemId: string) => ({
        itemId,
        price: 120_000_000,
        provider: { source: "test-price", fetchedAt: "1970-01-01T00:00:00.000Z" },
        warnings: [],
      }),
    });

    expect(plan.persistedObjectives).toMatchObject({ count: 3 });
    const items = listObjectiveItems().items;
    expect(items.map((entry) => entry.itemKind).sort()).toEqual(["buy", "objective", "snipe"]);
    expect(items).toContainEqual(expect.objectContaining({ itemKind: "buy", itemId: "GIANTS_SWORD" }));
  });
});
