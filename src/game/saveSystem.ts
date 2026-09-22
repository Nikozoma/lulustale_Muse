import {
  SAVE_SCHEMA_VERSION,
  createDefaultStatus,
  createEquipmentFromQuest,
  rebuildInventoryFromQuest,
  type PersistentGameState
} from "./gameState";

export const AUTOSAVE_STORAGE_KEY = "lulus-tale.autosave.v1";
export const BACKUP_SAVE_FORMAT = "lulus-tale-backup-save";

export type BackupSaveEnvelope = {
  format: typeof BACKUP_SAVE_FORMAT;
  version: typeof SAVE_SCHEMA_VERSION;
  exportedAt: string;
  state: PersistentGameState;
};

export function serializeBackupSave(state: PersistentGameState): string {
  const envelope: BackupSaveEnvelope = {
    format: BACKUP_SAVE_FORMAT,
    version: SAVE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    state
  };
  return JSON.stringify(envelope, null, 2);
}

export function parseBackupSave(text: string): PersistentGameState {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed) || parsed.format !== BACKUP_SAVE_FORMAT || parsed.version !== SAVE_SCHEMA_VERSION) {
    throw new Error("This is not a compatible Lulu's Tale backup save.");
  }
  if (!isRecord(parsed.state)) throw new Error("The backup save does not contain game state.");
  return normalizePersistentGameState(parsed.state);
}

export function writeAutosave(state: PersistentGameState): void {
  window.localStorage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify(state));
}

export function readAutosave(): PersistentGameState | null {
  const raw = window.localStorage.getItem(AUTOSAVE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    return normalizePersistentGameState(parsed);
  } catch {
    return null;
  }
}

export function exportBackupSave(state: PersistentGameState): void {
  const blob = new Blob([serializeBackupSave(state)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = backupFilename(new Date());
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

export async function readBackupSaveFile(file: File): Promise<PersistentGameState> {
  return parseBackupSave(await file.text());
}

function normalizePersistentGameState(value: Record<string, unknown>): PersistentGameState {
  if (value.schemaVersion !== SAVE_SCHEMA_VERSION) throw new Error("Unsupported save version.");
  if (!isRecord(value.quest) || !isRecord(value.player) || !isRecord(value.companion)) {
    throw new Error("Save data is incomplete.");
  }
  const quest = value.quest as unknown as PersistentGameState["quest"];
  const mapId = value.mapId;
  const phase = value.phase;
  if (mapId !== "home" && mapId !== "overworld" && mapId !== "charles_jr") throw new Error("Invalid saved map.");
  if (phase !== "day" && phase !== "night") throw new Error("Invalid saved phase.");
  const player = value.player as Record<string, unknown>;
  const companion = value.companion as Record<string, unknown>;
  if (!isWorldPoint(player.position) || typeof player.facing !== "string") throw new Error("Invalid saved player state.");
  if (!isWorldPoint(companion.position) || typeof companion.facing !== "string") throw new Error("Invalid saved companion state.");

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: typeof value.savedAt === "string" ? value.savedAt : new Date().toISOString(),
    quest,
    mapId,
    phase,
    player: {
      position: { ...player.position },
      facing: player.facing as PersistentGameState["player"]["facing"]
    },
    companion: {
      position: { ...companion.position },
      facing: companion.facing as PersistentGameState["companion"]["facing"],
      mode: companion.mode === "stay" ? "stay" : "follow",
      commandPose: normalizeCompanionCommandPose(companion.mode, companion.commandPose)
    },
    inventory: Array.isArray(value.inventory)
      ? (value.inventory as PersistentGameState["inventory"]).filter(
          (entry) => typeof entry?.itemId === "string" && Number.isFinite(entry.quantity) && entry.quantity > 0
        )
      : rebuildInventoryFromQuest(quest),
    equipment: isRecord(value.equipment)
      ? {
          weapon: typeof value.equipment.weapon === "string" ? value.equipment.weapon : null,
          body: typeof value.equipment.body === "string" ? value.equipment.body : null,
          accessory: typeof value.equipment.accessory === "string" ? value.equipment.accessory : null
        }
      : createEquipmentFromQuest(quest),
    status: isRecord(value.status)
      ? {
          ...createDefaultStatus(),
          ...(value.status as Partial<PersistentGameState["status"]>)
        }
      : createDefaultStatus(),
    flags: normalizeFlags(value.flags)
  };
}

function normalizeFlags(value: unknown): PersistentGameState["flags"] {
  if (!isRecord(value)) {
    return {
      dayWarningSeen: false,
      firstDayOpeningCompleted: true,
      brutusIntroTutorialCompleted: true
    };
  }
  return {
    dayWarningSeen: value.dayWarningSeen === true,
    // Saves created before these flags already represent an in-progress game,
    // so they must not replay first-playthrough presentation on load.
    firstDayOpeningCompleted:
      typeof value.firstDayOpeningCompleted === "boolean" ? value.firstDayOpeningCompleted : true,
    brutusIntroTutorialCompleted:
      typeof value.brutusIntroTutorialCompleted === "boolean" ? value.brutusIntroTutorialCompleted : true
  };
}

function normalizeCompanionCommandPose(mode: unknown, commandPose: unknown): "sit" | "lay" | null {
  if (mode !== "stay") return null;
  return commandPose === "lay" ? "lay" : "sit";
}

function backupFilename(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `Lulus_Tale_Save_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.lulusave`;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWorldPoint(value: unknown): value is { x: number; y: number } {
  return isRecord(value) && typeof value.x === "number" && Number.isFinite(value.x) && typeof value.y === "number" && Number.isFinite(value.y);
}
