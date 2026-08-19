import { describe, expect, it } from 'vitest';
import { computeBlockOpacity, computeScrollInstance } from './scrollTimeline';

describe('computeScrollInstance', () => {
  it('is 0 at the top of the container', () => {
    expect(computeScrollInstance(0, 800)).toBe(0);
  });
  it('is 1 after scrolling exactly one viewport height', () => {
    expect(computeScrollInstance(800, 800)).toBe(1);
  });
  it('never goes negative above the container top', () => {
    expect(computeScrollInstance(-500, 800)).toBe(0);
  });
});

describe('computeBlockOpacity', () => {
  // Block starts at instance 2, duration 3: fade-in [2,3), hold [3,4), fade-out [4,5), gone after.
  it('is 0 before the block starts', () => {
    expect(computeBlockOpacity(1.9, 2)).toBe(0);
  });
  it('is 0 exactly at the start instance', () => {
    expect(computeBlockOpacity(2, 2)).toBe(0);
  });
  it('is ~0.5 halfway through the fade-in instance', () => {
    expect(computeBlockOpacity(2.5, 2)).toBeCloseTo(0.5, 5);
  });
  it('is 1 (fully appeared) at the end of the fade-in instance', () => {
    expect(computeBlockOpacity(3, 2)).toBe(1);
  });
  it('stays at 1 through the whole hold instance', () => {
    expect(computeBlockOpacity(3.5, 2)).toBe(1);
    expect(computeBlockOpacity(3.999, 2)).toBe(1);
  });
  it('fades out linearly during the third instance', () => {
    expect(computeBlockOpacity(4.5, 2)).toBeCloseTo(0.5, 5);
  });
  it('is 0 after the block finishes', () => {
    expect(computeBlockOpacity(5, 2)).toBe(0);
    expect(computeBlockOpacity(9, 2)).toBe(0);
  });
});
