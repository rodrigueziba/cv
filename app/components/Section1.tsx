'use client';

/**
 * Section 1 — "Currents"
 * Inspired by Tame Impala's Currents album artwork.
 * A river of flowing liquid-metal streams reacts to mouse movement.
 * The central chrome sphere transitions to a glowing translucent core
 * as the user scrolls through four distinct camera phases.
 *
 * Camera phases (scroll 0 → 1):
 *   0 – 25%  │ Side view   — album-cover angle, sphere in lower half
 *  25 – 55%  │ Zenith      — bird's-eye, flow streams left → right
 *  55 – 80%  │ Zoom in     — sphere fills viewport, material transitions
 *  80 – 100% │ Rotated 90° — flow appears to rise bottom → top
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { HASH_NOISE_FBM_GLSL, HSV2RGB_GLSL } from '@/app/lib/shaders/common';
import {
  TITLE_CONFIG,
  shadowToCss,
  TEXT_BLOCKS,
  INTRO_CAMERA_INSTANCES,
  FINAL_PHASE_START_INSTANCE,
  FINAL_PHASE_DURATION_INSTANCES,
  FINAL_PHASE_SUBRANGES,
  DEFAULT_SCENE_COLORS,
  DIAGONAL_RAYS_CONFIG,
  AUDIO_CONFIG,
  FLOOR_DOPPLER_CONFIG,
  FLOOR_DOPPLER_MIN_CAMERA_PROGRESS,
  CORRIDOR_CONFIG,
  SPACE_PROMPT_CONFIG,
  TITLE_HIDE_TRIGGER_INSTANCE,
  FREE_CAMERA_CONFIG,
  CORRIDOR_TEXT_BLOCKS,
  CORRIDOR_TEXT_BLOCK_SEGMENTS,
  TEXT_BLOCK_DURATION_INSTANCES,
  MOBILE_CONFIG,
} from '@/app/lib/sceneConfig';
import ScrollTextBlocks from '@/app/components/ScrollTextBlocks';
import {
  computeBlockOpacity,
  computeScrollInstance,
  corridorBlockStartInstance,
  corridorInstanceFromTravel,
} from '@/app/lib/scrollTimeline';
import { useSceneControls, type AudioSourceMode, type ArpeggioMode } from '@/app/lib/SceneControlsContext';
import { useIsMobile } from '@/app/lib/mobileDetect';
import { remapDeviceTiltToScreenAxes } from '@/app/lib/deviceTilt';
import MobileGate from '@/app/components/MobileGate';
import { requestMotionPermissionIfNeeded } from '@/app/lib/motionPermission';
import { AudioEngine } from '@/app/lib/audioEngine';
import { withBasePath } from '@/app/lib/basePath';
import { stepContactAmount, stepFloorDopplerState, type DopplerFloorState } from '@/app/lib/audioMath';
import { remapSubrange, corridorTravelDistance } from '@/app/lib/finalPhase';
import { buildCorridor, type CorridorHandle } from '@/app/lib/corridor';

/* ═══════════════════════════════════════════════════════════════
   SHADERS
═══════════════════════════════════════════════════════════════ */

/* ── Star field shaders ────────────────────────────────────────────── */
const STAR_VERT = /* glsl */`
  attribute float aPhase;
  attribute float aSize;
  varying   vec3  vColor;
  uniform   float uTime;
  uniform   vec3  uStarTint;
  ${HSV2RGB_GLSL}
  void main() {
    /* Twinkling: each star has a random phase and frequency */
    float twinkle = 0.30 + 0.70 * abs(sin(uTime * (0.5 + aPhase) + aPhase * 6.28));
    /* Slowly drifting hue — mostly white (low saturation), occasional color */
    float hue = fract(aPhase * 4.13 + uTime * 0.025);
    float sat = 0.18 + 0.40 * abs(sin(aPhase * 7.7));
    vColor      = hsv2rgb(vec3(hue, sat, twinkle)) * uStarTint;
    gl_PointSize = aSize * (0.5 + twinkle * 0.5);
    gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const STAR_FRAG = /* glsl */`
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = 1.0 - smoothstep(0.25, 1.0, d);
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

