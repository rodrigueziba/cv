/**
 * ════════════════════════════════════════════════════════════════
 * CENTRAL SCENE CONFIG — every tunable value for the Doppler
 * experience lives here. Change values in this file only; the
 * components read from it and re-render/re-render-loop accordingly.
 * ════════════════════════════════════════════════════════════════
 */

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

/* ── 1) TITLE ──────────────────────────────────────────────────────
 * "EFFECTO DOPPLER" — plain Michroma text, white with a short black
 * shadow for contrast. Edit ANY of these to restyle the title.       */
export const TITLE_CONFIG = {
  text: 'EFFECTO DOPPLER',
  fontSizeClamp: 'clamp(24px, 4.2vw, 64px)', // min, preferred, max
  letterSpacing: '0.28em',
  textAlign: 'center' as const,
  color: '#ffffff',
  shadow: { colorRgb: '0,0,0', alpha: 0.85, offsetXPx: 2.2, offsetYPx: 2.2, blurPx: 0 } as TextShadowConfig, // was 2px → 2.2px (+10%)
  topPosition: '17%', // vertical placement inside the sticky viewport
};

/* ── SPACE-TO-ACTIVATE-AUDIO PROMPT ────────────────────────────────
 * Bottom-of-viewport hint, styled like the existing top "scroll ↓"
 * indicator. Visible until the user presses Space once; then hidden
 * for the rest of the session (see Section1.tsx). */
export const SPACE_PROMPT_CONFIG = {
  text: 'APRETÁ LA BARRA ESPACIADORA PARA ACTIVAR EL SONIDO',
  bottomPosition: '5vh',
};

/* ── 2) SCROLL TIMELINE UNITS ──────────────────────────────────────
 * 1 "instancia de scroll" = 1 window height (vh) of scrolling,
 * measured from the top of the Section1 container. All timings
 * below (text blocks, final phase) are expressed in these units so
 * they stay meaningful even if the page's total height changes.    */
export const SCROLL_INSTANCE_PX = () => (typeof window === 'undefined' ? 800 : window.innerHeight);

/* ── 3) FIVE SCROLL TEXT BLOCKS ─────────────────────────────────────
 * Each block: 4 lines, Michroma font, independent position/size/
 * spacing/alignment/shadow, and an independent `startInstance`
 * (which scroll-instance it begins fading in at). Duration is fixed
 * per spec: 1 instance fade-in, 1 instance held, 1 instance fade-out. */
export const TEXT_BLOCK_DURATION_INSTANCES = 3;

export type TextBlockAlignment = 'left' | 'center' | 'right' | 'justify';

export const DEFAULT_TEXT_BLOCK_ALIGNMENT: TextBlockAlignment = 'center';

export interface TextBlockConfig {
  id: string;
  lines: [string, string, string, string];
  startInstance: number;
  fontSizeClamp: string;
  letterSpacing: string;
  color: string;
  shadow: TextShadowConfig;
  /** Absolute placement inside the sticky viewport. `width` (not just
   * max-width) is required for 'justify' alignment to have any visible
   * effect — see ScrollTextBlocks.tsx. */
  position: { top?: string; bottom?: string; left?: string; right?: string; transform?: string; width?: string };
}

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
    color: '#ffffff',
    shadow: { colorRgb: '0,0,0', alpha: 0.80, offsetXPx: 1.1, offsetYPx: 1.1, blurPx: 0 },
    position: { top: '30%', left: '8%', width: '34ch' },
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
    color: '#ffffff',
    shadow: { colorRgb: '0,0,0', alpha: 0.80, offsetXPx: 1.1, offsetYPx: 1.1, blurPx: 0 },
    position: { top: '30%', right: '8%', width: '34ch' },
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
    color: '#ffffff',
    shadow: { colorRgb: '0,0,0', alpha: 0.80, offsetXPx: 1.1, offsetYPx: 1.1, blurPx: 0 },
    position: { top: '68%', left: '50%', transform: 'translateX(-50%)', width: '38ch' },
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
    color: '#ffffff',
    shadow: { colorRgb: '0,0,0', alpha: 0.80, offsetXPx: 1.1, offsetYPx: 1.1, blurPx: 0 },
    position: { top: '30%', left: '8%', width: '34ch' },
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
    color: '#ffffff',
    shadow: { colorRgb: '0,0,0', alpha: 0.80, offsetXPx: 1.1, offsetYPx: 1.1, blurPx: 0 },
    position: { top: '30%', right: '8%', width: '34ch' },
  },
];

/* Last scroll instance any block occupies — used to size the scroll runway. */
export const LAST_TEXT_BLOCK_END_INSTANCE =
  TEXT_BLOCKS[TEXT_BLOCKS.length - 1].startInstance + TEXT_BLOCK_DURATION_INSTANCES;

