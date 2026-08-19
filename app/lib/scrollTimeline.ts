import { TEXT_BLOCK_DURATION_INSTANCES } from './sceneConfig';

/**
 * Converts a raw scroll offset (px, measured from the top of the
 * Section1 container) into "scroll instances" — 1 instance = 1
 * viewport height. This is the shared timeline unit for text blocks
 * and the final phase (see sceneConfig.ts).
 */
export function computeScrollInstance(scrolledPx: number, viewportHeightPx: number): number {
  if (viewportHeightPx <= 0) return 0;
  return Math.max(0, scrolledPx / viewportHeightPx);
}

/**
 * Opacity of a text block given the current scroll instance and the
 * block's configured start instance. Spec timing, per block:
 *   [start,   start+1) → fade in 0 → 1 (linear)
 *   [start+1, start+2) → held at 1
 *   [start+2, start+3) → fade out 1 → 0 (linear)
 *   otherwise          → 0
 */
export function computeBlockOpacity(
  scrollInstance: number,
  startInstance: number,
  durationInstances: number = TEXT_BLOCK_DURATION_INSTANCES
): number {
  const t = scrollInstance - startInstance;
  if (t <= 0 || t >= durationInstances) return 0;
  if (t < 1) return t;
  if (t < durationInstances - 1) return 1;
  return Math.max(0, durationInstances - t);
}
