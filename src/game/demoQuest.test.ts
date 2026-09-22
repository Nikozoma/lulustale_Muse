import { describe, expect, it } from "vitest";
import {
  applyQuestTransition,
  canUseQuestTransition,
  winBirdGangBattle,
  chooseDayEnd,
  createDemoQuestState,
  feedBrutusForQuest,
  getDemoObjective,
  isDay1TravelUnlocked,
  meetNightGuide,
  orderFries,
  resolveBirdInvestigation,
  resolveFryDefense,
  sleepAfterNight,
  takeBushSword,
  takeDogFood
} from "./demoQuest";

describe("Day 1 demo quest", () => {
  const travelTransitions = [
    "transition_home_to_overworld",
    "transition_overworld_to_home",
    "transition_overworld_to_charles_jr",
    "transition_charles_jr_to_overworld"
  ];

  it("runs the complete daytime route into night", () => {
    let state = createDemoQuestState();
    expect(getDemoObjective(state, "home")).toBe("Check the fridge.");
    state = takeDogFood(state);
    state = feedBrutusForQuest(state);
    expect(state.stage).toBe("go_to_charles");
    state = applyQuestTransition(state, "transition_home_to_overworld");
    state = applyQuestTransition(state, "transition_overworld_to_charles_jr");
    expect(state.stage).toBe("order_fries");
    state = orderFries(state);
    state = applyQuestTransition(state, "transition_charles_jr_to_overworld");
    state = resolveFryDefense(state, "stolen");
    state = resolveBirdInvestigation(state);
    state = applyQuestTransition(state, "transition_overworld_to_home");
    state = chooseDayEnd(state, "stay_up");
    expect(state.phase).toBe("night");
    expect(state.stage).toBe("leave_home_night");
  });

  it("allows sleeping first without permanently losing the night quest", () => {
    let state = createDemoQuestState();
    state = { ...state, stage: "choose_day_end", hasFeather: true };
    state = chooseDayEnd(state, "sleep");
    expect(state.day).toBe(2);
    expect(state.stage).toBe("night_quest_pending");
    state = chooseDayEnd(state, "stay_up");
    expect(state.stage).toBe("leave_home_night");
    expect(state.phase).toBe("night");
  });

  it("completes the real bird-gang battle route and reaches Day 2", () => {
    let state = createDemoQuestState();
    state = { ...state, stage: "meet_night_guide", phase: "night", hasFeather: true };
    state = meetNightGuide(state);
    state = takeBushSword(state);
    state = winBirdGangBattle(state);
    expect(state.birdGangDefeated).toBe(true);
    state = applyQuestTransition(state, "transition_overworld_to_home");
    expect(state.stage).toBe("sleep_after_night");
    state = sleepAfterNight(state);
    expect(state.stage).toBe("complete");
    expect(state.phase).toBe("day");
  });

  it("permanently unlocks all established Day 1 travel links after Brutus is fed", () => {
    const locked = createDemoQuestState();
    expect(isDay1TravelUnlocked(locked)).toBe(false);
    for (const transition of travelTransitions) expect(canUseQuestTransition(locked, transition)).toBe(false);

    const unlocked = feedBrutusForQuest(takeDogFood(locked));
    expect(isDay1TravelUnlocked(unlocked)).toBe(true);
    for (const transition of travelTransitions) expect(canUseQuestTransition(unlocked, transition)).toBe(true);

    const complete = { ...unlocked, stage: "complete" as const, birdGangDefeated: true };
    for (const transition of travelTransitions) expect(canUseQuestTransition(complete, transition)).toBe(true);
  });

  it("does not change later quest progress during ordinary unlocked travel", () => {
    const later = {
      ...createDemoQuestState(),
      stage: "find_bush_sword" as const,
      phase: "night" as const,
      hasFeather: true
    };
    for (const transition of travelTransitions) {
      expect(applyQuestTransition(later, transition)).toBe(later);
    }
  });
});
