# Efecto Doppler V2 — Corrections & New Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four broken/misunderstood behaviors from the previous implementation (pitch inertia, floor-doppler inertia, light-beam→diagonal-ray reassignment, full corridor rework) and add a large batch of new user-facing and debug-menu features (spacebar audio activation, text timing/shadow tweaks, title auto-hide, and 9 new debug-menu controls including a free-fly camera).

**Architecture:** Same conventions as the existing codebase: `app/lib/sceneConfig.ts` stays the single source of truth for tunables; new debug-adjustable values live in `SceneControlsContext` and are bridged into the imperative Three.js/Audio world via the same ref-bridging pattern already established (`colorsRef`, `flowUniformsRef`, etc.) — a `useEffect` keyed on the context value keeps a ref fresh, and `animate()`'s rAF loop reads the ref, never the raw context value directly (avoids the stale-closure class of bug this codebase has hit twice before). Pure new math (pitch envelope) gets its own tested functions in `app/lib/audioMath.ts`, following the established split between tested pure logic and untestable Three.js/Web Audio wiring.

**Tech Stack:** Same as before — Next.js 16, React 19, TypeScript, raw Three.js, Web Audio API, Vitest.

**Testing approach:** Same as the prior plan — pure functions get real unit tests; Three.js/Web Audio/DOM wiring gets careful code-reading verification plus `npm run build`/`npm run lint`/`npm test`, since no browser is available in this environment.

**Clarifications already resolved with the user before writing this plan:**
- Free-camera Q/E move on the standard vertical axis (Three.js Y), not X.
- Of the two original diagonal streak rays baked into the flow-field shader: **red = lowpass, amber = highpass.**

---

## Task 1: `sceneConfig.ts` — shadow model refactor, text timing shift, ray/corridor config redesign

**Files:**
- Modify: `app/lib/sceneConfig.ts`
- Modify: `app/lib/sceneConfig.test.ts`

**Why this is one task:** every other task in this plan reads from this file. Doing it first, completely, means later tasks only ever *import* — never patch — config.

- [ ] **Step 1: Refactor the shadow model to numeric fields (needed for the new debug-adjustable size/intensity multipliers)**

Replace the `TextShadowConfig` interface and `shadowToCss` function:

```ts
/* ── Shared text-shadow shape (used by title + all 5 blocks) ─────── */
export interface TextShadowConfig {
  colorRgb: string; // e.g. '0,0,0' — no alpha, kept separate so intensity is adjustable
  alpha: number; // 0..1 base opacity
  offsetXPx: number;
  offsetYPx: number;
  blurPx: number;
}

/**
 * Builds a CSS text-shadow value. `sizeMult` scales offset+blur (a debug
 * "shadow size" control); `intensityMult` scales alpha (a debug "shadow
 * intensity" control). Both default to 1 (no change) for static usage
 * (the title, which has no debug multiplier).
 */
export function shadowToCss(s: TextShadowConfig, sizeMult = 1, intensityMult = 1): string {
  const alpha = Math.max(0, Math.min(1, s.alpha * intensityMult));
  return `${s.offsetXPx * sizeMult}px ${s.offsetYPx * sizeMult}px ${s.blurPx * sizeMult}px rgba(${s.colorRgb}, ${alpha})`;
}
```

- [ ] **Step 2: Update `TITLE_CONFIG.shadow` — +10% size (per the "aumentar la sombra 10%" correction)**

```ts
export const TITLE_CONFIG = {
  text: 'EFFECTO DOPPLER',
  fontSizeClamp: 'clamp(24px, 4.2vw, 64px)',
  letterSpacing: '0.28em',
  textAlign: 'center' as const,
  color: '#ffffff',
  shadow: { colorRgb: '0,0,0', alpha: 0.85, offsetXPx: 2.2, offsetYPx: 2.2, blurPx: 0 } as TextShadowConfig, // was 2px → 2.2px (+10%)
  topPosition: '17%',
};
```

- [ ] **Step 3: Update all 5 `TEXT_BLOCKS` — +10% shadow size AND shift `startInstance` earlier**

Each block's `shadow` becomes `{ colorRgb: '0,0,0', alpha: 0.80, offsetXPx: 1.1, offsetYPx: 1.1, blurPx: 0 }` (was 1px → 1.1px, +10%).

`startInstance` shifts from `2, 5, 8, 11, 14` to **`1, 4, 7, 10, 13`** (block 1 now appears after just 1 scroll instance — "right after the camera starts moving" — instead of 2; all 5 blocks shift down by 1, keeping the same 3-instance spacing/duration between them).

Full replacement:

```ts
export const TEXT_BLOCKS: TextBlockConfig[] = [
  {
    id: 'block-1',
    lines: [
      'EL EFECTO DOPPLER DESCRIBE',
      'EL CAMBIO DE FRECUENCIA DE UNA ONDA',
      'PERCIBIDO POR UN OBSERVADOR',
      'CUANDO LA FUENTE SE MUEVE',
    ],
    startInstance: 1,
    fontSizeClamp: 'clamp(14px, 1.6vw, 22px)',
    letterSpacing: '0.12em',
    textAlign: 'left',
    color: '#ffffff',
    shadow: { colorRgb: '0,0,0', alpha: 0.80, offsetXPx: 1.1, offsetYPx: 1.1, blurPx: 0 },
    position: { top: '30%', left: '8%', maxWidth: '34ch' },
  },
  {
    id: 'block-2',
    lines: [
      'SI LA FUENTE SE ACERCA,',
      'LAS ONDAS SE COMPRIMEN',
      'Y EL SONIDO SE PERCIBE',
      'MAS AGUDO',
    ],
    startInstance: 4,
    fontSizeClamp: 'clamp(14px, 1.6vw, 22px)',
    letterSpacing: '0.12em',
    textAlign: 'right',
    color: '#ffffff',
    shadow: { colorRgb: '0,0,0', alpha: 0.80, offsetXPx: 1.1, offsetYPx: 1.1, blurPx: 0 },
    position: { top: '30%', right: '8%', maxWidth: '34ch' },
  },
  {
    id: 'block-3',
    lines: [
      'SI LA FUENTE SE ALEJA,',
      'LAS ONDAS SE ESPACIAN',
      'Y EL SONIDO SE PERCIBE',
      'MAS GRAVE',
    ],
    startInstance: 7,
    fontSizeClamp: 'clamp(14px, 1.6vw, 22px)',
    letterSpacing: '0.12em',
    textAlign: 'center',
    color: '#ffffff',
    shadow: { colorRgb: '0,0,0', alpha: 0.80, offsetXPx: 1.1, offsetYPx: 1.1, blurPx: 0 },
    position: { top: '68%', left: '50%', transform: 'translateX(-50%)', maxWidth: '38ch' },
  },
  {
    id: 'block-4',
    lines: [
      'MOVE EL MOUSE PARA GUIAR',
      'LA ESFERA SOBRE EL ESCENARIO',
      'Y ESCUCHA COMO CAMBIA',
      'EL SONIDO EN TIEMPO REAL',
    ],
    startInstance: 10,
    fontSizeClamp: 'clamp(14px, 1.6vw, 22px)',
    letterSpacing: '0.12em',
    textAlign: 'left',
    color: '#ffffff',
    shadow: { colorRgb: '0,0,0', alpha: 0.80, offsetXPx: 1.1, offsetYPx: 1.1, blurPx: 0 },
    position: { top: '30%', left: '8%', maxWidth: '34ch' },
  },
  {
    id: 'block-5',
    lines: [
      'SEGUI SCROLLEANDO',
      'PARA ENTRAR AL PASILLO',
      'Y LLEGAR A LA',
      'SIMULACION COMPLETA',
    ],
    startInstance: 13,
    fontSizeClamp: 'clamp(14px, 1.6vw, 22px)',
    letterSpacing: '0.12em',
    textAlign: 'right',
    color: '#ffffff',
    shadow: { colorRgb: '0,0,0', alpha: 0.80, offsetXPx: 1.1, offsetYPx: 1.1, blurPx: 0 },
    position: { top: '30%', right: '8%', maxWidth: '34ch' },
  },
];
```

- [ ] **Step 4: Add the bottom "press space" prompt config**

Add near `TITLE_CONFIG` (it deliberately mirrors the existing scroll-indicator's own inline styling in `Section1.tsx` — same font/size/color/letter-spacing family, just at the bottom instead of the top, per the user's explicit "del mismo modo que aparece scroll en la parte superior"):

```ts
/* ── SPACE-TO-ACTIVATE-AUDIO PROMPT ────────────────────────────────
 * Bottom-of-viewport hint, styled like the existing top "scroll ↓"
 * indicator. Visible until the user presses Space once; then hidden
 * for the rest of the session (see Section1.tsx). */
export const SPACE_PROMPT_CONFIG = {
  text: 'APRETÁ LA BARRA ESPACIADORA PARA ACTIVAR EL SONIDO',
  bottomPosition: '5vh',
};

/* ── TITLE AUTO-HIDE ────────────────────────────────────────────────
 * The hero title disappears this many REAL seconds after the user
 * starts scrolling (not scroll-distance-based), and only reappears
 * once scrolled back to the very top of the page. */
export const TITLE_HIDE_DELAY_SECONDS = 5;
```

- [ ] **Step 5: Replace `LIGHT_BEAMS` with `DIAGONAL_RAYS_CONFIG`, remove `beamLowpass`/`beamHighpass` colors**

The two-new-cylinder-beam approach was a misunderstanding — the lowpass/highpass filter behavior belongs on the two diagonal streak rays already baked into `FLOW_FRAG` (the red primary streak and its amber secondary line, both defined by the world-space line equation `sv = z − 0.55·x + 1`, secondary at `sv = −2`). Delete the `LIGHT_BEAMS` export entirely and replace it with:

```ts
/* ── DIAGONAL RAY CONTACT (lowpass/highpass) ──────────────────────
 * The two diagonal streak rays baked into FLOW_FRAG (see Section1.tsx)
 * are defined by the world-space line `sv = z − 0.55·x + 1` (red,
 * primary) and its secondary line at `sv = −secondaryOffset` (amber).
 * `contactWidth` is the |sv| threshold within which the sphere is
 * considered "touching" a ray, for the progressive audio filters:
 * RED → lowpass, AMBER → highpass (per the user's clarification).     */
export const DIAGONAL_RAYS_CONFIG = {
  contactWidth: 1.2,
  secondaryOffset: 2.0, // MUST match FLOW_FRAG's `sv + 2.0` — keep in sync if that shader term ever changes
};
```

