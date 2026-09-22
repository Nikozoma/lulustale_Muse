import { describe, expect, it } from "vitest";
import {
  advanceBirdSnatchEvent,
  advanceBirdGangIntro,
  advanceSleepTransition,
  advanceWakeSequence,
  applyBirdStealAttempt,
  applyQuestInteraction,
  completeBirdGangFight,
  createQuestState,
  discoverBird,
  getActiveInteractableTarget,
  getAvailableQuestInteraction,
  getTappedQuestInteraction,
  getQuestObjective,
  markQuestMovementStarted,
  restartQuest,
  startBirdGangIntro,
  triggerBirdSnatch,
  type QuestMarkerPositions
} from "./quest";

const markers: QuestMarkerPositions = {
  fridge: [{ x: 752, y: 912, tileX: 23, tileY: 28 }],
  dog: [{ x: 208, y: 1200, tileX: 6, tileY: 37 }],
  exit: [{ x: 464, y: 1264, tileX: 14, tileY: 39 }],
  charlesJr: [{ x: 464, y: 656, tileX: 14, tileY: 20 }],
  order: [{ x: 592, y: 336, tileX: 18, tileY: 10 }],
  bird: [{ x: 336, y: 592, tileX: 10, tileY: 18 }],
  home: [{ x: 1072, y: 624, tileX: 33, tileY: 19 }],
  bed: [{ x: 624, y: 400, tileX: 19, tileY: 12 }],
  sword: [{ x: 1168, y: 624, tileX: 36, tileY: 19 }]
};

