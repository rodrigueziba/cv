import { describe, expect, it } from 'vitest';
import {
  lerpLog,
  speedToPlaybackRate,
  stepContactAmount,
  stepFloorDopplerState,
  type DopplerFloorState,
} from './audioMath';
import { stepPitchEnvelope, type PitchEnvelopeState, type PitchEnvelopeConfig } from './audioMath';

describe('lerpLog', () => {
  it('returns a at t=0 and b at t=1', () => {
    expect(lerpLog(100, 400, 0)).toBeCloseTo(100, 5);
    expect(lerpLog(100, 400, 1)).toBeCloseTo(400, 5);
  });
  it('is geometric (not linear) at the midpoint', () => {
    expect(lerpLog(100, 400, 0.5)).toBeCloseTo(200, 5); // sqrt(100*400) = 200
  });
  it('clamps t outside [0, 1]', () => {
    expect(lerpLog(100, 400, -0.5)).toBeCloseTo(lerpLog(100, 400, 0), 5);
    expect(lerpLog(100, 400, 1.5)).toBeCloseTo(lerpLog(100, 400, 1), 5);
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
  const initial: DopplerFloorState = { intensity: 0, timeSinceActive: 0, releaseStartIntensity: 0 };

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
    expect(state.intensity).toBeLessThan(0.05);
  });
  it('resumes rising from its current value (not reset to 0) if movement returns mid-release', () => {
    // Use a short rise so intensity doesn't saturate at the 1.0 cap, keeping the
    // resumed-rise arithmetic below unaffected by clamping.
    const moving = stepFloorDopplerState(initial, 1, 0.4, cfg); // intensity -> 0.4
    // Idle long enough to enter the release phase but not complete it.
    const state = stepFloorDopplerState(moving, 0, 1.5, cfg); // timeSinceActive=1.5 > holdSeconds=1, partial release
    expect(state.intensity).toBeGreaterThan(0);
    expect(state.intensity).toBeLessThan(moving.intensity);

    const resumed = stepFloorDopplerState(state, 1, 0.5, cfg);
    expect(resumed.timeSinceActive).toBe(0);
    expect(resumed.intensity).toBeCloseTo(state.intensity + cfg.riseRate * 0.5, 5);
    expect(resumed.intensity).toBeGreaterThan(state.intensity);
  });

  it('release curve is linear and takes approximately the full releaseSeconds to fully decay (regression test for compounding-decay bug)', () => {
    const cfg = { compressionStrength: 1, riseRate: 1.0, holdSeconds: 0, releaseSeconds: 2.0 };
    // Get to intensity=1, released, at t=0 of the release window.
    let state = stepFloorDopplerState({ intensity: 0, timeSinceActive: 0, releaseStartIntensity: 0 }, 1, 1.0, cfg);
    expect(state.intensity).toBeCloseTo(1, 5);
    // Stop moving; immediately enters release (holdSeconds=0).
    const dt = 1 / 60; // simulate 60fps stepping
    for (let i = 0; i < 30; i++) state = stepFloorDopplerState(state, 0, dt, cfg); // 0.5s of release elapsed
    // Halfway through a 2.0s release window (at t=0.5s / 25% elapsed) should be ~75% remaining, NOT near-zero.
    expect(state.intensity).toBeGreaterThan(0.6);
    expect(state.intensity).toBeCloseTo(0.75, 1);
  });
});