/* ── TITLE AUTO-HIDE ────────────────────────────────────────────────
 * The hero title starts hiding the moment the scroll position reaches
 * this instance — deliberately the SAME value as TEXT_BLOCKS[0]'s
 * startInstance (not just a similar one) so the title's fade-out and
 * the first text block's fade-in always begin at the exact same
 * scroll position, and therefore the same moment in time regardless
 * of how fast the user scrolls. Reappears (instantly) only once
 * scrolled back to the very top of the page. */
export const TITLE_HIDE_TRIGGER_INSTANCE = TEXT_BLOCKS[0].startInstance;

/* ── 4) ORIGINAL CAMERA CHOREOGRAPHY WINDOW ───────────────────────
 * The pre-existing 4-keyframe camera dance (side → zenith → zoom →
 * rotated) now plays out over this many scroll instances instead of
 * the old 0..1 normalized progress over the whole page.             */
export const INTRO_CAMERA_INSTANCES = 4;

/* Progress (0..1) threshold, in the OLD normalized camera scale,
 * above which the camera is considered "far from the scenario"
 * (zenith and beyond). Floor-doppler waves only run at/after this. */
export const FLOOR_DOPPLER_MIN_CAMERA_PROGRESS = 0.25;

/* ── 5) DEBUG-MENU COLORS ──────────────────────────────────────────
 * Every color the debug menu can repaint. Keys here MUST match the
 * keys read by Section1's shader-uniform sync (Task 9).             */
export const DEFAULT_SCENE_COLORS = {
  flowBackground: '#040012',
  flowLineLavender: '#9466eb',
  flowLinePink: '#eb5cc0',
  flowLineAmber: '#e6992e',
  flowNearSphereGlow: '#fa2e99',
  sphereChromeHighlight: '#ffffff',
  starColor: '#ffffff',
  corridorWallStart: '#ff0000',
  corridorWallEnd: '#0033ff',
};
export type SceneColorKey = keyof typeof DEFAULT_SCENE_COLORS;

/* A handful of curated preset palettes offered in the debug menu,
 * on top of the free-form native color picker.                     */
export const COLOR_PALETTE_PRESETS: { name: string; colors: Partial<Record<SceneColorKey, string>> }[] = [
  {
    name: 'Currents (default)',
    colors: { ...DEFAULT_SCENE_COLORS },
  },
  {
    name: 'Monochrome ice',
    colors: {
      flowBackground: '#020208',
      flowLineLavender: '#8fd8ff',
      flowLinePink: '#c9ecff',
      flowLineAmber: '#eaf6ff',
      flowNearSphereGlow: '#ffffff',
    },
  },
  {
    name: 'Sunset',
    colors: {
      flowBackground: '#180404',
      flowLineLavender: '#ff7a3f',
      flowLinePink: '#ff3f6b',
      flowLineAmber: '#ffd23f',
      flowNearSphereGlow: '#ff2e5c',
    },
  },
];

/* ── 6) AUDIO ENGINE ───────────────────────────────────────────────
 * Doppler pitch mapping, default source, and arpeggio chord tables. */
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
    minor: [220.0, 261.63, 329.63, 392.0], // A minor 7th-ish
    major: [220.0, 277.18, 329.63, 415.3], // A major-ish
  },
  arpeggioNoteMs: 180,
};

/* ── DIAGONAL RAY CONTACT (lowpass/highpass) ──────────────────────
 * The two diagonal streak rays baked into FLOW_FRAG (see Section1.tsx)
 * are defined by the world-space line `sv = z − 0.55·x + 1` (red,
 * primary) and its secondary line at `sv = −secondaryOffset` (amber).
 * `contactWidth` is the |sv| threshold within which the sphere is
 * considered "touching" a ray, for the progressive audio filters:
 * RED → lowpass, AMBER → highpass (per the user's clarification).     */
export const DIAGONAL_RAYS_CONFIG = {
  // `sv` is the raw plane-equation value (z - 0.55x + 1), NOT a normalized
  // Euclidean distance from the line — true perpendicular distance would be
  // |sv| / sqrt(1 + 0.55^2) ≈ |sv| / 1.141. contactWidth is tuned by eye
  // against the shader's visual glow width (sCore/sGlow falloff terms in
  // FLOW_FRAG), not derived analytically.
  contactWidth: 1.2,
  secondaryOffset: 2.0, // MUST match FLOW_FRAG's `sv + 2.0` — keep in sync if that shader term ever changes
};

/* ── 8) FLOOR DOPPLER WAVE COMPRESSION ────────────────────────────
 * How strongly the flow-field's iso-contour spacing compresses
 * ahead of / expands behind the moving sphere, and how it decays
 * back to normal once the sphere slows or stops.                   */
