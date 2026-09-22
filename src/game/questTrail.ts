import { canOccupy, type Collider, type RuntimeMap, type WorldPoint } from "./foundation";

export const DEFAULT_QUEST_TRAIL_ENABLED = false;

type GridPoint = { x: number; y: number };
type QueueNode = GridPoint & { priority: number };

export function findQuestTrailPath(
  map: RuntimeMap,
  start: WorldPoint,
  target: WorldPoint | null,
  collider: Collider
): WorldPoint[] | null {
  if (!target || !canOccupy(map, start, collider)) return null;
  const startTile = nearestTraversableTile(map, start, collider);
  const targetTile = nearestTraversableTile(map, target, collider);
  if (!startTile || !targetTile) return null;

  const open = new MinQueue();
  const startKey = key(startTile);
  const targetKey = key(targetTile);
  const costs = new Map<string, number>([[startKey, 0]]);
  const cameFrom = new Map<string, GridPoint>();
  open.push({ ...startTile, priority: heuristic(startTile, targetTile) });

  while (open.size > 0) {
    const current = open.pop()!;
    const currentKey = key(current);
    if (currentKey === targetKey) {
      const tiles = reconstructPath(cameFrom, current, startKey);
      const points = [
        { ...start },
        ...tiles.map((tile) => tileCenter(map, tile)),
        ...(canOccupy(map, target, collider) ? [{ ...target }] : [])
      ];
      return simplifyPath(map, points, collider);
    }

    const currentCost = costs.get(currentKey);
    if (currentCost === undefined) continue;
    for (const [dx, dy] of DIRECTIONS) {
      const next = { x: current.x + dx, y: current.y + dy };
      if (!isTraversableTile(map, next, collider)) continue;
      const nextKey = key(next);
      const nextCost = currentCost + 1;
      if (nextCost >= (costs.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      costs.set(nextKey, nextCost);
      cameFrom.set(nextKey, { x: current.x, y: current.y });
      open.push({ ...next, priority: nextCost + heuristic(next, targetTile) });
    }
  }

  return null;
}

function reconstructPath(cameFrom: Map<string, GridPoint>, end: GridPoint, startKey: string): GridPoint[] {
  const path: GridPoint[] = [{ x: end.x, y: end.y }];
  while (key(path[0]) !== startKey) {
    const previous = cameFrom.get(key(path[0]));
    if (!previous) return [];
    path.unshift(previous);
  }
  return path;
}

function simplifyPath(map: RuntimeMap, points: WorldPoint[], collider: Collider): WorldPoint[] {
  if (points.length <= 2) return points;
  const simplified: WorldPoint[] = [points[0]];
  let anchorIndex = 0;
  while (anchorIndex < points.length - 1) {
    let nextIndex = points.length - 1;
    while (nextIndex > anchorIndex + 1 && !lineIsTraversable(map, points[anchorIndex], points[nextIndex], collider)) {
      nextIndex -= 1;
    }
    simplified.push(points[nextIndex]);
    anchorIndex = nextIndex;
  }
  return simplified;
}

function lineIsTraversable(map: RuntimeMap, start: WorldPoint, end: WorldPoint, collider: Collider): boolean {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const steps = Math.max(1, Math.ceil(distance / 4));
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    if (!canOccupy(map, {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t
    }, collider)) return false;
  }
  return true;
}

function nearestTraversableTile(map: RuntimeMap, point: WorldPoint, collider: Collider): GridPoint | null {
  const origin = {
    x: Math.floor(point.x / map.tileSize),
    y: Math.floor(point.y / map.tileSize)
  };
  const maxRadius = Math.max(map.semantic.map_dimensions.tiles.height, map.semantic.map_dimensions.tiles.width);
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
      for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
        if (radius > 0 && x > origin.x - radius && x < origin.x + radius && y > origin.y - radius && y < origin.y + radius) continue;
        const tile = { x, y };
        if (isTraversableTile(map, tile, collider)) return tile;
      }
    }
  }
  return null;
}

function isTraversableTile(map: RuntimeMap, tile: GridPoint, collider: Collider): boolean {
  return tile.y >= 0 && tile.x >= 0
    && tile.y < map.semantic.map_dimensions.tiles.height
    && tile.x < map.semantic.map_dimensions.tiles.width
    && canOccupy(map, tileCenter(map, tile), collider);
}

function tileCenter(map: RuntimeMap, tile: GridPoint): WorldPoint {
  return { x: (tile.x + 0.5) * map.tileSize, y: (tile.y + 0.5) * map.tileSize };
}

function heuristic(a: GridPoint, b: GridPoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function key(point: GridPoint): string {
  return `${point.x},${point.y}`;
}

const DIRECTIONS = [[0, -1], [-1, 0], [1, 0], [0, 1]] as const;

class MinQueue {
  private nodes: QueueNode[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: QueueNode): void {
    this.nodes.push(node);
    let index = this.nodes.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.nodes[parent].priority <= node.priority) break;
      this.nodes[index] = this.nodes[parent];
      index = parent;
    }
    this.nodes[index] = node;
  }

  pop(): QueueNode | undefined {
    const first = this.nodes[0];
    const last = this.nodes.pop();
    if (!last || this.nodes.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.nodes.length) break;
      const child = right < this.nodes.length && this.nodes[right].priority < this.nodes[left].priority ? right : left;
      if (this.nodes[child].priority >= last.priority) break;
      this.nodes[index] = this.nodes[child];
      index = child;
    }
    this.nodes[index] = last;
    return first;
  }
}
