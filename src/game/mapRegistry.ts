export type MapId = "Home" | "Overworld" | "Charles";

export type MapSpec = {
  id: MapId;
  fileName: string;
  href: string;
};

export const MAP_REGISTRY: Record<MapId, MapSpec> = {
  Home: {
    id: "Home",
    fileName: "Home.json",
    href: new URL("../../Home.json", import.meta.url).href
  },
  Overworld: {
    id: "Overworld",
    fileName: "Overworld.json",
    href: new URL("../../Overworld.json", import.meta.url).href
  },
  Charles: {
    id: "Charles",
    fileName: "Charles.json",
    href: new URL("../../Charles.json", import.meta.url).href
  }
};

export function getMapSpec(id: MapId): MapSpec {
  return MAP_REGISTRY[id];
}
