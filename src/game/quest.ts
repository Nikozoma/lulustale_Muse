import type { MapId } from "./mapRegistry";
import type { MarkerPosition, WorldPoint } from "./world";

export type InputMode = "desktop" | "mobile";
export type QuestStage =
  | "movement"
  | "get_food"
  | "feed_dog"
  | "go_to_door"
  | "go_to_charles_jr"
  | "order_fries"
  | "leave_charles_jr"
  | "bird_snatch"
  | "find_bird"
  | "steal_fries"
  | "go_home"
  | "go_to_bed"
  | "sleep_transition"
  | "wake_tapping"
  | "go_outside"
  | "night_overworld"
  | "bird_gang_intro"
  | "find_sword"
  | "fight_birds"
  | "go_back_inside"
  | "go_back_to_bed"
  | "complete";
export type QuestInteractionKind =
  | "fridge"
  | "dog"
  | "exit"
  | "charles_jr"
  | "order"
  | "charles_exit"
  | "bird"
  | "home"
  | "bed"
  | "sword";
export type BirdAttention = "watching" | "distracted";

export type QuestState = {
  location: MapId;
  stage: QuestStage;
  hasDogFood: boolean;
  dogFed: boolean;
  hasFries: boolean;
  friesStolen: boolean;
  friesRecovered: boolean;
  isNight: boolean;
  wakeStep: number;
  birdGangStep: number;
  hasSword: boolean;
  birdGangDefeated: boolean;
  message: string | null;
};

export type QuestMarkerPositions = {
  fridge: MarkerPosition[];
  dog: MarkerPosition[];
  exit: MarkerPosition[];
  charlesJr: MarkerPosition[];
  order: MarkerPosition[];
  bird: MarkerPosition[];
  home: MarkerPosition[];
  bed: MarkerPosition[];
  sword: MarkerPosition[];
};

export type QuestInteraction = {
  kind: QuestInteractionKind;
  prompt: string;
};

export type ActiveInteractableTarget = {
  kind: QuestInteractionKind;
  position: MarkerPosition;
  markerPosition: WorldPoint;
};

export function createQuestState(): QuestState {
  return {
    location: "Home",
    stage: "movement",
    hasDogFood: false,
    dogFed: false,
    hasFries: false,
    friesStolen: false,
    friesRecovered: false,
    isNight: false,
    wakeStep: 0,
    birdGangStep: 0,
    hasSword: false,
    birdGangDefeated: false,
    message: null
  };
}

export function restartQuest(): QuestState {
  return createQuestState();
}

export function markQuestMovementStarted(state: QuestState): QuestState {
  if (state.stage !== "movement") {
    return state;
  }
  return {
    ...state,
    stage: "get_food"
  };
}

export function getQuestObjective(state: QuestState, inputMode: InputMode): string {
  void inputMode;
  switch (state.stage) {
    case "movement":
      return "Drag the left side of the screen to move.";
    case "get_food":
      return "Get food from the fridge.";
    case "feed_dog":
      return "Feed the dog.";
    case "go_to_door":
      return "Go to the door.";
    case "go_to_charles_jr":
      return "Go to Charles Jr.";
    case "order_fries":
      return "Order fries at the counter.";
    case "leave_charles_jr":
      return "Go outside.";
    case "bird_snatch":
      return "A bird stole the fries!";
    case "find_bird":
      return "Find the bird.";
    case "steal_fries":
      return "Steal the fries back.";
    case "go_home":
      return "Go home.";
    case "go_to_bed":
      return "It's getting late, time for bed.";
    case "sleep_transition":
      return "Lulu goes to sleep...";
    case "wake_tapping":
      return "Wake up.";
    case "go_outside":
      return "Go outside.";
    case "night_overworld":
    case "bird_gang_intro":
      return "Check outside.";
    case "find_sword":
      return "Find something to defend yourself.";
    case "fight_birds":
      return "Defeat the bird gang.";
    case "go_back_inside":
      return "Go back inside.";
    case "go_back_to_bed":
      return "Go back to bed.";
    case "complete":
      return "END OF DEMO";
  }
}

