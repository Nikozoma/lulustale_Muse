import type { FoundationVisual, RuntimeMap, WorldPoint } from "./foundation";

export type BattleBackdrop = {
  assetHref: string;
  backgroundPosition: string;
  backgroundSize: string;
  locationLabel: string;
  theme: "day" | "night" | "interior";
};

const LOCATION_LABELS: Record<RuntimeMap["id"], string> = {
  home: "Home",
  overworld: "Overworld",
  charles_jr: "Charles Jr."
};

export function createBattleBackdrop(
  map: Pick<RuntimeMap, "id" | "width" | "height">,
  visual: FoundationVisual,
  encounterPosition: WorldPoint
): BattleBackdrop {
  return {
    assetHref: mapAssetHref(visual.base_layer.asset),
    backgroundPosition: `${percent(encounterPosition.x, map.width)}% ${percent(encounterPosition.y, map.height)}%`,
    backgroundSize: map.id === "overworld" ? "240% auto" : "190% auto",
    locationLabel: `${LOCATION_LABELS[map.id]} · ${visual.variant === "night" ? "Night" : "Day"}`,
    theme: map.id === "overworld" ? visual.variant : "interior"
  };
}

function mapAssetHref(assetPath: string): string {
  return `/assets/maps/native/${assetPath.replace(/^production\//, "")}`;
}

function percent(value: number, extent: number): string {
  const normalized = extent > 0 ? (value / extent) * 100 : 50;
  return Math.max(0, Math.min(100, normalized)).toFixed(2);
}
