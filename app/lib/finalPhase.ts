export interface SubRange {
  start: number;
  end: number;
}

/** Linearly remaps `value` from `[range.start, range.end]` to `[0, 1]`, clamped. */
export function remapSubrange(value: number, range: SubRange): number {
  const span = range.end - range.start;
  if (span <= 0) return value >= range.end ? 1 : 0;
  return Math.max(0, Math.min(1, (value - range.start) / span));
}

/**
 * How far (world units) the sphere has traveled down the corridor for
 * a given travel progress `t` (0..1, already the output of
 * `remapSubrange` for the corridorTravel sub-range). Stops
 * `sphereRadius` short of `corridorLength` so the sphere's surface —
 * not its center — is what touches the end wall.
 */
export function corridorTravelDistance(t: number, corridorLength: number, sphereRadius: number): number {
  const clampedT = Math.max(0, Math.min(1, t));
  return clampedT * (corridorLength - sphereRadius);
}
