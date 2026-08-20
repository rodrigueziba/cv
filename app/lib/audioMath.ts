/**
 * Geometric (logarithmic) interpolation — correct for frequency sweeps, unlike linear lerp.
 * `a` and `b` should be positive (this is for frequency sweeps, which are always
 * positive in practice); non-positive `a` degrades to a tiny epsilon rather than NaN.
 */
export function lerpLog(a: number, b: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const base = a > 0 ? a : Number.EPSILON;
  return base * Math.pow(b / base, clamped);
}

export interface DopplerSpeedConfig {
  dopplerMinPlaybackRate: number;
  dopplerMaxPlaybackRate: number;
  dopplerSpeedForMaxRate: number;
}

/**
 * Maps sphere/mouse speed (world units/sec) to a playbackRate.
 * 0 speed → rate 1.0 (neutral pitch). Speed ramps rate up toward
 * dopplerMaxPlaybackRate as it approaches dopplerSpeedForMaxRate.
 * (The spec only calls for "faster = higher pitch", not a symmetric
 * downward shift, so idle is neutral rather than at the min rate.)
 */
export function speedToPlaybackRate(speedUnitsPerSec: number, cfg: DopplerSpeedConfig): number {
  const t =
    cfg.dopplerSpeedForMaxRate > 0
      ? Math.max(0, Math.min(1, speedUnitsPerSec / cfg.dopplerSpeedForMaxRate))
      : 1;
  const rate = 1.0 + t * (cfg.dopplerMaxPlaybackRate - 1.0);
  // dopplerMinPlaybackRate is currently unreachable in practice since rate is bounded
  // to [1.0, max] by construction above — kept for forward-compatibility if a
  // receding/lower-pitch mapping is added later.
  return Math.max(cfg.dopplerMinPlaybackRate, Math.min(cfg.dopplerMaxPlaybackRate, rate));
}

/**
 * Steps a [0,1] "contact amount" toward 1 (in contact) or 0 (not in
 * contact) at different rates, so entering a light beam ramps the
 * filter in over `rampSeconds` and leaving releases it over
 * `releaseSeconds`.
 */
export function stepContactAmount(
  current: number,
  inContact: boolean,
  dtSeconds: number,
  rampSeconds: number,
  releaseSeconds: number
): number {
  const rate = inContact ? 1 / rampSeconds : -1 / releaseSeconds;
  return Math.max(0, Math.min(1, current + rate * dtSeconds));
}

export interface FloorDopplerConfig {
  compressionStrength: number;
  riseRate: number;
  holdSeconds: number;
  releaseSeconds: number;
}

export interface DopplerFloorState {
  /** Current [0,1] effect intensity (multiplied by compressionStrength for the shader). */
  intensity: number;
  /** Seconds elapsed since speed was last above the "moving" threshold. */
  timeSinceActive: number;
  /**
   * Intensity snapshot taken the instant the hold phase ended (release
   * began). The release curve decays linearly from THIS frozen value
   * over `releaseSeconds`, not from the continuously-updated `intensity`
   * — multiplying an already-decayed value by the cumulative release
   * fraction every frame would compound into a much-faster-than-intended,
   * frame-rate-dependent decay (this was a real bug, found in final QA).
   */
  releaseStartIntensity: number;
}

const MOVING_THRESHOLD = 0.02;

/**
 * Advances the floor-doppler intensity state by one frame.
 * While `speed` is above threshold: intensity rises toward 1 at `riseRate`/sec.
 * Once speed drops to ~0: intensity holds for `holdSeconds`, then eases
 * LINEARLY to 0 over `releaseSeconds` (frame-rate independent).
 */
