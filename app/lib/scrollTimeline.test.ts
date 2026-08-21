import { describe, expect, it } from 'vitest';
import {
  computeBlockOpacity,
  computeScrollInstance,
  corridorBlockStartInstance,
  corridorInstanceFromTravel,
} from './scrollTimeline';

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

describe('corridor text block timing', () => {
  // Mirrors the corridor's real config: CORRIDOR_TEXT_BLOCK_SEGMENTS = 5,
  // TEXT_BLOCK_DURATION_INSTANCES = 3, 4 corridor text blocks (i = 0..3).
  const SEGMENTS = 5;
  const DURATION = 3;
  const NUM_BLOCKS = 4;

  it('corridorInstanceFromTravel scales travelT (0..1) onto the segments*duration instance axis', () => {
    expect(corridorInstanceFromTravel(0, SEGMENTS, DURATION)).toBe(0);
    expect(corridorInstanceFromTravel(1, SEGMENTS, DURATION)).toBe(SEGMENTS * DURATION);
    expect(corridorInstanceFromTravel(0.5, SEGMENTS, DURATION)).toBeCloseTo(7.5, 5);
  });

  it('corridorBlockStartInstance places block i at i * durationInstances', () => {
    expect(corridorBlockStartInstance(0, DURATION)).toBe(0);
    expect(corridorBlockStartInstance(1, DURATION)).toBe(3);
    expect(corridorBlockStartInstance(2, DURATION)).toBe(6);
  });

  // This is the exact invariant that regressed once already (fixed in
  // commit 53a46de): with the old formula (corridorInstance = travelT *
  // segments, startInstance = i - 1), block i's HOLD window landed on
  // the same instance range as block i+1's RAMP-IN window, so adjacent
  // corridor text blocks were visibly on screen at the same time.
  it('adjacent corridor blocks have non-overlapping [start, start+duration) windows', () => {
    for (let i = 0; i < NUM_BLOCKS - 1; i++) {
      const thisWindowEnd = corridorBlockStartInstance(i, DURATION) + DURATION;
      const nextWindowStart = corridorBlockStartInstance(i + 1, DURATION);
      expect(thisWindowEnd).toBeLessThanOrEqual(nextWindowStart);
    }
  });

  it('sweeping travelT across the full corridor (0..1) never shows two blocks at once', () => {
    for (let step = 0; step <= 200; step++) {
      const travelT = step / 200;
      const instance = corridorInstanceFromTravel(travelT, SEGMENTS, DURATION);
      const visibleCount = Array.from({ length: NUM_BLOCKS }, (_, i) =>
        computeBlockOpacity(instance, corridorBlockStartInstance(i, DURATION), DURATION)
      ).filter((opacity) => opacity > 0).length;
      expect(visibleCount).toBeLessThanOrEqual(1);
    }
  });
});
