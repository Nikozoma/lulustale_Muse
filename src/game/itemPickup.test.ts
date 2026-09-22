import { describe, expect, it } from "vitest";
import { pickupItem } from "./itemPickup";

describe("item pickup system", () => {
  it("adds real defined items to inventory and reports the pickup", () => {
    const result = pickupItem([], "glossy_feather");
    expect(result.inventory).toEqual([{ itemId: "glossy_feather", quantity: 1 }]);
    expect(result.message).toBe("Glossy Black Feather obtained.");
  });

  it("stacks quantities", () => {
    const result = pickupItem([{ itemId: "fries", quantity: 1 }], "fries", 2);
    expect(result.inventory).toEqual([{ itemId: "fries", quantity: 3 }]);
  });

  it("rejects unknown items instead of inventing placeholder data", () => {
    expect(() => pickupItem([], "fake_item")).toThrow(/unknown item/i);
  });
});
