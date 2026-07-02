import { decodeHypixelNbt, NbtDecodeError, payloadData } from "./nbt.ts";
import { fetchProfileContext } from "./profile.ts";

export type InventorySectionName =
  | "inventory"
  | "armor"
  | "equipment"
  | "wardrobe"
  | "ender_chest"
  | "backpacks"
  | "accessory_bag"
  | "personal_vault"
  | "pets";

type SectionDefinition = {
  name: InventorySectionName;
  label: string;
  paths: string[][];
  container?: boolean;
};

const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    name: "inventory",
    label: "Inventory",
    paths: [["inventory", "inv_contents"], ["inv_contents"]],
  },
  {
    name: "armor",
    label: "Armor",
    paths: [["inventory", "inv_armor"], ["inv_armor"]],
  },
  {
    name: "equipment",
    label: "Equipment",
    paths: [["inventory", "equipment_contents"], ["equipment_contents"], ["inventory", "equippment_contents"], ["equippment_contents"]],
  },
  {
    name: "wardrobe",
    label: "Wardrobe",
    paths: [["inventory", "wardrobe_contents"], ["wardrobe_contents"], ["loadout", "armor"]],
  },
  {
    name: "ender_chest",
    label: "Ender Chest",
    paths: [["inventory", "ender_chest_contents"], ["ender_chest_contents"]],
  },
  {
    name: "backpacks",
    label: "Backpacks",
    paths: [["inventory", "backpack_contents"], ["backpack_contents"]],
    container: true,
  },
  {
    name: "accessory_bag",
    label: "Accessory Bag",
    paths: [["inventory", "bag_contents", "talisman_bag"], ["inventory", "bag_contents"], ["talisman_bag"], ["bag_contents"]],
  },
  {
    name: "personal_vault",
    label: "Personal Vault",
    paths: [["inventory", "personal_vault_contents"], ["personal_vault_contents"]],
  },
  {
    name: "pets",
    label: "Pets",
    paths: [["pets"]],
  },
];

const SECTION_ALIASES = new Map<string, InventorySectionName>([
  ["inv", "inventory"],
  ["inventory", "inventory"],
  ["armor", "armor"],
  ["equipment", "equipment"],
  ["wardrobe", "wardrobe"],
  ["enderchest", "ender_chest"],
  ["ender_chest", "ender_chest"],
  ["ec", "ender_chest"],
  ["backpacks", "backpacks"],
  ["backpack", "backpacks"],
  ["accessory_bag", "accessory_bag"],
  ["accessories", "accessory_bag"],
  ["talisman_bag", "accessory_bag"],
  ["personal_vault", "personal_vault"],
  ["vault", "personal_vault"],
  ["pets", "pets"],
]);

export function inventorySectionNames() {
  return SECTION_DEFINITIONS.map((section) => section.name);
}

export function normalizeInventorySectionName(section: string): InventorySectionName {
  const key = String(section || "").trim().toLowerCase().replace(/[-\s]/g, "_");
  const normalized = SECTION_ALIASES.get(key);
  if (!normalized) {
    throw new Error(`Unsupported inventory section: ${section}. Supported sections: ${inventorySectionNames().join(", ")}`);
  }
  return normalized;
}

function getPath(source: unknown, path: string[]) {
  let current = source;
  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function firstPath(source: unknown, paths: string[][]) {
  for (const path of paths) {
    const value = getPath(source, path);
    if (value !== undefined && value !== null) {
      return { value, path: path.join(".") };
    }
  }
  return { value: null, path: null };
}

function isEmptySlot(item: unknown) {
  return !item || (typeof item === "object" && Object.keys(item).length === 0);
}

function cleanItemName(item: Record<string, unknown>) {
  const display = item.tag && typeof item.tag === "object"
    ? (item.tag as Record<string, any>).display
    : null;
  return display?.Name ?? null;
}

export function normalizeItemStack(item: unknown, index: number, sourcePath: string, options: { debugRaw?: boolean } = {}, containerId?: string, metadata: Record<string, unknown> = {}) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const record = item as Record<string, any>;
  if (isEmptySlot(record) || record.id === "minecraft:air" || record.id === "air") {
    return null;
  }
  const extra = record.tag?.ExtraAttributes ?? {};
  return {
    slot: record.Slot ?? index,
    index,
    containerId: containerId ?? null,
    itemId: record.id ?? null,
    internalId: extra.id ?? null,
    count: record.Count ?? 1,
    damage: record.Damage ?? null,
    displayName: cleanItemName(record),
    extraAttributes: extra,
    sourcePath,
    ...metadata,
    ...(options.debugRaw ? { raw: record } : {}),
  };
}

