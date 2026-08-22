import { describe, expect, it } from 'vitest';
import { remapDeviceTiltToScreenAxes } from './deviceTilt';

describe('remapDeviceTiltToScreenAxes', () => {
  it('passes through unchanged for portrait (angle 0)', () => {
    expect(remapDeviceTiltToScreenAxes(10, 20, 0)).toEqual({ x: 20, y: 10 });
  });
  it('treats upside-down portrait (angle 180) the same as portrait', () => {
    expect(remapDeviceTiltToScreenAxes(10, 20, 180)).toEqual({ x: 20, y: 10 });
  });
  it('remaps for landscape rotated +90°', () => {
    expect(remapDeviceTiltToScreenAxes(10, 20, 90)).toEqual({ x: -10, y: 20 });
  });
  it('remaps for landscape rotated -90° (also accepts 270)', () => {
    expect(remapDeviceTiltToScreenAxes(10, 20, -90)).toEqual({ x: 10, y: -20 });
    expect(remapDeviceTiltToScreenAxes(10, 20, 270)).toEqual({ x: 10, y: -20 });
  });
});