export function getAvailableQuestInteraction(
  state: QuestState,
  playerPosition: WorldPoint,
  markers: QuestMarkerPositions,
  radius: number
): QuestInteraction | null {
  if (state.stage === "get_food" && isNearAny(playerPosition, markers.fridge, radius)) {
    return { kind: "fridge", prompt: "" };
  }

  if (state.stage === "feed_dog" && state.hasDogFood && isNearAny(playerPosition, markers.dog, radius)) {
    return { kind: "dog", prompt: "" };
  }

  if (state.stage === "go_to_door" && state.dogFed && isNearAny(playerPosition, markers.exit, radius)) {
    return { kind: "exit", prompt: "" };
  }

  if (state.stage === "go_to_charles_jr" && isNearAny(playerPosition, markers.charlesJr, radius)) {
    return { kind: "charles_jr", prompt: "" };
  }

  if (state.stage === "order_fries" && isNearAny(playerPosition, markers.order, radius)) {
    return { kind: "order", prompt: "" };
  }

  if (state.stage === "leave_charles_jr" && state.hasFries && isNearAny(playerPosition, markers.exit, radius)) {
    return { kind: "charles_exit", prompt: "" };
  }

  if (state.stage === "steal_fries" && state.friesStolen && isNearAny(playerPosition, markers.bird, radius)) {
    return { kind: "bird", prompt: "" };
  }

  if (state.stage === "go_home" && state.friesRecovered && isNearAny(playerPosition, markers.home, radius)) {
    return { kind: "home", prompt: "" };
  }

  if (state.stage === "go_to_bed" && state.friesRecovered && isNearAny(playerPosition, markers.bed, radius)) {
    return { kind: "bed", prompt: "" };
  }

  if (state.stage === "go_outside" && state.isNight && isNearAny(playerPosition, markers.exit, radius)) {
    return { kind: "exit", prompt: "" };
  }

  if (state.stage === "find_sword" && state.isNight && isNearAny(playerPosition, markers.sword, radius)) {
    return { kind: "sword", prompt: "" };
  }

  if (state.stage === "go_back_inside" && state.birdGangDefeated && isNearAny(playerPosition, markers.home, radius)) {
    return { kind: "home", prompt: "" };
  }

  if (state.stage === "go_back_to_bed" && state.birdGangDefeated && isNearAny(playerPosition, markers.bed, radius)) {
    return { kind: "bed", prompt: "" };
  }

  return null;
}

export function getActiveInteractableTarget(
  state: QuestState,
  markers: QuestMarkerPositions
): ActiveInteractableTarget | null {
  if (state.stage === "get_food") {
    return firstTarget("fridge", markers.fridge);
  }

  if (state.stage === "feed_dog" && state.hasDogFood) {
    return firstTarget("dog", markers.dog);
  }

  if (state.stage === "go_to_door" && state.dogFed) {
    return firstTarget("exit", markers.exit);
  }

  if (state.stage === "go_to_charles_jr") {
    return firstTarget("charles_jr", markers.charlesJr);
  }

  if (state.stage === "order_fries") {
    return firstTarget("order", markers.order);
  }

  if (state.stage === "leave_charles_jr" && state.hasFries) {
    return firstTarget("charles_exit", markers.exit);
  }

  if (state.stage === "steal_fries" && state.friesStolen) {
    return firstTarget("bird", markers.bird);
  }

  if (state.stage === "go_home" && state.friesRecovered) {
    return firstTarget("home", markers.home);
  }

  if (state.stage === "go_to_bed" && state.friesRecovered) {
    return firstTarget("bed", markers.bed);
  }

  if (state.stage === "go_outside" && state.isNight) {
    return firstTarget("exit", markers.exit);
  }

  if (state.stage === "find_sword" && state.isNight) {
    return firstTarget("sword", markers.sword);
  }

  if (state.stage === "go_back_inside" && state.birdGangDefeated) {
    return firstTarget("home", markers.home);
  }

  if (state.stage === "go_back_to_bed" && state.birdGangDefeated) {
    return firstTarget("bed", markers.bed);
  }

  return null;
}

