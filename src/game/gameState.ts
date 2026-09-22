import type { CompanionMode } from "./companion";
import type { DemoQuestState } from "./demoQuest";
import type { FoundationMapId, WorldPoint } from "./foundation";
import type { Facing } from "./player";
import type { VisualPhase } from "./visual";

export const SAVE_SCHEMA_VERSION = 1 as const;

export type ItemCategory = "quest" | "food" | "weapon" | "key";
export type EquipmentSlot = "weapon" | "body" | "accessory";

export type ItemDefinition = {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  equippableSlot?: EquipmentSlot;
  attackBonus?: number;
  defenseBonus?: number;
};

export const ITEM_DEFINITIONS: Record<string, ItemDefinition> = {
  dog_food: {
    id: "dog_food",
    name: "Dog Food",
    description: "Brutus's breakfast. More important than Lulu's, apparently.",
    category: "food"
  },
  fries: {
    id: "fries",
    name: "Charles Jr. Fries",
    description: "Hot, salty, and historically difficult to defend from birds.",
    category: "food"
  },
  glossy_feather: {
    id: "glossy_feather",
    name: "Glossy Black Feather",
    description: "Evidence that the neighborhood birds may be more organized than they look.",
    category: "quest"
  },
  bush_sword: {
    id: "bush_sword",
    name: "Bush Sword",
    description: "A surprisingly serviceable sword found in a completely normal neighborhood bush.",
    category: "weapon",
    equippableSlot: "weapon",
    attackBonus: 4
  }
};

export type InventoryEntry = {
  itemId: string;
  quantity: number;
};

export type EquipmentState = Record<EquipmentSlot, string | null>;

export type PlayerStatusState = {
  level: number;
  experience: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  attack: number;
  defense: number;
  speed: number;
};

export type SavedCompanionState = {
  position: WorldPoint;
  facing: Facing;
  mode: CompanionMode;
  commandPose?: "sit" | "lay" | null;
};

export type PersistentGameState = {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  savedAt: string;
  quest: DemoQuestState;
  mapId: FoundationMapId;
  phase: VisualPhase;
  player: {
    position: WorldPoint;
    facing: Facing;
  };
  companion: SavedCompanionState;
  inventory: InventoryEntry[];
  equipment: EquipmentState;
  status: PlayerStatusState;
  flags: {
    dayWarningSeen: boolean;
    firstDayOpeningCompleted: boolean;
    brutusIntroTutorialCompleted: boolean;
  };
};

export function createFreshGameFlags(): PersistentGameState["flags"] {
  return {
    dayWarningSeen: false,
    firstDayOpeningCompleted: false,
    brutusIntroTutorialCompleted: false
  };
}

export function createDefaultInventory(): InventoryEntry[] {
  return [];
}

export function createDefaultEquipment(): EquipmentState {
  return { weapon: null, body: null, accessory: null };
}

export function createDefaultStatus(): PlayerStatusState {
  return {
    level: 1,
    experience: 0,
    hp: 20,
    maxHp: 20,
    mp: 8,
    maxMp: 8,
    attack: 5,
    defense: 4,
    speed: 5
  };
}

export function addInventoryItem(inventory: InventoryEntry[], itemId: string, quantity = 1): InventoryEntry[] {
  if (quantity <= 0) return inventory;
  const existing = inventory.find((entry) => entry.itemId === itemId);
  if (!existing) return [...inventory, { itemId, quantity }];
  return inventory.map((entry) => (entry.itemId === itemId ? { ...entry, quantity: entry.quantity + quantity } : entry));
}

export function removeInventoryItem(inventory: InventoryEntry[], itemId: string, quantity = 1): InventoryEntry[] {
  if (quantity <= 0) return inventory;
  return inventory
    .map((entry) => (entry.itemId === itemId ? { ...entry, quantity: Math.max(0, entry.quantity - quantity) } : entry))
    .filter((entry) => entry.quantity > 0);
}

export function hasInventoryItem(inventory: readonly InventoryEntry[], itemId: string): boolean {
  return inventory.some((entry) => entry.itemId === itemId && entry.quantity > 0);
}

export function equipItem(
  inventory: readonly InventoryEntry[],
  equipment: EquipmentState,
  itemId: string
): EquipmentState {
  const definition = ITEM_DEFINITIONS[itemId];
  if (!definition?.equippableSlot || !hasInventoryItem(inventory, itemId)) return equipment;
  return { ...equipment, [definition.equippableSlot]: itemId };
}

export function unequipSlot(equipment: EquipmentState, slot: EquipmentSlot): EquipmentState {
  return { ...equipment, [slot]: null };
}

export function getEffectiveStatus(status: PlayerStatusState, equipment: EquipmentState): PlayerStatusState {
  let attack = status.attack;
  let defense = status.defense;
  for (const itemId of Object.values(equipment)) {
    if (!itemId) continue;
    const definition = ITEM_DEFINITIONS[itemId];
    attack += definition?.attackBonus ?? 0;
    defense += definition?.defenseBonus ?? 0;
  }
  return { ...status, attack, defense };
}

export function getActiveQuestTitle(quest: DemoQuestState): string {
  if (
    quest.stage === "night_quest_pending" ||
    quest.stage === "leave_home_night" ||
    quest.stage === "meet_night_guide" ||
    quest.stage === "find_bush_sword" ||
    quest.stage === "confront_bird_gang" ||
    quest.stage === "return_home_night" ||
    quest.stage === "sleep_after_night"
  ) {
    return "Birds After Dark";
  }
  if (quest.stage === "complete") return "Day 1 Complete";
  return "Fries and Feathers";
}

export function rebuildInventoryFromQuest(quest: DemoQuestState): InventoryEntry[] {
  let inventory = createDefaultInventory();
  if (quest.hasDogFood) inventory = addInventoryItem(inventory, "dog_food");
  if (quest.hasFries) inventory = addInventoryItem(inventory, "fries");
  if (quest.hasFeather) inventory = addInventoryItem(inventory, "glossy_feather");
  if (quest.hasSword) inventory = addInventoryItem(inventory, "bush_sword");
  return inventory;
}

export function createEquipmentFromQuest(quest: DemoQuestState): EquipmentState {
  return quest.hasSword ? { ...createDefaultEquipment(), weapon: "bush_sword" } : createDefaultEquipment();
}