Remove `beamLowpass: '#3fd0ff',` and `beamHighpass: '#ff5a3f',` from `DEFAULT_SCENE_COLORS`. Remove the same two keys from the `'Monochrome ice'` and `'Sunset'` entries in `COLOR_PALETTE_PRESETS` (they're `Partial<Record<SceneColorKey,...>>`, so just delete those two lines from each preset's `colors` object — don't leave dangling references to a `SceneColorKey` that no longer exists, which would be a TypeScript error).

- [ ] **Step 6: Redesign the final-phase / corridor config for the new teleport-based corridor**

The old zoom-to-sphere + floor-hole-reveal + lazily-anchored-to-the-sphere's-current-position corridor is being fully replaced (see Task 11) with: continued scroll past the last text block **teleports** the sphere+camera to a corridor built ONCE at a fixed world position far below the main disc, then further scroll moves the sphere down the corridor with a simple chase-camera — fully reversible by scrolling back up, since it's a pure function of scroll position with no anchoring-to-a-dynamic-point.

Replace `FINAL_PHASE_DURATION_INSTANCES` and `FINAL_PHASE_SUBRANGES`:

```ts
export const FINAL_PHASE_START_INSTANCE = LAST_TEXT_BLOCK_END_INSTANCE; // now 13 + 3 = 16
export const FINAL_PHASE_DURATION_INSTANCES = 8; // just corridor travel now — no separate zoom/reveal subphases

export const FINAL_PHASE_SUBRANGES = {
  corridorTravel: { start: 0.0, end: 1.0 },
};
```

Replace `CORRIDOR_CONFIG` (adds `yOffset`, `chaseDistanceMultiplier`, `chaseHeightMultiplier`; everything else unchanged):

```ts
export const CORRIDOR_CONFIG = {
  lengthMultiplier: 20, // × sphere diameter
  crossSectionMultiplier: 4, // × sphere diameter (walls/ceiling/floor size)
  patternedPortion: 0.2, // first 20% of length keeps the wave pattern
  patternColorA: '#3a2a6b',
  patternColorB: '#6b2a55',
  solidColor: '#0a0a14',
  finalLinkText: 'IR A LA SIMULACION',
  finalLinkUrl: 'https://efectodoppler.vercel.app',
  reachedThreshold: 0.97,
  /** World Y the corridor sits at — far enough below the main disc
   * (which lives around y=0) that teleporting there reads as a clean
   * cut to a separate space, never visible/overlapping during the
   * main phase. */
  yOffset: -80,
  /** Chase-camera distance behind the sphere / height above it,
   * expressed as a multiplier of the sphere's diameter. */
  chaseDistanceMultiplier: 4,
  chaseHeightMultiplier: 2,
};
```

- [ ] **Step 7: Redesign the audio doppler-pitch config — bigger, more "inertial" effect with a post-deceleration undershoot**

In `AUDIO_CONFIG`, replace `dopplerMaxPlaybackRate`, `dopplerSpeedForMaxRate`, and `dopplerSmoothing` (the smoothing field is being replaced by an asymmetric rise/fall time-constant model, implemented in Task 2):

```ts
export const AUDIO_CONFIG = {
  defaultMp3Path: '/audio.mp3',
  defaultToneFrequencyHz: 220,
  toneFrequencyRangeHz: { min: 55, max: 1760 },

  /** Speed → playbackRate mapping for the moving-source doppler effect. */
  dopplerMinPlaybackRate: 0.55,
  dopplerMaxPlaybackRate: 2.6, // was 1.85 — bigger, more evident swing
  /** World-units/second of sphere speed that maps to dopplerMaxPlaybackRate. */
  dopplerSpeedForMaxRate: 4.5, // was 5.5 — reached a bit more readily, so the effect is easier to trigger

  /** Time constant (seconds) for the EXPONENTIAL glide toward a higher
   * target pitch while accelerating — fast/snappy so the rise reads
   * immediately. */
  dopplerRiseTimeConstant: 0.15,
  /** Time constant (seconds) for the glide back down toward neutral —
   * deliberately much slower than the rise ("más inercia", pitch lingers
   * elevated after the sphere slows). */
  dopplerFallTimeConstant: 1.3,
  /** playbackRate the pitch dips to (below neutral 1.0 — "un pitch mas
   * grave") when the sphere decelerates sharply after a fast peak. */
  dopplerUndershootRate: 0.62,
  /** Time constant (seconds) for the glide INTO the undershoot once
   * triggered — deliberately quick (quicker than dopplerFallTimeConstant)
   * so the dip is clearly reached and held, not just barely approached,
   * within the 2-second window below. */
  dopplerUndershootTimeConstant: 0.35,
  /** How long the undershoot lasts (from the moment it triggers) before
   * releasing back to the normal speed-driven target. */
  dopplerUndershootDurationSeconds: 2.0,
  /** Minimum peak speed (world-units/sec) required to arm the
   * undershoot-on-deceleration behavior — small jitters shouldn't
   * trigger it, only genuinely fast movement followed by stopping. */
  dopplerUndershootTriggerSpeed: 3.0,

  /** Progressive filter ramp when the sphere is in contact with a diagonal ray. */
  filterRampSeconds: 1.6,
  filterReleaseSeconds: 0.8,
  lowpassOpenHz: 18000,
  lowpassClosedHz: 220,
  highpassOpenHz: 20,
  highpassClosedHz: 3200,

  arpeggioChords: {
    minor: [220.0, 261.63, 329.63, 392.0],
    major: [220.0, 277.18, 329.63, 415.3],
  },
  arpeggioNoteMs: 180,
};
```

- [ ] **Step 8: Bigger, longer-lingering floor-doppler wave effect**

Replace `FLOOR_DOPPLER_CONFIG`:

```ts
export const FLOOR_DOPPLER_CONFIG = {
  compressionStrength: 5.0, // was 3.2 — bigger, more evident line compression/spacing
  riseRate: 0.35,
  /** Effect lingers this many seconds after the sphere stops before easing out. */
  holdSeconds: 2.0, // was 1.5
  /** Then eases back to 0 over this many seconds. holdSeconds + releaseSeconds
   * must total at least 5s per the "dure al menos 5 segundos" correction. */
  releaseSeconds: 3.5, // was 2.5 — 2.0 + 3.5 = 5.5s total
};
```

- [ ] **Step 9: Add free-camera and debug-slider-range config**

Add two new exports:

```ts
/* ── FREE CAMERA (debug menu toggle) ───────────────────────────────
 * WASD + Q/E fly-camera, mouse-look. See Section1.tsx for the
 * movement/look implementation.                                     */
export const FREE_CAMERA_CONFIG = {
  moveSpeed: 12, // world units/second
  lookSensitivity: 1.6, // radians of yaw/pitch swing across the full -1..1 mouseRef range
  maxPitchRad: Math.PI / 2 - 0.05, // clamp just short of straight up/down to avoid gimbal flip
};

/* ── DEBUG-MENU SLIDER RANGES ───────────────────────────────────────
 * min/max/default for every new debug-adjustable multiplier. The
 * "default" here is the multiplier's neutral value (1.0 = matches the
 * static config above exactly); sliders let the user scale up/down
 * from there live. See SceneControlsContext.tsx for the React state
 * these drive, and DebugMenu.tsx for the UI.                        */
export const DEBUG_RANGES = {
  textBlockFontSizeMultiplier: { min: 0.5, max: 2.0, default: 1.0, step: 0.05 },
  textBlockShadowSizeMultiplier: { min: 0, max: 3, default: 1.0, step: 0.1 },
  textBlockShadowIntensityMultiplier: { min: 0, max: 2, default: 1.0, step: 0.05 },
  cameraFovDeg: { min: 30, max: 120, default: 65, step: 1 },
  pitchInertiaMultiplier: { min: 0.2, max: 3, default: 1.0, step: 0.05 },
  floorDopplerIntensityMultiplier: { min: 0, max: 3, default: 1.0, step: 0.05 },
  floorDopplerInertiaMultiplier: { min: 0.3, max: 3, default: 1.0, step: 0.05 },
  corridorWaveSpeedMultiplier: { min: 0, max: 4, default: 1.0, step: 0.05 },
};
```

- [ ] **Step 10: Update `sceneConfig.test.ts`**

The existing tests assert `TEXT_BLOCKS[0].startInstance === 2` and (implicitly, via the "ordered, non-overlapping" test) the old spacing. Update the hardcoded expectation:

```ts
import { describe, expect, it } from 'vitest';
import { TEXT_BLOCKS, TEXT_BLOCK_DURATION_INSTANCES } from './sceneConfig';

describe('sceneConfig text blocks', () => {
  it('defines exactly 5 blocks, each with 4 lines', () => {
    expect(TEXT_BLOCKS).toHaveLength(5);
    TEXT_BLOCKS.forEach((b) => expect(b.lines).toHaveLength(4));
  });

  it('first block starts after 1 scroll instance', () => {
    expect(TEXT_BLOCKS[0].startInstance).toBe(1);
  });

  it('each block lasts exactly 3 scroll instances', () => {
    expect(TEXT_BLOCK_DURATION_INSTANCES).toBe(3);
  });

  it('blocks are ordered by start instance and do not overlap by default', () => {
    for (let i = 1; i < TEXT_BLOCKS.length; i++) {
      const prevEnd = TEXT_BLOCKS[i - 1].startInstance + TEXT_BLOCK_DURATION_INSTANCES;
      expect(TEXT_BLOCKS[i].startInstance).toBeGreaterThanOrEqual(prevEnd);
    }
  });
});
```

- [ ] **Step 11: Verify and commit**

Run: `npm test -- sceneConfig` — expect 4/4 pass.
Run: `npm run build` — this WILL currently fail, because `Section1.tsx`, `ScrollTextBlocks.tsx`, and `DebugMenu.tsx` still reference the old `shadowToCss` signature, `LIGHT_BEAMS`, `beamLowpass`/`beamHighpass`, `FINAL_PHASE_SUBRANGES.zoomToSphere`/`.floorOpens`, and `AUDIO_CONFIG.dopplerSmoothing` (all removed/changed by this task). **This is expected and OK** — later tasks fix every consumer. Note in your report exactly which build errors appear, so the next task's implementer has a checklist, but do not fix them yourself in this task (stay scoped to `sceneConfig.ts`/`sceneConfig.test.ts`).

```bash
git add app/lib/sceneConfig.ts app/lib/sceneConfig.test.ts
git commit -m "feat: redesign sceneConfig for V2 corrections (shadows, timing, rays, corridor, pitch envelope)"
```

---

## Task 2: `audioMath.ts` — pitch envelope with rise/fall inertia + post-deceleration undershoot

**Why:** This is the pure-math heart of the "correccion" #1 (bigger, more exaggerated pitch inertia, with a 2-second grave dip after decelerating from a fast peak). Fully unit-testable, so it gets real tests before `AudioEngine` (untestable) wires it in (Task 3).

**Files:**
- Modify: `app/lib/audioMath.ts`
- Modify: `app/lib/audioMath.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `app/lib/audioMath.test.ts` (keep every existing `describe` block — `lerpLog`, `speedToPlaybackRate`, `stepContactAmount`, `stepFloorDopplerState` — untouched; only ADD this new block):

```ts
import { stepPitchEnvelope, type PitchEnvelopeState, type PitchEnvelopeConfig } from './audioMath';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- audioMath`
Expected: FAIL — `stepPitchEnvelope`/`PitchEnvelopeState`/`PitchEnvelopeConfig` don't exist yet.

- [ ] **Step 3: Implement**

Add to `app/lib/audioMath.ts` (append — do not touch `lerpLog`, `speedToPlaybackRate`, `stepContactAmount`, `stepFloorDopplerState`, or their existing exports):

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- audioMath`
Expected: PASS — all previous tests still pass (unchanged), plus the new `stepPitchEnvelope` describe block (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/audioMath.ts app/lib/audioMath.test.ts
git commit -m "feat: add unit-tested doppler pitch envelope (asymmetric inertia + post-deceleration undershoot)"
```

---

## Task 3: `audioEngine.ts` — wire the pitch envelope, add play/pause, add file-source-error fallback hook

**Files:**
- Modify: `app/lib/audioEngine.ts`

- [ ] **Step 1: Replace the scalar `dopplerRate` with the full pitch-envelope state**

Update imports:

```ts
import { AUDIO_CONFIG } from '@/app/lib/sceneConfig';
import { lerpLog, stepPitchEnvelope, type PitchEnvelopeState, type PitchEnvelopeConfig } from '@/app/lib/audioMath';
import { withBasePath } from '@/app/lib/basePath';
import type { ArpeggioMode, AudioSourceMode } from '@/app/lib/SceneControlsContext';
```

(Note: `speedToPlaybackRate` is no longer imported directly here — `stepPitchEnvelope` calls it internally.)

Replace the class field `private dopplerRate = 1; // smoothed playbackRate-equivalent multiplier` with:

```ts
private pitchEnvelope: PitchEnvelopeState = { rate: 1, peakSpeed: 0, undershootTimer: 0 };
private pitchInertiaMultiplier = 1; // debug-menu-adjustable; scales all 3 envelope time constants
private playing = false;
```

Then replace **every** other reference to `this.dopplerRate` in the file with `this.pitchEnvelope.rate`:
- In `setSource`'s `'file'` branch: `el.playbackRate = this.dopplerRate;` → `el.playbackRate = this.pitchEnvelope.rate;`
- In `setSource`'s `'tone'` branch: `osc.frequency.value = this.baseToneFrequencyHz * this.dopplerRate;` → `... * this.pitchEnvelope.rate;`
- In `stepArpeggio`: `note * this.dopplerRate` → `note * this.pitchEnvelope.rate`
- In `setToneFrequency`: `hz * this.dopplerRate` → `hz * this.pitchEnvelope.rate`

- [ ] **Step 2: Replace `setDopplerSpeed` to use the envelope, add a `dtSeconds` parameter**

```ts
/**
 * Called every animation frame with the current sphere speed
 * (world units/sec) and the frame's delta time. Advances the pitch
 * envelope (rise/fall inertia + post-deceleration undershoot — see
 * app/lib/audioMath.ts stepPitchEnvelope) and applies the resulting
 * rate to whichever source is active.
 */
setDopplerSpeed(speedUnitsPerSec: number, dtSeconds: number): void {
  const scaledCfg: PitchEnvelopeConfig = {
    ...AUDIO_CONFIG,
    dopplerRiseTimeConstant: AUDIO_CONFIG.dopplerRiseTimeConstant * this.pitchInertiaMultiplier,
    dopplerFallTimeConstant: AUDIO_CONFIG.dopplerFallTimeConstant * this.pitchInertiaMultiplier,
    dopplerUndershootTimeConstant: AUDIO_CONFIG.dopplerUndershootTimeConstant * this.pitchInertiaMultiplier,
  };
  this.pitchEnvelope = stepPitchEnvelope(this.pitchEnvelope, speedUnitsPerSec, dtSeconds, scaledCfg);
  const rate = this.pitchEnvelope.rate;

  if (this.audioEl) {
    this.audioEl.playbackRate = rate;
  } else if (this.oscillator && this.ctx && this.mode === 'tone') {
    this.oscillator.frequency.setTargetAtTime(
      this.baseToneFrequencyHz * rate,
      this.ctx.currentTime,
      PITCH_GLIDE_SECONDS
    );
  }
  // Arpeggio mode picks up the new rate on its next stepArpeggio() tick.
}

/** Debug-menu control: scales all 3 envelope time constants (rise, fall,
 * undershoot). >1 = slower/more exaggerated transitions; <1 = snappier. */
setPitchInertiaMultiplier(multiplier: number): void {
  this.pitchInertiaMultiplier = multiplier;
}
```

- [ ] **Step 3: Add play/pause — mute via `masterGain`, and actually pause/resume the `<audio>` element**

Start `masterGain` SILENT (0 gain) instead of the default level — nothing should be audible until the user explicitly activates audio (spacebar). Change in `ensureGraph()`:

```ts
const masterGain = ctx.createGain();
masterGain.gain.value = 0; // silent until setPlaying(true) — user activates via spacebar
```

Add two new public methods (place near `setLowpassAmount`/`setHighpassAmount`):

```ts
/**
 * Play/pause toggle for whichever source is active. Mutes via
 * `masterGain` (works uniformly for oscillators, which have no native
 * pause) and additionally pauses/resumes the `<audio>` element in
 * 'file' mode (saves CPU/bandwidth rather than just muting it).
 */
setPlaying(playing: boolean): void {
  this.playing = playing;
  const { ctx } = this.ensureGraph();
  this.masterGain?.gain.setTargetAtTime(playing ? DEFAULT_MASTER_GAIN : 0, ctx.currentTime, 0.12);
  if (this.audioEl) {
    if (playing) this.audioEl.play().catch(() => {});
    else this.audioEl.pause();
  }
}

isPlaying(): boolean {
  return this.playing;
}
```

- [ ] **Step 4: Add the file-source-error → fallback callback**

Add a constructor accepting an optional callback, invoked whenever the 'file' source fails to load (network error, 404, bad format — as opposed to `NotAllowedError`, which is just "not resumed yet" and already handled separately):

```ts
export class AudioEngine {
  constructor(private onFileSourceError?: () => void) {}

  // ...existing fields unchanged...
```

In `setSource`'s `'file'` branch, add an `error` listener right after creating `el`:

```ts
if (mode === 'file') {
  const el = new Audio(opts.fileUrl ?? withBasePath(AUDIO_CONFIG.defaultMp3Path));
  el.loop = true;
  el.crossOrigin = 'anonymous';
  el.addEventListener('error', () => {
    console.warn('[AudioEngine] file source failed to load', el.error);
    this.onFileSourceError?.();
  });
  // Pitch must move WITH playbackRate for the doppler effect to be audible.
  const pitchPreservingEl = el as PitchPreservingAudio;
  pitchPreservingEl.preservesPitch = false;
  pitchPreservingEl.mozPreservesPitch = false;
  pitchPreservingEl.webkitPreservesPitch = false;
  el.playbackRate = this.pitchEnvelope.rate;
  const node = ctx.createMediaElementSource(el);
  node.connect(lowpass);
  if (this.playing) el.play().catch((err) => {
    if (err?.name !== 'NotAllowedError') {
      console.warn('[AudioEngine] file source failed to play', err);
    }
  });
  this.audioEl = el;
  this.mediaSourceNode = node;
  return;
}
```

(Changed from the previous unconditional `el.play()` to `if (this.playing) el.play()` — since audio now starts silent/paused by design until the user activates it via spacebar, `setSource('file', ...)` shouldn't start playback on its own if the engine hasn't been told to play yet. `setPlaying(true)` — called by the spacebar handler — will `.play()` it.)

Also update `resume()`'s retry logic to respect the same `playing` gate — replace:

```ts
async resume(): Promise<void> {
  const { ctx } = this.ensureGraph();
  if (ctx.state === 'suspended') await ctx.resume();
  if (this.playing && this.audioEl && this.audioEl.paused) {
    this.audioEl.play().catch(() => {
      /* still blocked — e.g. browser requires play() itself inside the gesture handler (Safari) */
    });
  }
}
```

- [ ] **Step 5: Verify**

No automated test possible (same as before — no `AudioContext` under Vitest). Run `npm run build` to catch type errors; carefully re-read the full file to confirm every `this.dopplerRate` reference was replaced (grep for `dopplerRate` — should find zero matches outside `AUDIO_CONFIG`'s own field names like `dopplerMinPlaybackRate`), and that `masterGain` truly starts silent and only becomes audible via `setPlaying(true)`.

- [ ] **Step 6: Commit**

```bash
git add app/lib/audioEngine.ts
git commit -m "feat: wire pitch envelope into AudioEngine, add play/pause and file-source-error fallback"
```

---

## Task 4: `SceneControlsContext.tsx` — add all new debug-adjustable state

**Files:**
- Modify: `app/lib/SceneControlsContext.tsx`

**Why:** every new debug-menu control (Task 14) and every consumer of it (Section1.tsx across Tasks 5–13) needs one shared place this state lives, following the exact pattern already established for `colors`/`audioSourceMode`/etc.

- [ ] **Step 1: Replace the whole file**

```tsx
'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SCENE_COLORS, DEBUG_RANGES, type SceneColorKey } from '@/app/lib/sceneConfig';

export type AudioSourceMode = 'file' | 'tone' | 'arpeggio';
export type ArpeggioMode = 'minor' | 'major';

interface SceneControlsValue {
  colors: Record<SceneColorKey, string>;
  setColor: (key: SceneColorKey, value: string) => void;
  applyColorPreset: (colors: Partial<Record<SceneColorKey, string>>) => void;

  audioSourceMode: AudioSourceMode;
  setAudioSourceMode: (mode: AudioSourceMode) => void;
  toneFrequencyHz: number;
  setToneFrequencyHz: (hz: number) => void;
  arpeggioMode: ArpeggioMode;
  setArpeggioMode: (mode: ArpeggioMode) => void;
  /** Object URL of a user-uploaded mp3, or null to use the default /audio.mp3 */
  uploadedFileUrl: string | null;
  setUploadedFile: (file: File | null) => void;

  /** Has the user pressed Space at least once this session? Drives the
   * "press space to activate" prompt's visibility. */
  audioActivated: boolean;
  setAudioActivated: (activated: boolean) => void;
  /** Is audio currently playing (vs. paused)? Space bar + the debug
   * menu's media control both read/write this. */
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;

  textBlockFontSizeMultiplier: number;
  setTextBlockFontSizeMultiplier: (v: number) => void;
  textBlockShadowSizeMultiplier: number;
  setTextBlockShadowSizeMultiplier: (v: number) => void;
  textBlockShadowIntensityMultiplier: number;
  setTextBlockShadowIntensityMultiplier: (v: number) => void;

  freeCameraEnabled: boolean;
  setFreeCameraEnabled: (v: boolean) => void;
  cameraFovDeg: number;
  setCameraFovDeg: (v: number) => void;

  pitchInertiaMultiplier: number;
  setPitchInertiaMultiplier: (v: number) => void;
  floorDopplerIntensityMultiplier: number;
  setFloorDopplerIntensityMultiplier: (v: number) => void;
  floorDopplerInertiaMultiplier: number;
  setFloorDopplerInertiaMultiplier: (v: number) => void;
  corridorWaveSpeedMultiplier: number;
  setCorridorWaveSpeedMultiplier: (v: number) => void;
}

const SceneControlsContext = createContext<SceneControlsValue | null>(null);

export function SceneControlsProvider({ children }: { children: ReactNode }) {
  const [colors, setColors] = useState<Record<SceneColorKey, string>>({ ...DEFAULT_SCENE_COLORS });
  const [audioSourceMode, setAudioSourceMode] = useState<AudioSourceMode>('tone');
  const [toneFrequencyHz, setToneFrequencyHz] = useState(220);
  const [arpeggioMode, setArpeggioMode] = useState<ArpeggioMode>('minor');
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const uploadedFileUrlRef = useRef<string | null>(null);

  const [audioActivated, setAudioActivated] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const [textBlockFontSizeMultiplier, setTextBlockFontSizeMultiplier] = useState(
    DEBUG_RANGES.textBlockFontSizeMultiplier.default
  );
  const [textBlockShadowSizeMultiplier, setTextBlockShadowSizeMultiplier] = useState(
    DEBUG_RANGES.textBlockShadowSizeMultiplier.default
  );
  const [textBlockShadowIntensityMultiplier, setTextBlockShadowIntensityMultiplier] = useState(
    DEBUG_RANGES.textBlockShadowIntensityMultiplier.default
  );

  const [freeCameraEnabled, setFreeCameraEnabled] = useState(false);
  const [cameraFovDeg, setCameraFovDeg] = useState(DEBUG_RANGES.cameraFovDeg.default);

  const [pitchInertiaMultiplier, setPitchInertiaMultiplier] = useState(
    DEBUG_RANGES.pitchInertiaMultiplier.default
  );
  const [floorDopplerIntensityMultiplier, setFloorDopplerIntensityMultiplier] = useState(
    DEBUG_RANGES.floorDopplerIntensityMultiplier.default
  );
  const [floorDopplerInertiaMultiplier, setFloorDopplerInertiaMultiplier] = useState(
    DEBUG_RANGES.floorDopplerInertiaMultiplier.default
  );
  const [corridorWaveSpeedMultiplier, setCorridorWaveSpeedMultiplier] = useState(
    DEBUG_RANGES.corridorWaveSpeedMultiplier.default
  );

  const setUploadedFile = (file: File | null) => {
    if (uploadedFileUrlRef.current) URL.revokeObjectURL(uploadedFileUrlRef.current);
    const next = file ? URL.createObjectURL(file) : null;
    uploadedFileUrlRef.current = next;
    setUploadedFileUrl(next);
  };

  useEffect(() => {
    return () => {
      if (uploadedFileUrlRef.current) URL.revokeObjectURL(uploadedFileUrlRef.current);
    };
  }, []);

  const value = useMemo<SceneControlsValue>(
    () => ({
      colors,
      setColor: (key, val) => setColors((prev) => ({ ...prev, [key]: val })),
      applyColorPreset: (preset) => setColors((prev) => ({ ...prev, ...preset })),
      audioSourceMode,
      setAudioSourceMode,
      toneFrequencyHz,
      setToneFrequencyHz,
      arpeggioMode,
      setArpeggioMode,
      uploadedFileUrl,
      setUploadedFile,
      audioActivated,
      setAudioActivated,
      isPlaying,
      setIsPlaying,
      textBlockFontSizeMultiplier,
      setTextBlockFontSizeMultiplier,
      textBlockShadowSizeMultiplier,
      setTextBlockShadowSizeMultiplier,
      textBlockShadowIntensityMultiplier,
      setTextBlockShadowIntensityMultiplier,
      freeCameraEnabled,
      setFreeCameraEnabled,
      cameraFovDeg,
      setCameraFovDeg,
      pitchInertiaMultiplier,
      setPitchInertiaMultiplier,
      floorDopplerIntensityMultiplier,
      setFloorDopplerIntensityMultiplier,
      floorDopplerInertiaMultiplier,
      setFloorDopplerInertiaMultiplier,
      corridorWaveSpeedMultiplier,
      setCorridorWaveSpeedMultiplier,
    }),
    [
      colors,
      audioSourceMode,
      toneFrequencyHz,
      arpeggioMode,
      uploadedFileUrl,
      audioActivated,
      isPlaying,
      textBlockFontSizeMultiplier,
      textBlockShadowSizeMultiplier,
      textBlockShadowIntensityMultiplier,
      freeCameraEnabled,
      cameraFovDeg,
      pitchInertiaMultiplier,
      floorDopplerIntensityMultiplier,
      floorDopplerInertiaMultiplier,
      corridorWaveSpeedMultiplier,
    ]
  );

  return <SceneControlsContext.Provider value={value}>{children}</SceneControlsContext.Provider>;
}

export function useSceneControls(): SceneControlsValue {
  const ctx = useContext(SceneControlsContext);
  if (!ctx) throw new Error('useSceneControls must be used within SceneControlsProvider');
  return ctx;
}
```

This preserves the existing `setUploadedFile` correctness fix (side effect in the plain function body, not a `useMemo`/functional-updater — from the prior plan's review rounds) unchanged, and adds every new field as a plain `useState`, following the exact same shape/pattern as the existing ones.

- [ ] **Step 2: Verify and commit**

Run: `npm run build` — expect the SAME pre-existing failures as Task 1 left (Section1.tsx/DebugMenu.tsx not yet updated for the new `sceneConfig.ts` shape) PLUS no NEW errors attributable to this file itself (this file should type-check cleanly on its own — its only import, `DEBUG_RANGES`, already exists from Task 1).

```bash
git add app/lib/SceneControlsContext.tsx
git commit -m "feat: add debug-adjustable state (font/shadow multipliers, free camera, FOV, audio inertia/inertia knobs, playback)"
```

---

## Task 5: Wire the shadow refactor + new font-size/shadow multipliers into `ScrollTextBlocks.tsx`

**Files:**
- Modify: `app/components/ScrollTextBlocks.tsx`
- Modify: `app/components/Section1.tsx` (one line — corridor end-link's shadow, +10%)

**Why:** `shadowToCss`'s signature changed in Task 1 (now takes optional `sizeMult`/`intensityMult`) and `TextShadowConfig`'s fields are now numeric. This task updates the one component that renders per-block shadows AND wires the two new debug multipliers (font size uses a `transform: scale()` approach — much simpler than algebraically rescaling a CSS `clamp()` string at runtime).

- [ ] **Step 1: Read the new context values**

In `app/components/ScrollTextBlocks.tsx`, add the import and hook call inside the component body:

```ts
import { useSceneControls } from '@/app/lib/SceneControlsContext';
```

```tsx
const ScrollTextBlocks = forwardRef<HTMLDivElement[], object>(function ScrollTextBlocks(_props, ref) {
  const { textBlockFontSizeMultiplier, textBlockShadowSizeMultiplier, textBlockShadowIntensityMultiplier } =
    useSceneControls();
  return (
```

- [ ] **Step 2: Apply the font-size multiplier via `transform: scale()`**

Each block's `transform-origin` should match its own alignment, so scaling doesn't drift the text away from its configured position: `left`-aligned blocks scale from their top-left corner, `right`-aligned from top-right, `center` from top-center.

Replace the per-block `<div>`'s style object — keep every existing field, ADD `transform`/`transformOrigin`, and change `textShadow` to pass the two new multipliers:

```tsx
{TEXT_BLOCKS.map((block, i) => {
  const transformOrigin =
    block.textAlign === 'left' ? 'top left' : block.textAlign === 'right' ? 'top right' : 'top center';
  return (
    <div
      key={block.id}
      ref={(el) => {
        if (!ref || typeof ref === 'function') return;
        if (el) ref.current[i] = el;
      }}
      style={{
        position: 'absolute',
        zIndex: 10,
        opacity: 0,
        pointerEvents: 'none',
        userSelect: 'none',
        textAlign: block.textAlign,
        color: block.color,
        fontFamily: 'var(--font-michroma), sans-serif',
        fontSize: block.fontSizeClamp,
        letterSpacing: block.letterSpacing,
        lineHeight: 1.6,
        textShadow: shadowToCss(block.shadow, textBlockShadowSizeMultiplier, textBlockShadowIntensityMultiplier),
        transform: `scale(${textBlockFontSizeMultiplier})`,
        transformOrigin,
        ...block.position,
      }}
    >
      {block.lines.map((line, li) => (
        <div key={li}>{line}</div>
      ))}
    </div>
  );
})}
```

(This replaces the existing `{TEXT_BLOCKS.map((block, i) => ( ... ))}` block — same structure, just computing `transformOrigin` per-block and adding the two new style fields.)

- [ ] **Step 3: +10% shadow on the corridor end-link (in `Section1.tsx`)**

Find the end-of-corridor `<a>` element's inline style (`textShadow: '2px 2px 0px rgba(0,0,0,0.85)'`) and bump it:

```ts
textShadow: '2.2px 2.2px 0px rgba(0,0,0,0.85)',
```

- [ ] **Step 4: Verify**

Run `npm run build` — `ScrollTextBlocks.tsx` should now compile cleanly against the new `shadowToCss` signature. (The overall build will still show OTHER pre-existing failures from Task 1 not yet addressed by later tasks — that's expected; just confirm no NEW errors originate from `ScrollTextBlocks.tsx` or the one line changed in `Section1.tsx`.)

- [ ] **Step 5: Commit**

```bash
git add app/components/ScrollTextBlocks.tsx app/components/Section1.tsx
git commit -m "feat: wire text-block font-size/shadow debug multipliers, +10% corridor link shadow"
```

---

## Task 6: Bottom "press space" prompt + title auto-hide-after-5s

**Files:**
- Modify: `app/components/Section1.tsx`

- [ ] **Step 1: Imports and new local state/refs**

Add to the `sceneConfig` import line: `SPACE_PROMPT_CONFIG, TITLE_HIDE_DELAY_SECONDS`.

Add `useState` to the existing `import { useEffect, useRef } from 'react';` line (becomes `import { useEffect, useRef, useState } from 'react';`).

Extend the existing `useSceneControls()` destructure at the top of the component to also read `audioActivated`:

```ts
const { colors, audioSourceMode, toneFrequencyHz, arpeggioMode, uploadedFileUrl, audioActivated } = useSceneControls();
```

Add new local state and refs, near the other refs:

```ts
const [titleVisible, setTitleVisible] = useState(true);
const titleHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const titleHideTimerArmedRef = useRef(false);
```

- [ ] **Step 2: Arm/disarm the 5-second title-hide timer from `onScroll`**

Find the existing `onScroll` function inside the mount effect. Add this logic at the end of its body (after the existing `scrollRef.current = ...` line):

```ts
function onScroll() {
  const scrolled = window.scrollY - container.offsetTop;
  const instance = computeScrollInstance(Math.max(0, scrolled), window.innerHeight);
  scrollInstanceRef.current = instance;
  scrollRef.current = Math.max(0, Math.min(1, instance / INTRO_CAMERA_INSTANCES));

  if (instance <= 0.01) {
    // Back at the very top — cancel any pending hide, show the title immediately,
    // and disarm so the NEXT scroll-away restarts a fresh 5-second countdown.
    if (titleHideTimerRef.current !== null) {
      clearTimeout(titleHideTimerRef.current);
      titleHideTimerRef.current = null;
    }
    titleHideTimerArmedRef.current = false;
    setTitleVisible(true);
  } else if (!titleHideTimerArmedRef.current) {
    titleHideTimerArmedRef.current = true;
    titleHideTimerRef.current = setTimeout(() => setTitleVisible(false), TITLE_HIDE_DELAY_SECONDS * 1000);
  }
}
```

- [ ] **Step 3: Clear the timer on unmount**

In the mount effect's cleanup function, add (alongside the other cleanup lines):

```ts
if (titleHideTimerRef.current !== null) clearTimeout(titleHideTimerRef.current);
```

- [ ] **Step 4: Drive the title's visibility from `titleVisible`**

Update the title `<div>`'s style — add `opacity`/`transition`/override `animation`:

```tsx
<div
  ref={titleRef}
  style={{
    position:      'absolute',
    top:           TITLE_CONFIG.topPosition,
    left:          '50%',
    transform:     'translateX(-50%)',
    zIndex:        10,
    textAlign:     TITLE_CONFIG.textAlign,
    whiteSpace:    'nowrap',
    color:         TITLE_CONFIG.color,
    fontFamily:    'var(--font-michroma), "Arial Narrow", Impact, sans-serif',
    fontSize:      TITLE_CONFIG.fontSizeClamp,
    fontWeight:    400,
    letterSpacing: TITLE_CONFIG.letterSpacing,
    textTransform: 'uppercase',
    userSelect:    'none',
    pointerEvents: 'none',
    opacity:       titleVisible ? undefined : 0,
    transition:    'opacity 1s ease',
    animation:     titleVisible ? 'titlePulse 4s ease-in-out infinite' : 'none',
    textShadow:    shadowToCss(TITLE_CONFIG.shadow),
  }}
>
  {TITLE_CONFIG.text}
</div>
```

- [ ] **Step 5: Add the bottom "press space" prompt**

Add this new `<div>` inside the sticky viewport, right after the existing scroll indicator `<div>` (the one with `<span>scroll</span>`):

```tsx
{/* ── Press-space-to-activate-audio prompt — mirrors the scroll indicator's styling ── */}
{!audioActivated && (
  <div
    style={{
      position:      'absolute',
      bottom:        SPACE_PROMPT_CONFIG.bottomPosition,
      left:          '50%',
      transform:     'translateX(-50%)',
      zIndex:        10,
      color:         'rgba(210, 170, 255, 0.60)',
      fontFamily:    '"Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSize:      '9px',
      fontWeight:    700,
      letterSpacing: '0.30em',
      textTransform: 'uppercase',
      textAlign:     'center',
      userSelect:    'none',
      pointerEvents: 'none',
      transition:    'opacity 0.4s ease',
      whiteSpace:    'nowrap',
      padding:       '0 16px',
    }}
  >
    {SPACE_PROMPT_CONFIG.text}
  </div>
)}
```

(This is a simple conditional-render, unlike the imperative-ref-driven scroll indicator — appropriate here since `audioActivated` only changes once per session, not every frame, so a normal React re-render is not a performance concern the way per-frame scroll opacity would be.)

- [ ] **Step 6: Manual check**

(You cannot run a real browser — verify by careful code reading and `npm run build` instead, noting any pre-existing unrelated build failures from earlier tasks not yet finished.)

Trace through: at page load, `instance` starts at 0, title visible, prompt visible (assuming `audioActivated` starts `false`, from Task 4's context default). On first scroll, `titleHideTimerArmedRef` arms, a 5-real-second timer starts; if the user keeps scrolling for 5+ seconds without returning to the top, `titleVisible` flips false and the title fades out over 1s. Scrolling back to `instance ≈ 0` at any point cancels the timer and shows the title again immediately, re-arming for next time.

- [ ] **Step 7: Commit**

```bash
git add app/components/Section1.tsx
git commit -m "feat: add press-space-to-activate prompt and 5-second title auto-hide"
```

---

## Task 7: Spacebar audio activation + play/pause wiring

**Files:**
- Modify: `app/components/Section1.tsx`

**Why this converges correctly without careful effect-ordering:** `AudioEngine.setPlaying(true)` unmutes `masterGain` regardless of whether an `<audio>` element exists yet, AND (from Task 3) `setSource('file', ...)` only calls `.play()` on a newly-created element `if (this.playing)`. Whichever of the two React effects below (`[audioSourceMode]` vs `[isPlaying]`) happens to run first after the same state-update batch, the end state converges: the file element gets created AND played, and the master gain gets unmuted. No imperative call-ordering trick needed in the keydown handler itself — just update React state and let the existing effect pattern (already wired in Task 3/earlier tasks) do the rest.

- [ ] **Step 1: Wire the file-source-error fallback at engine construction**

Extend the top-level `useSceneControls()` destructure to also pull the new setters:

```ts
const {
  colors,
  audioSourceMode,
  toneFrequencyHz,
  arpeggioMode,
  uploadedFileUrl,
  audioActivated,
  setAudioSourceMode,
  setAudioActivated,
  isPlaying,
  setIsPlaying,
} = useSceneControls();
```

Change the engine construction line inside the mount effect from `audioEngineRef.current = new AudioEngine();` to:

```ts
// If the default /audio.mp3 fails to load, fall back to the pure tone —
// per the "en default, intenta reproducir el audio.mp3, sino el tono puro" spec.
audioEngineRef.current = new AudioEngine(() => setAudioSourceMode('tone'));
```

(`setAudioSourceMode` is a raw `useState` setter — stable across renders — so referencing it directly inside this `[]`-dep mount effect is safe, same reasoning already documented for `setAudioSourceMode`'s existing effect further down in this file.)

- [ ] **Step 2: Add refs for reading current state inside the mount-effect closure**

Add near the other `*Ref` declarations (following the exact `audioSourceModeRef` pattern already in the file):

```ts
const spacePressedOnceRef = useRef(false);
const isPlayingRef = useRef(isPlaying);
useEffect(() => {
  isPlayingRef.current = isPlaying;
}, [isPlaying]);
```

- [ ] **Step 3: Add the Space keydown handler (a new, persistent effect — distinct from the existing one-shot gesture-unlock effect)**

Add this as a new `useEffect(() => {...}, [])` — place it after the existing gesture-unlock effect:

```ts
/* Space bar: first press activates audio (tries the default mp3, falls
 * back to tone via the onFileSourceError callback above); every press
 * after that toggles play/pause. Skipped when focus is on a form control
 * (e.g. a debug-menu slider) so Space still works normally there. */
useEffect(() => {
  function onSpaceKey(e: KeyboardEvent) {
    if (e.code !== 'Space' || e.repeat) return;
    const target = e.target as HTMLElement | null;
    const isEditable =
      !!target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'BUTTON' ||
        target.isContentEditable);
    if (isEditable) return;
    e.preventDefault();

    if (!spacePressedOnceRef.current) {
      spacePressedOnceRef.current = true;
      setAudioSourceMode('file');
      setAudioActivated(true);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlayingRef.current);
    }
  }
  window.addEventListener('keydown', onSpaceKey);
  return () => window.removeEventListener('keydown', onSpaceKey);
}, []);
```

- [ ] **Step 4: Sync `isPlaying` into the engine**

Add a new effect (place near the existing `setToneFrequency`/`setArpeggioMode` cheap-update effects, same pattern):

```ts
useEffect(() => {
  audioEngineRef.current?.setPlaying(isPlaying);
}, [isPlaying]);
```

- [ ] **Step 5: Verify**

Run `npm run build`. Trace through the flow by hand: page load → `audioActivated=false`, prompt visible, `isPlaying=false` (silent). First Space press (not on a form control) → `spacePressedOnceRef` flips, `audioSourceMode` becomes `'file'`, `audioActivated`/`isPlaying` become `true` → the `[audioSourceMode]` effect rebuilds the source as the mp3 (or, if it 404s, the `onFileSourceError` callback flips `audioSourceMode` to `'tone'`, which re-triggers that same effect for the oscillator instead) → the `[isPlaying]` effect unmutes `masterGain` and plays whatever `audioEl` exists. Prompt disappears (React re-render, `audioActivated` now true). Second Space press → toggles `isPlaying` false → engine mutes/pauses. Confirm none of this fires when, e.g., the debug menu's frequency `<input type="range">` has focus and the user presses Space to nudge it (should NOT toggle playback).

- [ ] **Step 6: Commit**

```bash
git add app/components/Section1.tsx
git commit -m "feat: wire spacebar audio activation (mp3-with-tone-fallback) and play/pause toggle"
```

---

## Task 8: Move lowpass/highpass filter behavior from the (wrong) new light beams to the original diagonal rays

**Files:**
- Modify: `app/components/Section1.tsx`
- Modify: `app/components/DebugMenu.tsx`

**Why:** the previous implementation misunderstood the spec — it added two brand-new cylinder "light beam" meshes and applied the filter behavior to those. The correct target is the **two diagonal streak rays already baked into `FLOW_FRAG`** (present since the very first version of this scene) — the red primary streak (world-space line `sv = z − 0.55·x + 1`) and its amber secondary line (`sv = −2`). Per the user's clarification: **red → lowpass, amber → highpass.**

- [ ] **Step 1: Remove the two cylinder-beam meshes entirely**

In `app/components/Section1.tsx`:
1. Remove `LIGHT_BEAMS` from the `sceneConfig` import list; add `DIAGONAL_RAYS_CONFIG` in its place.
2. Delete the entire `/* ── Light beams — contact triggers progressive audio filters ──── */` block: the `BEAM_HEIGHT` constant, the `makeBeam` function, and the two `const beamLowpassMesh = makeBeam(...)` / `const beamHighpassMesh = makeBeam(...)` lines plus their ref assignments.
3. Delete the `beamLowpassMeshRef`/`beamHighpassMeshRef` `useRef` declarations.
4. Delete their disposal lines in the mount effect's cleanup: `beamLowpassMesh.geometry.dispose(); ...` and `beamHighpassMesh.geometry.dispose(); ...`.
5. Delete their two lines from the color-sync `useEffect(() => {...}, [colors])`: `(beamLowpassMeshRef.current?.material as ...)?.color.set(colors.beamLowpass);` and the highpass equivalent. (These would be a TypeScript error anyway now — `colors.beamLowpass`/`colors.beamHighpass` no longer exist on the `colors` type after Task 1 removed those keys from `DEFAULT_SCENE_COLORS`.)

- [ ] **Step 2: Replace the contact-detection math with line-proximity instead of circle-radius**

Find the `/* Light-beam contact → progressive lowpass / highpass (Task 14). */` block (the `dxLow`/`dzLow`/`inLowpassBeam` ... `dxHigh`/`dzHigh`/`inHighpassBeam` code) and replace it entirely with:

```ts
/* Diagonal-ray contact → progressive lowpass (red) / highpass (amber).
 * `sv` mirrors FLOW_FRAG's exact line equation for the red streak
 * (`sv = z - 0.55*x + 1`); the amber line sits at `sv = -secondaryOffset`. */
const svAtSphere = sphere.position.z - 0.55 * sphere.position.x + 1.0;

const inRedRay = Math.abs(svAtSphere) < DIAGONAL_RAYS_CONFIG.contactWidth;
lowpassContactRef.current = stepContactAmount(
  lowpassContactRef.current, inRedRay, dt, AUDIO_CONFIG.filterRampSeconds, AUDIO_CONFIG.filterReleaseSeconds
);
audioEngineRef.current?.setLowpassAmount(lowpassContactRef.current);

const inAmberRay = Math.abs(svAtSphere + DIAGONAL_RAYS_CONFIG.secondaryOffset) < DIAGONAL_RAYS_CONFIG.contactWidth;
highpassContactRef.current = stepContactAmount(
  highpassContactRef.current, inAmberRay, dt, AUDIO_CONFIG.filterRampSeconds, AUDIO_CONFIG.filterReleaseSeconds
);
audioEngineRef.current?.setHighpassAmount(highpassContactRef.current);
```

(`lowpassContactRef`/`highpassContactRef`/`stepContactAmount`/`AUDIO_CONFIG.filterRampSeconds`/`.filterReleaseSeconds` are all pre-existing and unchanged — only the "am I in contact" boolean's source changes, from circle-distance-to-a-beam-position to line-distance-to-a-ray.)

- [ ] **Step 3: Update `DebugMenu.tsx`'s color labels**

Remove the two now-nonexistent keys from `COLOR_LABELS` (it's typed `Record<SceneColorKey, string>`, and `SceneColorKey` no longer includes `beamLowpass`/`beamHighpass` after Task 1 — leaving these in would be a TypeScript excess-property/type error):

```ts
const COLOR_LABELS: Record<SceneColorKey, string> = {
  flowBackground: 'Fondo del escenario',
  flowLineLavender: 'Líneas — lavanda',
  flowLinePink: 'Líneas — rosa',
  flowLineAmber: 'Líneas — ámbar',
  flowNearSphereGlow: 'Halo cerca de la esfera',
  sphereChromeHighlight: 'Brillo cromado (esfera)',
  starColor: 'Estrellas',
  corridorWallStart: 'Pasillo — pared inicial',
  corridorWallEnd: 'Pasillo — pared final',
};
```

- [ ] **Step 4: Verify**

Run `npm run build`. Confirm no remaining references to `LIGHT_BEAMS`, `beamLowpassMesh`, `beamHighpassMesh`, `beamLowpassMeshRef`, `beamHighpassMeshRef`, `colors.beamLowpass`, `colors.beamHighpass` anywhere in `app/components/Section1.tsx` or `app/components/DebugMenu.tsx` (`grep -rn "beamLowpass\|beamHighpass\|LIGHT_BEAMS" app/` should return nothing).

Trace through by hand: guide the sphere near world position where `z − 0.55·x + 1 ≈ 0` (e.g. near the origin, since at `x=0,z=-1` that's exactly 0) → `inRedRay` becomes true → lowpass ramps in over `filterRampSeconds`. Move to where `z − 0.55·x + 1 ≈ −2` (e.g. `x=0, z=-3`) → `inAmberRay` becomes true → highpass ramps in instead.

- [ ] **Step 5: Commit**

```bash
git add app/components/Section1.tsx app/components/DebugMenu.tsx
git commit -m "fix: apply lowpass/highpass filters to the original diagonal rays, not new light-beam meshes"
```

---

## Task 9: Wire `dt` into `setDopplerSpeed` + the pitch-inertia debug multiplier

**Files:**
- Modify: `app/components/Section1.tsx`

- [ ] **Step 1: Pass `dt` to `setDopplerSpeed`**

Find `audioEngineRef.current?.setDopplerSpeed(sphereSpeed);` and change it to:

```ts
audioEngineRef.current?.setDopplerSpeed(sphereSpeed, dt);
```

- [ ] **Step 2: Wire the `pitchInertiaMultiplier` debug control into the engine**

Extend the top-level `useSceneControls()` destructure to also read `pitchInertiaMultiplier`.

Add a new effect (same pattern as `setToneFrequency`/`setArpeggioMode`):

```ts
useEffect(() => {
  audioEngineRef.current?.setPitchInertiaMultiplier(pitchInertiaMultiplier);
}, [pitchInertiaMultiplier]);
```

- [ ] **Step 3: Verify**

Run `npm run build`. Confirm `setDopplerSpeed` is called with exactly 2 arguments everywhere it's invoked (should be exactly once, in `animate()`).

- [ ] **Step 4: Commit**

```bash
git add app/components/Section1.tsx
git commit -m "feat: wire dt into doppler pitch envelope and the pitch-inertia debug multiplier"
```

---

## Task 10: Sharper near/far contrast + intensity/inertia debug multipliers for the floor-doppler effect

**Files:**
- Modify: `app/components/Section1.tsx`

- [ ] **Step 1: Tighten the shader's near/far falloff for a starker contrast**

In `FLOW_FRAG`, find `float dopplerFalloff = 1.0 - smoothstep(0.0, R * 8.0, r);` and tighten the falloff radius so the "near = strong compression" vs "far = normal spacing" contrast reads more starkly (per "que haya menos espacio entre las lineas que están cercanas... y más espacio... de aquellas que están mas lejos"):

```glsl
float dopplerFalloff = 1.0 - smoothstep(0.0, R * 5.0, r); // was R*8.0 — starker near/far contrast
```

- [ ] **Step 2: Add refs for the two new debug multipliers**

Extend the top-level `useSceneControls()` destructure to also read `floorDopplerIntensityMultiplier, floorDopplerInertiaMultiplier`.

Add refs near `floorDopplerStateRef` (following the established `colorsRef`-style pattern for values read inside the `[]`-dep `animate()` closure):

```ts
const floorDopplerIntensityMultRef = useRef(floorDopplerIntensityMultiplier);
useEffect(() => {
  floorDopplerIntensityMultRef.current = floorDopplerIntensityMultiplier;
}, [floorDopplerIntensityMultiplier]);

const floorDopplerInertiaMultRef = useRef(floorDopplerInertiaMultiplier);
useEffect(() => {
  floorDopplerInertiaMultRef.current = floorDopplerInertiaMultiplier;
}, [floorDopplerInertiaMultiplier]);
```

- [ ] **Step 3: Apply both multipliers in `animate()`**

Find the floor-doppler block in `animate()` and replace it with:

```ts
/* Floor doppler wave compression — only "active" (camera far from the
 * scenario) at/after FLOOR_DOPPLER_MIN_CAMERA_PROGRESS; forcing speed
 * to 0 below that threshold lets the hold+release curve ease it out
 * naturally instead of an abrupt cut. Inertia multiplier scales
 * hold+release duration; intensity multiplier scales the final
 * compression strength (kept separate from the state machine's own
 * timing so scaling "how strong" never distorts "how long"). */
const floorEffectiveSpeed = progress >= FLOOR_DOPPLER_MIN_CAMERA_PROGRESS ? sphereSpeed : 0;
const scaledFloorDopplerCfg = {
  compressionStrength: FLOOR_DOPPLER_CONFIG.compressionStrength,
  riseRate: FLOOR_DOPPLER_CONFIG.riseRate,
  holdSeconds: FLOOR_DOPPLER_CONFIG.holdSeconds * floorDopplerInertiaMultRef.current,
  releaseSeconds: FLOOR_DOPPLER_CONFIG.releaseSeconds * floorDopplerInertiaMultRef.current,
};
floorDopplerStateRef.current = stepFloorDopplerState(
  floorDopplerStateRef.current, floorEffectiveSpeed, dt, scaledFloorDopplerCfg
);
// NOTE: spring.vx/vz are frozen once inside the corridor phase — harmless today
// since the flow-mesh floor (which this drives) is not visible from the corridor.
const rawVelX = dt > 0 ? spring.vx / dt : 0;
const rawVelZ = dt > 0 ? spring.vz / dt : 0;
const rawVelLen = Math.sqrt(rawVelX * rawVelX + rawVelZ * rawVelZ);
if (rawVelLen > 0.05) lastSphereVelRef.current.set(rawVelX, rawVelZ);
flowUniforms.uSphereVel.value.copy(lastSphereVelRef.current);
flowUniforms.uDopplerCompress.value =
  floorDopplerStateRef.current.intensity * FLOOR_DOPPLER_CONFIG.compressionStrength * floorDopplerIntensityMultRef.current;
```

(This is the same block as before, with only the `scaledFloorDopplerCfg` construction added and the two multiplier reads applied at the two points that matter — `stepFloorDopplerState`'s `cfg` argument for timing, and the final `uDopplerCompress` write for strength. Everything else — `rawVelX`/`rawVelZ`/`lastSphereVelRef` — is unchanged from before.)

- [ ] **Step 4: Verify**

Run `npm run build`. With both multipliers at their default of 1.0, behavior should be identical to before this task except for the (deliberately) bigger `FLOOR_DOPPLER_CONFIG.compressionStrength`/`holdSeconds`/`releaseSeconds` values already set in Task 1.

- [ ] **Step 5: Commit**

```bash
git add app/components/Section1.tsx
git commit -m "feat: sharpen floor-doppler near/far contrast, wire intensity/inertia debug multipliers"
```

---

## Task 11: `corridor.ts` — respect the entrance's real Y (no more forced y=0)

**Files:**
- Modify: `app/lib/corridor.ts`

**Why:** the old design anchored the corridor at the sphere's dynamic disc position and forced its `y` to 0 so a "floor hole" would visually align with the disc. The new design (Task 12) builds the corridor ONCE at a fixed, deliberately-far-below world position (`CORRIDOR_CONFIG.yOffset`, e.g. `-80`) — so `entrancePosition.y` is now meaningful and must NOT be zeroed out.

- [ ] **Step 1: Remove the `y=0` override; simplify `endWallCenter`**

Replace:

```ts
  meshes.forEach((m) => group.add(m));
  group.position.copy(entrancePosition);
  group.position.y = 0;

  const axis = new THREE.Vector3(0, 0, -1);
  const groupWorldPos = new THREE.Vector3(entrancePosition.x, 0, entrancePosition.z); // matches group.position after the y=0 zeroing above
  const endWallCenter = groupWorldPos.clone().add(new THREE.Vector3(0, crossSection / 2, -length - thickness / 2));
```

with:

```ts
  meshes.forEach((m) => group.add(m));
  group.position.copy(entrancePosition);

  const axis = new THREE.Vector3(0, 0, -1);
  const endWallCenter = entrancePosition.clone().add(new THREE.Vector3(0, crossSection / 2, -length - thickness / 2));
```

(`group.position` now literally equals `entrancePosition` with no special-casing, so `endWallCenter` can be derived directly from it — no more indirection through a reconstructed `groupWorldPos`.)

- [ ] **Step 2: Verify and commit**

Run `npm run build`. This file has no other consumers changed yet (Task 12 updates the call site) — confirm `corridor.ts` itself still type-checks (it should; the function signature is unchanged, only its body).

```bash
git add app/lib/corridor.ts
git commit -m "fix: let buildCorridor respect the entrance's real world Y instead of forcing 0"
```

---

## Task 12: Rebuild the final phase — teleport to a fixed-position corridor with a chase camera

**Files:**
- Modify: `app/components/Section1.tsx`

**Why — read this before touching code:** the previous final phase (zoom-to-sphere camera + a floor "hole" that grows to reveal a corridor anchored to wherever the sphere happened to be) is being fully replaced per explicit user feedback ("no se ve bien, no funciona... podemos cambiar la implementacion completa"). The new design is much simpler and more robust specifically BECAUSE it removes every piece of dynamic/lazy state that made the old one hard to reverse cleanly:

- The corridor is built **once**, at mount, like every other static piece of geometry (the disc, the sphere, the stars) — at a **fixed** world position `(0, CORRIDOR_CONFIG.yOffset, 0)`, e.g. 80 units straight down. It is never rebuilt, never lazily constructed, never anchored to a moving point.
- Crossing into the final phase (`finalPhaseProgress > 0`) is a **hard teleport**: the sphere's position formula and the camera's formula both switch, instantly, to the corridor's fixed coordinate frame. There is no zoom, no reveal animation.
- Both the sphere's position and the camera's position are **pure functions of the current scroll position** (via `remapSubrange`/`corridorTravelDistance`, both already unit-tested) — nothing is "remembered" from a previous frame except the mouse-spring's `x/z/vx/vz`, which get explicitly reset at the disc↔corridor boundary (Step 3 below). This is what makes scrolling up and down through the boundary repeatedly safe: every frame recomputes both positions from scratch from the current scroll value, so there's no state that can drift or desync.

- [ ] **Step 1: Remove the old hole-reveal shader plumbing**

In `FLOW_FRAG`, remove the two uniform declarations `uniform vec2 uHoleCenter;` and `uniform float uHoleRadius;`. Change the final two lines of `main()` from:

```glsl
    float holeR = max(uHoleRadius, 0.0001);
    float holeMask = smoothstep(holeR * 0.7, holeR, length(wxz - uHoleCenter));
    gl_FragColor = vec4(color, holeMask);
```

back to:

```glsl
    gl_FragColor = vec4(color, 1.0);
```

Remove `uHoleCenter: { value: new THREE.Vector2(0, 0) },` and `uHoleRadius: { value: 0 },` from the `flowUniforms` object literal. Remove `transparent: true,` from the `flowMat` `THREE.ShaderMaterial` constructor call (no longer needed — the disc is fully opaque again).

Remove the `flowMeshRef` ref declaration entirely, and simplify its creation back to an inline, unreferenced mesh (nothing reads it anymore — the old hole-reveal visibility toggle is gone, and the disc no longer needs hiding: once the camera teleports to the corridor, the disc is simply out of frame, so no explicit visibility management is needed):

```ts
scene.add(new THREE.Mesh(planeGeo, flowMat));
```

- [ ] **Step 2: Remove `applyFinalPhaseCamera`; add `applyCorridorCamera` and the fixed corridor build**

Remove the entire `applyFinalPhaseCamera` function and its two constants (`FINAL_CLOSE_OFFSET`, `HOLE_MAX_RADIUS`).

In their place (same position — right after `applyCamKeyframes`'s definition, before the spring-physics constants), add:

```ts
const CORRIDOR_UP = new THREE.Vector3(0, 1, 0);

/** Simple third-person chase camera: sits behind (relative to travel
 * direction) and above the sphere, always looking at it. Pure function
 * of the sphere's current position — no per-frame state, so it's
 * trivially correct whether scrolling forward or backward through the
 * corridor. */
function applyCorridorCamera(spherePos: THREE.Vector3) {
  const diameter = SPHERE_R * 2;
  const behindOffset = corridor.axis.clone().multiplyScalar(-diameter * CORRIDOR_CONFIG.chaseDistanceMultiplier);
  const camPos = spherePos.clone().add(behindOffset).add(new THREE.Vector3(0, diameter * CORRIDOR_CONFIG.chaseHeightMultiplier, 0));
  camera.position.copy(camPos);
  camera.up.copy(CORRIDOR_UP);
  camera.lookAt(spherePos);
}
```

Now build the corridor **once**, as static scene geometry. Add this right after the sphere is added to the scene (`scene.add(sphere);`), before the light-beam/diagonal-ray section (there's no mesh-based beam section left after Task 8, so this lands right before the star field section):

```ts
/* ── Corridor — fixed position far below the main disc; the final
 * phase teleports the sphere+camera here, never rebuilt. ──────── */
const corridor = buildCorridor(
  SPHERE_R,
  new THREE.Vector3(0, CORRIDOR_CONFIG.yOffset, 0),
  colorsRef.current.corridorWallStart,
  colorsRef.current.corridorWallEnd
);
scene.add(corridor.group);
corridorRef.current = corridor;
```

(`corridorRef` still exists as a ref — Task 11's plan intentionally keeps it, since the color-sync `useEffect` OUTSIDE the mount effect needs a way to reach `corridor.endWallUniforms` reactively when the debug menu changes `colors.corridorWallStart`/`corridorWallEnd`. What's gone is the *lazy, maybe-null* construction pattern — `corridor` itself, from here on, is a plain `const` closure variable, always available, exactly like `sphere` or `flowMat`.)

- [ ] **Step 3: Rewrite the position/camera/end-link section of `animate()`**

Replace the entire block from the `/* Camera transition */` comment through the `wasInsideCorridorRef.current = insideCorridorPhase;` line (this spans: the old camera branch, the old hole-reveal uniform writes, the mouse-rotation doc comment, and the full disc/corridor `if/else` — i.e. everything between the `starUniforms.uTime.value = time;` line above it and the `audioEngineRef.current?.setDopplerSpeed(...)` line below it) with:

```ts
      /* Scroll-timeline gating: the final phase begins the instant scroll
       * passes the last text block — a hard teleport to the corridor
       * (see CORRIDOR_CONFIG.yOffset), not a gradual zoom/reveal. */
      const instance = scrollInstanceRef.current;
      const finalPhaseProgress = remapSubrange(
        instance,
        { start: FINAL_PHASE_START_INSTANCE, end: FINAL_PHASE_START_INSTANCE + FINAL_PHASE_DURATION_INSTANCES }
      );
      const insideCorridorPhase = finalPhaseProgress > 0;

      /*
       * Progressive mouse control rotation
       * ─────────────────────────────────
       * Phase 0 (progress=0): mouse X → sphere X, mouse lower-Y → sphere Z
       * Phase 3 (progress=1): axes rotate 90° to match camera — sphere up/down
       *   (world X, which is screen-up in Phase 3) follows mouse left/right.
       *
       * Lower-half Y constraint fades out as camera ascends to zenith,
       * releasing to full-range Y control by ~40% scroll.
       */
      let sphereSpeed: number;
      let corridorTravelT = 0;

      if (!insideCorridorPhase) {
        /* ── Original disc/mouse-spring control (unchanged) ── */
        if (wasInsideCorridorRef.current) {
          // Hard teleport back from the corridor — there's no spatial
          // continuity to preserve either direction, so resume disc
          // physics from the center rather than the corridor's exit point.
          spring.x = 0;
          spring.z = 0;
          spring.vx = 0;
          spring.vz = 0;
        }

        const mx = mouseRef.current.x;
        const my = mouseRef.current.y; // +1 = top, −1 = bottom

        const constraintFade = Math.max(0, 1 - progress / 0.25);
        const myPhase0 = my < 0 ? -my : 0;
        const myPhase3 = -my;
        const myInput = myPhase0 * constraintFade + myPhase3 * (1 - constraintFade);

        const angle = progress * Math.PI / 2;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const targetX = (mx * cosA - myInput * sinA) * MAX_X;
        const targetZ = (mx * sinA + myInput * cosA) * MAX_Z;

        spring.vx = spring.vx * SPRING_DAMP + (targetX - spring.x) * SPRING_K;
        spring.vz = spring.vz * SPRING_DAMP + (targetZ - spring.z) * SPRING_K;
        spring.x += spring.vx;
        spring.z += spring.vz;

        const clampFade = Math.max(0, 1 - progress / 0.22);
        const clampX = THREE.MathUtils.lerp(PLANE * 0.85, MAX_X, clampFade);
        const clampZMin = THREE.MathUtils.lerp(-(PLANE * 0.85), 0, clampFade);
        const clampZMax = PLANE * 0.85;
        spring.x = THREE.MathUtils.clamp(spring.x, -clampX, clampX);
        spring.z = THREE.MathUtils.clamp(spring.z, clampZMin, clampZMax);

        sphere.position.x = spring.x;
        sphere.position.z = spring.z;

        sphereSpeed = dt > 0 ? Math.sqrt(spring.vx * spring.vx + spring.vz * spring.vz) / dt : 0;
      } else {
        /* ── Corridor: mouse control frozen; travel driven by scroll ── */
        corridorTravelT = remapSubrange(finalPhaseProgress, FINAL_PHASE_SUBRANGES.corridorTravel);
        const travelDistance = corridorTravelDistance(corridorTravelT, corridor.length, SPHERE_R);

        sphere.position.copy(corridor.entrance).addScaledVector(corridor.axis, travelDistance);

        if (!wasInsideCorridorRef.current) {
          prevTravelDistanceRef.current = travelDistance; // fresh entry — no delta on the first frame
        }
        sphereSpeed = dt > 0 ? Math.abs(travelDistance - prevTravelDistanceRef.current) / dt : 0;
        prevTravelDistanceRef.current = travelDistance;

        corridorTimeAccumRef.current += dt * corridorWaveSpeedMultRef.current;
        corridor.patternUniforms.uTime.value = corridorTimeAccumRef.current;
        corridor.endWallUniforms.uColorT.value = corridorTravelT;
      }

      /* Ground level differs by phase — disc floor is at world y=0,
       * corridor floor is at CORRIDOR_CONFIG.yOffset. Sphere sinks the
       * same ~70% into either floor. */
      const groundY = insideCorridorPhase ? CORRIDOR_CONFIG.yOffset : 0;
      sphere.position.y = groundY + SPHERE_R * 0.30;
      wasInsideCorridorRef.current = insideCorridorPhase;

      /* Camera — computed AFTER the position branch above so it always
       * reads the CURRENT frame's sphere position, with zero lag. */
      if (!insideCorridorPhase) {
        applyCamKeyframes(progress);
      } else {
        applyCorridorCamera(sphere.position);
      }

      /* End-of-corridor link — only relevant, and only projected, while
       * actually inside the corridor. */
      if (insideCorridorPhase) {
        // .project(camera) relies on camera.matrixWorldInverse, which is
        // normally refreshed by composer.render() — but that runs AFTER
        // this point in the frame, so without an explicit update here
        // we'd project against last frame's camera transform.
        camera.updateMatrixWorld();
        const projected = corridor.endWallCenter.clone().project(camera);
        if (endLinkRef.current) {
          endLinkRef.current.style.left = `${(projected.x * 0.5 + 0.5) * window.innerWidth}px`;
          endLinkRef.current.style.top  = `${(-projected.y * 0.5 + 0.5) * window.innerHeight}px`;
          const reached = corridorTravelT >= CORRIDOR_CONFIG.reachedThreshold;
          endLinkRef.current.style.opacity = reached ? '1' : '0';
          endLinkRef.current.style.pointerEvents = reached ? 'auto' : 'none';
          endLinkRef.current.tabIndex = reached ? 0 : -1;
          endLinkRef.current.setAttribute('aria-hidden', reached ? 'false' : 'true');
        }
      } else if (endLinkRef.current) {
        endLinkRef.current.style.opacity = '0';
        endLinkRef.current.style.pointerEvents = 'none';
        endLinkRef.current.tabIndex = -1;
        endLinkRef.current.setAttribute('aria-hidden', 'true');
      }
```

Everything AFTER this block (`audioEngineRef.current?.setDopplerSpeed(sphereSpeed, dt);` onward — the diagonal-ray contact code from Task 8, the floor-doppler code from Task 10, bloom, the scroll indicator, text-block opacity, `composer.render()`) is unchanged and stays exactly where it is.

- [ ] **Step 4: Add the corridor-wave-speed accumulator + debug multiplier ref**

Add near the other refs declared above the mount effect:

```ts
// Accumulates independently of the global clock so the debug-menu wave-
// speed multiplier can change live without discontinuity (a direct
// `time * multiplier` would jump whenever the multiplier changes).
const corridorTimeAccumRef = useRef(0);
const corridorWaveSpeedMultRef = useRef(corridorWaveSpeedMultiplier);
useEffect(() => {
  corridorWaveSpeedMultRef.current = corridorWaveSpeedMultiplier;
}, [corridorWaveSpeedMultiplier]);
```

Extend the top-level `useSceneControls()` destructure to also read `corridorWaveSpeedMultiplier`.

- [ ] **Step 5: Simplify the corridor's disposal in the mount effect's cleanup**

Replace:

```ts
corridorRef.current?.dispose();
if (corridorRef.current) scene.remove(corridorRef.current.group);
corridorRef.current = null;
```

with:

```ts
corridor.dispose();
scene.remove(corridor.group);
corridorRef.current = null;
```

(`corridor` — the closure variable from Step 2 — is always defined by the time cleanup can run, since it's built synchronously earlier in the same effect; no more null-checking needed.)

- [ ] **Step 6: Verify**

Run `npm run build`. Grep for any remaining references to `applyFinalPhaseCamera`, `FINAL_CLOSE_OFFSET`, `HOLE_MAX_RADIUS`, `uHoleCenter`, `uHoleRadius`, `flowMeshRef` — all should be gone. Confirm `corridor` (lowercase, the closure variable) is referenced consistently, and `corridorRef.current` is only used for (a) the one-time assignment right after `buildCorridor`, (b) the external color-sync effect, (c) the cleanup's final `= null`.

Trace through by hand, both directions:
- **Forward:** scroll instance crosses `FINAL_PHASE_START_INSTANCE` → `finalPhaseProgress` ticks above 0 → next frame, `insideCorridorPhase` is true → sphere INSTANTLY appears at `corridor.entrance` (world `(0, CORRIDOR_CONFIG.yOffset + SPHERE_R*0.3, 0)`) → camera instantly cuts to the chase view behind it. Continued scroll advances `corridorTravelT` from 0 toward 1, sphere travels the corridor's length, camera follows continuously, wall color lerps red→blue, link appears once `corridorTravelT ≥ reachedThreshold`.
- **Backward:** scrolling back down past `FINAL_PHASE_START_INSTANCE` → `insideCorridorPhase` flips false → sphere instantly reappears at disc-center `(0, SPHERE_R*0.3, 0)` with a fully reset, zero-velocity spring → camera instantly cuts back to `applyCamKeyframes(progress)`'s intro choreography. No leftover state (corridor travel distance, spring velocity) carries over incorrectly in either direction.

- [ ] **Step 7: Commit**

```bash
git add app/components/Section1.tsx
git commit -m "feat: rebuild final phase as a hard teleport to a fixed-position corridor with a chase camera"
```

---

## Task 13: Camera FOV debug control

**Files:**
- Modify: `app/components/Section1.tsx`

- [ ] **Step 1: Expose the camera via a ref**

Add near the other refs:

```ts
const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
```

Right after `const camera = new THREE.PerspectiveCamera(65, W / H, 0.1, 500);` in the mount effect, add:

```ts
cameraRef.current = camera;
```

- [ ] **Step 2: React to `cameraFovDeg` changes**

Extend the top-level `useSceneControls()` destructure to also read `cameraFovDeg`.

Add a new effect (outside the mount effect, alongside the other reactive `[colors]`/`[toneFrequencyHz]`-style effects):

```ts
useEffect(() => {
  if (!cameraRef.current) return;
  cameraRef.current.fov = cameraFovDeg;
  cameraRef.current.updateProjectionMatrix();
}, [cameraFovDeg]);
```

(FOV only needs to change when the debug slider moves — not every frame — so a plain reactive effect, not a per-frame ref read in `animate()`, is the right pattern here; contrast with `colorsRef`/`corridorWaveSpeedMultRef`, which DO need per-frame reads because they're consumed inside the rAF loop's own logic.)

- [ ] **Step 3: Verify and commit**

Run `npm run build`. Confirm `cameraRef.current` is null-guarded (the effect can fire before the mount effect has run, e.g. on fast refresh) and that changing `cameraFovDeg` doesn't touch anything else (aspect ratio, near/far planes stay as constructed).

```bash
git add app/components/Section1.tsx
git commit -m "feat: add camera FOV debug control"
```

---

## Task 14: Free-fly debug camera (WASD + Q/E + mouse-look)

**Files:**
- Modify: `app/components/Section1.tsx`

**Design notes (read first):**
- **Mouse-look without Pointer Lock.** This codebase already tracks raw mouse position as `mouseRef.current.{x,y}` in the range `[-1, 1]` (screen-space, used for sphere steering). Free-camera mode repurposes that SAME signal as a continuous look-rate: mouse near an edge of the screen keeps rotating the camera toward that edge; mouse at center = no rotation. This avoids the Pointer Lock API entirely (no click-to-lock UX, no browser permission prompt) — appropriate for what is explicitly a debug/exploration tool, not user-facing polish.
- **Scope: camera only.** Free-camera mode does NOT touch the sphere's position or the scroll-driven animation — those keep running normally underneath. This is a deliberate simplification: `mouseRef` is used by BOTH the disc's sphere-steering AND (when active) the free camera's look — moving the mouse while free-camera is on will do both simultaneously. This is an accepted, documented overlap, not a bug — decoupling them would add real complexity for a debug-only feature where it doesn't matter.
- **Q/E move along world Y** (confirmed with the user — not X).

- [ ] **Step 1: Track WASD/Q/E key state**

Add a ref near the others:

```ts
const freeCameraKeysRef = useRef<Set<string>>(new Set());
```

Add a new effect (persistent for the component's lifetime, unlike the one-shot gesture-unlock effect):

```ts
useEffect(() => {
  const TRACKED_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']);
  function isEditableTarget(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement | null;
    return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
  }
  function onKeyDown(e: KeyboardEvent) {
    if (isEditableTarget(e) || !TRACKED_CODES.has(e.code)) return;
    freeCameraKeysRef.current.add(e.code);
  }
  function onKeyUp(e: KeyboardEvent) {
    if (!TRACKED_CODES.has(e.code)) return;
    freeCameraKeysRef.current.delete(e.code);
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  };
}, []);
```

- [ ] **Step 2: Free-camera state refs + context sync**

Extend the top-level `useSceneControls()` destructure to also read `freeCameraEnabled`.

Add refs near the others:

```ts
const freeCameraEnabledRef = useRef(freeCameraEnabled);
useEffect(() => {
  freeCameraEnabledRef.current = freeCameraEnabled;
}, [freeCameraEnabled]);
const wasFreeCameraEnabledRef = useRef(false);
const freeCamPosRef = useRef(new THREE.Vector3());
const freeCamYawRef = useRef(0);
const freeCamPitchRef = useRef(0);
```

- [ ] **Step 3: Add `updateFreeCamera` inside the mount effect**

Add this function right after `applyCorridorCamera` (from Task 12):

```ts
/**
 * WASD (forward/back/strafe) + Q/E (world-Y up/down) + mouse-position-
 * as-look-rate (no pointer lock — see task notes). Yaw/pitch are
 * maintained here (not derived from camera.quaternion each frame) so
 * they can be smoothly accumulated across frames.
 */
function updateFreeCamera(dt: number) {
  const mx = mouseRef.current.x;
  const my = mouseRef.current.y;

  freeCamYawRef.current -= mx * FREE_CAMERA_CONFIG.lookSensitivity * dt;
  freeCamPitchRef.current = THREE.MathUtils.clamp(
    freeCamPitchRef.current + my * FREE_CAMERA_CONFIG.lookSensitivity * dt,
    -FREE_CAMERA_CONFIG.maxPitchRad,
    FREE_CAMERA_CONFIG.maxPitchRad
  );

  const yaw = freeCamYawRef.current;
  const pitch = freeCamPitchRef.current;
  const forward = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch)
  );
  const right = new THREE.Vector3(Math.sin(yaw + Math.PI / 2), 0, Math.cos(yaw + Math.PI / 2));

  const keys = freeCameraKeysRef.current;
  const move = new THREE.Vector3();
  if (keys.has('KeyW')) move.add(forward);
  if (keys.has('KeyS')) move.sub(forward);
  if (keys.has('KeyD')) move.add(right);
  if (keys.has('KeyA')) move.sub(right);
  if (keys.has('KeyE')) move.y -= 1;
  if (keys.has('KeyQ')) move.y += 1;
  if (move.lengthSq() > 0) move.normalize().multiplyScalar(FREE_CAMERA_CONFIG.moveSpeed * dt);
  freeCamPosRef.current.add(move);

  camera.position.copy(freeCamPosRef.current);
  camera.up.set(0, 1, 0);
  camera.lookAt(freeCamPosRef.current.clone().add(forward));
}
```

- [ ] **Step 4: Wrap the camera branch (from Task 12) with the free-camera check**

Find the camera branch Task 12 added in `animate()`:

```ts
      /* Camera — computed AFTER the position branch above so it always
       * reads the CURRENT frame's sphere position, with zero lag. */
      if (!insideCorridorPhase) {
        applyCamKeyframes(progress);
      } else {
        applyCorridorCamera(sphere.position);
      }
```

Replace it with:

```ts
      /* Camera — computed AFTER the position branch above so it always
       * reads the CURRENT frame's sphere position, with zero lag.
       * Free-camera mode (debug menu) overrides everything else. */
      if (freeCameraEnabledRef.current) {
        if (!wasFreeCameraEnabledRef.current) {
          // Just enabled — snapshot the camera's current position/facing
          // as the starting point so there's no jump.
          freeCamPosRef.current.copy(camera.position);
          const currentForward = new THREE.Vector3();
          camera.getWorldDirection(currentForward);
          freeCamPitchRef.current = Math.asin(THREE.MathUtils.clamp(currentForward.y, -1, 1));
          freeCamYawRef.current = Math.atan2(currentForward.x, currentForward.z);
        }
        updateFreeCamera(dt);
      } else if (!insideCorridorPhase) {
        applyCamKeyframes(progress);
      } else {
        applyCorridorCamera(sphere.position);
      }
      wasFreeCameraEnabledRef.current = freeCameraEnabledRef.current;
```

- [ ] **Step 5: Add the `FREE_CAMERA_CONFIG` import**

Add `FREE_CAMERA_CONFIG` to the existing `sceneConfig` import list.

- [ ] **Step 6: Verify**

Run `npm run build`. Trace through: debug menu toggle flips `freeCameraEnabled` → context → `freeCameraEnabledRef` (via its sync effect) → next `animate()` frame takes the free-camera branch, snapshotting position/orientation on the FIRST such frame (no jump), then W/A/S/D/Q/E + mouse position drive it every frame after. Toggling back off: next frame falls through to whichever of `applyCamKeyframes`/`applyCorridorCamera` is appropriate for the current scroll position — this WILL produce a visible jump back to the scroll-driven camera position, which is expected/acceptable for a debug tool.

- [ ] **Step 7: Commit**

```bash
git add app/components/Section1.tsx
git commit -m "feat: add free-fly debug camera (WASD + Q/E + mouse-look)"
```

---

## Task 15: `DebugMenu.tsx` — Michroma + responsive redesign, close button, all 9 new controls

**Files:**
- Modify: `app/components/DebugMenu.tsx`

**Why one task:** every new control reads from context state that now fully exists (Tasks 4, 9, 10, 13, 14) and drives engine/camera/shader behavior already wired in those tasks — this task is purely the UI surface for controls whose underlying behavior is already implemented and independently verified.

- [ ] **Step 1: Replace the entire file**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useSceneControls } from '@/app/lib/SceneControlsContext';
import {
  DEFAULT_SCENE_COLORS,
  COLOR_PALETTE_PRESETS,
  AUDIO_CONFIG,
  DEBUG_RANGES,
  type SceneColorKey,
} from '@/app/lib/sceneConfig';

const COLOR_LABELS: Record<SceneColorKey, string> = {
  flowBackground: 'Fondo del escenario',
  flowLineLavender: 'Líneas — lavanda',
  flowLinePink: 'Líneas — rosa',
  flowLineAmber: 'Líneas — ámbar',
  flowNearSphereGlow: 'Halo cerca de la esfera',
  sphereChromeHighlight: 'Brillo cromado (esfera)',
  starColor: 'Estrellas',
  corridorWallStart: 'Pasillo — pared inicial',
  corridorWallEnd: 'Pasillo — pared final',
};

/** Shared label+range-input row — used by every new debug slider. */
function SliderRow({
  label,
  value,
  onChange,
  min,
  max,
  step,
  formatValue,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  formatValue?: (v: number) => string;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ opacity: 0.7 }}>{formatValue ? formatValue(value) : value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  );
}

/**
 * Debug panel — press Shift, or click the ✕, to toggle. Sections:
 *  1) Color pickers + palette presets.
 *  2) Audio source (mp3/tone/arpeggio) + play/pause media control.
 *  3) Text-block appearance (font size, shadow size/intensity).
 *  4) Camera (FOV, free-fly toggle).
 *  5) Effect tuning (pitch inertia, floor-doppler intensity/inertia,
 *     corridor wave speed).
 * All state lives in SceneControlsContext; this component only renders
 * controls for it. Responsive: narrows to a near-full-width sheet on
 * small viewports (see the injected <style> block below).
 */
export default function DebugMenu() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    colors,
    setColor,
    applyColorPreset,
    audioSourceMode,
    setAudioSourceMode,
    toneFrequencyHz,
    setToneFrequencyHz,
    arpeggioMode,
    setArpeggioMode,
    setUploadedFile,
    isPlaying,
    setIsPlaying,
    textBlockFontSizeMultiplier,
    setTextBlockFontSizeMultiplier,
    textBlockShadowSizeMultiplier,
    setTextBlockShadowSizeMultiplier,
    textBlockShadowIntensityMultiplier,
    setTextBlockShadowIntensityMultiplier,
    freeCameraEnabled,
    setFreeCameraEnabled,
    cameraFovDeg,
    setCameraFovDeg,
    pitchInertiaMultiplier,
    setPitchInertiaMultiplier,
    floorDopplerIntensityMultiplier,
    setFloorDopplerIntensityMultiplier,
    floorDopplerInertiaMultiplier,
    setFloorDopplerInertiaMultiplier,
    corridorWaveSpeedMultiplier,
    setCorridorWaveSpeedMultiplier,
  } = useSceneControls();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Shift' || e.repeat) return;
      const target = e.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      setOpen((v) => !v);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!open) return null;

  const michroma = 'var(--font-michroma), sans-serif';

  return (
    <>
      <style>{`
        .dbgPanel { width: 300px; }
        @media (max-width: 560px) {
          .dbgPanel { width: calc(100vw - 24px) !important; right: 12px !important; left: 12px !important; max-height: 85vh !important; }
        }
      `}</style>
      <div
        ref={panelRef}
        className="dbgPanel"
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          maxHeight: '90vh',
          overflowY: 'auto',
          zIndex: 1000,
          background: 'rgba(10, 8, 20, 0.94)',
          color: '#f0f0f5',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 12,
          borderRadius: 10,
          padding: 14,
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <div style={{ fontFamily: michroma, fontWeight: 400, fontSize: 12, letterSpacing: '0.05em' }}>
            DEBUG MENU
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Cerrar menu de debug"
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#f0f0f5',
              borderRadius: 6,
              width: 22,
              height: 22,
              lineHeight: '20px',
              textAlign: 'center',
              cursor: 'pointer',
              padding: 0,
              fontFamily: michroma,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ opacity: 0.5, marginBottom: 12 }}>(Shift para cerrar tambien)</div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: michroma, fontWeight: 400, marginBottom: 6 }}>Paletas</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {COLOR_PALETTE_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyColorPreset(preset.colors)}
                style={{
                  fontSize: 11,
                  fontFamily: michroma,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#f0f0f5',
                  cursor: 'pointer',
                }}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: michroma, fontWeight: 400, marginBottom: 6 }}>Colores</div>
          {(Object.keys(DEFAULT_SCENE_COLORS) as SceneColorKey[]).map((key) => (
            <label
              key={key}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}
            >
              <span>{COLOR_LABELS[key]}</span>
              <input
                type="color"
                value={colors[key]}
                onChange={(e) => setColor(key, e.target.value)}
                style={{ width: 28, height: 20, border: 'none', background: 'none', cursor: 'pointer' }}
              />
            </label>
          ))}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: michroma, fontWeight: 400, marginBottom: 6 }}>Fuente de audio</div>
          <label style={{ display: 'block', marginBottom: 4 }}>
            <input
              type="radio"
              name="audio-source"
              checked={audioSourceMode === 'file'}
              onChange={() => setAudioSourceMode('file')}
            />{' '}
            Archivo MP3
          </label>
          {audioSourceMode === 'file' && (
            <div style={{ marginLeft: 20, marginBottom: 8 }}>
              <input type="file" accept="audio/*" onChange={(e) => setUploadedFile(e.target.files?.[0] ?? null)} />
              <div style={{ opacity: 0.6, marginTop: 4 }}>
                Sin archivo cargado: usa <code>/public/audio.mp3</code> por defecto.
              </div>
            </div>
          )}

          <label style={{ display: 'block', marginBottom: 4 }}>
            <input
              type="radio"
              name="audio-source"
              checked={audioSourceMode === 'tone'}
              onChange={() => setAudioSourceMode('tone')}
            />{' '}
            Tono puro
          </label>
          {audioSourceMode === 'tone' && (
            <div style={{ marginLeft: 20, marginBottom: 8 }}>
              <input
                type="range"
                min={AUDIO_CONFIG.toneFrequencyRangeHz.min}
                max={AUDIO_CONFIG.toneFrequencyRangeHz.max}
                value={toneFrequencyHz}
                onChange={(e) => setToneFrequencyHz(Number(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ opacity: 0.7 }}>{Math.round(toneFrequencyHz)} Hz</div>
            </div>
          )}

          <label style={{ display: 'block', marginBottom: 4 }}>
            <input
              type="radio"
              name="audio-source"
              checked={audioSourceMode === 'arpeggio'}
              onChange={() => setAudioSourceMode('arpeggio')}
            />{' '}
            Arpegio
          </label>
          {audioSourceMode === 'arpeggio' && (
            <div style={{ marginLeft: 20, marginBottom: 8 }}>
              <select
                value={arpeggioMode}
                onChange={(e) => setArpeggioMode(e.target.value as 'minor' | 'major')}
                style={{ width: '100%' }}
              >
                <option value="minor">Menor</option>
                <option value="major">Mayor</option>
              </select>
            </div>
          )}

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              width: '100%',
              marginTop: 4,
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.2)',
              background: isPlaying ? 'rgba(120,255,170,0.18)' : 'rgba(255,255,255,0.06)',
              color: '#f0f0f5',
              cursor: 'pointer',
              fontFamily: michroma,
              fontSize: 11,
              letterSpacing: '0.05em',
            }}
          >
            {isPlaying ? '⏸ PAUSAR' : '▶ REPRODUCIR'}
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: michroma, fontWeight: 400, marginBottom: 6 }}>Texto — bloques</div>
          <SliderRow
            label="Tamaño de fuente"
            value={textBlockFontSizeMultiplier}
            onChange={setTextBlockFontSizeMultiplier}
            {...DEBUG_RANGES.textBlockFontSizeMultiplier}
          />
          <SliderRow
            label="Tamaño de sombra"
            value={textBlockShadowSizeMultiplier}
            onChange={setTextBlockShadowSizeMultiplier}
            {...DEBUG_RANGES.textBlockShadowSizeMultiplier}
          />
          <SliderRow
            label="Intensidad de sombra"
            value={textBlockShadowIntensityMultiplier}
            onChange={setTextBlockShadowIntensityMultiplier}
            {...DEBUG_RANGES.textBlockShadowIntensityMultiplier}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: michroma, fontWeight: 400, marginBottom: 6 }}>Cámara</div>
          <SliderRow
            label="FOV"
            value={cameraFovDeg}
            onChange={setCameraFovDeg}
            formatValue={(v) => `${Math.round(v)}°`}
            {...DEBUG_RANGES.cameraFovDeg}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <input type="checkbox" checked={freeCameraEnabled} onChange={(e) => setFreeCameraEnabled(e.target.checked)} />
            <span>Cámara libre (WASD + Q/E + mouse)</span>
          </label>
        </div>

        <div>
          <div style={{ fontFamily: michroma, fontWeight: 400, marginBottom: 6 }}>Efectos</div>
          <SliderRow
            label="Inercia del pitch (Doppler)"
            value={pitchInertiaMultiplier}
            onChange={setPitchInertiaMultiplier}
            {...DEBUG_RANGES.pitchInertiaMultiplier}
          />
          <SliderRow
            label="Intensidad — ondas del piso"
            value={floorDopplerIntensityMultiplier}
            onChange={setFloorDopplerIntensityMultiplier}
            {...DEBUG_RANGES.floorDopplerIntensityMultiplier}
          />
          <SliderRow
            label="Inercia — ondas del piso"
            value={floorDopplerInertiaMultiplier}
            onChange={setFloorDopplerInertiaMultiplier}
            {...DEBUG_RANGES.floorDopplerInertiaMultiplier}
          />
          <SliderRow
            label="Velocidad — ondas del pasillo"
            value={corridorWaveSpeedMultiplier}
            onChange={setCorridorWaveSpeedMultiplier}
            {...DEBUG_RANGES.corridorWaveSpeedMultiplier}
          />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify**