export const FLOOR_DOPPLER_CONFIG = {
  compressionStrength: 5.0, // was 3.2 — bigger, more evident line compression/spacing
  riseRate: 0.35,
  /** Effect lingers this many seconds after the sphere stops before easing out. */
  holdSeconds: 2.0, // was 1.5
  /** Then eases back to 0 over this many seconds. holdSeconds + releaseSeconds
   * must total at least 5s per the "dure al menos 5 segundos" correction. */
  releaseSeconds: 3.5, // was 2.5 — 2.0 + 3.5 = 5.5s total
};

/* ── 9) FINAL PHASE — teleport to corridor ─────────────────────────
 * Begins immediately after the last text block finishes. Continued
 * scroll teleports the sphere+camera to a corridor built ONCE at a
 * fixed world position far below the main disc; further scroll moves
 * the sphere down the corridor with a chase-camera — fully reversible.
 * Expressed as sub-ranges of `finalPhaseProgress` (0..1).            */
export const FINAL_PHASE_START_INSTANCE = LAST_TEXT_BLOCK_END_INSTANCE; // now 13 + 3 = 16
export const FINAL_PHASE_DURATION_INSTANCES = 8; // just corridor travel now — no separate zoom/reveal subphases

export const FINAL_PHASE_SUBRANGES = {
  corridorTravel: { start: 0.0, end: 1.0 },
};

export const CORRIDOR_CONFIG = {
  lengthMultiplier: 20, // × sphere diameter
  crossSectionMultiplier: 4, // × sphere diameter (walls/ceiling/floor size)
  reactivePortion: 0.5, // first 50% of length reacts to the sphere; the rest is calm/static
  patternColorA: '#3a2a6b', // corridor's own pattern colors (independent of the disc's debug-menu colors)
  patternColorB: '#6b2a55',
  // End-wall red→blue colors are NOT duplicated here — they live in
  // DEFAULT_SCENE_COLORS.corridorWallStart/End above, the single
  // source of truth the debug menu's color pickers also read/write.
  finalLinkText: 'IR A LA SIMULACION',
  finalLinkUrl: 'https://efectodoppler.vercel.app',
  reachedThreshold: 0.97, // corridorTravelT at/above which the sphere is considered "arrived" at the end wall
  /** World Y the corridor sits at — far enough below the main disc
   * (which lives around y=0) that teleporting there reads as a clean
   * cut to a separate space, never visible/overlapping during the
   * main phase. */
  yOffset: -80,
  /** Chase-camera distance behind the sphere / height above it,
   * expressed as a multiplier of the sphere's diameter. */
  chaseDistanceMultiplier: 5, // was 4 — a bit further back, gentler angle
  chaseHeightMultiplier: 1.3, // was 2 — less steep downward pitch onto the sphere
};

/* ── FREE CAMERA (debug menu toggle) ───────────────────────────────
 * WASD + Q/E fly-camera, mouse-look. See Section1.tsx for the
 * movement/look implementation.                                     */
export const FREE_CAMERA_CONFIG = {
  moveSpeed: 12, // world units/second
  lookSensitivity: 1.6, // radians of yaw/pitch swing across the full -1..1 mouseRef range
  maxPitchRad: Math.PI / 2 - 0.05, // clamp just short of straight up/down to avoid gimbal flip
};

/* ── DEBUG-MENU SLIDER RANGES ───────────────────────────────────────
 * min/max/default for every new debug-adjustable multiplier. Most
 * entries default to the multiplier's neutral value (1.0 = matches the
 * static config above exactly); sliders let the user scale up/down
 * from there live. The 3 textBlock* entries are the exception — their
 * defaults were deliberately tuned to non-neutral values (1.30/1.70/
 * 2.0) rather than left at 1.0. See SceneControlsContext.tsx for the
 * React state these drive, and DebugMenu.tsx for the UI.            */
export const DEBUG_RANGES = {
  textBlockFontSizeMultiplier: { min: 0.5, max: 2.0, default: 1.30, step: 0.05 },
  textBlockShadowSizeMultiplier: { min: 0, max: 3, default: 1.70, step: 0.1 },
  textBlockShadowIntensityMultiplier: { min: 0, max: 2, default: 2.0, step: 0.05 },
  cameraFovDeg: { min: 30, max: 120, default: 65, step: 1 },
  pitchInertiaMultiplier: { min: 0.2, max: 3, default: 1.0, step: 0.05 },
  floorDopplerIntensityMultiplier: { min: 0, max: 3, default: 1.0, step: 0.05 },
  floorDopplerInertiaMultiplier: { min: 0.3, max: 3, default: 1.0, step: 0.05 },
  corridorWaveSpeedMultiplier: { min: 0, max: 4, default: 1.0, step: 0.05 },
};

/* ── 10) SHARED FONT ────────────────────────────────────────────── */
export const MICHROMA_CSS_VAR = '--font-michroma';
