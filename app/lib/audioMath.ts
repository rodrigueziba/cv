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
}

const MOVING_THRESHOLD = 0.02;

/**
 * Advances the floor-doppler intensity state by one frame.
 * While `speed` is above threshold: intensity rises toward 1 at `riseRate`/sec.
 * Once speed drops to ~0: intensity holds for `holdSeconds`, then eases
 * linearly to 0 over `releaseSeconds`.
 */
export function stepFloorDopplerState(
  state: DopplerFloorState,
  speed: number,
  dtSeconds: number,
  cfg: FloorDopplerConfig
): DopplerFloorState {
  const moving = speed > MOVING_THRESHOLD;

  if (moving) {
    return {
      intensity: Math.min(1, state.intensity + cfg.riseRate * dtSeconds),
      timeSinceActive: 0,
    };
  }

  const timeSinceActive = state.timeSinceActive + dtSeconds;
  if (timeSinceActive <= cfg.holdSeconds) {
    return { intensity: state.intensity, timeSinceActive };
  }
  const releaseElapsed = timeSinceActive - cfg.holdSeconds;
  const releaseT = Math.min(1, releaseElapsed / cfg.releaseSeconds);
  return {
    intensity: state.intensity * (1 - releaseT),
    timeSinceActive,
  };
}
