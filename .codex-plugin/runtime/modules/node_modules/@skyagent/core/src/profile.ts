import { readConfig } from "./store.ts";
import { skyblockProfiles, uuidFromNameOrUuid } from "./hypixel.ts";

export function skycryptUrl(usernameOrUuid, profileName) {
  const base = `https://sky.shiiyu.moe/stats/${encodeURIComponent(usernameOrUuid)}`;
  return profileName ? `${base}/${encodeURIComponent(profileName)}` : base;
}

function normalizeProfileName(value) {
  return String(value || "").trim().toLowerCase();
}

export function profileSummaries(profiles = [], uuid) {
  return profiles.map((profile) => {
    const member = profile.members?.[uuid] ?? null;
    return {
      profileId: profile.profile_id,
      cuteName: profile.cute_name ?? null,
      selected: Boolean(profile.selected),
      gameMode: profile.game_mode ?? "normal",
      memberPresent: Boolean(member),
      lastSave: member?.last_save ?? null,
      purse: member?.currencies?.coin_purse ?? member?.coin_purse ?? null,
      bank: profile.banking?.balance ?? null,
      skyblockLevelXp: member?.leveling?.experience ?? null,
    };
  });
}

export function chooseProfile(profiles, selector) {
  if (!profiles?.length) {
    throw new Error("No SkyBlock profiles were returned for this player.");
  }

  const config = readConfig();
  const requested = selector ?? config.selectedProfileId ?? null;

  if (requested) {
    const normalized = normalizeProfileName(requested);
    const match = profiles.find((profile) => (
      normalizeProfileName(profile.profile_id) === normalized ||
      normalizeProfileName(profile.cute_name) === normalized
    ));
    if (!match) {
      throw new Error(`SkyBlock profile not found: ${requested}`);
    }
    return match;
  }

  return profiles.find((profile) => profile.selected) ?? profiles[0];
}

export async function fetchProfileContext(player, selector) {
  const uuid = await uuidFromNameOrUuid(player);
  const response = await skyblockProfiles(uuid);
  const profiles = response.body?.profiles ?? [];
  const profile = chooseProfile(profiles, selector);
  const member = profile.members?.[uuid] ?? null;
  if (!member) {
    throw new Error(`Selected profile does not contain member ${uuid}.`);
  }

  return {
    uuid,
    profile,
    member,
    profiles: profileSummaries(profiles, uuid),
    rateLimit: response.rateLimit,
  };
}

function objectKeys(value) {
  return value && typeof value === "object" ? Object.keys(value) : [];
}

export function compactProfileOverview(context) {
  const { uuid, profile, member, profiles, rateLimit } = context;
  const playerData = member.player_data ?? {};
  const currencies = member.currencies ?? {};
  const slayers = member.slayer?.slayer_bosses ?? {};
  const dungeons = member.dungeons ?? {};
  const skills = playerData.experience ?? {};

  return {
    uuid,
    selectedProfile: {
      profileId: profile.profile_id,
      cuteName: profile.cute_name ?? null,
      selected: Boolean(profile.selected),
      gameMode: profile.game_mode ?? "normal",
    },
    profiles,
    economy: {
      purse: currencies.coin_purse ?? member.coin_purse ?? null,
      bank: profile.banking?.balance ?? null,
    },
    progression: {
      skyblockLevelXp: member.leveling?.experience ?? null,
      skillExperienceKeys: objectKeys(skills),
      slayerBosses: objectKeys(slayers),
      dungeonTypes: objectKeys(dungeons.dungeon_types),
      dungeonClasses: objectKeys(dungeons.player_classes),
      collections: objectKeys(member.collection),
      craftedGenerators: member.player_data?.crafted_generators?.length ?? member.crafted_generators?.length ?? null,
      unlockedCollections: member.player_data?.unlocked_coll_tiers?.length ?? member.unlocked_coll_tiers?.length ?? null,
    },
    inventoryApiSignals: {
      hasInventoryBag: Boolean(member.inventory?.bag_contents || member.inv_contents),
      hasEnderChest: Boolean(member.inventory?.ender_chest_contents || member.ender_chest_contents),
      hasArmor: Boolean(member.inventory?.inv_armor || member.inv_armor),
      hasWardrobe: Boolean(member.inventory?.wardrobe_contents || member.wardrobe_contents || member.loadout?.armor),
      hasAccessoryBag: Boolean(member.inventory?.bag_contents?.talisman_bag || member.inventory?.bag_contents || member.talisman_bag),
      hasPets: Boolean(member.pets_data?.pets || member.pets),
    },
    rateLimit,
  };
}