function itemListFromDecoded(decoded: unknown): unknown[] {
  if (!decoded || typeof decoded !== "object") {
    return [];
  }
  const root = decoded as Record<string, any>;
  if (Array.isArray(root.i)) {
    return root.i;
  }
  if (Array.isArray(root.items)) {
    return root.items;
  }
  return [];
}

async function decodeSectionPayload(payload: unknown, sourcePath: string, options: { debugRaw?: boolean }, containerId?: string, metadata: Record<string, unknown> = {}) {
  const decoded = await decodeHypixelNbt(payload);
  const rawItems = itemListFromDecoded(decoded.simplified);
  const items = rawItems
    .map((item, index) => normalizeItemStack(item, index, sourcePath, options, containerId, metadata))
    .filter(Boolean);

  return {
    sourcePath,
    itemCount: items.length,
    items,
    warnings: [],
    ...(options.debugRaw ? { decoded: decoded.simplified } : {}),
  };
}

async function decodeContainerSection(payload: unknown, sourcePath: string, options: { debugRaw?: boolean }) {
  if (Array.isArray(payload)) {
    const containers = [];
    const warnings = [];
    for (const [index, value] of payload.entries()) {
      try {
        containers.push(await decodeSectionPayload(value, `${sourcePath}.${index}`, options, String(index)));
      } catch (error) {
        warnings.push(warningFromError(error, `${sourcePath}.${index}`));
      }
    }
    return {
      sourcePath,
      itemCount: containers.reduce((total, container: any) => total + container.itemCount, 0),
      containers,
      items: containers.flatMap((container: any) => container.items),
      warnings,
    };
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return decodeSectionPayload(payload, sourcePath, options);
  }

  const entries = Object.entries(payload as Record<string, unknown>);
  if (entries.some(([, value]) => typeof value === "string" || (value && typeof value === "object" && "data" in value))) {
    const containers = [];
    const warnings = [];
    for (const [containerId, value] of entries) {
      try {
        containers.push(await decodeSectionPayload(value, `${sourcePath}.${containerId}`, options, containerId));
      } catch (error) {
        warnings.push(warningFromError(error, `${sourcePath}.${containerId}`));
      }
    }
    return {
      sourcePath,
      itemCount: containers.reduce((total, container: any) => total + container.itemCount, 0),
      containers,
      items: containers.flatMap((container: any) => container.items),
      warnings,
    };
  }

  return {
    sourcePath,
    itemCount: 0,
    items: [],
    warnings: [{
      code: "unsupported_section_shape",
      message: `Section ${sourcePath} exists but is not an encoded NBT payload or payload map.`,
    }],
    ...(options.debugRaw ? { raw: payload } : {}),
  };
}

function warningFromError(error: unknown, sourcePath: string | null) {
  if (error instanceof NbtDecodeError) {
    return {
      code: error.code,
      message: error.message,
      sourcePath,
    };
  }
  return {
    code: "inventory_section_error",
    message: (error as Error).message,
    sourcePath,
  };
}

function petList(member: any) {
  if (Array.isArray(member?.pets_data?.pets)) {
    return { pets: member.pets_data.pets, sourcePath: "pets_data.pets", present: true };
  }
  if (Array.isArray(member?.pets)) {
    return { pets: member.pets, sourcePath: "pets", present: true };
  }
  return { pets: [], sourcePath: "pets_data.pets", present: false };
}

function petItems(member: any, options: { debugRaw?: boolean } = {}) {
  const { pets, sourcePath } = petList(member);
  return pets.map((pet, index) => {
    const type = pet.type ?? null;
    const tier = pet.tier ?? pet.rarity ?? null;
    const displayName = [tier, type].filter(Boolean).join(" ").replace(/_/g, " ") || null;
    const hasXp = pet.exp !== undefined && pet.exp !== null;
    const warnings = [{
      code: "pet_level_formula_unavailable",
      message: hasXp
        ? "Pet XP is preserved, but exact pet level is not derived because no maintained pet XP formula provider is bundled."
        : "Exact pet level is not derived because no pet XP value or maintained pet XP formula provider is bundled.",
      sourcePath: hasXp ? `${sourcePath}.${index}.exp` : `${sourcePath}.${index}`,
    }];
    return {
      slot: index,
      index,
      containerId: null,
      itemId: "skyblock:pet",
      internalId: type,
      petType: type,
      count: 1,
      damage: null,
      displayName,
      tier,
      rarity: tier,
      xp: pet.exp ?? null,
      level: null,
      levelSource: null,
      active: pet.active ?? false,
      heldItem: pet.heldItem ?? pet.held_item ?? null,
      skin: pet.skin ?? null,
      candyUsed: pet.candyUsed ?? pet.candy_used ?? null,
      warnings,
      extraAttributes: {
        type,
        tier,
        exp: pet.exp ?? null,
        active: pet.active ?? false,
        heldItem: pet.heldItem ?? pet.held_item ?? null,
        skin: pet.skin ?? null,
        candyUsed: pet.candyUsed ?? pet.candy_used ?? null,
        level: null,
        levelSource: null,
      },
      sourcePath,
      ...(options.debugRaw ? { raw: pet } : {}),
    };
  });
}

