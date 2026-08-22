/**
 * Remaps a device's raw beta/gamma orientation angles into SCREEN-relative
 * x/y axes, given the current screen rotation angle (0/90/-90/180, from
 * `screen.orientation.angle` or the legacy `window.orientation` fallback).
 * beta/gamma are defined relative to the DEVICE's own physical axes, not
 * the screen's, so without this remap, tilting the phone in landscape
 * steers ~90° rotated from what's actually on screen.
 */
export function remapDeviceTiltToScreenAxes(
  beta: number,
  gamma: number,
  screenAngle: number
): { x: number; y: number } {
  if (screenAngle === 90) {
    return { x: -beta, y: gamma };
  }
  if (screenAngle === -90 || screenAngle === 270) {
    return { x: beta, y: -gamma };
  }
  // 0 (portrait) or 180 (upside-down portrait) — treat both as the
  // portrait mapping; upside-down portrait use is out of scope.
  return { x: gamma, y: beta };
}
