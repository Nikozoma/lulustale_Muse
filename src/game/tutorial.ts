export type TutorialPopupId = "movement" | "quest_interaction" | "actions" | "menu" | "brutus";

export type TutorialPopupContent = {
  title: string;
  body: string[];
  buttonLabel: string;
};

export const TUTORIAL_CONTENT: Record<TutorialPopupId, TutorialPopupContent> = {
  movement: {
    title: "Movement",
    body: ["Move Lulu with the joystick."],
    buttonLabel: "Continue"
  },
  quest_interaction: {
    title: "Quest Interaction",
    body: ["See the ❕ marker? Tap it when you're close to interact with your current objective."],
    buttonLabel: "Continue"
  },
  actions: {
    title: "Actions",
    body: ["Use Actions near people, objects, or animals to see what Lulu can do."],
    buttonLabel: "Continue"
  },
  menu: {
    title: "Game Menu",
    body: ["Open Menu for quests, inventory, equipment, maps, save/load, and debug options."],
    buttonLabel: "Continue"
  },
  brutus: {
    title: "Brutus Is Your Companion",
    body: ["Use Actions near Brutus to pet or feed him, or tell him to Follow, Sit / Stay, Lie Down, and Fetch."],
    buttonLabel: "Continue"
  }
};

export const OPENING_TUTORIAL_SEQUENCE: readonly TutorialPopupId[] = [
  "movement",
  "quest_interaction",
  "actions",
  "menu"
];