async function decodeLoadoutArmorSection(payload: unknown, sourcePath: string, options: { debugRaw?: boolean }) {
  if (payloadData(payload) || !payload || typeof payload !== "object") {
    return decodeSectionPayload(payload, sourcePath, options);
  }

  const containers = [];
  const warnings = [];
  const armorSlots = ["HELMET", "CHESTPLATE", "LEGGINGS", "BOOTS"];

  if (Array.isArray(payload)) {
    if (payload.length > 0 && payload.length < armorSlots.length) {
      warnings.push({
        code: "partial_loadout_armor",
        message: `Loadout armor list is missing ${armorSlots.length - payload.length} expected armor piece(s).`,
        sourcePath,
      });
    }
    for (const [index, value] of payload.entries()) {
      try {
        const armorSlot = armorSlots[index] ?? null;
        containers.push(await decodeSectionPayload(value, `${sourcePath}.${index}`, options, String(index), {
          wardrobeSource: "loadout_armor_fallback",
          current: true,
          loadoutSlot: null,
          armorSlot,
        }));
      } catch (error) {
        warnings.push(warningFromError(error, `${sourcePath}.${index}`));
      }
    }
    return {
      sourcePath,
      itemCount: containers.reduce((total, container: any) => total + container.itemCount, 0),
      containers,
      items: containers.flatMap((container: any) => container.items),
      warnings: containers.length ? warnings : [{
        code: "unsupported_section_shape",
        message: `Section ${sourcePath} exists but no loadout armor payloads were found.`,
        sourcePath,
      }, ...warnings],
    };
  }

  const directArmorSlots = armorSlots.filter((armorSlot) => (payload as Record<string, unknown>)[armorSlot] !== undefined && (payload as Record<string, unknown>)[armorSlot] !== null);
  if (directArmorSlots.length > 0) {
    if (directArmorSlots.length < armorSlots.length) {
      const missingPieces = armorSlots.filter((armorSlot) => !directArmorSlots.includes(armorSlot));
      warnings.push({
        code: "partial_loadout_armor",
        message: `Loadout armor is missing ${missingPieces.join(", ")}.`,
        sourcePath,
        missingPieces,
      });
    }
    for (const armorSlot of armorSlots) {
      const value = (payload as Record<string, any>)[armorSlot];
      if (value === undefined || value === null) {
        continue;
      }
      const path = `${sourcePath}.${armorSlot}`;
      try {
        containers.push(await decodeSectionPayload(value, path, options, armorSlot, {
          wardrobeSource: "loadout_armor_fallback",
          current: true,
          loadoutSlot: null,
          armorSlot,
        }));
      } catch (error) {
        warnings.push(warningFromError(error, path));
      }
    }
    return {
      sourcePath,
      itemCount: containers.reduce((total, container: any) => total + container.itemCount, 0),
      containers,
      items: containers.flatMap((container: any) => container.items),
      warnings: containers.length ? warnings : [{
        code: "unsupported_section_shape",
        message: `Section ${sourcePath} exists but no loadout armor payloads were found.`,
        sourcePath,
      }, ...warnings],
    };
  }

  const entries = Object.entries(payload as Record<string, any>)
    .sort(([left], [right]) => Number(left) - Number(right) || left.localeCompare(right));
  if (entries.length > 0) {
    warnings.push({
      code: "current_loadout_unknown",
      message: "Loadout armor exposes loadout slots, but the active loadout slot is not identified by this payload.",
      sourcePath,
    });
  }

  for (const [loadoutSlot, loadout] of entries) {
    if (!loadout || typeof loadout !== "object") {
      continue;
    }
    const presentArmorSlots = armorSlots.filter((armorSlot) => loadout[armorSlot] !== undefined && loadout[armorSlot] !== null);
    if (presentArmorSlots.length > 0 && presentArmorSlots.length < armorSlots.length) {
      const missingPieces = armorSlots.filter((armorSlot) => !presentArmorSlots.includes(armorSlot));
      warnings.push({
        code: "partial_loadout_armor",
        message: `Loadout armor slot ${loadoutSlot} is missing ${missingPieces.join(", ")}.`,
        sourcePath: `${sourcePath}.${loadoutSlot}`,
        missingPieces,
      });
    }
    for (const armorSlot of armorSlots) {
      const value = loadout[armorSlot];
      if (value === undefined || value === null) {
        continue;
      }
      const path = `${sourcePath}.${loadoutSlot}.${armorSlot}`;
      try {
        containers.push(await decodeSectionPayload(value, path, options, `${loadoutSlot}:${armorSlot}`, {
          wardrobeSource: "loadout_armor_fallback",
          current: null,
          loadoutSlot,
          armorSlot,
        }));
      } catch (error) {
        warnings.push(warningFromError(error, path));
      }
    }
  }

  return {
    sourcePath,
    itemCount: containers.reduce((total, container: any) => total + container.itemCount, 0),
    containers,
    items: containers.flatMap((container: any) => container.items),
    warnings: containers.length ? warnings : [{
      code: "unsupported_section_shape",
      message: `Section ${sourcePath} exists but no loadout armor payloads were found.`,
      sourcePath,
    }, ...warnings],
  };
}

