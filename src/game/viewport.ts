import { CORE_SAFE_VIEW, LOGICAL_CAMERA_HEIGHT } from "./constants";
import type { Size } from "./camera";

export type LogicalViewport = Size & {
  outputScale: number;
  cssWidth: number;
  cssHeight: number;
  compatibilityFallback: boolean;
};

export function calculateLogicalViewport(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number
): LogicalViewport {
  const availableWidth = Math.max(1, cssWidth);
  const availableHeight = Math.max(1, cssHeight);
  const dpr = Math.max(1, devicePixelRatio || 1);
  const physicalWidth = Math.max(1, Math.floor(availableWidth * dpr));
  const physicalHeight = Math.max(1, Math.floor(availableHeight * dpr));
  const height = LOGICAL_CAMERA_HEIGHT;
  const width = Math.max(
    CORE_SAFE_VIEW.width,
    Math.round((height * availableWidth) / availableHeight)
  );
  const referenceScale = Math.floor(
    Math.min(physicalWidth / width, physicalHeight / height)
  );
  const outputScale = Math.max(1, referenceScale);
  const compatibilityFallback = referenceScale < 1;
  const cssPixelScale = Math.min(availableWidth / width, availableHeight / height);

  return {
    width,
    height,
    outputScale,
    cssWidth: Math.max(1, width * cssPixelScale),
    cssHeight: Math.max(1, height * cssPixelScale),
    compatibilityFallback
  };
}

export function applyLogicalViewport(canvas: HTMLCanvasElement, viewport: LogicalViewport): void {
  const backingWidth = Math.max(1, Math.round(viewport.width * viewport.outputScale));
  const backingHeight = Math.max(1, Math.round(viewport.height * viewport.outputScale));
  if (canvas.width !== backingWidth) {
    canvas.width = backingWidth;
  }
  if (canvas.height !== backingHeight) {
    canvas.height = backingHeight;
  }
  canvas.style.width = `${viewport.cssWidth}px`;
  canvas.style.height = `${viewport.cssHeight}px`;
}
