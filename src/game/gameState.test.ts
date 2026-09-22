import { describe, expect, it } from "vitest";
import { createDemoQuestState } from "./demoQuest";
import {
  addInventoryItem,
  createDefaultEquipment,
  createDefaultStatus,
  equipItem,
  getActiveQuestTitle,
  getEffectiveStatus,
  removeInventoryItem
} from "./gameState";

describe("game state foundation", () => {
  it("adds, stacks, and removes inventory items", () => {
    let inventory = addInventoryItem([], "fries");
    inventory = addInventoryItem(inventory, "fries", 2);
    expect(inventory).toEqual([{ itemId: "fries", quantity: 3 }]);
    expect(removeInventoryItem(inventory, "fries", 2)).toEqual([{ itemId: "fries", quantity: 1 }]);
  });

  it("equips owned equipment and applies its stat bonus", () => {
    const inventory = [{ itemId: "bush_sword", quantity: 1 }];
    const equipment = equipItem(inventory, createDefaultEquipment(), "bush_sword");
    expect(equipment.weapon).toBe("bush_sword");
    expect(getEffectiveStatus(createDefaultStatus(), equipment).attack).toBe(9);
  });

  it("uses the linked daytime and nighttime quest titles", () => {
    const quest = createDemoQuestState();
    expect(getActiveQuestTitle(quest)).toBe("Fries and Feathers");
    expect(getActiveQuestTitle({ ...quest, stage: "meet_night_guide", phase: "night" })).toBe("Birds After Dark");
  });
});
