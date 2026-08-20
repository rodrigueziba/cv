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

import { useEffect, useRef } from 'react';
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
  DEFAULT_SCENE_COLORS,
} from '@/app/lib/sceneConfig';
import ScrollTextBlocks from '@/app/components/ScrollTextBlocks';
import { computeBlockOpacity, computeScrollInstance } from '@/app/lib/scrollTimeline';
import { useSceneControls } from '@/app/lib/SceneControlsContext';

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
    float lineFreq = 7.0;
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

export default function Section1() {
  const { colors } = useSceneControls();

  const containerRef  = useRef<HTMLDivElement>(null);
  const mountRef      = useRef<HTMLDivElement>(null);
  const indicatorRef  = useRef<HTMLDivElement>(null);
  const titleRef      = useRef<HTMLDivElement>(null);
  const scrollRef     = useRef(0);
  const mouseRef      = useRef({ x: 0, y: 0 });
  const textBlockRefs = useRef<HTMLDivElement[]>([]);
  const scrollInstanceRef = useRef(0); // raw scroll timeline position, in "instances"

  const colorsRef = useRef(colors);
  useEffect(() => {
    colorsRef.current = colors;
  }, [colors]);

  const flowUniformsRef = useRef<Record<string, THREE.IUniform> | null>(null);
  const sphUniformsRef  = useRef<Record<string, THREE.IUniform> | null>(null);
  const starUniformsRef = useRef<Record<string, THREE.IUniform> | null>(null);

  useEffect(() => {
    if (!mountRef.current || !containerRef.current) return;
    const mount     = mountRef.current;
    const container = containerRef.current;
    const W = window.innerWidth;
    const H = window.innerHeight;

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

    /* ── Star field (visible in sky above horizon) ──────────────── */
    const STAR_COUNT = 550;
    const sPosArr    = new Float32Array(STAR_COUNT * 3);
    const sPhaseArr  = new Float32Array(STAR_COUNT);
    const sSizeArr   = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta    = Math.random() * Math.PI * 2;
      const cosP     = 0.04 + Math.random() * 0.96;   // upper hemisphere
      const sinP     = Math.sqrt(1 - cosP * cosP);
      const radius   = 30 + Math.random() * 25;        // closer: 30–55 units
      sPosArr[i*3]   = Math.cos(theta) * sinP * radius;
      sPosArr[i*3+1] = Math.abs(cosP) * radius + 1.5; // always above horizon
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
    scene.add(new THREE.Points(starGeo, starMat));

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

      /* Camera transition */
      applyCamKeyframes(progress);

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
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y; // +1 = top, −1 = bottom

      /* Lower-half Y constraint fades to zero exactly at Phase 1 (progress=0.25) */
      const constraintFade = Math.max(0, 1 - progress / 0.25);
      const myPhase0 = my < 0 ? -my : 0;        // lower-half only
      const myPhase3 = -my;                       // full range, inverted
      const myInput  = myPhase0 * constraintFade + myPhase3 * (1 - constraintFade);

      /* Rotate control frame by (progress × 90°) */
      const angle = progress * Math.PI / 2;
      const cosA  = Math.cos(angle);
      const sinA  = Math.sin(angle);
      const targetX = (mx * cosA - myInput * sinA) * MAX_X;
      const targetZ = (mx * sinA + myInput * cosA) * MAX_Z;

      spring.vx  = spring.vx * SPRING_DAMP + (targetX - spring.x) * SPRING_K;
      spring.vz  = spring.vz * SPRING_DAMP + (targetZ - spring.z) * SPRING_K;
      spring.x  += spring.vx;
      spring.z  += spring.vz;

      /* Phase 0: tight clamp (half-Y, limited X).
       * After Phase 0 (progress > 0.25): full disc range, no hard walls.
       * The clamps lerp smoothly so there's no jump.                      */
      const clampFade = Math.max(0, 1 - progress / 0.22);   // 0→1 fades by p=0.22
      const clampX    = THREE.MathUtils.lerp(PLANE * 0.85, MAX_X, clampFade);
      const clampZMin = THREE.MathUtils.lerp(-(PLANE * 0.85), 0, clampFade);
      const clampZMax = PLANE * 0.85;
      spring.x = THREE.MathUtils.clamp(spring.x, -clampX, clampX);
      spring.z = THREE.MathUtils.clamp(spring.z, clampZMin, clampZMax);

      sphere.position.x = spring.x;
      sphere.position.z = spring.z;
      sphere.position.y = SPHERE_R * 0.30; // sunken ~70% into the plane

      /* Pass sphere world XZ to shader for repulsion */
      flowUniforms.uSphereXZ.value.set(spring.x, spring.z);

      /* Bloom reacts to progress: subtle at start, punchy at Phase 3 */
      bloom.strength = 0.12 + progress * 0.30;

      /* Fade scroll indicator */
      if (indicatorRef.current) {
        indicatorRef.current.style.opacity = String(
          Math.max(0, 1 - progress * 12)
        );
      }

      /* Scroll-timed text block opacity (imperative — avoids per-frame re-render) */
      const instance = scrollInstanceRef.current;
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
    }

    function onMouse(e: MouseEvent) {
      mouseRef.current = {
        x:  (e.clientX / window.innerWidth)  * 2 - 1,
        y: -(e.clientY / window.innerHeight) * 2 + 1,
      };
    }

    function onTouch(e: TouchEvent) {
      if (!e.touches[0]) return;
      mouseRef.current = {
        x:  (e.touches[0].clientX / window.innerWidth)  * 2 - 1,
        y: -(e.touches[0].clientY / window.innerHeight) * 2 + 1,
      };
    }

    function onResize() {
      const w = window.innerWidth, h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    }

    window.addEventListener('scroll',     onScroll, { passive: true });
    window.addEventListener('mousemove',  onMouse);
    window.addEventListener('touchmove',  onTouch, { passive: true });
    window.addEventListener('resize',     onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll',    onScroll);
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('resize',    onResize);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
      planeGeo.dispose(); flowMat.dispose();
      sphGeo.dispose();   sphMat.dispose();
      starGeo.dispose();  starMat.dispose();
    };
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
  }, [colors]);

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

        {/* ── Scroll-timed text blocks — see app/lib/sceneConfig.ts TEXT_BLOCKS ── */}
        <ScrollTextBlocks ref={textBlockRefs} />

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
            animation:     'titlePulse 4s ease-in-out infinite',
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
      </div>
    </div>
  );
}