describe("indoor home quest flow", () => {
  it("advances through the full first-day demo flow and restarts", () => {
    let quest = createQuestState();

    expect(quest.location).toBe("Home");
    expect(getQuestObjective(quest, "desktop")).toBe("Drag the left side of the screen to move.");
    quest = markQuestMovementStarted(quest);
    expect(getQuestObjective(quest, "desktop")).toBe("Get food from the fridge.");

    const fridge = getAvailableQuestInteraction(quest, { x: 750, y: 910 }, markers, 40);
    expect(fridge?.kind).toBe("fridge");
    quest = applyQuestInteraction(quest, fridge!);
    expect(quest.hasDogFood).toBe(true);
    expect(getQuestObjective(quest, "desktop")).toBe("Feed the dog.");

    const dog = getAvailableQuestInteraction(quest, { x: 206, y: 1198 }, markers, 40);
    expect(dog?.kind).toBe("dog");
    quest = applyQuestInteraction(quest, dog!);
    expect(quest.hasDogFood).toBe(false);
    expect(quest.dogFed).toBe(true);
    expect(getQuestObjective(quest, "desktop")).toBe("Go to the door.");

    const exit = getAvailableQuestInteraction(quest, { x: 464, y: 1264 }, markers, 40);
    expect(exit?.kind).toBe("exit");
    quest = applyQuestInteraction(quest, exit!);
    expect(quest.location).toBe("Overworld");
    expect(quest.stage).toBe("go_to_charles_jr");
    expect(getQuestObjective(quest, "desktop")).toBe("Go to Charles Jr.");

    const charlesJr = getAvailableQuestInteraction(quest, { x: 464, y: 656 }, markers, 40);
    expect(charlesJr?.kind).toBe("charles_jr");
    quest = applyQuestInteraction(quest, charlesJr!);
    expect(quest.location).toBe("Charles");
    expect(quest.stage).toBe("order_fries");
    expect(getQuestObjective(quest, "desktop")).toBe("Order fries at the counter.");

    const order = getAvailableQuestInteraction(quest, { x: 592, y: 336 }, markers, 40);
    expect(order?.kind).toBe("order");
    quest = applyQuestInteraction(quest, order!);
    expect(quest.hasFries).toBe(true);
    expect(quest.stage).toBe("leave_charles_jr");
    expect(getQuestObjective(quest, "desktop")).toBe("Go outside.");

    const charlesExit = getAvailableQuestInteraction(quest, { x: 464, y: 1264 }, markers, 40);
    expect(charlesExit?.kind).toBe("charles_exit");
    quest = applyQuestInteraction(quest, charlesExit!);
    expect(quest.location).toBe("Overworld");
    expect(quest.stage).toBe("bird_snatch");
    expect(quest.hasFries).toBe(false);
    expect(quest.friesStolen).toBe(true);
    expect(quest.message).toBe("A bird swoops down and steals Lulu's fries!");

    quest = advanceBirdSnatchEvent(quest);
    expect(getQuestObjective(quest, "desktop")).toBe("Find the bird.");

    quest = discoverBird(quest);
    expect(getQuestObjective(quest, "desktop")).toBe("Steal the fries back.");

    quest = applyBirdStealAttempt(quest, { x: 336, y: 592 }, { x: 336, y: 592 }, "distracted", 42);
    expect(quest.hasFries).toBe(true);
    expect(quest.friesRecovered).toBe(true);
    expect(quest.stage).toBe("go_home");
    expect(getQuestObjective(quest, "desktop")).toBe("Go home.");

    const home = getAvailableQuestInteraction(quest, { x: 1072, y: 624 }, markers, 40);
    expect(home?.kind).toBe("home");
    quest = applyQuestInteraction(quest, home!);
    expect(quest.location).toBe("Home");
    expect(quest.stage).toBe("go_to_bed");
    expect(getQuestObjective(quest, "desktop")).toBe("It's getting late, time for bed.");

    const bed = getAvailableQuestInteraction(quest, { x: 624, y: 400 }, markers, 40);
    expect(bed?.kind).toBe("bed");
    quest = applyQuestInteraction(quest, bed!);
    expect(quest.stage).toBe("sleep_transition");
    expect(quest.isNight).toBe(false);
    expect(quest.message).toBe("Lulu goes to sleep...");
    expect(getQuestObjective(quest, "desktop")).toBe("Lulu goes to sleep...");

    quest = advanceSleepTransition(quest);
    expect(quest.stage).toBe("wake_tapping");
    expect(quest.isNight).toBe(true);
    expect(quest.message).toBe("Tap... tap... tap...");

    quest = advanceWakeSequence(quest);
    expect(quest.message).toBe("Something is tapping on the window.");

    quest = advanceWakeSequence(quest);
    expect(quest.stage).toBe("go_outside");
    expect(getQuestObjective(quest, "desktop")).toBe("Go outside.");
    expect(quest.message).toBe("Lulu should check outside.");

    const nightExit = getAvailableQuestInteraction(quest, { x: 464, y: 1264 }, markers, 40);
    expect(nightExit?.kind).toBe("exit");
    quest = applyQuestInteraction(quest, nightExit!);
    expect(quest.location).toBe("Overworld");
    expect(quest.stage).toBe("night_overworld");
    expect(quest.isNight).toBe(true);
    expect(getQuestObjective(quest, "desktop")).toBe("Check outside.");

    quest = startBirdGangIntro(quest);
    expect(quest.stage).toBe("bird_gang_intro");
    expect(quest.message).toBe("Three birds are waiting outside.");

    quest = advanceBirdGangIntro(quest);
    expect(quest.message).toBe("They remember the fries.");

    quest = advanceBirdGangIntro(quest);
    expect(quest.message).toBe("This means war.");

    quest = advanceBirdGangIntro(quest);
    expect(quest.stage).toBe("find_sword");
    expect(getQuestObjective(quest, "desktop")).toBe("Find something to defend yourself.");

    const sword = getAvailableQuestInteraction(quest, { x: 1168, y: 624 }, markers, 40);
    expect(sword?.kind).toBe("sword");
    quest = applyQuestInteraction(quest, sword!);
    expect(quest.stage).toBe("fight_birds");
    expect(quest.hasSword).toBe(true);
    expect(quest.message).toBe("Lulu found a sword in the bush. Obviously.");

    quest = completeBirdGangFight(quest);
    expect(quest.stage).toBe("go_back_inside");
    expect(quest.birdGangDefeated).toBe(true);
    expect(getQuestObjective(quest, "desktop")).toBe("Go back inside.");

    const returnHome = getAvailableQuestInteraction(quest, { x: 1072, y: 624 }, markers, 40);
    expect(returnHome?.kind).toBe("home");
    quest = applyQuestInteraction(quest, returnHome!);
    expect(quest.location).toBe("Home");
    expect(quest.stage).toBe("go_back_to_bed");
    expect(getQuestObjective(quest, "desktop")).toBe("Go back to bed.");

    const finalBed = getAvailableQuestInteraction(quest, { x: 624, y: 400 }, markers, 40);
    expect(finalBed?.kind).toBe("bed");
    quest = applyQuestInteraction(quest, finalBed!);
    expect(quest.stage).toBe("complete");
    expect(quest.message).toBe("Lulu finally gets some sleep.");
    expect(getQuestObjective(quest, "desktop")).toBe("END OF DEMO");

    quest = restartQuest();
    expect(quest).toEqual(createQuestState());
  });

  it("uses mobile movement instruction copy", () => {
    expect(getQuestObjective(createQuestState(), "mobile")).toBe("Drag the left side of the screen to move.");
    expect(getQuestObjective(createQuestState(), "desktop")).not.toMatch(/WASD|arrow/i);
  });

  it("only offers the relevant nearby interaction for the current quest stage", () => {
    const nearFridge = { x: 750, y: 910 };
    const nearDog = { x: 206, y: 1198 };
    const nearExit = { x: 464, y: 1264 };
    const farAway = { x: 16, y: 16 };
    let quest = createQuestState();

    expect(getAvailableQuestInteraction(quest, nearFridge, markers, 42)).toBeNull();

    quest = markQuestMovementStarted(quest);
    expect(getAvailableQuestInteraction(quest, farAway, markers, 42)).toBeNull();
    expect(getAvailableQuestInteraction(quest, nearDog, markers, 42)).toBeNull();
    expect(getAvailableQuestInteraction(quest, nearExit, markers, 42)).toBeNull();
    expect(getAvailableQuestInteraction(quest, nearFridge, markers, 42)?.kind).toBe("fridge");

    quest = applyQuestInteraction(quest, { kind: "fridge", prompt: "" });
    expect(getAvailableQuestInteraction(quest, nearFridge, markers, 42)).toBeNull();
    expect(getAvailableQuestInteraction(quest, nearExit, markers, 42)).toBeNull();
    expect(getAvailableQuestInteraction(quest, nearDog, markers, 42)?.kind).toBe("dog");

    quest = applyQuestInteraction(quest, { kind: "dog", prompt: "" });
    expect(getAvailableQuestInteraction(quest, nearDog, markers, 42)).toBeNull();
    expect(getAvailableQuestInteraction(quest, nearFridge, markers, 42)).toBeNull();
    expect(getAvailableQuestInteraction(quest, nearExit, markers, 42)?.kind).toBe("exit");

    quest = applyQuestInteraction(quest, { kind: "exit", prompt: "" });
    expect(getAvailableQuestInteraction(quest, nearExit, markers, 42)).toBeNull();
    expect(getAvailableQuestInteraction(quest, nearFridge, markers, 42)).toBeNull();
    expect(getAvailableQuestInteraction(quest, farAway, markers, 42)).toBeNull();
    expect(getAvailableQuestInteraction(quest, { x: 464, y: 656 }, markers, 42)?.kind).toBe("charles_jr");

    quest = applyQuestInteraction(quest, { kind: "charles_jr", prompt: "" });
    expect(getAvailableQuestInteraction(quest, { x: 464, y: 656 }, markers, 42)).toBeNull();
    expect(getAvailableQuestInteraction(quest, { x: 592, y: 336 }, markers, 20)?.kind).toBe("order");

    quest = applyQuestInteraction(quest, { kind: "order", prompt: "" });
    expect(getAvailableQuestInteraction(quest, { x: 592, y: 336 }, markers, 42)).toBeNull();
    expect(getAvailableQuestInteraction(quest, nearExit, markers, 42)?.kind).toBe("charles_exit");

    quest = applyQuestInteraction(quest, { kind: "charles_exit", prompt: "" });
    expect(getAvailableQuestInteraction(quest, { x: 336, y: 592 }, markers, 42)).toBeNull();

    quest = advanceBirdSnatchEvent(quest);
    expect(getAvailableQuestInteraction(quest, { x: 336, y: 592 }, markers, 42)).toBeNull();

    quest = discoverBird(quest);
    expect(getAvailableQuestInteraction(quest, { x: 336, y: 592 }, markers, 42)?.kind).toBe("bird");

    quest = applyBirdStealAttempt(quest, { x: 336, y: 592 }, { x: 336, y: 592 }, "distracted", 42);
    expect(getAvailableQuestInteraction(quest, { x: 1072, y: 624 }, markers, 42)?.kind).toBe("home");

    quest = applyQuestInteraction(quest, { kind: "home", prompt: "" });
    expect(getAvailableQuestInteraction(quest, { x: 624, y: 400 }, markers, 42)?.kind).toBe("bed");

    quest = applyQuestInteraction(quest, { kind: "bed", prompt: "" });
    expect(getAvailableQuestInteraction(quest, nearExit, markers, 42)).toBeNull();

    quest = advanceSleepTransition(quest);
    expect(getAvailableQuestInteraction(quest, nearExit, markers, 42)).toBeNull();

    quest = advanceWakeSequence(advanceWakeSequence(quest));
    expect(getAvailableQuestInteraction(quest, nearDog, markers, 42)).toBeNull();
    expect(getAvailableQuestInteraction(quest, { x: 624, y: 400 }, markers, 42)).toBeNull();
    expect(getAvailableQuestInteraction(quest, nearExit, markers, 42)?.kind).toBe("exit");

    quest = applyQuestInteraction(quest, { kind: "exit", prompt: "" });
    quest = advanceBirdGangIntro(advanceBirdGangIntro(advanceBirdGangIntro(startBirdGangIntro(quest))));
    expect(getAvailableQuestInteraction(quest, nearExit, markers, 42)).toBeNull();
    expect(getAvailableQuestInteraction(quest, { x: 1168, y: 624 }, markers, 42)?.kind).toBe("sword");

    quest = applyQuestInteraction(quest, { kind: "sword", prompt: "" });
    expect(getAvailableQuestInteraction(quest, { x: 1072, y: 624 }, markers, 42)).toBeNull();

    quest = completeBirdGangFight(quest);
    expect(getAvailableQuestInteraction(quest, { x: 1072, y: 624 }, markers, 42)?.kind).toBe("home");

    quest = applyQuestInteraction(quest, { kind: "home", prompt: "" });
    expect(getAvailableQuestInteraction(quest, { x: 624, y: 400 }, markers, 42)?.kind).toBe("bed");
  });

  it("exposes only the current objective target for the interactable marker", () => {
    let quest = createQuestState();
    expect(getActiveInteractableTarget(quest, markers)).toBeNull();

    quest = markQuestMovementStarted(quest);
    expect(getActiveInteractableTarget(quest, markers)).toMatchObject({
      kind: "fridge",
      markerPosition: { x: 784, y: 920 }
    });

    quest = applyQuestInteraction(quest, { kind: "fridge", prompt: "" });
    expect(getActiveInteractableTarget(quest, markers)).toMatchObject({
      kind: "dog",
      markerPosition: { x: 208, y: 1180 }
    });

    quest = applyQuestInteraction(quest, { kind: "dog", prompt: "" });
    expect(getActiveInteractableTarget(quest, markers)).toMatchObject({
      kind: "exit",
      markerPosition: { x: 464, y: 1264 }
    });

    quest = applyQuestInteraction(quest, { kind: "exit", prompt: "" });
    expect(getActiveInteractableTarget(quest, markers)).toMatchObject({
      kind: "charles_jr",
      markerPosition: { x: 464, y: 648 }
    });

    quest = applyQuestInteraction(quest, { kind: "charles_jr", prompt: "" });
    expect(getActiveInteractableTarget(quest, markers)).toMatchObject({
      kind: "order",
      markerPosition: { x: 592, y: 354 }
    });

    quest = applyQuestInteraction(quest, { kind: "order", prompt: "" });
    expect(getActiveInteractableTarget(quest, markers)).toMatchObject({
      kind: "charles_exit",
      markerPosition: { x: 464, y: 1264 }
    });

    quest = applyQuestInteraction(quest, { kind: "charles_exit", prompt: "" });
    expect(getActiveInteractableTarget(quest, markers)).toBeNull();

    quest = advanceBirdSnatchEvent(quest);
    expect(getActiveInteractableTarget(quest, markers)).toBeNull();

    quest = discoverBird(quest);
    expect(getActiveInteractableTarget(quest, markers)).toMatchObject({
      kind: "bird",
      markerPosition: { x: 336, y: 570 }
    });

    quest = applyBirdStealAttempt(quest, { x: 336, y: 592 }, { x: 336, y: 592 }, "distracted", 42);
    expect(getActiveInteractableTarget(quest, markers)).toMatchObject({
      kind: "home",
      markerPosition: { x: 1072, y: 616 }
    });

    quest = applyQuestInteraction(quest, { kind: "home", prompt: "" });
    expect(getActiveInteractableTarget(quest, markers)).toMatchObject({
      kind: "bed",
      markerPosition: { x: 624, y: 378 }
    });

    quest = applyQuestInteraction(quest, { kind: "bed", prompt: "" });
    expect(getActiveInteractableTarget(quest, markers)).toBeNull();

    quest = advanceSleepTransition(quest);
    expect(getActiveInteractableTarget(quest, markers)).toBeNull();

    quest = advanceWakeSequence(advanceWakeSequence(quest));
    expect(getActiveInteractableTarget(quest, markers)).toMatchObject({
      kind: "exit",
      markerPosition: { x: 464, y: 1264 }
    });

    quest = applyQuestInteraction(quest, { kind: "exit", prompt: "" });
    quest = advanceBirdGangIntro(advanceBirdGangIntro(advanceBirdGangIntro(startBirdGangIntro(quest))));
    expect(getActiveInteractableTarget(quest, markers)).toMatchObject({
      kind: "sword",
      markerPosition: { x: 1168, y: 606 }
    });

    quest = applyQuestInteraction(quest, { kind: "sword", prompt: "" });
    expect(getActiveInteractableTarget(quest, markers)).toBeNull();

    quest = completeBirdGangFight(quest);
    expect(getActiveInteractableTarget(quest, markers)).toMatchObject({
      kind: "home",
      markerPosition: { x: 1072, y: 616 }
    });

    quest = applyQuestInteraction(quest, { kind: "home", prompt: "" });
    expect(getActiveInteractableTarget(quest, markers)).toMatchObject({
      kind: "bed",
      markerPosition: { x: 624, y: 378 }
    });
  });

  it("allows tapping the active marker only when Lulu is also in interaction range", () => {
    const quest = markQuestMovementStarted(createQuestState());
    const fridgeMarkerTap = { x: 784, y: 920 };

    expect(getTappedQuestInteraction(quest, { x: 16, y: 16 }, fridgeMarkerTap, markers, 42, 36)).toBeNull();
    expect(getTappedQuestInteraction(quest, { x: 750, y: 910 }, { x: 464, y: 1264 }, markers, 42, 36)).toBeNull();
    expect(getTappedQuestInteraction(quest, { x: 750, y: 910 }, fridgeMarkerTap, markers, 42, 36)?.kind).toBe("fridge");
  });

  it("bird steal fails while watching, succeeds while distracted, and requires range", () => {
    let quest = createQuestState();
    quest = {
      ...quest,
      location: "Overworld",
      stage: "find_bird",
      friesStolen: true
    };
    quest = discoverBird(quest);

    const birdPosition = { x: 336, y: 592 };
    expect(getTappedQuestInteraction(quest, { x: 16, y: 16 }, { x: 336, y: 570 }, markers, 42, 42)).toBeNull();
    expect(getTappedQuestInteraction(quest, birdPosition, { x: 336, y: 570 }, markers, 42, 42)?.kind).toBe("bird");

    const watchingAttempt = applyBirdStealAttempt(quest, birdPosition, birdPosition, "watching", 42);
    expect(watchingAttempt.stage).toBe("steal_fries");
    expect(watchingAttempt.hasFries).toBe(false);
    expect(watchingAttempt.message).toBe("Not while it's watching!");

    const farAttempt = applyBirdStealAttempt(quest, { x: 16, y: 16 }, birdPosition, "distracted", 42);
    expect(farAttempt).toBe(quest);

    const success = applyBirdStealAttempt(quest, birdPosition, birdPosition, "distracted", 42);
    expect(success.stage).toBe("go_home");
    expect(success.hasFries).toBe(true);
    expect(success.friesRecovered).toBe(true);
    expect(success.message).toBe("You got the fries back!");
  });

  it("keeps bird snatch, discovery, return home, and bed ending explicit", () => {
    let quest = createQuestState();
    quest = {
      ...quest,
      location: "Charles",
      stage: "leave_charles_jr",
      hasFries: true
    };

    quest = triggerBirdSnatch(quest);
    expect(quest.location).toBe("Overworld");
    expect(quest.stage).toBe("bird_snatch");
    expect(quest.hasFries).toBe(false);
    expect(quest.friesStolen).toBe(true);
    expect(quest.message).toBe("A bird swoops down and steals Lulu's fries!");

    quest = advanceBirdSnatchEvent(quest);
    expect(quest.stage).toBe("find_bird");
    expect(getQuestObjective(quest, "mobile")).toBe("Find the bird.");

    quest = discoverBird(quest);
    expect(quest.stage).toBe("steal_fries");
    expect(getQuestObjective(quest, "mobile")).toBe("Steal the fries back.");

    quest = applyBirdStealAttempt(quest, { x: 336, y: 592 }, { x: 336, y: 592 }, "distracted", 42);
    expect(quest.stage).toBe("go_home");
    expect(getQuestObjective(quest, "mobile")).toBe("Go home.");

    quest = applyQuestInteraction(quest, { kind: "home", prompt: "" });
    expect(quest.stage).toBe("go_to_bed");
    expect(getQuestObjective(quest, "mobile")).toBe("It's getting late, time for bed.");

    quest = applyQuestInteraction(quest, { kind: "bed", prompt: "" });
    expect(quest.stage).toBe("sleep_transition");
    expect(quest.message).toBe("Lulu goes to sleep...");

    quest = advanceSleepTransition(quest);
    expect(quest.isNight).toBe(true);
    expect(quest.message).toBe("Tap... tap... tap...");

    quest = advanceWakeSequence(quest);
    expect(quest.message).toBe("Something is tapping on the window.");

    quest = advanceWakeSequence(quest);
    expect(quest.stage).toBe("go_outside");
    expect(getQuestObjective(quest, "mobile")).toBe("Go outside.");
    expect(quest.message).toBe("Lulu should check outside.");
  });

  it("keeps night state active after wake-up exit and restart clears it", () => {
    let quest = createQuestState();
    quest = {
      ...quest,
      location: "Home",
      stage: "go_to_bed",
      hasFries: true,
      friesStolen: true,
      friesRecovered: true
    };

    quest = applyQuestInteraction(quest, { kind: "bed", prompt: "" });
    expect(quest.stage).not.toBe("complete");

    quest = advanceSleepTransition(quest);
    quest = advanceWakeSequence(advanceWakeSequence(quest));
    expect(quest.stage).toBe("go_outside");
    expect(quest.isNight).toBe(true);
    expect(getActiveInteractableTarget(quest, markers)?.kind).toBe("exit");

    quest = applyQuestInteraction(quest, { kind: "exit", prompt: "" });
    expect(quest.location).toBe("Overworld");
    expect(quest.stage).toBe("night_overworld");
    expect(quest.isNight).toBe(true);
    expect(getQuestObjective(quest, "mobile")).toBe("Check outside.");

    expect(restartQuest()).toEqual(createQuestState());
  });

  it("runs bird gang intro, sword pickup, fight completion, return home, and final bed ending", () => {
    let quest = createQuestState();
    quest = {
      ...quest,
      location: "Overworld",
      stage: "night_overworld",
      isNight: true
    };

    quest = startBirdGangIntro(quest);
    expect(quest.message).toBe("Three birds are waiting outside.");
    expect(getQuestObjective(quest, "mobile")).toBe("Check outside.");

    quest = advanceBirdGangIntro(quest);
    expect(quest.message).toBe("They remember the fries.");
    quest = advanceBirdGangIntro(quest);
    expect(quest.message).toBe("This means war.");
    quest = advanceBirdGangIntro(quest);
    expect(quest.stage).toBe("find_sword");
    expect(getQuestObjective(quest, "mobile")).toBe("Find something to defend yourself.");

    expect(getAvailableQuestInteraction(quest, { x: 16, y: 16 }, markers, 42)).toBeNull();
    expect(getAvailableQuestInteraction(quest, { x: 1168, y: 624 }, markers, 42)?.kind).toBe("sword");

    quest = applyQuestInteraction(quest, { kind: "sword", prompt: "" });
    expect(quest.stage).toBe("fight_birds");
    expect(quest.hasSword).toBe(true);
    expect(getQuestObjective(quest, "mobile")).toBe("Defeat the bird gang.");

    quest = completeBirdGangFight(quest);
    expect(quest.stage).toBe("go_back_inside");
    expect(quest.birdGangDefeated).toBe(true);
    expect(quest.message).toBe("The bird gang has been defeated. For now.");

    quest = applyQuestInteraction(quest, { kind: "home", prompt: "" });
    expect(quest.location).toBe("Home");
    expect(quest.stage).toBe("go_back_to_bed");
    expect(getQuestObjective(quest, "mobile")).toBe("Go back to bed.");

    quest = applyQuestInteraction(quest, { kind: "bed", prompt: "" });
    expect(quest.stage).toBe("complete");
    expect(quest.isNight).toBe(true);
    expect(quest.message).toBe("Lulu finally gets some sleep.");
  });
});
