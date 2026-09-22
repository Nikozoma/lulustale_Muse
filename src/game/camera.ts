import type { WorldPoint } from "./world";

export type Size = {
  width: number;
  height: number;
};

export function clampCamera(target: WorldPoint, world: Size, viewport: Size): WorldPoint {
  return {
    x: clampAxis(target.x - viewport.width / 2, world.width, viewport.width),
    y: clampAxis(target.y - viewport.height / 2, world.height, viewport.height)
  };
}

export function getVisibleWorldViewport(screenViewport: Size, renderZoom: number): Size {
  return {
    width: screenViewport.width / renderZoom,
    height: screenViewport.height / renderZoom
  };
}

function clampAxis(topLeft: number, worldSize: number, viewportSize: number): number {
  if (worldSize <= viewportSize) {
    return (worldSize - viewportSize) / 2;
  }
  return Math.min(Math.max(topLeft, 0), worldSize - viewportSize);
}
