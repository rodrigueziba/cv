/**
 * ════════════════════════════════════════════════════════════════
 * CENTRAL SCENE CONFIG — every tunable value for the Doppler
 * experience lives here. Change values in this file only; the
 * components read from it and re-render/re-render-loop accordingly.
 * ════════════════════════════════════════════════════════════════
 */

/* ── Shared text-shadow shape (used by title + all 5 blocks) ─────── */
export interface TextShadowConfig {
  color: string;
  offsetX: string;
  offsetY: string;
  blur: string;
}

export function shadowToCss(s: TextShadowConfig): string {
  return `${s.offsetX} ${s.offsetY} ${s.blur} ${s.color}`;
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
  shadow: { color: 'rgba(0,0,0,0.85)', offsetX: '2px', offsetY: '2px', blur: '0px' } as TextShadowConfig,
  topPosition: '17%', // vertical placement inside the sticky viewport
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

export interface TextBlockConfig {
  id: string;
  lines: [string, string, string, string];
  startInstance: number;
  fontSizeClamp: string;
  letterSpacing: string;
  textAlign: 'left' | 'center' | 'right';
  color: string;
  shadow: TextShadowConfig;
  /** Absolute placement inside the sticky viewport. Any CSS position subset. */
  position: { top?: string; bottom?: string; left?: string; right?: string; transform?: string; maxWidth?: string };
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
    startInstance: 2,
    fontSizeClamp: 'clamp(14px, 1.6vw, 22px)',
    letterSpacing: '0.12em',
    textAlign: 'left',
    color: '#ffffff',
    shadow: { color: 'rgba(0,0,0,0.80)', offsetX: '1px', offsetY: '1px', blur: '0px' },
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
    startInstance: 5,
    fontSizeClamp: 'clamp(14px, 1.6vw, 22px)',
    letterSpacing: '0.12em',
    textAlign: 'right',
    color: '#ffffff',
    shadow: { color: 'rgba(0,0,0,0.80)', offsetX: '1px', offsetY: '1px', blur: '0px' },
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
    startInstance: 8,
    fontSizeClamp: 'clamp(14px, 1.6vw, 22px)',
    letterSpacing: '0.12em',
    textAlign: 'center',
    color: '#ffffff',
    shadow: { color: 'rgba(0,0,0,0.80)', offsetX: '1px', offsetY: '1px', blur: '0px' },
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
    startInstance: 11,
    fontSizeClamp: 'clamp(14px, 1.6vw, 22px)',
    letterSpacing: '0.12em',
    textAlign: 'left',
    color: '#ffffff',
    shadow: { color: 'rgba(0,0,0,0.80)', offsetX: '1px', offsetY: '1px', blur: '0px' },
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
    startInstance: 14,
    fontSizeClamp: 'clamp(14px, 1.6vw, 22px)',
    letterSpacing: '0.12em',
    textAlign: 'right',
    color: '#ffffff',
    shadow: { color: 'rgba(0,0,0,0.80)', offsetX: '1px', offsetY: '1px', blur: '0px' },
    position: { top: '30%', right: '8%', maxWidth: '34ch' },
  },
];

/* Last scroll instance any block occupies — used to size the scroll runway. */
export const LAST_TEXT_BLOCK_END_INSTANCE =
  TEXT_BLOCKS[TEXT_BLOCKS.length - 1].startInstance + TEXT_BLOCK_DURATION_INSTANCES;

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
  beamLowpass: '#3fd0ff',
  beamHighpass: '#ff5a3f',
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
      beamLowpass: '#7fd8ff',
      beamHighpass: '#eaf6ff',
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
      beamLowpass: '#ff9d3f',
      beamHighpass: '#ff3f3f',
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
  dopplerMaxPlaybackRate: 1.85,
  /** World-units/second of sphere speed that maps to dopplerMaxPlaybackRate. */
  dopplerSpeedForMaxRate: 5.5,
  /** Smoothing: higher = snappier, lower = smoother pitch changes. */
  dopplerSmoothing: 0.12,

  /** Progressive filter ramp when the sphere is in contact with a light beam. */
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

/* ── 7) LIGHT BEAMS ─────────────────────────────────────────────────
 * Two fixed beams on the flow-field disc. Contact radius uses the
 * same world units as the sphere's XZ position (see Section1.tsx).  */
export const LIGHT_BEAMS = {
  lowpass: { position: { x: 14, z: -10 }, radius: 3.2 },
  highpass: { position: { x: -14, z: 10 }, radius: 3.2 },
};

/* ── 8) FLOOR DOPPLER WAVE COMPRESSION ────────────────────────────
 * How strongly the flow-field's iso-contour spacing compresses
 * ahead of / expands behind the moving sphere, and how it decays
 * back to normal once the sphere slows or stops.                   */
export const FLOOR_DOPPLER_CONFIG = {
  compressionStrength: 3.2, // added to lineFreq at full intensity
  riseRate: 0.35, // per-second rise toward target intensity
  /** Effect lingers this many seconds after the sphere stops before easing out. */
  holdSeconds: 1.5,
  /** Then eases back to 0 over this many seconds. */
  releaseSeconds: 2.5,
};

/* ── 9) FINAL PHASE — camera zoom + corridor ──────────────────────
 * Begins immediately after the last text block finishes. Expressed
 * as sub-ranges of `finalPhaseProgress` (0..1).                    */
export const FINAL_PHASE_START_INSTANCE = LAST_TEXT_BLOCK_END_INSTANCE;
export const FINAL_PHASE_DURATION_INSTANCES = 10;

export const FINAL_PHASE_SUBRANGES = {
  zoomToSphere: { start: 0.0, end: 0.18 },
  floorOpens: { start: 0.18, end: 0.32 },
  corridorTravel: { start: 0.32, end: 1.0 },
};

export const CORRIDOR_CONFIG = {
  lengthMultiplier: 20, // × sphere diameter
  crossSectionMultiplier: 4, // × sphere diameter (walls/ceiling/floor size)
  patternedPortion: 0.2, // first 20% of length keeps the wave pattern
  patternColorA: '#3a2a6b', // corridor's own pattern colors (independent of the disc's debug-menu colors)
  patternColorB: '#6b2a55',
  solidColor: '#0a0a14', // floor/ceiling/side-walls color past the patterned portion
  // End-wall red→blue colors are NOT duplicated here — they live in
  // DEFAULT_SCENE_COLORS.corridorWallStart/End above, the single
  // source of truth the debug menu's color pickers also read/write.
  finalLinkText: 'IR A LA SIMULACION',
  finalLinkUrl: 'https://efectodoppler.vercel.app',
  reachedThreshold: 0.97, // corridorTravelT at/above which the sphere is considered "arrived" at the end wall
};

/* ── 10) SHARED FONT ────────────────────────────────────────────── */
export const MICHROMA_CSS_VAR = '--font-michroma';
