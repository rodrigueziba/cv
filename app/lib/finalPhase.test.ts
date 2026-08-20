import { describe, expect, it } from 'vitest';
import { remapSubrange, corridorTravelDistance } from './finalPhase';

describe('remapSubrange', () => {
  const range = { start: 0.18, end: 0.32 };
  it('is 0 at and before the range start', () => {
    expect(remapSubrange(0.1, range)).toBe(0);
    expect(remapSubrange(0.18, range)).toBe(0);
  });
  it('is 1 at and after the range end', () => {
    expect(remapSubrange(0.32, range)).toBe(1);
    expect(remapSubrange(0.9, range)).toBe(1);
  });
  it('is linear in between', () => {
    expect(remapSubrange(0.25, range)).toBeCloseTo(0.5, 5);
  });
});

describe('corridorTravelDistance', () => {
  it('is 0 at t=0', () => {
    expect(corridorTravelDistance(0, 30, 0.75)).toBe(0);
  });
  it('stops sphereRadius short of the full corridor length at t=1 (cannot advance further)', () => {
    expect(corridorTravelDistance(1, 30, 0.75)).toBeCloseTo(29.25, 5);
  });
  it('clamps t outside [0,1]', () => {
    expect(corridorTravelDistance(-1, 30, 0.75)).toBe(0);
    expect(corridorTravelDistance(2, 30, 0.75)).toBeCloseTo(29.25, 5);
  });
});
