import { decodeHypixelNbt, NbtDecodeError } from "./nbt.ts";
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
    paths: [["inventory", "wardrobe_contents"], ["wardrobe_contents"]],
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
    paths: [["inventory", "bag_contents"], ["talisman_bag"], ["bag_contents"]],
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

export function normalizeItemStack(item: unknown, index: number, sourcePath: string, options: { debugRaw?: boolean } = {}, containerId?: string) {
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

async function decodeSectionPayload(payload: unknown, sourcePath: string, options: { debugRaw?: boolean }, containerId?: string) {
  const decoded = await decodeHypixelNbt(payload);
  const rawItems = itemListFromDecoded(decoded.simplified);
  const items = rawItems
    .map((item, index) => normalizeItemStack(item, index, sourcePath, options, containerId))
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

function petItems(member: any, options: { debugRaw?: boolean } = {}) {
  const pets = Array.isArray(member?.pets) ? member.pets : [];
  return pets.map((pet, index) => ({
    slot: index,
    index,
    containerId: null,
    itemId: "skyblock:pet",
    internalId: pet.type ?? null,
    count: 1,
    damage: null,
    displayName: pet.type ?? null,
    extraAttributes: {
      type: pet.type ?? null,
      tier: pet.tier ?? null,
      exp: pet.exp ?? null,
      heldItem: pet.heldItem ?? null,
      skin: pet.skin ?? null,
      candyUsed: pet.candyUsed ?? null,
    },
    sourcePath: "pets",
    ...(options.debugRaw ? { raw: pet } : {}),
  }));
}

export async function inventorySectionFromMember(member: unknown, sectionName: string, options: { debugRaw?: boolean } = {}) {
  const normalized = normalizeInventorySectionName(sectionName);
  const definition = SECTION_DEFINITIONS.find((section) => section.name === normalized)!;

  if (normalized === "pets") {
    const petsPresent = Boolean(member && typeof member === "object" && "pets" in member);
    const items = petItems(member, options);
    return {
      section: definition.name,
      label: definition.label,
      sourcePath: "pets",
      available: petsPresent,
      itemCount: items.length,
      items,
      warnings: petsPresent ? [] : [{ code: "missing_section", message: "No exposed pet data found.", sourcePath: "pets" }],
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
    const decoded = definition.container
      ? await decodeContainerSection(value, path, options)
      : await decodeSectionPayload(value, path, options);
    return {
      section: definition.name,
      label: definition.label,
      available: true,
      warnings: [],
      ...decoded,
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
