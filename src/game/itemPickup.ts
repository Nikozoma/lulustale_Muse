import { ITEM_DEFINITIONS, addInventoryItem, type InventoryEntry } from "./gameState";

export type ItemPickupResult = {
  inventory: InventoryEntry[];
  itemId: string;
  quantity: number;
  message: string;
};

export function pickupItem(
  inventory: InventoryEntry[],
  itemId: string,
  quantity = 1
): ItemPickupResult {
  const definition = ITEM_DEFINITIONS[itemId];
  if (!definition) throw new Error(`Cannot pick up unknown item: ${itemId}`);
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`Pickup quantity must be a positive integer: ${quantity}`);
  return {
    inventory: addInventoryItem(inventory, itemId, quantity),
    itemId,
    quantity,
    message: `${definition.name}${quantity > 1 ? ` ×${quantity}` : ""} obtained.`
  };
}
