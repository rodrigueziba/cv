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

/**
 * Maps how far the sphere has traveled through the corridor (0..1) onto
 * the same "instance" axis computeBlockOpacity expects, scaled so each
 * of `segments` equal-length corridor segments maps to exactly one
 * `durationInstances`-wide, non-overlapping opacity window (see
 * corridorBlockStartInstance below for why this specific scaling
 * matters).
 */
export function corridorInstanceFromTravel(
  travelT: number,
  segments: number,
  durationInstances: number
): number {
  return travelT * segments * durationInstances;
}

/**
 * The `startInstance` for corridor text block `i`, paired with
 * corridorInstanceFromTravel() above and computeBlockOpacity(). Giving
 * block i an EXCLUSIVE `durationInstances`-wide window starting at
 * `i * durationInstances` — rather than spacing blocks only 1 unit
 * apart — is what makes adjacent blocks' opacity windows never overlap:
 * block i's window is exactly [i*durationInstances, (i+1)*durationInstances),
 * which maps back to travelT range [i/segments, (i+1)/segments) — i.e.
 * exactly segment i's own bounds, touching but never overlapping segment
 * i-1 or i+1. (A prior version used `i - 1` on a `travelT * segments`
 * axis instead — that put block i's HOLD window at the same range as
 * block i+1's RAMP-IN window, so they visibly overlapped. Do not
 * reintroduce that formula.)
 */
export function corridorBlockStartInstance(i: number, durationInstances: number): number {
  return i * durationInstances;
}
