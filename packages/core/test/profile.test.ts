import { describe, expect, test } from "bun:test";
import { compactProfileOverview } from "../src/profile.ts";

describe("profile overview", () => {
  test("reports current inventory, pet, and loadout API signals", () => {
    const overview = compactProfileOverview({
      uuid: "player-uuid",
      profile: {
        profile_id: "profile-id",
        cute_name: "Apple",
        members: {},
        banking: { balance: 0 },
      },
      profiles: [],
      member: {
        currencies: { coin_purse: 0 },
        inventory: {
          bag_contents: {
            talisman_bag: { data: "encoded" },
          },
          ender_chest_contents: { data: "encoded" },
          inv_armor: { data: "encoded" },
        },
        loadout: {
          armor: {
            "1": {},
          },
        },
        pets_data: {
          pets: [],
        },
        player_data: { experience: {} },
      },
      rateLimit: null,
    });

    expect(overview.inventoryApiSignals).toMatchObject({
      hasInventoryBag: true,
      hasEnderChest: true,
      hasArmor: true,
      hasWardrobe: true,
      hasAccessoryBag: true,
      hasPets: true,
    });
  });
});
