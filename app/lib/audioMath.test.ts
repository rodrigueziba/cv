import { describe, expect, it } from 'vitest';
import {
  lerpLog,
  speedToPlaybackRate,
  stepContactAmount,
  stepFloorDopplerState,
  type DopplerFloorState,
} from './audioMath';

describe('lerpLog', () => {
  it('returns a at t=0 and b at t=1', () => {
    expect(lerpLog(100, 400, 0)).toBeCloseTo(100, 5);
    expect(lerpLog(100, 400, 1)).toBeCloseTo(400, 5);
  });
  it('is geometric (not linear) at the midpoint', () => {
    expect(lerpLog(100, 400, 0.5)).toBeCloseTo(200, 5); // sqrt(100*400) = 200
  });
});

describe('speedToPlaybackRate', () => {
  const cfg = { dopplerMinPlaybackRate: 0.5, dopplerMaxPlaybackRate: 2.0, dopplerSpeedForMaxRate: 10 };
  it('is 1.0 (neutral) at zero speed', () => {
    expect(speedToPlaybackRate(0, cfg)).toBeCloseTo(1.0, 5);
  });
  it('approaches max rate as speed approaches the configured max-speed', () => {
    expect(speedToPlaybackRate(10, cfg)).toBeCloseTo(2.0, 5);
  });
  it('clamps beyond the configured max-speed', () => {
    expect(speedToPlaybackRate(999, cfg)).toBeCloseTo(2.0, 5);
  });
  it('never goes below dopplerMinPlaybackRate for any non-negative speed', () => {
    expect(speedToPlaybackRate(0, cfg)).toBeGreaterThanOrEqual(cfg.dopplerMinPlaybackRate);
  });
});

describe('stepContactAmount', () => {
  it('ramps up toward 1 while in contact', () => {
    let amount = 0;
    amount = stepContactAmount(amount, true, 0.5, 2, 1); // rampSeconds=2 → +0.25 per 0.5s
    expect(amount).toBeCloseTo(0.25, 5);
  });
  it('ramps down toward 0 when contact ends', () => {
    let amount = 1;
    amount = stepContactAmount(amount, false, 0.5, 2, 1); // releaseSeconds=1 → -0.5 per 0.5s
    expect(amount).toBeCloseTo(0.5, 5);
  });
  it('clamps to [0, 1]', () => {
    expect(stepContactAmount(0.9, true, 10, 2, 1)).toBe(1);
    expect(stepContactAmount(0.1, false, 10, 2, 1)).toBe(0);
  });
});

describe('stepFloorDopplerState', () => {
  const cfg = { compressionStrength: 3.2, riseRate: 1.0, holdSeconds: 1.0, releaseSeconds: 2.0 };
  const initial: DopplerFloorState = { intensity: 0, timeSinceActive: 0 };

  it('rises toward the speed-driven target while moving', () => {
    const next = stepFloorDopplerState(initial, /* speed */ 1, 0.5, cfg);
    expect(next.intensity).toBeGreaterThan(0);
    expect(next.timeSinceActive).toBe(0);
  });
  it('holds intensity steady for holdSeconds after speed drops to 0', () => {
    const moving = stepFloorDopplerState(initial, 1, 1.0, cfg); // intensity ramps to ~1
    const justStopped = stepFloorDopplerState(moving, 0, 0.3, cfg); // within holdSeconds=1
    expect(justStopped.intensity).toBeCloseTo(moving.intensity, 5);
  });
  it('releases toward 0 after holdSeconds elapses with no movement', () => {
    const moving = stepFloorDopplerState(initial, 1, 1.0, cfg);
    let state = moving;
    for (let i = 0; i < 20; i++) state = stepFloorDopplerState(state, 0, 0.3, cfg); // 6s of stillness
    expect(state.intensity).toBeLessThan(moving.intensity);
  });
});