export function getTappedQuestInteraction(
  state: QuestState,
  playerPosition: WorldPoint,
  tapPosition: WorldPoint,
  markers: QuestMarkerPositions,
  interactionRadius: number,
  tapRadius: number
): QuestInteraction | null {
  const activeTarget = getActiveInteractableTarget(state, markers);
  if (!activeTarget || distance(tapPosition, activeTarget.markerPosition) > tapRadius) {
    return null;
  }

  return getAvailableQuestInteraction(state, playerPosition, markers, interactionRadius);
}

export function applyQuestInteraction(state: QuestState, interaction: QuestInteraction): QuestState {
  if (state.stage === "get_food" && interaction.kind === "fridge") {
    return {
      ...state,
      stage: "feed_dog",
      hasDogFood: true,
      message: "Dog food acquired."
    };
  }

  if (state.stage === "feed_dog" && interaction.kind === "dog" && state.hasDogFood) {
    return {
      ...state,
      stage: "go_to_door",
      hasDogFood: false,
      dogFed: true,
      message: "Good dog!"
    };
  }

  if (state.stage === "go_to_door" && interaction.kind === "exit" && state.dogFed) {
    return {
      ...state,
      location: "Overworld",
      stage: "go_to_charles_jr",
      message: null
    };
  }

  if (state.stage === "go_to_charles_jr" && interaction.kind === "charles_jr") {
    return {
      ...state,
      location: "Charles",
      stage: "order_fries",
      message: null
    };
  }

  if (state.stage === "order_fries" && interaction.kind === "order") {
    return {
      ...state,
      stage: "leave_charles_jr",
      hasFries: true,
      message: "You got the fries."
    };
  }

  if (state.stage === "leave_charles_jr" && interaction.kind === "charles_exit" && state.hasFries) {
    return {
      ...state,
      location: "Overworld",
      stage: "bird_snatch",
      hasFries: false,
      friesStolen: true,
      message: "A bird swoops down and steals Lulu's fries!"
    };
  }

  if (state.stage === "go_home" && interaction.kind === "home" && state.friesRecovered) {
    return {
      ...state,
      location: "Home",
      stage: "go_to_bed",
      message: "It's getting late, time for bed."
    };
  }

  if (state.stage === "go_to_bed" && interaction.kind === "bed" && state.friesRecovered) {
    return {
      ...state,
      stage: "sleep_transition",
      message: "Lulu goes to sleep..."
    };
  }

  if (state.stage === "go_outside" && interaction.kind === "exit" && state.isNight) {
    return {
      ...state,
      location: "Overworld",
      stage: "night_overworld",
      message: null
    };
  }

  if (state.stage === "find_sword" && interaction.kind === "sword" && state.isNight) {
    return {
      ...state,
      stage: "fight_birds",
      hasSword: true,
      message: "Lulu found a sword in the bush. Obviously."
    };
  }

  if (state.stage === "go_back_inside" && interaction.kind === "home" && state.birdGangDefeated) {
    return {
      ...state,
      location: "Home",
      stage: "go_back_to_bed",
      message: "Go back to bed."
    };
  }

  if (state.stage === "go_back_to_bed" && interaction.kind === "bed" && state.birdGangDefeated) {
    return {
      ...state,
      stage: "complete",
      message: "Lulu finally gets some sleep."
    };
  }

  return state;
}

export function advanceSleepTransition(state: QuestState): QuestState {
  if (state.stage !== "sleep_transition") {
    return state;
  }

  return {
    ...state,
    stage: "wake_tapping",
    isNight: true,
    wakeStep: 0,
    message: "Tap... tap... tap..."
  };
}

export function advanceWakeSequence(state: QuestState): QuestState {
  if (state.stage !== "wake_tapping") {
    return state;
  }

  if (state.wakeStep === 0) {
    return {
      ...state,
      wakeStep: 1,
      message: "Something is tapping on the window."
    };
  }

  return {
    ...state,
    stage: "go_outside",
    wakeStep: 2,
    message: "Lulu should check outside."
  };
}

