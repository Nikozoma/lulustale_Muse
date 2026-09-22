import type { FoundationMapId } from "./foundation";
import type { VisualPhase } from "./visual";

export type FriesOutcome = "mostly_saved" | "partial" | "stolen";
export type BedChoice = "stay_up" | "sleep";

export type DemoQuestStage =
  | "check_fridge"
  | "feed_brutus"
  | "go_to_charles"
  | "order_fries"
  | "head_home_with_fries"
  | "ambush_pending"
  | "investigate_bird"
  | "return_home_day"
  | "choose_day_end"
  | "night_quest_pending"
  | "leave_home_night"
  | "meet_night_guide"
  | "find_bush_sword"
  | "confront_bird_gang"
  | "return_home_night"
  | "sleep_after_night"
  | "complete";

export type DemoQuestState = {
  stage: DemoQuestStage;
  day: number;
  phase: VisualPhase;
  hasDogFood: boolean;
  dogFed: boolean;
  hasFries: boolean;
  friesOutcome: FriesOutcome | null;
  hasFeather: boolean;
  hasSword: boolean;
  birdGangDefeated: boolean;
};

export function createDemoQuestState(): DemoQuestState {
  return {
    stage: "check_fridge",
    day: 1,
    phase: "day",
    hasDogFood: false,
    dogFed: false,
    hasFries: false,
    friesOutcome: null,
    hasFeather: false,
    hasSword: false,
    birdGangDefeated: false
  };
}

export function getDemoObjective(state: DemoQuestState, mapId: FoundationMapId): string {
  switch (state.stage) {
    case "check_fridge":
      return "Check the fridge.";
    case "feed_brutus":
      return "Feed Brutus.";
    case "go_to_charles":
      return mapId === "home" ? "Leave home and go to Charles Jr." : "Go to Charles Jr.";
    case "order_fries":
      return "Order fries at the counter.";
    case "head_home_with_fries":
      return "Head home with the fries.";
    case "ambush_pending":
      return "Head home with the fries.";
    case "investigate_bird":
      return state.friesOutcome === "stolen" ? "Find the bird that stole the fries." : "Find out where that bird went.";
    case "return_home_day":
      return "Go home.";
    case "choose_day_end":
      return "Decide what to do tonight.";
    case "night_quest_pending":
      return "Stay up another night when you're ready.";
    case "leave_home_night":
      return "Check outside.";
    case "meet_night_guide":
      return "Talk to the man outside.";
    case "find_bush_sword":
      return "Find something to defend yourself.";
    case "confront_bird_gang":
      return "Confront the bird gang.";
    case "return_home_night":
      return "Go home.";
    case "sleep_after_night":
      return "Get some sleep.";
    case "complete":
      return "DAY 2 — THE BIRDS WILL REMEMBER THIS.";
  }
}

export function takeDogFood(state: DemoQuestState): DemoQuestState {
  if (state.stage !== "check_fridge") return state;
  return { ...state, stage: "feed_brutus", hasDogFood: true };
}

export function feedBrutusForQuest(state: DemoQuestState): DemoQuestState {
  if (state.stage !== "feed_brutus" || !state.hasDogFood) return state;
  return { ...state, stage: "go_to_charles", hasDogFood: false, dogFed: true };
}

export function orderFries(state: DemoQuestState): DemoQuestState {
  if (state.stage !== "order_fries") return state;
  return { ...state, stage: "head_home_with_fries", hasFries: true };
}

export function resolveFryDefense(state: DemoQuestState, outcome: FriesOutcome): DemoQuestState {
  if (state.stage !== "ambush_pending") return state;
  return {
    ...state,
    stage: "investigate_bird",
    friesOutcome: outcome,
    hasFries: outcome !== "stolen"
  };
}

export function resolveBirdInvestigation(state: DemoQuestState): DemoQuestState {
  if (state.stage !== "investigate_bird") return state;
  return {
    ...state,
    stage: "return_home_day",
    hasFeather: true
  };
}

export function chooseDayEnd(state: DemoQuestState, choice: BedChoice): DemoQuestState {
  if (state.stage !== "choose_day_end" && state.stage !== "night_quest_pending") return state;
  if (choice === "stay_up") {
    return { ...state, stage: "leave_home_night", phase: "night" };
  }
  return {
    ...state,
    stage: "night_quest_pending",
    day: state.day + 1,
    phase: "day"
  };
}

export function meetNightGuide(state: DemoQuestState): DemoQuestState {
  if (state.stage !== "meet_night_guide" || state.phase !== "night") return state;
  return { ...state, stage: "find_bush_sword" };
}

export function takeBushSword(state: DemoQuestState): DemoQuestState {
  if (state.stage !== "find_bush_sword" || state.phase !== "night") return state;
  return { ...state, stage: "confront_bird_gang", hasSword: true };
}

export function winBirdGangBattle(state: DemoQuestState): DemoQuestState {
  if (state.stage !== "confront_bird_gang" || !state.hasSword) return state;
  return { ...state, stage: "return_home_night", birdGangDefeated: true };
}

export function sleepAfterNight(state: DemoQuestState): DemoQuestState {
  if (state.stage !== "sleep_after_night" || !state.birdGangDefeated) return state;
  return { ...state, stage: "complete", day: state.day + 1, phase: "day" };
}

export function canUseQuestTransition(state: DemoQuestState, transitionId: string): boolean {
  if (!isDay1TravelUnlocked(state)) return false;
  switch (transitionId) {
    case "transition_home_to_overworld":
    case "transition_overworld_to_charles_jr":
    case "transition_charles_jr_to_overworld":
    case "transition_overworld_to_home":
      return true;
    default:
      return false;
  }
}

export function applyQuestTransition(state: DemoQuestState, transitionId: string): DemoQuestState {
  if (!canUseQuestTransition(state, transitionId)) return state;
  switch (transitionId) {
    case "transition_overworld_to_charles_jr":
      return state.stage === "go_to_charles" ? { ...state, stage: "order_fries" } : state;
    case "transition_charles_jr_to_overworld":
      return state.stage === "head_home_with_fries" ? { ...state, stage: "ambush_pending" } : state;
    case "transition_overworld_to_home":
      if (state.stage === "return_home_day") return { ...state, stage: "choose_day_end" };
      return state.stage === "return_home_night" ? { ...state, stage: "sleep_after_night" } : state;
    case "transition_home_to_overworld":
      return state.stage === "leave_home_night" ? { ...state, stage: "meet_night_guide" } : state;
    default:
      return state;
  }
}

export function isDay1TravelUnlocked(state: DemoQuestState): boolean {
  return state.stage !== "check_fridge" && state.stage !== "feed_brutus";
}
