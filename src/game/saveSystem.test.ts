import { describe, expect, it } from "vitest";
import { canUseQuestTransition, createDemoQuestState } from "./demoQuest";
import { SAVE_SCHEMA_VERSION, createDefaultEquipment, createDefaultStatus } from "./gameState";
import { parseBackupSave, serializeBackupSave } from "./saveSystem";

describe("backup save format", () => {
  it("round-trips a versioned game state", () => {
    const state = {
      schemaVersion: SAVE_SCHEMA_VERSION,
      savedAt: "2026-07-20T00:00:00.000Z",
      quest: createDemoQuestState(),
      mapId: "home" as const,
      phase: "day" as const,
      player: { position: { x: 464, y: 1232 }, facing: "down" as const },
      companion: { position: { x: 420, y: 1232 }, facing: "right" as const, mode: "follow" as const, commandPose: null },
      inventory: [],
      equipment: createDefaultEquipment(),
      status: createDefaultStatus(),
      flags: {
        dayWarningSeen: false,
        firstDayOpeningCompleted: false,
        brutusIntroTutorialCompleted: false
      }
    };
    expect(parseBackupSave(serializeBackupSave(state))).toEqual(state);
  });

  it("rejects unrelated JSON", () => {
    expect(() => parseBackupSave('{"hello":"world"}')).toThrow(/compatible/);
  });

  it.each([
    ["follow", null, "follow", null],
    ["stay", "sit", "stay", "sit"],
    ["stay", "lay", "stay", "lay"]
  ] as const)("preserves Brutus %s / %s through backup normalization", (mode, commandPose, expectedMode, expectedPose) => {
    const state = savedState({ mode, commandPose });
    expect(parseBackupSave(serializeBackupSave(state)).companion).toMatchObject({
      mode: expectedMode,
      commandPose: expectedPose
    });
  });

  it("restores older stay saves without commandPose as Sit / Stay", () => {
    const state = savedState({ mode: "stay" });
    delete state.companion.commandPose;
    expect(parseBackupSave(serializeBackupSave(state)).companion.commandPose).toBe("sit");
  });

  it("safely normalizes invalid command poses", () => {
    const state = savedState({ mode: "stay", commandPose: "roll_over" as never });
    expect(parseBackupSave(serializeBackupSave(state)).companion.commandPose).toBe("sit");

    const following = savedState({ mode: "follow", commandPose: "lay" });
    expect(parseBackupSave(serializeBackupSave(following)).companion.commandPose).toBeNull();
  });

  it("preserves unlocked free travel through backup normalization", () => {
    const state = savedState({ mode: "follow", commandPose: null });
    state.quest = { ...state.quest, stage: "complete", birdGangDefeated: true };
    const restored = parseBackupSave(serializeBackupSave(state));
    for (const transitionId of [
      "transition_home_to_overworld",
      "transition_overworld_to_home",
      "transition_overworld_to_charles_jr",
      "transition_charles_jr_to_overworld"
    ]) {
      expect(canUseQuestTransition(restored.quest, transitionId)).toBe(true);
    }
  });

  it("preserves first-playthrough completion flags and treats older saves as already introduced", () => {
    const current = savedState({ mode: "stay", commandPose: "lay" });
    current.flags = {
      dayWarningSeen: false,
      firstDayOpeningCompleted: false,
      brutusIntroTutorialCompleted: false
    };
    expect(parseBackupSave(serializeBackupSave(current)).flags).toEqual(current.flags);

    const older = savedState({ mode: "follow", commandPose: null });
    older.flags = { dayWarningSeen: false } as never;
    expect(parseBackupSave(serializeBackupSave(older)).flags).toEqual({
      dayWarningSeen: false,
      firstDayOpeningCompleted: true,
      brutusIntroTutorialCompleted: true
    });
  });
});

function savedState(companion: { mode: "follow" | "stay"; commandPose?: "sit" | "lay" | null }) {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: "2026-07-20T00:00:00.000Z",
    quest: createDemoQuestState(),
    mapId: "home" as const,
    phase: "day" as const,
    player: { position: { x: 464, y: 1232 }, facing: "down" as const },
    companion: {
      position: { x: 420, y: 1232 },
      facing: "right" as const,
      ...companion
    },
    inventory: [],
    equipment: createDefaultEquipment(),
    status: createDefaultStatus(),
    flags: {
      dayWarningSeen: false,
      firstDayOpeningCompleted: true,
      brutusIntroTutorialCompleted: true
    }
  };
}