describe('stepPitchEnvelope', () => {
  const cfg: PitchEnvelopeConfig = {
    dopplerMinPlaybackRate: 0.55,
    dopplerMaxPlaybackRate: 2.6,
    dopplerSpeedForMaxRate: 4.5,
    dopplerRiseTimeConstant: 0.15,
    dopplerFallTimeConstant: 1.3,
    dopplerUndershootRate: 0.62,
    dopplerUndershootTimeConstant: 0.35,
    dopplerUndershootDurationSeconds: 2.0,
    dopplerUndershootTriggerSpeed: 3.0,
  };
  const initial: PitchEnvelopeState = { rate: 1.0, peakSpeed: 0, undershootTimer: 0 };

  it('starts at neutral rate 1.0 for zero speed', () => {
    expect(initial.rate).toBe(1.0);
  });

  it('rises quickly toward the speed-driven target while accelerating (uses the fast rise time constant)', () => {
    // Sustained high speed for 0.15s (one rise time constant) should get ~63% of the way to target.
    let state = initial;
    for (let i = 0; i < 15; i++) state = stepPitchEnvelope(state, 4.5, 0.01, cfg); // 0.15s @ speed=max
    // target at speed=4.5 (== dopplerSpeedForMaxRate) is 2.6; expect meaningfully past halfway there.
    expect(state.rate).toBeGreaterThan(1.6);
    expect(state.rate).toBeLessThan(2.6);
  });

  it('does NOT rise as fast as it falls would (rise time constant is much shorter than fall)', () => {
    // Peak speed deliberately stays BELOW dopplerUndershootTriggerSpeed (3.0) throughout
    // this test — otherwise the subsequent slow-down would arm the undershoot (a much
    // faster, DIFFERENT time constant) instead of exercising the plain fall constant.
    let risen = initial;
    for (let i = 0; i < 15; i++) risen = stepPitchEnvelope(risen, 2.0, 0.01, cfg); // 0.15s of acceleration, peak=2.0 < trigger
    let eased = risen;
    for (let i = 0; i < 15; i++) eased = stepPitchEnvelope(eased, 0.1, 0.01, cfg); // 0.15s "coasting" — not sharp/high enough to arm the undershoot
    const roseAmount = risen.rate - initial.rate;
    const easedAmount = risen.rate - eased.rate;
    expect(easedAmount).toBeLessThan(roseAmount * 0.3); // falls much more slowly than it rose
  });

  it('dips BELOW neutral (undershoot) after decelerating sharply from a fast peak', () => {
    // Ramp up to a fast peak well above the trigger threshold.
    let state = initial;
    for (let i = 0; i < 100; i++) state = stepPitchEnvelope(state, 4.5, 0.01, cfg); // 1s at max speed
    expect(state.peakSpeed).toBeGreaterThanOrEqual(cfg.dopplerUndershootTriggerSpeed);
    // Sharp deceleration to a near-stop.
    state = stepPitchEnvelope(state, 0, 0.01, cfg);
    expect(state.undershootTimer).toBeGreaterThan(0); // armed
    // Let the undershoot glide play out — rate should drop below 1.0 (neutral), toward 0.62.
    // With dopplerUndershootTimeConstant=0.35s and a starting rate near 2.6, the
    // exponential glide crosses below 1.0 at ~0.58s (rate(t) = 0.62 + 1.98*exp(-t/0.35));
    // 0.8s gives comfortable margin while staying well inside the 2.0s hold window.
    for (let i = 0; i < 80; i++) state = stepPitchEnvelope(state, 0, 0.01, cfg); // 0.8s more
    expect(state.rate).toBeLessThan(1.0);
  });

  it('holds the undershoot for approximately dopplerUndershootDurationSeconds, then releases back toward neutral', () => {
    let state = initial;
    for (let i = 0; i < 100; i++) state = stepPitchEnvelope(state, 4.5, 0.01, cfg); // ramp to peak
    state = stepPitchEnvelope(state, 0, 0.01, cfg); // trigger undershoot
    expect(state.undershootTimer).toBeCloseTo(cfg.dopplerUndershootDurationSeconds, 1);
    // Step through just under the full duration — should still be armed (timer > 0).
    for (let i = 0; i < 190; i++) state = stepPitchEnvelope(state, 0, 0.01, cfg); // ~1.9s more
    expect(state.undershootTimer).toBeGreaterThan(0);
    expect(state.undershootTimer).toBeLessThan(0.2);
    // A bit more and it should have released (timer hits 0, target flips back to neutral-ish).
    for (let i = 0; i < 20; i++) state = stepPitchEnvelope(state, 0, 0.01, cfg); // ~0.2s more (total ~2.1s)
    expect(state.undershootTimer).toBe(0);
  });

  it('does NOT arm the undershoot for small/jittery deceleration below the trigger speed', () => {
    let state = initial;
    // Gentle speed, well under dopplerUndershootTriggerSpeed (3.0) the whole time.
    for (let i = 0; i < 50; i++) state = stepPitchEnvelope(state, 1.0, 0.01, cfg);
    state = stepPitchEnvelope(state, 0, 0.01, cfg); // "decelerate" to 0
    expect(state.undershootTimer).toBe(0); // never armed — peak never exceeded the trigger speed
  });

  it('is frame-rate independent for the same cumulative elapsed time', () => {
    let stateA = initial;
    for (let i = 0; i < 100; i++) stateA = stepPitchEnvelope(stateA, 4.5, 1 / 100, cfg); // 100 steps of 1s total
    let stateB = initial;
    for (let i = 0; i < 25; i++) stateB = stepPitchEnvelope(stateB, 4.5, 1 / 25, cfg); // 25 steps of 1s total
    expect(stateA.rate).toBeCloseTo(stateB.rate, 2);
  });
});
