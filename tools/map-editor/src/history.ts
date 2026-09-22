import type {
  ArtLayer,
  HistorySnapshot,
  MapProjectManifest,
  RepairAnnotation,
  SemanticMap,
  VisualMap,
  Phase
} from "./types.js";

export class StudioHistory {
  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];

  capture(
    label: string,
    semantic: SemanticMap,
    visuals: Record<Phase, VisualMap>,
    repairs: RepairAnnotation[],
    art: Record<Phase, { layers: ArtLayer[] }>,
    approval: MapProjectManifest["approval"]
  ): void {
    this.undoStack.push({
      label,
      semantic: structuredClone(semantic),
      visuals: structuredClone(visuals),
      repairs: structuredClone(repairs),
      art: structuredClone(art),
      approval: structuredClone(approval)
    });
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(current: HistorySnapshot): HistorySnapshot | null {
    const previous = this.undoStack.pop();
    if (!previous) return null;
    this.redoStack.push(structuredClone(current));
    return previous;
  }

  redo(current: HistorySnapshot): HistorySnapshot | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(structuredClone(current));
    return next;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