export function startBirdGangIntro(state: QuestState): QuestState {
  if (state.stage !== "night_overworld" || !state.isNight) {
    return state;
  }

  return {
    ...state,
    stage: "bird_gang_intro",
    birdGangStep: 0,
    message: "Three birds are waiting outside."
  };
}

export function advanceBirdGangIntro(state: QuestState): QuestState {
  if (state.stage !== "bird_gang_intro") {
    return state;
  }

  if (state.birdGangStep === 0) {
    return {
      ...state,
      birdGangStep: 1,
      message: "They remember the fries."
    };
  }

  if (state.birdGangStep === 1) {
    return {
      ...state,
      birdGangStep: 2,
      message: "This means war."
    };
  }

  return {
    ...state,
    stage: "find_sword",
    message: null
  };
}

export function completeBirdGangFight(state: QuestState): QuestState {
  if (state.stage !== "fight_birds" || !state.hasSword) {
    return state;
  }

  return {
    ...state,
    stage: "go_back_inside",
    birdGangDefeated: true,
    message: "The bird gang has been defeated. For now."
  };
}

export function triggerBirdSnatch(state: QuestState): QuestState {
  if (state.stage !== "leave_charles_jr" || !state.hasFries) {
    return state;
  }

  return {
    ...state,
    location: "Overworld",
    stage: "bird_snatch",
    hasFries: false,
    friesStolen: true,
    message: "A bird swoops down and steals Lulu's fries!"
  };
}

export function advanceBirdSnatchEvent(state: QuestState): QuestState {
  if (state.stage !== "bird_snatch" || !state.friesStolen) {
    return state;
  }

  return {
    ...state,
    stage: "find_bird",
    message: null
  };
}

export function discoverBird(state: QuestState): QuestState {
  if (state.stage !== "find_bird" || !state.friesStolen) {
    return state;
  }

  return {
    ...state,
    stage: "steal_fries",
    message: null
  };
}

export function applyBirdStealAttempt(
  state: QuestState,
  playerPosition: WorldPoint,
  birdPosition: WorldPoint,
  attention: BirdAttention,
  radius: number
): QuestState {
  if (state.stage !== "steal_fries" || !state.friesStolen || distance(playerPosition, birdPosition) > radius) {
    return state;
  }

  if (attention === "watching") {
    return {
      ...state,
      message: "Not while it's watching!"
    };
  }

  return {
    ...state,
    stage: "go_home",
    hasFries: true,
    friesRecovered: true,
    message: "You got the fries back!"
  };
}

function firstTarget(kind: QuestInteractionKind, positions: MarkerPosition[]): ActiveInteractableTarget | null {
  const position = positions[0];
  return position ? { kind, position, markerPosition: getMarkerPosition(kind, position) } : null;
}

function getMarkerPosition(kind: QuestInteractionKind, position: MarkerPosition): WorldPoint {
  switch (kind) {
    case "fridge":
      return { x: position.x + 32, y: position.y + 8 };
    case "dog":
      return { x: position.x, y: position.y - 20 };
    case "exit":
      return { x: position.x, y: position.y };
    case "charles_jr":
      return { x: position.x, y: position.y - 8 };
    case "order":
      return { x: position.x, y: position.y + 18 };
    case "charles_exit":
      return { x: position.x, y: position.y };
    case "bird":
      return { x: position.x, y: position.y - 22 };
    case "home":
      return { x: position.x, y: position.y - 8 };
    case "bed":
      return { x: position.x, y: position.y - 22 };
    case "sword":
      return { x: position.x, y: position.y - 18 };
  }
}

function isNearAny(playerPosition: WorldPoint, positions: MarkerPosition[], radius: number): boolean {
  return positions.some((position) => {
    return distance(playerPosition, position) <= radius;
  });
}

function distance(a: WorldPoint, b: WorldPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}