export async function inventorySectionFromMember(member: unknown, sectionName: string, options: { debugRaw?: boolean } = {}) {
  const normalized = normalizeInventorySectionName(sectionName);
  const definition = SECTION_DEFINITIONS.find((section) => section.name === normalized)!;

  if (normalized === "pets") {
    const pets = petList(member);
    const items = petItems(member, options);
    return {
      section: definition.name,
      label: definition.label,
      sourcePath: pets.sourcePath,
      available: pets.present,
      itemCount: items.length,
      items,
      warnings: pets.present ? items.flatMap((item: any) => item.warnings ?? []) : [{ code: "missing_section", message: "No exposed pet data found.", sourcePath: pets.sourcePath }],
    };
  }

  const { value, path } = firstPath(member, definition.paths);
  if (!value || !path) {
    return {
      section: definition.name,
      label: definition.label,
      sourcePath: null,
      available: false,
      itemCount: 0,
      items: [],
      warnings: [{
        code: "missing_section",
        message: `${definition.label} data is missing. The player's inventory API may be disabled or the profile payload may be partial.`,
        sourcePath: null,
      }],
    };
  }

  try {
    const decoded = normalized === "wardrobe" && path === "loadout.armor"
      ? await decodeLoadoutArmorSection(value, path, options)
      : definition.container
      ? await decodeContainerSection(value, path, options)
      : await decodeSectionPayload(value, path, options);
    const wardrobeMetadata = normalized === "wardrobe"
      ? path === "loadout.armor"
        ? { sourceKind: "loadout_armor_fallback", currentLoadoutFallback: true }
        : { sourceKind: "wardrobe_contents", currentLoadoutFallback: false }
      : {};
    const items = normalized === "wardrobe" && path !== "loadout.armor"
      ? (decoded.items ?? []).map((item: any) => ({ ...item, wardrobeSource: "wardrobe_contents", current: false }))
      : decoded.items;
    return {
      section: definition.name,
      label: definition.label,
      available: true,
      warnings: [],
      ...decoded,
      ...wardrobeMetadata,
      items,
    };
  } catch (error) {
    return {
      section: definition.name,
      label: definition.label,
      sourcePath: path,
      available: true,
      itemCount: 0,
      items: [],
      warnings: [warningFromError(error, path)],
    };
  }
}

export async function inventoryFromMember(member: unknown, options: { debugRaw?: boolean } = {}) {
  const sections = [];
  for (const definition of SECTION_DEFINITIONS) {
    sections.push(await inventorySectionFromMember(member, definition.name, options));
  }
  return {
    sections,
    itemCount: sections.reduce((total, section) => total + section.itemCount, 0),
    warnings: sections.flatMap((section) => section.warnings ?? []),
  };
}

export async function inventoryForPlayer(player?: string, profile?: string, options: { debugRaw?: boolean } = {}) {
  const context = await fetchProfileContext(player, profile);
  const inventory = await inventoryFromMember(context.member, options);
  return {
    uuid: context.uuid,
    profile: {
      profileId: context.profile.profile_id,
      cuteName: context.profile.cute_name ?? null,
    },
    rateLimit: context.rateLimit,
    ...inventory,
  };
}

export async function inventorySectionForPlayer(section: string, player?: string, profile?: string, options: { debugRaw?: boolean } = {}) {
  const context = await fetchProfileContext(player, profile);
  const result = await inventorySectionFromMember(context.member, section, options);
  return {
    uuid: context.uuid,
    profile: {
      profileId: context.profile.profile_id,
      cuteName: context.profile.cute_name ?? null,
    },
    rateLimit: context.rateLimit,
    ...result,
  };
}