Run `npm run build`. Confirm `DEBUG_RANGES.*` spreads (`{...DEBUG_RANGES.textBlockFontSizeMultiplier}`) correctly supply `min`/`max`/`step` to each `SliderRow` (the `DEBUG_RANGES` entries from Task 1 have exactly `{min, max, default, step}` — `SliderRow` only destructures `min`/`max`/`step` from its props, so the extra `default` field spread in is simply an unused prop, which TypeScript accepts silently for a spread — confirm this compiles without an excess-property error, since spreads bypass the object-literal excess-property check that would otherwise flag `default`).

At this point in the plan, `npm run build` should be **fully clean** — this is the last task that touches source files before Task 16 (final QA). If it isn't, something upstream was missed; go back and check every prior task's "expected pre-existing failures" note against what's still failing.

- [ ] **Step 3: Commit**

```bash
git add app/components/DebugMenu.tsx
git commit -m "feat: redesign debug menu (Michroma, responsive, close button, 9 new controls)"
```

---

## Task 16: Full QA pass — tests, build, and a complete code-level walkthrough

**Files:** none (verification only; fix genuine bugs found, don't invent scope)

- [ ] **Step 1: Run the full unit-test suite**

Run: `npm test` — expect ALL suites green: `basePath`, `sceneConfig`, `scrollTimeline`, `audioMath` (now including the new `stepPitchEnvelope` block), `finalPhase`.

- [ ] **Step 2: Verify the static export build**

Run: `npm run build` — must complete cleanly with no errors, `out/` emitted. Run `npm run lint` — must be 0 errors AND 0 warnings (the prior plan ended with a fully clean lint; this one should too).

- [ ] **Step 3: Full code-level walkthrough checklist**

No browser is available in this environment — verify each item by reading the final code (not by trusting what a prior task's report claimed). For each, confirm PASS with a file:line reference, or describe a genuine bug found (don't fix it yourself — report it precisely; the controller will dispatch a fix):

1. **Spacebar audio** — bottom prompt renders only while `!audioActivated`; first Space press (not on a form control) sets `audioSourceMode='file'`, `audioActivated=true`, `isPlaying=true`; `AudioEngine`'s `onFileSourceError` callback flips the mode to `'tone'` on a load failure; subsequent Space presses toggle `isPlaying`; `masterGain` starts at 0 and only becomes audible via `setPlaying(true)`.
2. **+10% shadows** — `TITLE_CONFIG.shadow`, all 5 `TEXT_BLOCKS[i].shadow`, and the corridor end-link's inline shadow are each 10% larger than the pre-this-plan values (2px→2.2px, 1px→1.1px).
3. **Text blocks appear earlier** — `TEXT_BLOCKS[0].startInstance === 1` (not 2), and each subsequent block is shifted by the same -1.
4. **Title auto-hide** — disappears 5 real seconds after the FIRST scroll-away from the top (not scroll-distance-based), reappears immediately when scrolled back to the top, and the 5-second timer is correctly canceled (not left running) when the user returns to the top before it fires.
5. **Debug menu — all 9 new controls present and wired**: text-block font size, text-block shadow size, text-block shadow intensity, free-camera toggle, FOV slider, media play/pause control, pitch-inertia slider, floor-doppler intensity slider, floor-doppler inertia slider, corridor wave-speed slider. Close button present. Panel and its controls use the Michroma font. A narrow-viewport media query exists for responsiveness.
6. **Pitch inertia correction** — `AudioEngine.setDopplerSpeed` now takes `(speed, dt)` and delegates to `stepPitchEnvelope`; the rise time constant is short, the fall time constant is much longer; a sharp deceleration from a peak above `dopplerUndershootTriggerSpeed` arms a ~2-second dip to `dopplerUndershootRate` before releasing back to neutral. `pitchInertiaMultiplier` scales all 3 time constants.
7. **Floor-doppler inertia correction** — `holdSeconds + releaseSeconds ≥ 5` in the shipped `FLOOR_DOPPLER_CONFIG`; the shader's `dopplerFalloff` radius was tightened (R×5 instead of R×8); `floorDopplerIntensityMultiplier`/`floorDopplerInertiaMultiplier` are wired into `animate()`.
8. **Diagonal-ray filter correction** — NO cylinder beam meshes remain anywhere in `Section1.tsx` (grep for `makeBeam`/`LIGHT_BEAMS`/`beamLowpassMesh` — all should be gone); contact is computed from the `sv = z − 0.55·x + 1` line equation; red→lowpass, amber→highpass per the user's clarification; `DEFAULT_SCENE_COLORS` no longer has `beamLowpass`/`beamHighpass` keys anywhere (grep the whole `app/` tree).
9. **Corridor rework** — `buildCorridor` is called exactly ONCE, at mount, with a fixed `new THREE.Vector3(0, CORRIDOR_CONFIG.yOffset, 0)` entrance (not `sphere.position.clone()`); crossing `finalPhaseProgress > 0` is an instant position/camera switch (no zoom/reveal code remains — grep for `applyFinalPhaseCamera`/`uHoleRadius`/`uHoleCenter`, all should be gone); the chase camera (`applyCorridorCamera`) reads the CURRENT frame's sphere position (computed after the position branch, not before); scrolling back out resets the mouse-spring to the disc center with zero velocity; free-camera mode (Task 14) correctly overrides both the disc and corridor camera branches.
10. **Cross-cutting**: every new context field from Task 4 has (a) a default value, (b) a setter used somewhere, (c) is actually READ somewhere driving real behavior — no orphaned/unused state. Every new `useRef`+sync-`useEffect` pair added across Tasks 7, 9, 10, 13, 14 follows the established pattern correctly (ref updated in a `[dep]`-effect, read only inside the `[]`-dep `animate()` closure, never the raw context value read directly from inside that closure).

- [ ] **Step 4: Report**

Summarize pass/fail for all 10 checklist items. For any genuine bug found, the controller will dispatch a targeted fix (implementer + spec review + code-quality review, same as every other task in this plan) before considering the plan complete.

---

## Self-Review

**Spec coverage** (every item from the user's MODIFICACIONES/CORRECCIONES list, mapped to a task):
- Bottom "press space" prompt + spacebar play/pause/fallback → Tasks 1, 3, 7.
- +10% shadow on all current texts → Tasks 1, 5.
- Text blocks appear earlier → Task 1.
- Title disappears 5s after scroll starts, reappears at top → Tasks 1, 6.
- Debug panel: text-block font size/shadow size/shadow intensity → Tasks 1, 4, 5, 15.
- Debug panel: free camera (WASD/QE/mouse) → Tasks 1, 4, 14, 15.
- Debug panel: media control → Tasks 4, 7, 15.
- Debug panel: FOV → Tasks 1, 4, 13, 15.
- Debug panel: close button, responsive, Michroma → Task 15.
- Debug panel: pitch-inertia-curve modifier → Tasks 1, 3, 9, 15.
- Debug panel: floor-doppler effect/inertia modifier → Tasks 1, 4, 10, 15.
- Debug panel: corridor wave-speed modifier → Tasks 1, 4, 12, 15.
- Correction — bigger/longer pitch inertia + post-deceleration grave undershoot → Tasks 1, 2, 3, 9.
- Correction — bigger/longer floor-doppler inertia + near/far contrast → Tasks 1, 10.
- Correction — filters on the ORIGINAL diagonal rays, not new beams → Task 8 (plus config changes in Task 1).
- Correction — complete corridor rework (teleport, fixed position, bidirectional) → Tasks 1, 11, 12.

**Placeholder scan:** no `TBD`/`fill in later` markers; every step has runnable code specific to this codebase's current (post-first-plan) state.

**Type consistency:** `PitchEnvelopeState`/`PitchEnvelopeConfig` (Task 2) are defined once and consumed identically in `AudioEngine` (Task 3); `TextShadowConfig`'s new numeric shape (Task 1) is consumed identically by `shadowToCss`'s new signature (Task 1) and its only two call sites (Task 5's `ScrollTextBlocks.tsx`, and the title in `Section1.tsx`, which needed no change since it already just calls `shadowToCss(TITLE_CONFIG.shadow)`); `DIAGONAL_RAYS_CONFIG.secondaryOffset` (Task 1) matches the shader's literal `sv + 2.0` (Task 8) — flagged with an explicit "keep in sync" comment since it's a duplicated constant between GLSL and TS with no way to share it directly; `CorridorHandle`'s fields (`corridor.ts`) are unchanged in shape (Task 11 only changes internal math, not the interface), so every consumer in `Section1.tsx` (Task 12) continues to compile against the same type.

