export type DialogueLine = { speaker: string; text: string };

export type NpcDialogueDefinition = {
  id: string;
  displayName: string;
  lines: DialogueLine[];
  bubble: string;
};

const PEDESTRIAN_LINES = [
  "Morning. I think the crows are holding meetings again.",
  "The bus was early today. I don't trust it.",
  "Nice weather. Suspiciously nice.",
  "I saw a bird carrying half a sandwich yesterday.",
  "Charles Jr. smells dangerous when you're hungry.",
  "Someone keeps leaving bread by the hedge.",
  "If you see a blue bird staring at you, stare back.",
  "I was going to exercise, but then I remembered sidewalks are optional."
];

export function getNpcDialogue(npcId: string): NpcDialogueDefinition | null {
  if (npcId === "cashier") {
    return {
      id: npcId,
      displayName: "Charles Jr. Employee",
      bubble: "Welcome in!",
      lines: [
        { speaker: "Cashier", text: "Hey! Let me know when you're ready to order." },
        { speaker: "Cashier", text: "The fryer is winning today." }
      ]
    };
  }
  if (npcId === "homeless-day") {
    return {
      id: npcId,
      displayName: "Neighborhood Regular",
      bubble: "Watch the birds.",
      lines: [
        { speaker: "Neighborhood Regular", text: "Birds don't steal. They collect." },
        { speaker: "Lulu", text: "You keep saying that like it's better." }
      ]
    };
  }
  if (npcId === "night-guide") {
    return {
      id: npcId,
      displayName: "Guide",
      bubble: "The birds are waiting.",
      lines: [
        { speaker: "Guide", text: "Night makes the neighborhood honest." },
        { speaker: "Lulu", text: "That sentence made it worse." }
      ]
    };
  }
  const pedestrianMatch = /^pedestrian-(\d+)$/.exec(npcId);
  if (pedestrianMatch) {
    const index = Math.max(0, Math.min(PEDESTRIAN_LINES.length - 1, Number(pedestrianMatch[1]) - 1));
    return {
      id: npcId,
      displayName: "Neighbor",
      bubble: PEDESTRIAN_LINES[index],
      lines: [{ speaker: "Neighbor", text: PEDESTRIAN_LINES[index] }]
    };
  }
  return null;
}
