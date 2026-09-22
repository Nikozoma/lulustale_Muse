import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getMapSpec, type MapId } from "./mapRegistry";
import {
  getVisualCompanionFileName,
  normalizeVisualMap,
  type RawVisualMap,
  type VisualMap,
  type VisualPhase
} from "./visual";

export function loadVisualMapFromProjectFile(id: MapId, phase: VisualPhase = "day"): VisualMap | null {
  const visualFileName = getVisualCompanionFileName(getMapSpec(id).fileName, phase);
  const visualPath = resolve(process.cwd(), visualFileName);

  if (!existsSync(visualPath)) {
    return null;
  }

  const raw = JSON.parse(readFileSync(visualPath, "utf8")) as RawVisualMap;
  return normalizeVisualMap(raw);
}