/** Flow-field plane — world-position-based so tile density is camera-invariant */
const FLOW_VERT = /* glsl */`
  varying vec3 vWorldPos;
  void main() {
    vWorldPos   = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FLOW_FRAG = /* glsl */`
  precision highp float;

  /*
   * POTENTIAL FLOW AROUND A CYLINDER (2D cross-section of sphere)
   * ─────────────────────────────────────────────────────────────
   * Stream function:  ψ = U_cross · (1 − R²/r²)
   *   where U_cross = (U × delta) = U.x·Δz − U.z·Δx  (perpendicular component)
   *   U   = base flow direction (uniform far-field)
   *   R   = cylinder/sphere radius for flow deflection
   *   r   = distance from sphere centre
   *
   * Iso-contours of ψ = const are the streamlines.
   * Far from sphere   → parallel lines (ψ ≈ U_cross, uniform flow)
   * Near sphere       → lines smoothly curve around it
   * This is the exact physics behind the Currents album cover look.
   */

  uniform float uTime;
  uniform vec2  uSphereXZ;
  uniform float uSphereR;    // flow deflection radius (≈ visual sphere radius)
  uniform float uProgress;
  uniform vec3  uBgColor;
  uniform vec3  uLineLavender;
  uniform vec3  uLinePink;
  uniform vec3  uLineAmber;
  uniform vec3  uNearGlow;
  uniform vec2  uSphereVel;
  uniform float uDopplerCompress;

  varying vec3 vWorldPos;

  /* ── Noise helpers ──────────────────────────────────────────────── */
  ${HASH_NOISE_FBM_GLSL}
  ${HSV2RGB_GLSL}

  void main() {
    vec2  wxz = vWorldPos.xz;
    float t   = uTime * 0.042;

    /* ── Potential-flow stream function ─────────────────────────────── */
    vec2  delta  = wxz - uSphereXZ;
    float r2     = dot(delta, delta) + 0.0001;
    float r      = sqrt(r2);

    /* Base flow direction — diagonal upper-left→lower-right like the album */
    vec2  U      = normalize(vec2(1.0, 0.32));

    /* U_cross: component of U perpendicular to the radial direction          */
    /* = |U|·sin(angle between U and delta) = U.x·Δz − U.z·Δx (2D cross)    */
    float Ucross = U.x * delta.y - U.y * delta.x;

    float R      = uSphereR;                            // deflection radius
    float psi    = Ucross * (1.0 - (R * R) / r2);      // stream function ψ

    /* ── Organic FBM warp ────────────────────────────────────────────── */
    /* Attenuate near sphere so wrapping stays clean and physics-like */
    float farBlend = smoothstep(0.0, R * 5.0, r);       // 0=near sphere, 1=far
    float warp1  = fbm(wxz * 0.065 + vec2(t, t * 0.55)) - 0.5;
    float warp2  = fbm(wxz * 0.105 - vec2(t * 0.7, 0.3)) - 0.5;
    float warp   = (warp1 * 0.80 + warp2 * 0.38) * farBlend;

    /* Phase 3: rainbow turbulence — full warp, ignore near-sphere clean zone */
    float rainbowWarp = (fbm(wxz * 0.17 + vec2(t * 1.5, t * 0.8)) - 0.5) * 1.8;
    warp = mix(warp, rainbowWarp, smoothstep(0.58, 0.92, uProgress));

    psi += warp;

    /* ── Iso-contour lines ───────────────────────────────────────────── */
    /* Doppler wave compression: lines compress ahead of the sphere's
     * motion, space out behind it. uDopplerCompress (JS-driven, decays
     * over time) scales the effect. */
    float velLen   = length(uSphereVel);
    vec2  velDir   = velLen > 0.0001 ? uSphereVel / velLen : vec2(1.0, 0.0);
    vec2  towardFrag = length(delta) > 0.0001 ? normalize(delta) : vec2(1.0, 0.0);
    float along    = dot(towardFrag, velDir); // +1 ahead of motion, -1 behind
    float dopplerFalloff = 1.0 - smoothstep(0.0, R * 5.0, r); // was R*8.0 — starker near/far contrast
    float lineFreq = 7.0 + along * uDopplerCompress * dopplerFalloff;
    float lw       = 0.095;                             /* thin lines */
    float drift    = t * 0.18;                          /* slow drift */
    float lp       = fract(psi * lineFreq + drift);
    float line     = smoothstep(0.0, lw, lp) * smoothstep(2.0*lw, lw, lp);
    line           = pow(line, 0.52);

    /* ── Colour palette ──────────────────────────────────────────────── */
    /* Album: near-black deep purple bg, bright lavender/pink lines       */
    vec3 bg = uBgColor;                                 /* near-black purple */

    /* Horizontal gradient: lavender → pink → amber across world X */
    float cx     = clamp((wxz.x + 25.0) / 50.0, 0.0, 1.0);
    vec3  cLav   = uLineLavender;                       /* deep lavender */
    vec3  cPink  = uLinePink;                            /* hot pink */
    vec3  cAmber = uLineAmber;                           /* warm amber */
    vec3  lineCol = (cx < 0.5)
                    ? mix(cLav,  cPink,  cx * 2.0)
                    : mix(cPink, cAmber, (cx - 0.5) * 2.0);

    /* Near sphere: vivid hot-pink (like the album's sphere halo) */
    float nearSph = 1.0 - smoothstep(0.0, R * 2.5, r);
    lineCol       = mix(lineCol, uNearGlow, nearSph * 0.72);

    /* Phase 3: rainbow */
    vec3 rainbow = hsv2rgb(vec3(fract(cx * 1.7 + t * 0.55 + warp1 * 0.5), 0.92, 1.0));
    lineCol      = mix(lineCol, rainbow, smoothstep(0.60, 0.94, uProgress));

    /* ── Compose: dark bg + bright thin lines ───────────────────────── */
    vec3 color = mix(bg, lineCol * 1.08, line);

    /* ── Red diagonal streak ─────────────────────────────────────────── */
    /* World-space line: Z = 0.55·X − 1 (upper-left → lower-right)       */
    // KEEP IN SYNC: Section1.tsx's animate() contact-detection code and
    // DIAGONAL_RAYS_CONFIG mirror this exact formula for the audio filters.
    float sv    = vWorldPos.z - 0.55 * vWorldPos.x + 1.0;
    float sCore = exp(-abs(sv) * 4.0);                 /* sharp bright core */
    float sGlow = exp(-abs(sv) * 0.55);                /* wide soft glow    */
    float pulse = fract(vWorldPos.x * 0.055 - uTime * 0.14);
    float pMask = smoothstep(0.0,0.4,pulse)*smoothstep(1.0,0.6,pulse);

    /* Phase 3: streak hue cycles through saturated palette */
    float streakPhase = smoothstep(0.72, 1.0, uProgress);
    /* Two slowly drifting hues — one per line */
    float hue1 = fract(uTime * 0.040 + 0.00);  /* main streak */
    float hue2 = fract(uTime * 0.055 + 0.42);  /* secondary streak */
    vec3  sRed1 = mix(vec3(0.96, 0.04, 0.10), hsv2rgb(vec3(hue1, 0.95, 1.0)), streakPhase);
    vec3  sRed2 = mix(vec3(0.95, 0.46, 0.04), hsv2rgb(vec3(hue2, 0.95, 1.0)), streakPhase);

    vec3  sCol  = sRed1 * (sCore * 1.80 + sGlow * 0.10 * (1.0 + pMask * 0.5));
    /* Secondary amber line shifts with its own hue */
    // KEEP IN SYNC: DIAGONAL_RAYS_CONFIG.secondaryOffset must match this "+ 2.0".
    sCol       += sRed2 * exp(-abs(sv + 2.0) * 2.2) * 0.55;
    /* Attenuate at sphere */
    sCol       *= (1.0 - nearSph * 0.60);
    color      += sCol;

    /* ── Vignette ───────────────────────────────────────────────────── */
    float vig = 1.0 - smoothstep(9.0, 30.0, length(wxz));
    color    *= 0.10 + vig * 0.96;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/* ── Sphere: chrome → translucent glowing core ─────────────────────── */
const SPH_VERT = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;
  void main() {
    vNormal   = normalize(normalMatrix * normal);
    vec4 mv   = modelViewMatrix * vec4(position, 1.0);
    vViewDir  = normalize(-mv.xyz);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const SPH_FRAG = /* glsl */`
  precision highp float;

  uniform float uProgress;
  uniform float uTime;
  uniform vec3  uChromeHighlight;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  ${HSV2RGB_GLSL}

  void main() {
    vec3  N   = normalize(vNormal);
    vec3  V   = normalize(vViewDir);
    float ndv = max(0.0, dot(N, V));

    /* ── Chrome / metallic ────────────────────────────────────────── */
    float fresnel  = pow(1.0 - ndv, 2.0);
    /* At progress=0: very dark env (near-black purple) → chrome pops out  */
    vec3  envDark  = vec3(0.02, 0.01, 0.06);     /* near-black env */
    vec3  envLight = vec3(0.92, 0.94, 1.00);      /* bright chrome white */
    vec3  metalCol = mix(envDark, envLight, fresnel * 0.80 + ndv * 0.22);
    /* Primary key-light — tight sharp specular */
    vec3  L1   = normalize(vec3(1.4, 2.5, 1.8));
    float sp1  = pow(max(0.0, dot(reflect(-V, N), L1)), 160.0) * 1.80;
    /* Secondary fill — lavender */
    vec3  L2   = normalize(vec3(-0.8, 0.5, -0.5));
    float sp2  = pow(max(0.0, dot(reflect(-V, N), L2)), 28.0) * 0.45;
    /* Third light from below — warm amber bounce */
    vec3  L3   = normalize(vec3(0.0, -1.0, 0.5));
    float sp3  = pow(max(0.0, dot(reflect(-V, N), L3)), 14.0) * 0.22;
    vec3  metal = metalCol
                + uChromeHighlight * sp1
                + vec3(0.55, 0.38, 0.88) * sp2
                + vec3(0.90, 0.52, 0.10) * sp3;

    /* ── Glowing translucent core ─────────────────────────────────── */
    /* Hue cycles slowly; different on each axis for movement feel  */
    float hue   = fract(uTime * 0.07 + vWorldPos.y * 0.09 + sin(uTime*0.11)*0.15);
    vec3  coreC = hsv2rgb(vec3(hue, 0.88, 1.0));
    float inner = pow(1.0 - ndv, 0.55);  // bright in centre
    float rim   = pow(1.0 - ndv, 4.2);   // rim glow at edge
    vec3  glow  = coreC * (0.35 + inner * 0.80) + rim * 0.85;

    /* ── Blend metal → glow ───────────────────────────────────────── */
    float tp   = smoothstep(0.28, 0.94, uProgress);
    vec3  col  = mix(metal, glow, tp);
    float alph = mix(1.0, 0.28 + rim * 0.50 + inner * 0.28, tp);

    gl_FragColor = vec4(col, alph);
  }
`;

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════════════ */

/** Sentinel `currentTrackIndex` value that selects AUDIO_CONFIG.corridorOverridePath
 * instead of a playlist entry — used only by the corridor's 50%-crossing audio
 * override (see the corridor branch of animate() and resolveFileSourceOpts below),
 * never set by the UI. */
const CORRIDOR_AUDIO_OVERRIDE_TRACK_INDEX = -1;

const FINGERPRINT_SVG_PATHS = [
  'M20,82 C20,42 30,16 50,16 C70,16 80,42 80,82',
  'M28,82 C28,47 36,26 50,26 C64,26 72,47 72,82',
  'M36,82 C36,52 42,36 50,36 C58,36 64,52 64,82',
  'M44,82 C44,57 47,46 50,46 C53,46 56,57 56,82',
  'M50,82 L50,62',
];

export default function Section1() {
  const {
    colors,
    audioSourceMode,
    toneFrequencyHz,
    setToneFrequencyHz,
    arpeggioMode,
    setArpeggioMode,
    currentTrackIndex,
    setCurrentTrackIndex,
    uploadedFileUrl,
    audioActivated,
    setAudioSourceMode,
    setAudioActivated,
    isPlaying,
    setIsPlaying,
    pitchInertiaMultiplier,
    floorDopplerIntensityMultiplier,
    floorDopplerInertiaMultiplier,
    corridorWaveSpeedMultiplier,
    cameraFovDeg,
    freeCameraEnabled,
    textBlockFontSizeMultiplier,
    textBlockShadowSizeMultiplier,
    textBlockShadowIntensityMultiplier,
    debugMenuOpen,
    setDebugMenuOpen,
  } = useSceneControls();

  // See useIsMobile's doc comment (app/lib/mobileDetect.ts) — avoids a
  // hydration mismatch that a lazy `useState(() => isMobileDevice())`
  // initializer would cause (server: false, client: actual UA result).
  const isMobile = useIsMobile();
  // Mirrors `isMobile` for reads inside the mount effect's []-dep closure
  // (animate()'s steering code, and the deviceorientation/mousemove/touchmove
  // handlers below). A direct closure read of `isMobile` there would be
  // permanently stuck at false: useSyncExternalStore's hydration-safety
  // mechanism renders once with getServerSnapshot() (false) to match SSR,
  // then corrects to the real client value via an internal re-render — but
  // that correction happens in a NEW render pass, after the mount effect's
  // `[]`-dep closure has already been created (and, being `[]`-dep, is never
  // recreated). Without this mirror, mobile devices would permanently read
  // isMobile=false inside the mount effect, silently falling back to
  // desktop-style mouse/touch steering. Same stale-closure concern
  // colorsRef/audioSourceModeRef above exist to avoid.
  const isMobileRef = useRef(isMobile);
  useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);
  // Doesn't depend on isMobile — the JSX gate below only renders the gate
  // when `isMobile && mobileGateOpen`, so defaulting this to true (stable
  // across server/client, unlike isMobile itself) is safe and needs no
  // mount-effect sync.
  const [mobileGateOpen, setMobileGateOpen] = useState(true);
  const sphereButtonElRef = useRef<HTMLButtonElement>(null);

  const [titleVisible, setTitleVisible] = useState(true);
  // Mirrors `titleVisible` for reads inside onScroll — that function lives in
  // the mount effect's once-only ([]) closure, so a direct read of the state
  // variable there would be permanently stuck at its mount-time value instead
  // of the current one (same stale-closure concern colorsRef/audioSourceModeRef
  // above exist to avoid). Kept in sync at every setTitleVisible call site.
  const titleVisibleRef = useRef(true);

  const containerRef  = useRef<HTMLDivElement>(null);
  const mountRef      = useRef<HTMLDivElement>(null);
  const indicatorRef  = useRef<HTMLDivElement>(null);
  const indicatorClickRevealUntilRef = useRef(0); // clock.getElapsedTime() timestamp, 0 = no active reveal
  const titleRef      = useRef<HTMLDivElement>(null);
  const spacePromptRef = useRef<HTMLDivElement>(null);
  const scrollRef     = useRef(0);
  const mouseRef      = useRef({ x: 0, y: 0 });
  const deviceTiltRef = useRef({ x: 0, y: 0 });
  const sphereControlHeldRef = useRef(false);
  const textBlockRefs = useRef<HTMLDivElement[]>([]);
  const corridorTextRefs = useRef<HTMLDivElement[]>([]);
  // Locked wrap width (px) per corridor text block, set the first frame the
  // block becomes visible and reused for the rest of its visible lifetime —
  // see the insideCorridorPhase loop below for why.
  const corridorTextMaxWidthRef = useRef<(number | null)[]>([null, null, null, null]);
  const scrollInstanceRef = useRef(0); // raw scroll timeline position, in "instances"
  const audioEngineRef = useRef<AudioEngine | null>(null);
  // Lets the uploadedFileUrl effect below check the CURRENT mode without
  // depending on it (which would rebuild the source graph on every mode
  // switch in addition to the dedicated audioSourceMode effect).
  const audioSourceModeRef = useRef(audioSourceMode);
  useEffect(() => {
    audioSourceModeRef.current = audioSourceMode;
  }, [audioSourceMode]);

  // Read by a later task's rAF-loop code (corridor construction) that needs the
  // CURRENT colors without the stale-closure problem `animate()`'s single
  // mount-time closure would otherwise have. Not consumed within this task.
  const colorsRef = useRef(colors);
  useEffect(() => {
    colorsRef.current = colors;
  }, [colors]);

  // Mirrors `audioActivated` for reads inside animate()'s []-dep closure
  // (corridor-exit visibility restore needs the CURRENT value, not the
  // mount-time one — same stale-closure concern colorsRef exists to avoid).
  const audioActivatedRef = useRef(audioActivated);
  useEffect(() => {
    audioActivatedRef.current = audioActivated;
  }, [audioActivated]);

  const flowUniformsRef = useRef<Record<string, THREE.IUniform> | null>(null);
  const sphUniformsRef  = useRef<Record<string, THREE.IUniform> | null>(null);
  const starUniformsRef = useRef<Record<string, THREE.IUniform> | null>(null);

  // Progressive [0,1] contact amount for each diagonal ray's audio filter,
  // ramped/released every frame in animate() (Task 14).
  const lowpassContactRef  = useRef(0);
  const highpassContactRef = useRef(0);

  // Floor doppler wave-compression state (Task 15) — decaying intensity
  // driven by sphere speed, stepped every frame in animate().
  const floorDopplerStateRef = useRef<DopplerFloorState>({ intensity: 0, timeSinceActive: 0, releaseStartIntensity: 0 });
  // Last non-negligible sphere velocity direction — held steady while the
  // sphere is momentarily still so the compression pattern's orientation
  // doesn't snap to an arbitrary axis while uDopplerCompress is still decaying.
  const lastSphereVelRef = useRef(new THREE.Vector2(1, 0));

  // Debug multipliers for the floor-doppler effect — read inside animate()'s
  // []-dep closure, so mirrored into refs following the colorsRef pattern.
  const floorDopplerIntensityMultRef = useRef(floorDopplerIntensityMultiplier);
  useEffect(() => {
    floorDopplerIntensityMultRef.current = floorDopplerIntensityMultiplier;
  }, [floorDopplerIntensityMultiplier]);

  const floorDopplerInertiaMultRef = useRef(floorDopplerInertiaMultiplier);
  useEffect(() => {
    floorDopplerInertiaMultRef.current = floorDopplerInertiaMultiplier;
  }, [floorDopplerInertiaMultiplier]);

  // Corridor — built once at mount at a fixed world position; drives
  // scroll-controlled sphere travel down its length.
  const corridorRef = useRef<CorridorHandle | null>(null);
  const prevTravelDistanceRef = useRef(0);
  const wasInsideCorridorRef = useRef(false);
  const endLinkRef = useRef<HTMLAnchorElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Accumulates independently of the global clock so the debug-menu wave-
  // speed multiplier can change live without discontinuity (a direct
  // `time * multiplier` would jump whenever the multiplier changes).
  const corridorTimeAccumRef = useRef(0);
  const corridorWaveSpeedMultRef = useRef(corridorWaveSpeedMultiplier);
  useEffect(() => {
    corridorWaveSpeedMultRef.current = corridorWaveSpeedMultiplier;
  }, [corridorWaveSpeedMultiplier]);

  // Corridor 50%-crossing audio override (Task 1) — forces AUDIO_CONFIG.corridorOverridePath
  // while past halfway down the corridor, then reverts to exactly whatever audio state
  // (mode + track/frequency/key) was active right before the crossing.
  const corridorAudioOverrideActiveRef = useRef(false);
  const corridorAudioSnapshotRef = useRef<{
    mode: AudioSourceMode;
    trackIndex: number;
    toneFrequencyHz: number;
    arpeggioMode: ArpeggioMode;
  } | null>(null);
  // Mirrors — read inside animate()'s []-dep closure, same stale-closure concern
  // colorsRef/audioSourceModeRef above exist to avoid.
  const currentTrackIndexRef = useRef(currentTrackIndex);
  useEffect(() => {
    currentTrackIndexRef.current = currentTrackIndex;
  }, [currentTrackIndex]);
  const toneFrequencyHzRef = useRef(toneFrequencyHz);
  useEffect(() => {
    toneFrequencyHzRef.current = toneFrequencyHz;
  }, [toneFrequencyHz]);
  const arpeggioModeRef = useRef(arpeggioMode);
  useEffect(() => {
    arpeggioModeRef.current = arpeggioMode;
  }, [arpeggioMode]);

  // Debug-only free-fly camera (Task 14) — WASD + Q/E + mouse-look, gated by
  // the debug menu's freeCameraEnabled toggle (Task 15 adds the UI). Mirrored
  // into a ref following the colorsRef pattern since it's read inside
  // animate()'s []-dep closure.
  const freeCameraKeysRef = useRef<Set<string>>(new Set());
  const freeCameraEnabledRef = useRef(freeCameraEnabled);
  useEffect(() => {
    freeCameraEnabledRef.current = freeCameraEnabled;
  }, [freeCameraEnabled]);
  const wasFreeCameraEnabledRef = useRef(false);
  const freeCamPosRef = useRef(new THREE.Vector3());
  const freeCamYawRef = useRef(0);
  const freeCamPitchRef = useRef(0);

  // Persistent for the component's lifetime (unlike the one-shot gesture-
  // unlock effect below) — tracks which of WASD/Q/E are currently held so
  // animate()'s updateFreeCamera can read continuous move input.
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

  // Space-bar audio activation/play-pause (Task 7).
  const spacePressedOnceRef = useRef(false);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // NOTE: must stay declared before the setSource/setToneFrequency/setArpeggioMode/
  // gesture-unlock effects below — React runs effect setup in declaration order, so
  // audioEngineRef.current must be assigned here before those effects can read it
  // on initial mount. (Not about cleanup order — React runs cleanups in the same
  // forward order too, not reverse.)
  useEffect(() => {
    if (!mountRef.current || !containerRef.current) return;
    const mount     = mountRef.current;
    const container = containerRef.current;
    const W = window.innerWidth;
    const H = window.innerHeight;

    // If the default /audio.mp3 fails to load, fall back to the pure tone —
    // per the "en default, intenta reproducir el audio.mp3, sino el tono puro" spec.
    audioEngineRef.current = new AudioEngine(
      () => setAudioSourceMode('tone'),
      // Reads currentTrackIndexRef (not the closed-over currentTrackIndex) — see
      // its doc comment above for why a direct closure read would be stale here.
      () => setCurrentTrackIndex((currentTrackIndexRef.current + 1) % AUDIO_CONFIG.playlistPaths.length)
    );

    /* ── Renderer ───────────────────────────────────────────────── */
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x07001a);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.90;
    mount.appendChild(renderer.domElement);

    /* ── Scene & fog ────────────────────────────────────────────── */
    const scene = new THREE.Scene();
    scene.fog   = new THREE.FogExp2(0x07001a, 0.012);

    /* ── Camera ─────────────────────────────────────────────────── */
    const camera = new THREE.PerspectiveCamera(65, W / H, 0.1, 500);
    cameraRef.current = camera;
    camera.position.set(0, 7, 12);
    camera.lookAt(0, 0, 0);

    /* ── Flow-field disc (circular → curved horizon, planet-like) ─── */
    /* CircleGeometry gives a round footprint. With a large radius and    */
    /* perspective camera the far edge reads as a smooth curved horizon.  */
    const PLANE   = 55;                                          // disc radius
    const planeGeo = new THREE.CircleGeometry(PLANE, 128);       // 128 segments
    planeGeo.rotateX(-Math.PI / 2);                              // lay flat XZ

    const SPHERE_R  = 0.75;
    const SPHERE_IR = 1.05;  // flow deflection radius — tight to sphere surface

    const flowUniforms: Record<string, THREE.IUniform> = {
      uTime:     { value: 0 },
      uSphereXZ: { value: new THREE.Vector2(0, 0) },
      uSphereR:  { value: SPHERE_IR },
      uProgress: { value: 0 },
      uBgColor:      { value: new THREE.Color(DEFAULT_SCENE_COLORS.flowBackground) },
      uLineLavender: { value: new THREE.Color(DEFAULT_SCENE_COLORS.flowLineLavender) },
      uLinePink:     { value: new THREE.Color(DEFAULT_SCENE_COLORS.flowLinePink) },
      uLineAmber:    { value: new THREE.Color(DEFAULT_SCENE_COLORS.flowLineAmber) },
      uNearGlow:     { value: new THREE.Color(DEFAULT_SCENE_COLORS.flowNearSphereGlow) },
      uSphereVel:       { value: new THREE.Vector2(0, 0) },
      uDopplerCompress: { value: 0 },
    };
    flowUniformsRef.current = flowUniforms;
    const flowMat  = new THREE.ShaderMaterial({
      vertexShader:   FLOW_VERT,
      fragmentShader: FLOW_FRAG,
      uniforms:       flowUniforms,
      side:           THREE.DoubleSide,
    });
    scene.add(new THREE.Mesh(planeGeo, flowMat));

    /* ── Sphere ─────────────────────────────────────────────────── */
    const sphGeo = new THREE.SphereGeometry(SPHERE_R, 64, 64);
    const sphUniforms: Record<string, THREE.IUniform> = {
      uProgress: { value: 0 },
      uTime:     { value: 0 },
      uChromeHighlight: { value: new THREE.Color(DEFAULT_SCENE_COLORS.sphereChromeHighlight) },
    };
    sphUniformsRef.current = sphUniforms;
    const sphMat = new THREE.ShaderMaterial({
      vertexShader:   SPH_VERT,
      fragmentShader: SPH_FRAG,
      uniforms:       sphUniforms,
      transparent:    true,
      depthWrite:     false,
    });
    const sphere = new THREE.Mesh(sphGeo, sphMat);
    sphere.position.set(0, SPHERE_R * 0.30, 0); // sunken ~70% into the plane
    scene.add(sphere);

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

    /* ── Star field (visible in sky above horizon) ──────────────── */
    const STAR_COUNT = 550;
    const sPosArr    = new Float32Array(STAR_COUNT * 3);
    const sPhaseArr  = new Float32Array(STAR_COUNT);
    const sSizeArr   = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta    = Math.random() * Math.PI * 2;
      // Full sphere (was upper-hemisphere-only, world-anchored) — the
      // field is repositioned onto the camera every frame below, so it
      // needs to surround the viewer in every direction; the flow
      // plane's own opaque geometry naturally occludes whichever
      // hemisphere would otherwise read as "underground" via ordinary
      // depth testing, so no visibility logic is needed here.
      const cosP     = -1 + Math.random() * 2;
      const sinP     = Math.sqrt(Math.max(0, 1 - cosP * cosP));
      const radius   = 30 + Math.random() * 25;        // 30–55 units from the camera
      sPosArr[i*3]   = Math.cos(theta) * sinP * radius;
      sPosArr[i*3+1] = cosP * radius;
      sPosArr[i*3+2] = Math.sin(theta) * sinP * radius;
      sPhaseArr[i]   = Math.random();
      sSizeArr[i]    = 3.0 + Math.random() * 5.0;      // larger points
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sPosArr,   3));
    starGeo.setAttribute('aPhase',   new THREE.BufferAttribute(sPhaseArr, 1));
    starGeo.setAttribute('aSize',    new THREE.BufferAttribute(sSizeArr,  1));
    const starUniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 },
      uStarTint: { value: new THREE.Color(DEFAULT_SCENE_COLORS.starColor) },
    };
    starUniformsRef.current = starUniforms;
    const starMat = new THREE.ShaderMaterial({
      vertexShader:   STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms:       starUniforms,
      transparent:    true,
      depthWrite:     false,
      fog:            false,        // stars ignore scene fog
    });
    const starPoints = new THREE.Points(starGeo, starMat);
    scene.add(starPoints);

    /* ── Corridor-entrance star field ──────────────────────────────
     * The disc star field above now follows the camera (see the
     * starPoints.position.copy(camera.position) call in animate()), so
     * it does still show up once the camera teleports into the corridor.
     * This is a second, additional field positioned in the corridor's
     * own local space (added as a child of corridor.group, so it moves
     * with it automatically) — denser and art-directed specifically for
     * the tunnel's local scale, reusing the SAME material/uniforms as
     * the disc field — same shader, same random-brightness twinkle, for
     * free — just different geometry/positions. Placed above and a bit
     * behind the tunnel entrance (local +Z, since the tunnel extends
     * toward -Z), matching where the very first corridor-phase camera
     * position (behind + above the sphere, chase-cam) actually looks. */
    const CORRIDOR_STAR_COUNT = 200;
    const csPosArr   = new Float32Array(CORRIDOR_STAR_COUNT * 3);
    const csPhaseArr = new Float32Array(CORRIDOR_STAR_COUNT);
    const csSizeArr  = new Float32Array(CORRIDOR_STAR_COUNT);
    for (let i = 0; i < CORRIDOR_STAR_COUNT; i++) {
      const theta  = Math.random() * Math.PI * 2;
      const radius = 4 + Math.random() * 22;
      csPosArr[i*3]   = Math.cos(theta) * radius;
      csPosArr[i*3+1] = corridor.crossSection + 3 + Math.random() * 18;
      csPosArr[i*3+2] = Math.sin(theta) * radius + corridor.crossSection * 1.5;
      csPhaseArr[i]   = Math.random();
      csSizeArr[i]    = 2.5 + Math.random() * 4.5;
    }
    const corridorStarGeo = new THREE.BufferGeometry();
    corridorStarGeo.setAttribute('position', new THREE.BufferAttribute(csPosArr,   3));
    corridorStarGeo.setAttribute('aPhase',   new THREE.BufferAttribute(csPhaseArr, 1));
    corridorStarGeo.setAttribute('aSize',    new THREE.BufferAttribute(csSizeArr,  1));
    corridor.group.add(new THREE.Points(corridorStarGeo, starMat));

    /* ── Post-processing ────────────────────────────────────────── */
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.18, 0.38, 0.72);
    composer.addPass(bloom);

    /* ── Camera keyframes ───────────────────────────────────────── */
    /*
     * Each keyframe: { pos, target, up }
     * Interpolated piecewise over [0, 1] scroll progress.
     *
     * Phase 0 → 1 : side view → zenith            (scroll 0.00–0.25)
     * Phase 1 → 2 : zenith → zoomed               (scroll 0.25–0.55)
     * Phase 2 → 3 : zoomed → rotated 90° Y        (scroll 0.55–1.00)
     *
     * In Phase 3, camera.up = (1,0,0) → world X becomes screen-up
     * → flow lines (constant world-Z) appear vertical
     * → flow direction (along X) rises from bottom to top  ✓
     */
    type V3Arr = [number, number, number];
    interface CamKey { pos: V3Arr; target: V3Arr; up: V3Arr }

    const CAM: CamKey[] = [
      { pos: [0, 7, 12],    target: [0, 0, 0], up: [0, 1, 0]  }, // side
      { pos: [0, 22, 0.5],  target: [0, 0, 0], up: [0, 0, -1] }, // zenith
      { pos: [0, 8,  0.5],  target: [0, 0, 0], up: [0, 0, -1] }, // zoom in
      { pos: [0.5, 8, 0],   target: [0, 0, 0], up: [1, 0, 0]  }, // rotated
    ];
    const BREAKS = [0, 0.25, 0.55, 1.0];

    const ease = (t: number) => t * t * (3 - 2 * t);
    const lerpArr = (a: V3Arr, b: V3Arr, t: number): V3Arr =>
      [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];

    function applyCamKeyframes(progress: number) {
      let fi = 0;
      for (let i = 0; i < BREAKS.length - 1; i++) {
        if (progress <= BREAKS[i + 1]) { fi = i; break; }
        fi = i;
      }
      fi = Math.min(fi, CAM.length - 2);
      const span = BREAKS[fi + 1] - BREAKS[fi];
      const t    = ease(Math.max(0, Math.min(1, (progress - BREAKS[fi]) / span)));

      const [px, py, pz] = lerpArr(CAM[fi].pos,    CAM[fi+1].pos,    t);
      const [tx, ty, tz] = lerpArr(CAM[fi].target,  CAM[fi+1].target, t);
      const [ux, uy, uz] = lerpArr(CAM[fi].up,      CAM[fi+1].up,     t);

      camera.position.set(px, py, pz);
      camera.up.set(ux, uy, uz).normalize();
      camera.lookAt(tx, ty, tz);
    }

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
      // Look AHEAD along the travel axis and at a height blended between the
      // sphere's low position and the tunnel's vertical center — locking onto
      // the sphere alone pitches the camera too steeply down, pushing the
      // tunnel/end-wall geometry far above screen-center.
      const lookAheadOffset = corridor.axis.clone().multiplyScalar(diameter * 3);
      const tunnelCenterY = corridor.entrance.y + corridor.crossSection / 2;
      const lookTarget = spherePos.clone().add(lookAheadOffset);
      lookTarget.y = THREE.MathUtils.lerp(spherePos.y, tunnelCenterY, 0.5);
      camera.lookAt(lookTarget);
    }

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

    /* ── Spring physics for sphere following mouse ───────────────── */
    const spring = { x: 0, z: 0, vx: 0, vz: 0 };
    const SPRING_K    = 0.22;  // faster follow
    const SPRING_DAMP = 0.70;
    const MAX_X       = 9;
    const MAX_Z       = 7;

    /* ── Animation loop ─────────────────────────────────────────── */
    const clock = new THREE.Clock();
    let rafId: number;

    function animate() {
      rafId = requestAnimationFrame(animate);
      const dt       = Math.min(clock.getDelta(), 0.05);
      const time     = clock.getElapsedTime();
      const progress = scrollRef.current;

      /* Update uniforms */
      flowUniforms.uTime.value     = time;
      flowUniforms.uProgress.value = progress;
      sphUniforms.uTime.value      = time;
      sphUniforms.uProgress.value  = progress;
      starUniforms.uTime.value     = time;

      /* Scroll-timeline gating: the final phase begins the instant scroll
       * passes the last text block — a hard teleport to the corridor
       * (see CORRIDOR_CONFIG.yOffset), not a gradual zoom/reveal. */
      const instance = scrollInstanceRef.current;
      const finalPhaseProgress = remapSubrange(
        instance,
        { start: FINAL_PHASE_START_INSTANCE, end: FINAL_PHASE_START_INSTANCE + FINAL_PHASE_DURATION_INSTANCES }
      );
      const insideCorridorPhase = finalPhaseProgress > 0;

      // Title/space-prompt are otherwise controlled by React state driven
      // by signals other than corridor entry (the title's scroll-instance
      // auto-hide / audioActivated) — a fast scroll can carry either into
      // the corridor view, overlapping the 3D scene. Force-hide imperatively
      // while inside the corridor; on exit, restore based on the CURRENT
      // live React state (via ref mirrors) rather than blindly clearing to
      // '' — a blind clear would hand back whatever React's LAST render
      // set, which is wrong if the title/prompt were already legitimately
      // hidden (scroll-instance auto-hide / audioActivated) before the
      // corridor was entered.
      if (insideCorridorPhase !== wasInsideCorridorRef.current) {
        if (titleRef.current) {
          titleRef.current.style.opacity = insideCorridorPhase ? '0' : (titleVisibleRef.current ? '' : '0');
          titleRef.current.style.animation = insideCorridorPhase ? 'none' : (titleVisibleRef.current ? '' : 'none');
        }
        if (spacePromptRef.current) {
          // "Press Space" is a desktop-only hint (phones have no physical
          // Space key) — mobile already has its own separate audio-
          // activation flow (the gate overlay), so force-hide regardless
          // of audioActivatedRef. Reads isMobileRef (not the closed-over
          // `isMobile`) — see isMobileRef's doc comment above for why a
          // direct closure read would be stale here.
          spacePromptRef.current.style.opacity =
            insideCorridorPhase || isMobileRef.current ? '0' : (audioActivatedRef.current ? '0' : '');
        }
      }

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
        // Discontinuous-jump safety net: the corridor branch's own revert
        // (below) only fires on a frame that samples corridorTravelT < 0.5
        // while still inside the corridor phase. A single-frame scroll delta
        // (fast scroll-up, scrollbar drag) can jump straight from "past
        // halfway, override active" to fully outside the corridor phase,
        // skipping that sample entirely and leaving the override stuck on.
        // Catch that here too, symmetric to the corridor branch's revert.
        if (corridorAudioOverrideActiveRef.current) {
          corridorAudioOverrideActiveRef.current = false;
          const snap = corridorAudioSnapshotRef.current;
          if (snap) {
            setAudioSourceMode(snap.mode);
            if (snap.mode === 'file') setCurrentTrackIndex(snap.trackIndex);
            else if (snap.mode === 'tone') setToneFrequencyHz(snap.toneFrequencyHz);
            else setArpeggioMode(snap.arpeggioMode);
          }
        }

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

        // Reads isMobileRef (not the closed-over `isMobile`) — see isMobileRef's
        // doc comment above for why a direct closure read would be stale here.
        const mx = isMobileRef.current ? (sphereControlHeldRef.current ? deviceTiltRef.current.x : 0) : mouseRef.current.x;
        const my = isMobileRef.current ? (sphereControlHeldRef.current ? deviceTiltRef.current.y : 0) : mouseRef.current.y; // +1 = top, −1 = bottom

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
        corridor.patternUniforms.uSpherePosZ.value = -travelDistance;

        // Corridor 50%-crossing audio override — force-switches to the dedicated
        // override track past halfway, then reverts to exactly whatever audio
        // state (mode + track/frequency/key) was active right before crossing.
        // Setting the context setters here is what actually reloads the audio
        // source — the reactive effects further down (resolveFileSourceOpts)
        // pick up the change on the next render.
        const pastHalfway = corridorTravelT >= 0.5;
        if (pastHalfway && !corridorAudioOverrideActiveRef.current) {
          corridorAudioOverrideActiveRef.current = true;
          corridorAudioSnapshotRef.current = {
            mode: audioSourceModeRef.current,
            trackIndex: currentTrackIndexRef.current,
            toneFrequencyHz: toneFrequencyHzRef.current,
            arpeggioMode: arpeggioModeRef.current,
          };
          setAudioSourceMode('file');
          setCurrentTrackIndex(CORRIDOR_AUDIO_OVERRIDE_TRACK_INDEX);
        } else if (!pastHalfway && corridorAudioOverrideActiveRef.current) {
          corridorAudioOverrideActiveRef.current = false;
          const snap = corridorAudioSnapshotRef.current;
          if (snap) {
            setAudioSourceMode(snap.mode);
            if (snap.mode === 'file') setCurrentTrackIndex(snap.trackIndex);
            else if (snap.mode === 'tone') setToneFrequencyHz(snap.toneFrequencyHz);
            else setArpeggioMode(snap.arpeggioMode);
          }
        }
      }

      /* Ground level differs by phase — disc floor is at world y=0,
       * corridor floor is at CORRIDOR_CONFIG.yOffset. Sphere sinks the
       * same ~70% into either floor. */
      const groundY = insideCorridorPhase ? CORRIDOR_CONFIG.yOffset : 0;
      sphere.position.y = groundY + SPHERE_R * 0.30;
      wasInsideCorridorRef.current = insideCorridorPhase;

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
      starPoints.position.copy(camera.position);

      /* End-of-corridor link — only relevant, and only projected, while
       * actually inside the corridor. */
      if (insideCorridorPhase) {
        // .project(camera) relies on camera.matrixWorldInverse, which is
        // normally refreshed by composer.render() — but that runs AFTER
        // this point in the frame, so without an explicit update here
        // we'd project against last frame's camera transform.
        camera.updateMatrixWorld();
        const projected = corridor.endWallCenter.clone().project(camera);
        // Also project the wall's left/right edges (not just its center)
        // so the link text can be given a pixel-accurate max-width with a
        // real margin — it should never touch the wall's physical edges,
        // regardless of viewing distance/angle. Using 0.42 (rather than
        // the true half-width fraction 0.5) as the edge offset already
        // bakes an ~8%-per-side margin into the measurement itself.
        const EDGE_FRACTION = 0.42;
        const leftEdge2D  = corridor.endWallCenter.clone()
          .add(new THREE.Vector3(-corridor.crossSection * EDGE_FRACTION, 0, 0)).project(camera);
        const rightEdge2D = corridor.endWallCenter.clone()
          .add(new THREE.Vector3( corridor.crossSection * EDGE_FRACTION, 0, 0)).project(camera);
        const wallWidthPx = Math.abs(rightEdge2D.x - leftEdge2D.x) * 0.5 * window.innerWidth;
        if (endLinkRef.current) {
          endLinkRef.current.style.left = `${(projected.x * 0.5 + 0.5) * window.innerWidth}px`;
          endLinkRef.current.style.top  = `${(-projected.y * 0.5 + 0.5) * window.innerHeight}px`;
          endLinkRef.current.style.maxWidth = `${Math.max(120, wallWidthPx)}px`;
          const reached = corridorTravelT >= CORRIDOR_CONFIG.reachedThreshold;
          endLinkRef.current.style.opacity = reached ? '1' : '0';
          endLinkRef.current.style.pointerEvents = reached ? 'auto' : 'none';
          endLinkRef.current.tabIndex = reached ? 0 : -1;
          endLinkRef.current.setAttribute('aria-hidden', reached ? 'false' : 'true');
        }

        // Floating narrative text blocks — same fade-in/hold/fade-out
        // envelope as the main scroll text blocks (computeBlockOpacity),
        // but driven by how far the sphere has traveled through the
        // corridor (corridorTravelT) instead of page-scroll instance.
        const corridorInstance = corridorInstanceFromTravel(corridorTravelT, CORRIDOR_TEXT_BLOCK_SEGMENTS, TEXT_BLOCK_DURATION_INSTANCES);
        const segmentLength = corridor.length / CORRIDOR_TEXT_BLOCK_SEGMENTS;
        const camForward = new THREE.Vector3();
        camera.getWorldDirection(camForward);
        CORRIDOR_TEXT_BLOCKS.forEach((_text, i) => {
          const el = corridorTextRefs.current[i];
          if (!el) return;
          const blockLocalZ = -(i + 0.5) * segmentLength;
          const anchor = corridor.entrance.clone().add(new THREE.Vector3(0, corridor.crossSection / 2, blockLocalZ));
          const toAnchor = anchor.clone().sub(camera.position);
          const inFront = toAnchor.dot(camForward) > 0;
          const opacity = inFront
            ? computeBlockOpacity(corridorInstance, corridorBlockStartInstance(i, TEXT_BLOCK_DURATION_INSTANCES), TEXT_BLOCK_DURATION_INSTANCES)
            : 0;
          if (opacity <= 0) {
            el.style.opacity = '0';
            // Not visible — clear the locked wrap width so the NEXT time
            // this block appears it re-measures fresh rather than reusing
            // a stale value from a previous appearance.
            corridorTextMaxWidthRef.current[i] = null;
            return;
          }
          const projected = anchor.clone().project(camera);
          el.style.left = `${(projected.x * 0.5 + 0.5) * window.innerWidth}px`;
          el.style.top  = `${(-projected.y * 0.5 + 0.5) * window.innerHeight}px`;
          // Lock the wrap width on the FIRST frame this block becomes
          // visible, then reuse it for the rest of its visible lifetime.
          // Recomputing this every frame (the tunnel's projected width at
          // the anchor's depth, which shrinks as the chase camera
          // approaches) made the text visibly re-wrap mid-fade — jarring
          // and hard to read.
          if (corridorTextMaxWidthRef.current[i] === null) {
            const leftEdge2D  = anchor.clone().add(new THREE.Vector3(-corridor.crossSection * EDGE_FRACTION, 0, 0)).project(camera);
            const rightEdge2D = anchor.clone().add(new THREE.Vector3( corridor.crossSection * EDGE_FRACTION, 0, 0)).project(camera);
            const wallWidthPx = Math.abs(rightEdge2D.x - leftEdge2D.x) * 0.5 * window.innerWidth;
            corridorTextMaxWidthRef.current[i] = Math.max(120, wallWidthPx);
          }
          el.style.maxWidth = `${corridorTextMaxWidthRef.current[i]}px`;
          el.style.opacity = String(opacity);
        });
      } else if (endLinkRef.current) {
        endLinkRef.current.style.opacity = '0';
        endLinkRef.current.style.pointerEvents = 'none';
        endLinkRef.current.tabIndex = -1;
        endLinkRef.current.setAttribute('aria-hidden', 'true');
        corridorTextRefs.current.forEach((el, i) => {
          if (el) el.style.opacity = '0';
          corridorTextMaxWidthRef.current[i] = null;
        });
      }

      audioEngineRef.current?.setDopplerSpeed(sphereSpeed, dt);
      flowUniforms.uSphereXZ.value.set(sphere.position.x, sphere.position.z);

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

      /* Floor doppler wave compression — only "active" (camera far from the
       * scenario) at/after FLOOR_DOPPLER_MIN_CAMERA_PROGRESS; forcing speed
       * to 0 below that threshold lets the hold+release curve ease it out
       * naturally instead of an abrupt cut. Inertia multiplier scales
       * hold+release duration; intensity multiplier scales the final
       * compression strength (kept separate from the state machine's own
       * timing so scaling "how strong" never distorts "how long"). */
      const floorEffectiveSpeed = progress >= FLOOR_DOPPLER_MIN_CAMERA_PROGRESS ? sphereSpeed : 0;
      // Deliberately excludes riseRate (unlike pitchInertiaMultiplier, which scales
      // all 3 of its time constants) — the rise phase is fast and visually tied to
      // the sphere's own motion, so only the hold+release "lingering after the
      // sphere stops" phase reads as needing an adjustable inertia.
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
      corridor.patternUniforms.uDopplerCompress.value = flowUniforms.uDopplerCompress.value;

      /* Bloom reacts to progress: subtle at start, punchy at Phase 3 */
      bloom.strength = 0.12 + progress * 0.30;

      /* Fade scroll indicator — the normal scroll-progress-driven fade,
       * PLUS (PC only) a temporary full-opacity reveal for 3s after any
       * click, with its own smooth fade-out once that window ends. The
       * two are blended via max() so whichever wants the indicator MORE
       * visible right now wins — clicking during the normal fade-out
       * pops it back to full opacity, and once the 3s window itself
       * ends, control silently reverts to the normal scroll-driven value
       * (which may itself already be low/zero by then). */
      if (indicatorRef.current) {
        const scrollFade = Math.max(0, 1 - progress * 12);
        let clickFade = 0;
        if (!isMobileRef.current && indicatorClickRevealUntilRef.current > 0) {
          const remaining = indicatorClickRevealUntilRef.current - time;
          if (remaining > 0) {
            // Full opacity for the first 2s of the 3s window, then a
            // 1s smooth fade-out to close it.
            clickFade = remaining > 1 ? 1 : remaining;
          } else {
            indicatorClickRevealUntilRef.current = 0; // window expired — stop paying the branch cost every frame
          }
        }
        indicatorRef.current.style.opacity = String(Math.max(scrollFade, clickFade));
      }

      /* Scroll-timed text block opacity (imperative — avoids per-frame re-render) */
      TEXT_BLOCKS.forEach((block, i) => {
        const el = textBlockRefs.current[i];
        if (el) el.style.opacity = String(computeBlockOpacity(instance, block.startInstance));
      });

      composer.render();
    }

    animate();

    function onScroll() {
      const scrolled = window.scrollY - container.offsetTop;
      const instance = computeScrollInstance(Math.max(0, scrolled), window.innerHeight);
      scrollInstanceRef.current = instance;
      // Camera choreography progress: 0..1 over the first INTRO_CAMERA_INSTANCES,
      // then held at 1 (matches the existing "fixed camera" final look) until
      // the final zoom phase (a later task) takes over.
      scrollRef.current = Math.max(0, Math.min(1, instance / INTRO_CAMERA_INSTANCES));

      if (instance <= 0.01) {
        // Back at the very top — show the title immediately.
        if (!titleVisibleRef.current) {
          titleVisibleRef.current = true;
          setTitleVisible(true);
        }
      } else if (instance >= TITLE_HIDE_TRIGGER_INSTANCE && titleVisibleRef.current) {
        // Same trigger instance as TEXT_BLOCKS[0].startInstance — the title
        // starts hiding at the exact scroll position the first text block
        // starts appearing, so they're always in sync regardless of scroll speed.
        titleVisibleRef.current = false;
        setTitleVisible(false);
      }
    }

    function onMouse(e: MouseEvent) {
      // Gated on the REF (not the closed-over `isMobile`) — see isMobileRef's
      // doc comment above for why: this handler's closure is fixed at mount
      // time, but isMobileRef is corrected shortly after by a later render.
      if (isMobileRef.current) return;
      mouseRef.current = {
        x:  (e.clientX / window.innerWidth)  * 2 - 1,
        y: -(e.clientY / window.innerHeight) * 2 + 1,
      };
    }

    function onTouch(e: TouchEvent) {
      if (isMobileRef.current) return; // see onMouse's comment above
      if (!e.touches[0]) return;
      mouseRef.current = {
        x:  (e.touches[0].clientX / window.innerWidth)  * 2 - 1,
        y: -(e.touches[0].clientY / window.innerHeight) * 2 + 1,
      };
    }

    function onDeviceOrientation(e: DeviceOrientationEvent) {
      // beta: front-back tilt (-180..180, 0 = flat), gamma: left-right tilt
      // (-90..90, 0 = flat) — both relative to the DEVICE's own physical
      // axes, not the screen's. Remap to SCREEN-relative axes first (see
      // remapDeviceTiltToScreenAxes) so landscape rotation doesn't steer
      // ~90° off from what's actually on screen, THEN normalize to
      // roughly -1..1 the same way mouseRef's x/y are, so this can drive
      // the EXACT SAME downstream spring-physics code the mouse does.
      // Clamped, since the remapped angle can exceed the "comfortable
      // tilt" range if the phone is held at an unusual angle — clamping
      // avoids the sphere pinning at max deflection for any tilt beyond a
      // modest, comfortable range.
      const screenAngle =
        screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0;
      const { x: sx, y: sy } = remapDeviceTiltToScreenAxes(e.beta ?? 0, e.gamma ?? 0, screenAngle);
      deviceTiltRef.current = {
        x: THREE.MathUtils.clamp(sx / 30, -1, 1),
        y: THREE.MathUtils.clamp(-(sy - 45) / 30, -1, 1), // ~45° = comfortable "neutral" hold angle
      };
    }

    function onClick() {
      if (isMobileRef.current) return;
      indicatorClickRevealUntilRef.current = clock.getElapsedTime() + 3;
    }

    function onResize() {
      const w = window.innerWidth, h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    }

    // All three (mousemove/touchmove/deviceorientation) are attached
    // unconditionally — NOT gated on `isMobile` here, because that would
    // bake in the same closure-staleness bug isMobileRef's doc comment
    // above describes (this registration runs once, synchronously, before
    // isMobileRef has necessarily been corrected). Each handler instead
    // gates its OWN effect on isMobileRef.current at call time, which is
    // always safe since real events only arrive well after mount. This is
    // harmless cross-registration in practice: desktop browsers essentially
    // never fire deviceorientation, and mobile's onMouse/onTouch handlers
    // no-op via their own isMobileRef guard.
    window.addEventListener('scroll',     onScroll, { passive: true });
    window.addEventListener('mousemove',  onMouse);
    window.addEventListener('touchmove',  onTouch, { passive: true });
    window.addEventListener('deviceorientation', onDeviceOrientation);
    window.addEventListener('click',      onClick);
    window.addEventListener('resize',     onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll',    onScroll);
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('deviceorientation', onDeviceOrientation);
      window.removeEventListener('click',     onClick);
      window.removeEventListener('resize',    onResize);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
      planeGeo.dispose(); flowMat.dispose();
      sphGeo.dispose();   sphMat.dispose();
      starGeo.dispose();  starMat.dispose();
      corridorStarGeo.dispose();
      corridor.dispose();
      scene.remove(corridor.group);
      corridorRef.current = null;
      audioEngineRef.current?.dispose();
      audioEngineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Unlock the AudioContext on the first user gesture — browsers block
   * autoplay until then. Removes its own listeners after the first fire. */
  useEffect(() => {
    function unlock() {
      audioEngineRef.current?.resume().catch(() => {});
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('wheel', unlock);
    }
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('wheel', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('wheel', unlock);
    };
  }, []);

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
        // Reads isMobileRef (not the closed-over `isMobile`) — see isMobileRef's
        // doc comment above for why a direct closure read would be stale here.
        setCurrentTrackIndex(isMobileRef.current ? AUDIO_CONFIG.mobileDefaultTrackIndex : 0);
      } else {
        setIsPlaying(!isPlayingRef.current);
      }
    }
    window.addEventListener('keydown', onSpaceKey);
    return () => window.removeEventListener('keydown', onSpaceKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Push debug-menu color changes into the live shader uniforms. Runs on
   * React's normal render/commit cycle, so it always sees the latest
   * `colors` (unlike the rAF loop inside the mount effect above, which
   * closes over the uniforms refs instead). */
  useEffect(() => {
    flowUniformsRef.current?.uBgColor.value.set(colors.flowBackground);
    flowUniformsRef.current?.uLineLavender.value.set(colors.flowLineLavender);
    flowUniformsRef.current?.uLinePink.value.set(colors.flowLinePink);
    flowUniformsRef.current?.uLineAmber.value.set(colors.flowLineAmber);
    flowUniformsRef.current?.uNearGlow.value.set(colors.flowNearSphereGlow);
    sphUniformsRef.current?.uChromeHighlight.value.set(colors.sphereChromeHighlight);
    starUniformsRef.current?.uStarTint.value.set(colors.starColor);
    corridorRef.current?.endWallUniforms.uColorStart.value.set(colors.corridorWallStart);
    corridorRef.current?.endWallUniforms.uColorEnd.value.set(colors.corridorWallEnd);
  }, [colors]);

  /* Push debug-menu FOV changes into the live camera. Null-guarded because
   * this effect can fire before the mount effect has run (e.g. fast
   * refresh). Only touches `fov` — aspect ratio and near/far planes stay
   * as constructed. */
  useEffect(() => {
    if (!cameraRef.current) return;
    cameraRef.current.fov = cameraFovDeg;
    cameraRef.current.updateProjectionMatrix();
  }, [cameraFovDeg]);

  /* Resolves the { fileUrl, loop } opts for setSource('file', ...): a custom
   * upload always wins and loops on its own; the corridor's 50%-crossing
   * override sentinel selects the dedicated override track (also looping);
   * otherwise the current playlist entry plays once (loop: false) so its
   * 'ended' event (see audioEngine.ts) advances to the next track. */
  function resolveFileSourceOpts(): { fileUrl: string; loop: boolean } {
    if (uploadedFileUrl) return { fileUrl: uploadedFileUrl, loop: true };
    if (currentTrackIndex === CORRIDOR_AUDIO_OVERRIDE_TRACK_INDEX) {
      return { fileUrl: withBasePath(AUDIO_CONFIG.corridorOverridePath), loop: true };
    }
    return { fileUrl: withBasePath(AUDIO_CONFIG.playlistPaths[currentTrackIndex]), loop: false };
  }

  /* Rebuild the source graph on an actual mode switch — expensive (tears
   * down and recreates the oscillator/audio element), audible click is
   * expected here. Also reacts to currentTrackIndex, since switching tracks
   * while already in file mode (debug-menu skip, playlist auto-advance, or
   * the corridor override engaging/reverting) must reload the source too. */
  useEffect(() => {
    audioEngineRef.current?.setSource(audioSourceMode, {
      ...resolveFileSourceOpts(),
      toneFrequencyHz,
      arpeggioMode,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSourceMode, currentTrackIndex]);

  /* Rebuild the source graph when the uploaded file changes — but ONLY while
   * already in 'file' mode. Uploading a file while in tone/arpeggio mode
   * must not touch the (currently playing) oscillator; the new file becomes
   * relevant only once the user actually switches to 'file' mode, which the
   * effect above already handles. */
  useEffect(() => {
    if (audioSourceModeRef.current !== 'file') return;
    audioEngineRef.current?.setSource('file', resolveFileSourceOpts());
    // resolveFileSourceOpts reads currentTrackIndex only on the uploadedFileUrl-truthy
    // branch (gated above), where currentTrackIndex is irrelevant — the upload always
    // wins. Omitting it avoids reloading the file source on every playlist track change
    // while an upload is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedFileUrl]);

  /* Cheap live-parameter updates (e.g. dragging the frequency slider) that
   * must NOT tear down/recreate the oscillator. */
  useEffect(() => {
    audioEngineRef.current?.setToneFrequency(toneFrequencyHz);
  }, [toneFrequencyHz]);

  useEffect(() => {
    audioEngineRef.current?.setArpeggioMode(arpeggioMode);
  }, [arpeggioMode]);

  useEffect(() => {
    audioEngineRef.current?.setPitchInertiaMultiplier(pitchInertiaMultiplier);
  }, [pitchInertiaMultiplier]);

  useEffect(() => {
    audioEngineRef.current?.setPlaying(isPlaying);
  }, [isPlaying]);

  function handleSphereControlPress() {
    sphereControlHeldRef.current = true;
    requestMotionPermissionIfNeeded();
  }
  function handleSphereControlRelease() {
    sphereControlHeldRef.current = false;
  }

  /* Scroll runway size — enough for the intro, all 5 text blocks, and the
   * final zoom/corridor phase, plus a 1-instance settle buffer at the end. */
  const TOTAL_SCROLL_INSTANCES =
    FINAL_PHASE_START_INSTANCE + FINAL_PHASE_DURATION_INSTANCES + 1;

  /* ── JSX ──────────────────────────────────────────────────────── */
  return (
    /*
     * The outer div's height is derived from TOTAL_SCROLL_INSTANCES — the
     * "scroll runway" for the section. Inside it a sticky viewport hosts
     * both the Three.js canvas and the overlay UI, so the experience is
     * fully contained within the section.
     */
    <div
      ref={containerRef}
      style={{ position: 'relative', height: `${(TOTAL_SCROLL_INSTANCES + 1) * 100}vh` }}
    >
      {/* Sticky viewport — canvas + UI overlay stay pinned while scrolling */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        {/* Three.js canvas mount */}
        <div
          ref={mountRef}
          style={{ position: 'absolute', inset: 0 }}
        />

        {isMobile && mobileGateOpen && (
          <MobileGate onDismiss={() => setMobileGateOpen(false)} />
        )}

        {isMobile && !mobileGateOpen && (
          <button
            ref={sphereButtonElRef}
            aria-label={MOBILE_CONFIG.sphereButton.ariaLabel}
            onPointerDown={handleSphereControlPress}
            onPointerUp={handleSphereControlRelease}
            onPointerCancel={handleSphereControlRelease}
            onPointerLeave={handleSphereControlRelease}
            style={{
              position: 'absolute',
              zIndex: 30,
              width: MOBILE_CONFIG.sphereButton.sizePx,
              height: MOBILE_CONFIG.sphereButton.sizePx,
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              touchAction: 'none',
              left: '50%',
              bottom: `${MOBILE_CONFIG.sphereButton.portraitBottomPercent}%`,
              transform: 'translateX(-50%)',
            }}
            className="sphereControlBtn"
          >
            <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ filter: 'drop-shadow(1.5px 1.5px 0 rgba(0,0,0,0.85))' }}>
              {FINGERPRINT_SVG_PATHS.map((d, i) => (
                <path key={i} d={d} stroke="#ffffff" strokeWidth={5} strokeLinecap="round" fill="none" />
              ))}
            </svg>
          </button>
        )}

        {isMobile && !mobileGateOpen && (
          <style>{`
            @media (orientation: landscape) {
              .sphereControlBtn {
                left: auto !important;
                bottom: 50% !important;
                right: ${MOBILE_CONFIG.sphereButton.landscapeRightPercent}% !important;
                transform: translateY(50%) !important;
              }
            }
          `}</style>
        )}

        {isMobile && !mobileGateOpen && (
          <button
            aria-label={MOBILE_CONFIG.hamburger.ariaLabel}
            onClick={() => setDebugMenuOpen(!debugMenuOpen)}
            style={{
              position: 'absolute',
              zIndex: 30,
              top: `${MOBILE_CONFIG.hamburger.topPercent}%`,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 40,
              height: 40,
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              opacity: 0.5,
              filter: 'drop-shadow(1.5px 1.5px 0 rgba(0,0,0,0.85))',
            }}
          >
            <svg viewBox="0 0 24 24" width="100%" height="100%">
              <rect x="3" y="6" width="18" height="2.4" rx="1.2" fill="#ffffff" />
              <rect x="3" y="11" width="18" height="2.4" rx="1.2" fill="#ffffff" />
              <rect x="3" y="16" width="18" height="2.4" rx="1.2" fill="#ffffff" />
            </svg>
          </button>
        )}

        {/* ── Scroll-timed text blocks — see app/lib/sceneConfig.ts TEXT_BLOCKS ── */}
        <ScrollTextBlocks ref={textBlockRefs} />

        {/* ── End-of-corridor link — see CORRIDOR_CONFIG in sceneConfig.ts ── */}
        <a
          ref={endLinkRef}
          href={CORRIDOR_CONFIG.finalLinkUrl}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={-1}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            zIndex: 20,
            transform: 'translate(-50%, -50%)',
            opacity: 0,
            pointerEvents: 'none',
            transition: 'opacity 0.6s ease',
            color: '#ffffff',
            fontFamily: 'var(--font-michroma), sans-serif',
            fontSize: 'clamp(16px, 2.2vw, 28px)',
            letterSpacing: '0.18em',
            textAlign: 'center',
            textTransform: 'uppercase',
            textShadow: '2.2px 2.2px 0px rgba(0,0,0,0.85)',
            textDecoration: 'none',
          }}
        >
          {CORRIDOR_CONFIG.finalLinkText}
        </a>

        {/* ── Corridor floating text blocks — see CORRIDOR_TEXT_BLOCKS in sceneConfig.ts ── */}
        {CORRIDOR_TEXT_BLOCKS.map((text, i) => (
          <div
            key={`corridor-text-${i}`}
            ref={(el) => {
              if (el) corridorTextRefs.current[i] = el;
            }}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              zIndex: 10,
              opacity: 0,
              pointerEvents: 'none',
              userSelect: 'none',
              textAlign: 'center',
              color: TEXT_BLOCKS[0].color,
              fontFamily: 'var(--font-michroma), sans-serif',
              fontSize: TEXT_BLOCKS[0].fontSizeClamp,
              letterSpacing: TEXT_BLOCKS[0].letterSpacing,
              lineHeight: 1.6,
              textShadow: shadowToCss(TEXT_BLOCKS[0].shadow, textBlockShadowSizeMultiplier, textBlockShadowIntensityMultiplier),
              transform: `translate(-50%, -50%) scale(${textBlockFontSizeMultiplier})`,
              transformOrigin: 'center',
            }}
          >
            {text}
          </div>
        ))}

        {/* ── Animations ───────────────────────────────────────────── */}
        <style>{`
          @keyframes currentsArrow {
            0%, 100% { transform: translateY(0px); opacity: 0.55; }
            50%       { transform: translateY(7px); opacity: 0.90; }
          }
          @keyframes titlePulse {
            0%, 100% { opacity: 0.72; }
            50%       { opacity: 0.96; }
          }
        `}</style>

        {/* ── Hero title — see app/lib/sceneConfig.ts TITLE_CONFIG to restyle ── */}
        <div
          ref={titleRef}
          style={{
            position:      'absolute',
            top:           isMobile ? '23%' : TITLE_CONFIG.topPosition,
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

        {/* ── Scroll indicator ───────────────────────────────────── */}
        <div
          ref={indicatorRef}
          style={{
            position:      'absolute',
            top:           '5vh',
            left:          '50%',
            transform:     'translateX(-50%)',
            zIndex:        10,
            display:       'flex',
            flexDirection: 'column',
            alignItems:    'center',
            gap:           '4px',
            color:         'rgba(210, 170, 255, 0.60)',
            fontFamily:    '"Helvetica Neue", Helvetica, Arial, sans-serif',
            fontSize:      '9px',
            fontWeight:    700,
            letterSpacing: '0.30em',
            textTransform: 'uppercase',
            userSelect:    'none',
            pointerEvents: 'none',
            transition:    'opacity 0.4s ease',
          }}
        >
          <span>scroll</span>
          <span style={{ animation: 'currentsArrow 2.4s ease-in-out infinite', display: 'block' }}>↓</span>
        </div>

        {/* ── Press-space-to-activate-audio prompt — mirrors the scroll indicator's styling ── */}
        <div
          ref={spacePromptRef}
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
            opacity:       (isMobile || audioActivated) ? 0 : undefined,
            transition:    'opacity 0.4s ease',
            whiteSpace:    'nowrap',
            padding:       '0 16px',
          }}
        >
          {SPACE_PROMPT_CONFIG.text}
        </div>
      </div>
    </div>
  );
}