import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getMapSpec, type MapId } from "./mapRegistry";
import { normalizeSemanticMap, type RawSemanticMap, type SemanticMap } from "./world";

export function loadSemanticMapFromProjectFile(id: MapId): SemanticMap {
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), getMapSpec(id).fileName), "utf8")) as RawSemanticMap;
  return normalizeSemanticMap(raw);
}