export function stepFloorDopplerState(
  state: DopplerFloorState,
  speed: number,
  dtSeconds: number,
  cfg: FloorDopplerConfig
): DopplerFloorState {
  const moving = speed > MOVING_THRESHOLD;

  if (moving) {
    const intensity = Math.min(1, state.intensity + cfg.riseRate * dtSeconds);
    return { intensity, timeSinceActive: 0, releaseStartIntensity: intensity };
  }

  const timeSinceActive = state.timeSinceActive + dtSeconds;
  if (timeSinceActive <= cfg.holdSeconds) {
    return { intensity: state.intensity, timeSinceActive, releaseStartIntensity: state.intensity };
  }
  const releaseElapsed = timeSinceActive - cfg.holdSeconds;
  const releaseT = Math.min(1, releaseElapsed / cfg.releaseSeconds);
  return {
    intensity: state.releaseStartIntensity * (1 - releaseT),
    timeSinceActive,
    releaseStartIntensity: state.releaseStartIntensity, // frozen during release
  };
}

export interface PitchEnvelopeConfig extends DopplerSpeedConfig {
  dopplerRiseTimeConstant: number;
  dopplerFallTimeConstant: number;
  dopplerUndershootRate: number;
  dopplerUndershootTimeConstant: number;
  dopplerUndershootDurationSeconds: number;
  dopplerUndershootTriggerSpeed: number;
}

export interface PitchEnvelopeState {
  /** Current smoothed playbackRate-equivalent multiplier. */
  rate: number;
  /** Recently-decaying peak speed, used to detect "decelerated sharply from a fast peak". */
  peakSpeed: number;
  /** Seconds remaining in an active post-deceleration undershoot; 0 = inactive. */
  undershootTimer: number;
}

/** How quickly `peakSpeed` decays per second when not being pushed higher by the current speed. */
const PEAK_DECAY_PER_SECOND = 0.9;
/** Speed must drop below this fraction of the recent peak to count as "decelerating sharply". */
const DECEL_FRACTION = 0.5;

/**
 * Advances the doppler pitch envelope by one frame. Three regimes:
 *  - Accelerating/high speed: `rate` glides toward the speed-driven
 *    target using the SHORT `dopplerRiseTimeConstant` (fast, evident rise).
 *  - Cruising/slowly changing: glides using the LONG `dopplerFallTimeConstant`
 *    ("más inercia" — pitch lingers elevated after the sphere slows).
 *  - Sharp deceleration from a peak that exceeded `dopplerUndershootTriggerSpeed`:
 *    arms a `dopplerUndershootDurationSeconds`-long dip toward
 *    `dopplerUndershootRate` (below neutral — "un pitch mas grave"),
 *    glided into quickly via `dopplerUndershootTimeConstant`, then
 *    released back to the normal speed-driven target once the timer
 *    expires (using the rise/fall constants again, whichever applies).
 * All glides use exponential (dt-aware) smoothing, so behavior is
 * frame-rate independent — see stepFloorDopplerState's docstring for
 * why a naive per-frame multiply would NOT be (a real bug found once
 * already in this codebase).
 */
export function stepPitchEnvelope(
  state: PitchEnvelopeState,
  speed: number,
  dtSeconds: number,
  cfg: PitchEnvelopeConfig
): PitchEnvelopeState {
  const targetFromSpeed = speedToPlaybackRate(speed, cfg);

  let peakSpeed = Math.max(speed, state.peakSpeed * Math.pow(PEAK_DECAY_PER_SECOND, dtSeconds));

  const decelerating = speed < peakSpeed * DECEL_FRACTION && peakSpeed >= cfg.dopplerUndershootTriggerSpeed;

  let undershootTimer = state.undershootTimer;
  if (undershootTimer <= 0 && decelerating) {
    undershootTimer = cfg.dopplerUndershootDurationSeconds;
    peakSpeed = 0; // consumed — avoid re-triggering every frame while still slow
  } else if (undershootTimer > 0) {
    undershootTimer = Math.max(0, undershootTimer - dtSeconds);
  }

  const target = undershootTimer > 0 ? cfg.dopplerUndershootRate : targetFromSpeed;
  const timeConstant =
    undershootTimer > 0
      ? cfg.dopplerUndershootTimeConstant
      : target > state.rate
        ? cfg.dopplerRiseTimeConstant
        : cfg.dopplerFallTimeConstant;
  const alpha = timeConstant > 0 ? 1 - Math.exp(-dtSeconds / timeConstant) : 1;
  const rate = state.rate + (target - state.rate) * alpha;

  return { rate, peakSpeed, undershootTimer };
}
