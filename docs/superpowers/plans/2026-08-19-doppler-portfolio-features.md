# Efecto Doppler — Portfolio Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the existing "Currents" hero section into the full "Efecto Doppler" experience: a simplified title, 5 scroll-timed text blocks, a Shift-activated debug menu (colors + audio source), a Web Audio doppler/filter system tied to sphere movement and two light beams, a doppler wave-compression effect on the scenario floor, and a final camera-zoom-into-corridor sequence ending in a clickable link.

**Architecture:** All new tunable values live in one central config module (`app/lib/sceneConfig.ts`) so every requirement that asked to be "easily locatable to modify" has one file and one named constant. The Three.js/WebGL logic stays imperative (refs + a single `requestAnimationFrame` loop in `Section1.tsx`), matching the existing code style — no React re-renders per frame. New concerns are split into small modules with one responsibility each: scroll-timeline math, shader GLSL helpers, the corridor scene builder, and the Web Audio engine. A React Context (`SceneControlsContext`) bridges the debug menu (React state) into the imperative Three.js/Audio world (refs).

**Tech Stack:** Next.js 16 (App Router, static export via `output: "export"`), React 19, TypeScript, Three.js (raw, not `@react-three/fiber`), Web Audio API, `next/font/google` (Michroma), Vitest for pure-function unit tests (new dev dependency — no test runner exists yet in this repo).

**Testing approach — read before starting:** This repo has zero test infrastructure and the majority of the work is real-time WebGL/audio behavior that cannot be asserted with `expect()` (shader visuals, spring physics, audio pitch). Per-task steps therefore split into two kinds:
- **Pure logic** (scroll timeline math, corridor progress remap, doppler pitch mapping, color lerp): written test-first with Vitest — these are genuinely unit-testable and easy to get subtly wrong.
- **Visual/audio integration** (shaders, camera, Web Audio graph, debug menu UI): no unit test is possible: the step is "run `npm run dev`, do X, confirm Y visually/audibly." Treat these as the acceptance check for that step.

Every task ends with a commit.

---

## Task 0: Add Vitest for pure-function tests

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Add a `test` script**

Edit `package.json` scripts block:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run"
  }
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Verify it runs with zero tests**

Run: `npm test`
Expected: `No test files found` (exit code non-zero is fine here — confirms Vitest is wired; the next tasks add real tests).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for pure-function unit tests"
```

---

## Task 1: Base-path helper (static export safety)

**Why:** `next.config.ts` sets `output: "export"` and a production `basePath` of `/cv`. Any asset referenced by a raw string (e.g. `/audio.mp3` in the new audio engine) will 404 in production because Next only rewrites `basePath` automatically for `next/image` and `next/link`, not for hand-written URLs. Every later task that references a public asset must go through this helper.

**Files:**
- Modify: `next.config.ts`
- Create: `app/lib/basePath.ts`
- Test: `app/lib/basePath.test.ts`

- [ ] **Step 1: Expose the base path to the client via env**

Modify `next.config.ts`:

```ts
import type { NextConfig } from "next";

// En GitHub Pages la app vive bajo /<repo>/; en `next dev` debe ser '' o `/` da 404.
const repoBase =
  process.env.GITHUB_PAGES_BASE_PATH ?? "/cv";

const nextConfig: NextConfig = {
  output: "export", // Genera la carpeta /out con HTML/CSS/JS estáticos
  basePath: process.env.NODE_ENV === "production" ? repoBase : "",
  env: {
    // Mirrors basePath so client code (audio/asset URLs) can prefix correctly.
    NEXT_PUBLIC_BASE_PATH: process.env.NODE_ENV === "production" ? repoBase : "",
  },
  images: {
    unoptimized: true, // GitHub Pages no soporta la optimización de imágenes nativa de Next.js
  },
};

export default nextConfig;
```

- [ ] **Step 2: Write the failing test**

Create `app/lib/basePath.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { withBasePath } from './basePath';

describe('withBasePath', () => {
  it('prefixes a leading-slash path with the configured base path', () => {
    expect(withBasePath('/audio.mp3')).toMatch(/\/audio\.mp3$/);
  });

  it('does not double-prefix an already-absolute URL', () => {
    expect(withBasePath('https://example.com/x.mp3')).toBe('https://example.com/x.mp3');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- basePath`
Expected: FAIL — `Cannot find module './basePath'`

- [ ] **Step 4: Implement**

Create `app/lib/basePath.ts`:

```ts
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/**
 * Prefixes a root-relative path (e.g. "/audio.mp3") with the app's
 * deployment base path. Leaves absolute URLs (http/https/blob/data) untouched.
 */
export function withBasePath(path: string): string {
  if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(path) || path.startsWith('blob:') || path.startsWith('data:')) {
    return path;
  }
  return `${BASE_PATH}${path}`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- basePath`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add next.config.ts app/lib/basePath.ts app/lib/basePath.test.ts
git commit -m "feat: add basePath-aware asset URL helper for static export"
```

---

## Task 2: Central scene configuration module

**Why:** Every requirement in the spec explicitly asks for variables to be "easily locatable ... to modify" — font size, spacing, alignment, shadow, per-block scroll timing, per-block screen position, colors, audio params, corridor dimensions. This task creates the single file all of that lives in, populated with real default values, fully commented, so later tasks only *import* from it.

**Files:**
- Create: `app/lib/sceneConfig.ts`
- Test: `app/lib/sceneConfig.test.ts`

- [ ] **Step 1: Write the failing test (structural sanity — 5 blocks, monotonically increasing start instances)**

Create `app/lib/sceneConfig.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TEXT_BLOCKS, TEXT_BLOCK_DURATION_INSTANCES } from './sceneConfig';

describe('sceneConfig text blocks', () => {
  it('defines exactly 5 blocks, each with 4 lines', () => {
    expect(TEXT_BLOCKS).toHaveLength(5);
    TEXT_BLOCKS.forEach((b) => expect(b.lines).toHaveLength(4));
  });

  it('first block starts after 2 scroll instances', () => {
    expect(TEXT_BLOCKS[0].startInstance).toBe(2);
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- sceneConfig`
Expected: FAIL — `Cannot find module './sceneConfig'`

- [ ] **Step 3: Implement the full config file**

Create `app/lib/sceneConfig.ts`:

```ts
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
  // DEFAULT_SCENE_COLORS.corridorWallStart/End below, the single
  // source of truth the debug menu's color pickers also read/write.
  finalLinkText: 'IR A LA SIMULACION',
  finalLinkUrl: 'https://efectodoppler.vercel.app',
};

/* ── 10) SHARED FONT ────────────────────────────────────────────── */
export const MICHROMA_CSS_VAR = '--font-michroma';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- sceneConfig`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/lib/sceneConfig.ts app/lib/sceneConfig.test.ts
git commit -m "feat: add central scene config for all Doppler-experience tunables"
```

---

## Task 3: Extract shared GLSL helpers (DRY refactor)

**Why:** `Section1.tsx` already defines `hash21`/`noise`/`fbm`/`hsv2rgb` GLSL inline inside `FLOW_FRAG` and again inside `SPH_FRAG`/`STAR_VERT`. Task 16 (corridor shader) needs the same helpers a third time. Extract once now so all three shaders share one source of truth.

**Files:**
- Create: `app/lib/shaders/common.ts`
- Modify: `app/components/Section1.tsx:28-283` (shader string definitions only)

- [ ] **Step 1: Create the shared GLSL snippet module**

Create `app/lib/shaders/common.ts`:

```ts
/** Shared GLSL helper functions, injected via template-literal composition. */

export const HASH_NOISE_FBM_GLSL = /* glsl */ `
  float hash21(vec2 p) {
    p  = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 17.19);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i),           hash21(i+vec2(1,0)), f.x),
               mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.50;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p  = p * 2.1 + vec2(3.11, 1.73);
      a *= 0.50;
    }
    return v;
  }
`;

export const HSV2RGB_GLSL = /* glsl */ `
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    return c.z * mix(K.xxx, clamp(abs(fract(c.xxx+K.xyz)*6.0-K.www)-K.xxx, 0.0, 1.0), c.y);
  }
`;
```

- [ ] **Step 2: Use it inside `Section1.tsx`'s shader strings**

In `app/components/Section1.tsx`, add the import and splice the helpers into `STAR_VERT`, `FLOW_FRAG`, and `SPH_FRAG`, removing the now-duplicated inline copies:

```ts
import { HASH_NOISE_FBM_GLSL, HSV2RGB_GLSL } from '@/app/lib/shaders/common';
```

In `STAR_VERT`, replace the inline `hsv2rgb` function body with `${HSV2RGB_GLSL}` spliced in right after the `uniform float uTime;` line (template literal: `` `... uniform float uTime; ${HSV2RGB_GLSL} void main() {...` ``).

In `FLOW_FRAG`, remove the inline `hash21`/`noise`/`fbm`/`hsv2rgb` bodies and splice `${HASH_NOISE_FBM_GLSL}${HSV2RGB_GLSL}` in their place, right after the uniform/varying declarations and before `void main()`.

In `SPH_FRAG`, remove the inline `hsv2rgb` body and splice `${HSV2RGB_GLSL}` in the same position.

- [ ] **Step 3: Manual visual regression check**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: scene renders identically to before this task — flow lines, sphere chrome/glow transition, and star twinkle all unchanged. If any shader fails to compile, the canvas goes black and the browser console shows a `THREE.WebGLProgram` compile error — check for a stray duplicate function definition (both the inline copy and the spliced-in copy present) or a missing `${...}` splice.

- [ ] **Step 4: Commit**

```bash
git add app/lib/shaders/common.ts app/components/Section1.tsx
git commit -m "refactor: extract shared GLSL noise/fbm/hsv2rgb helpers"
```

---

## Task 4: Michroma font + simplified title (remove glitch effects)

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/components/Section1.tsx` (title block + remove `TEXT_EFFECTS`/`fx-*` CSS and the `textFxInterval` logic)

- [ ] **Step 1: Load Michroma via `next/font/google` in the root layout**

Modify `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, Michroma } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const michroma = Michroma({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-michroma",
});

export const metadata: Metadata = {
  title: "Efecto Doppler",
  description: "Portfolio interactivo — simulación del efecto Doppler",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${michroma.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Remove the glitch/wave/flicker/scanline/dissolve/neon text-fx system**

In `app/components/Section1.tsx`:
1. Delete the entire `TEXT_EFFECTS` array, the `textFxIdx`/`textFxInterval` block (the `setInterval` that swaps `fx-*` classes), and its `clearInterval(textFxInterval)` cleanup line.
2. Delete the `@keyframes kGlitch/kWave/kFlicker/kScan/kDissolve/kNeon` blocks and their `.fx-*` class rules from the inline `<style>` tag (keep `@import` for now — Bebas Neue is removed in the next step, `currentsArrow`/`titlePulse` keyframes stay, they're used by the scroll indicator and title pulse).
3. Remove the `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue...')` line — Michroma now comes from `next/font`, no external CSS import needed.

- [ ] **Step 3: Replace the title JSX with the config-driven, Michroma version**

Import at the top of `Section1.tsx`:

```ts
import { TITLE_CONFIG, shadowToCss } from '@/app/lib/sceneConfig';
```

Replace the title `<div>` block:

```tsx
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
```

- [ ] **Step 4: Manual check**

Run: `npm run dev`. Confirm: title reads "EFFECTO DOPPLER" in the Michroma font, white fill, short black offset shadow (no chroma glitch/shake/flicker at any point during the first 20% of scroll — the old 5-second interval effects are gone entirely).

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx app/components/Section1.tsx
git commit -m "feat: simplify title to static Michroma text, remove glitch text-fx system"
```

---

## Task 5: Scroll-instance timeline math (pure functions)

**Files:**
- Create: `app/lib/scrollTimeline.ts`
- Test: `app/lib/scrollTimeline.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/lib/scrollTimeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeBlockOpacity, computeScrollInstance } from './scrollTimeline';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- scrollTimeline`
Expected: FAIL — `Cannot find module './scrollTimeline'`

- [ ] **Step 3: Implement**

Create `app/lib/scrollTimeline.ts`:

```ts
import { TEXT_BLOCK_DURATION_INSTANCES } from './sceneConfig';

/**
 * Converts a raw scroll offset (px, measured from the top of the
 * Section1 container) into "scroll instances" — 1 instance = 1
 * viewport height. This is the shared timeline unit for text blocks
 * and the final phase (see sceneConfig.ts).
 */
export function computeScrollInstance(scrolledPx: number, viewportHeightPx: number): number {
  if (viewportHeightPx <= 0) return 0;
  return Math.max(0, scrolledPx / viewportHeightPx);
}

/**
 * Opacity of a text block given the current scroll instance and the
 * block's configured start instance. Spec timing, per block:
 *   [start,   start+1) → fade in 0 → 1 (linear)
 *   [start+1, start+2) → held at 1
 *   [start+2, start+3) → fade out 1 → 0 (linear)
 *   otherwise          → 0
 */
export function computeBlockOpacity(
  scrollInstance: number,
  startInstance: number,
  durationInstances: number = TEXT_BLOCK_DURATION_INSTANCES
): number {
  const t = scrollInstance - startInstance;
  if (t <= 0 || t >= durationInstances) return 0;
  if (t < 1) return t;
  if (t < durationInstances - 1) return 1;
  return Math.max(0, durationInstances - t);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- scrollTimeline`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add app/lib/scrollTimeline.ts app/lib/scrollTimeline.test.ts
git commit -m "feat: add pure scroll-instance timeline math with unit tests"
```

---

## Task 6: `ScrollTextBlocks` component + Section1 integration

**Files:**
- Create: `app/components/ScrollTextBlocks.tsx`
- Modify: `app/components/Section1.tsx` (container height, scroll handler, animate loop, JSX)

- [ ] **Step 1: Create the presentational component**

Create `app/components/ScrollTextBlocks.tsx`:

```tsx
'use client';

import { forwardRef } from 'react';
import { TEXT_BLOCKS, shadowToCss } from '@/app/lib/sceneConfig';

/**
 * Renders the 5 scroll-timed text blocks. Opacity is NOT driven by
 * React state (would re-render every scroll frame) — Section1's
 * rAF loop writes `style.opacity` directly onto these refs each
 * frame via `blockRefs`. See app/lib/scrollTimeline.ts for the math
 * and app/lib/sceneConfig.ts TEXT_BLOCKS for position/size/timing.
 */
const ScrollTextBlocks = forwardRef<HTMLDivElement[], object>(function ScrollTextBlocks(_props, ref) {
  return (
    <>
      {TEXT_BLOCKS.map((block, i) => (
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
            textShadow: shadowToCss(block.shadow),
            ...block.position,
          }}
        >
          {block.lines.map((line, li) => (
            <div key={li}>{line}</div>
          ))}
        </div>
      ))}
    </>
  );
});

export default ScrollTextBlocks;
```

- [ ] **Step 2: Wire refs, container height, and per-frame opacity updates into `Section1.tsx`**

Add imports:

```ts
import ScrollTextBlocks from '@/app/components/ScrollTextBlocks';
import { computeBlockOpacity, computeScrollInstance } from '@/app/lib/scrollTimeline';
import {
  TEXT_BLOCKS,
  INTRO_CAMERA_INSTANCES,
  FINAL_PHASE_START_INSTANCE,
  FINAL_PHASE_DURATION_INSTANCES,
} from '@/app/lib/sceneConfig';
```

Add a ref for the block DOM nodes, next to the existing refs:

```ts
const textBlockRefs = useRef<HTMLDivElement[]>([]);
const scrollInstanceRef = useRef(0); // raw scroll timeline position, in "instances"
```

Replace `onScroll` (it currently writes a single normalized `scrollRef.current`) so it also computes the raw instance value:

```ts
function onScroll() {
  const scrolled = window.scrollY - container.offsetTop;
  const instance = computeScrollInstance(Math.max(0, scrolled), window.innerHeight);
  scrollInstanceRef.current = instance;
  // Camera choreography progress: 0..1 over the first INTRO_CAMERA_INSTANCES,
  // then held at 1 (matches the existing "fixed camera" final look) until
  // the final zoom phase (Task 15) takes over.
  scrollRef.current = Math.max(0, Math.min(1, instance / INTRO_CAMERA_INSTANCES));
}
```

In `animate()`, after the existing uniform/camera updates, add the per-block opacity write:

```ts
const instance = scrollInstanceRef.current;
TEXT_BLOCKS.forEach((block, i) => {
  const el = textBlockRefs.current[i];
  if (el) el.style.opacity = String(computeBlockOpacity(instance, block.startInstance));
});
```

- [ ] **Step 3: Size the scroll runway to fit the intro, all 5 blocks, and the final phase**

Replace the container's hardcoded `height: '400vh'` with a computed value:

```ts
const TOTAL_SCROLL_INSTANCES =
  FINAL_PHASE_START_INSTANCE + FINAL_PHASE_DURATION_INSTANCES + 1; // +1 = settle buffer at the end
```

In the JSX:

```tsx
<div
  ref={containerRef}
  style={{ position: 'relative', height: `${(TOTAL_SCROLL_INSTANCES + 1) * 100}vh` }}
>
```

(The container itself is `viewport + scrollable` tall, matching the original component's convention where the sticky child is 100vh and the container needs `scrollable + 100vh` total.)

- [ ] **Step 4: Render the blocks inside the sticky viewport**

Add `<ScrollTextBlocks ref={textBlockRefs} />` inside the `sticky` wrapper div, after the canvas `mountRef` div and before the `<style>` tag.

- [ ] **Step 5: Manual check**

Run: `npm run dev`. Scroll down slowly. Expected: block 1 begins fading in exactly 1 viewport-height after block 1's `startInstance` (2) is reached — i.e. 2 full window-heights of scroll from the top — reaches full opacity after 1 more window-height, holds for 1, then fades out over the next. Blocks 2–5 follow at their configured `startInstance`s with no visual overlap. Resize the window and confirm the timing (in scroll distance) rescales correctly since it's viewport-height-relative.

- [ ] **Step 6: Commit**

```bash
git add app/components/ScrollTextBlocks.tsx app/components/Section1.tsx
git commit -m "feat: add 5 scroll-triggered text blocks with fade in/hold/fade out timing"
```

---

## Task 7: `SceneControlsContext` (shared state for colors + audio prefs)

**Why:** The debug menu (React state, Task 10) and the imperative Three.js/audio side (Section1, Tasks 11–12) need a shared source of truth. The context owns only *state*; Section1 is responsible for reacting to it (side effects live in Section1's `useEffect`s, not in the context).

**Files:**
- Create: `app/lib/SceneControlsContext.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create the context + provider**

Create `app/lib/SceneControlsContext.tsx`:

```tsx
'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SCENE_COLORS, type SceneColorKey } from '@/app/lib/sceneConfig';

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
}

const SceneControlsContext = createContext<SceneControlsValue | null>(null);

export function SceneControlsProvider({ children }: { children: ReactNode }) {
  const [colors, setColors] = useState<Record<SceneColorKey, string>>({ ...DEFAULT_SCENE_COLORS });
  const [audioSourceMode, setAudioSourceMode] = useState<AudioSourceMode>('tone');
  const [toneFrequencyHz, setToneFrequencyHz] = useState(220);
  const [arpeggioMode, setArpeggioMode] = useState<ArpeggioMode>('minor');
  const [uploadedFile, setUploadedFileState] = useState<File | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!uploadedFile) {
      setUploadedFileUrl(null);
      return;
    }
    const url = URL.createObjectURL(uploadedFile);
    setUploadedFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [uploadedFile]);

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
      setUploadedFile: setUploadedFileState,
    }),
    [colors, audioSourceMode, toneFrequencyHz, arpeggioMode, uploadedFileUrl]
  );

  return <SceneControlsContext.Provider value={value}>{children}</SceneControlsContext.Provider>;
}

export function useSceneControls(): SceneControlsValue {
  const ctx = useContext(SceneControlsContext);
  if (!ctx) throw new Error('useSceneControls must be used within SceneControlsProvider');
  return ctx;
}
```

- [ ] **Step 2: Wrap the page in the provider**

Modify `app/page.tsx`:

```tsx
import Section1 from '@/app/components/Section1';
import DebugMenu from '@/app/components/DebugMenu';
import { SceneControlsProvider } from '@/app/lib/SceneControlsContext';

export default function Home() {
  return (
    <SceneControlsProvider>
      <main>
        <Section1 />
        <DebugMenu />
      </main>
    </SceneControlsProvider>
  );
}
```

(`DebugMenu` doesn't exist yet — Task 10 creates it. This step will not compile until then; that's expected and fine since both tasks land in the same work session before the next `npm run dev` check.)

- [ ] **Step 3: Commit**

```bash
git add app/lib/SceneControlsContext.tsx app/page.tsx
git commit -m "feat: add SceneControlsContext for debug-menu-driven colors and audio prefs"
```

---

## Task 8: Audio math (pure functions, unit tested)

**Why:** These are the only genuinely pure pieces of the audio system — everything else touches `AudioContext`, which doesn't exist under Vitest's node environment. Isolating the math here means the doppler mapping, filter-frequency mapping, and contact ramping are actually verified, not just eyeballed.

**Files:**
- Create: `app/lib/audioMath.ts`
- Test: `app/lib/audioMath.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/lib/audioMath.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- audioMath`
Expected: FAIL — `Cannot find module './audioMath'`

- [ ] **Step 3: Implement**

Create `app/lib/audioMath.ts`:

```ts
/** Geometric (logarithmic) interpolation — correct for frequency sweeps, unlike linear lerp. */
export function lerpLog(a: number, b: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return a * Math.pow(b / a, clamped);
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
  const t = Math.max(0, Math.min(1, speedUnitsPerSec / cfg.dopplerSpeedForMaxRate));
  const rate = 1.0 + t * (cfg.dopplerMaxPlaybackRate - 1.0);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- audioMath`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add app/lib/audioMath.ts app/lib/audioMath.test.ts
git commit -m "feat: add unit-tested doppler/filter/contact math for the audio system"
```

---

## Task 9: `AudioEngine` — Web Audio graph (3 source modes, doppler pitch, dual progressive filters)

**Why:** This is the runtime engine behind requirements "sistema de audio" and "tres tipos de fuentes de audio." It has no automated test (jsdom doesn't implement `AudioContext`) — verification is manual, listed at the end of the task. All frequency/rate math is delegated to the already-tested `app/lib/audioMath.ts`.

**Files:**
- Create: `app/lib/audioEngine.ts`

- [ ] **Step 1: Implement the engine**

Create `app/lib/audioEngine.ts`:

```ts
import { AUDIO_CONFIG } from '@/app/lib/sceneConfig';
import { lerpLog, speedToPlaybackRate } from '@/app/lib/audioMath';
import { withBasePath } from '@/app/lib/basePath';
import type { ArpeggioMode, AudioSourceMode } from '@/app/lib/SceneControlsContext';

const FILTER_GLIDE_SECONDS = 0.05;
const PITCH_GLIDE_SECONDS = 0.08;

/**
 * Owns the entire Web Audio graph for the Doppler experience:
 *
 *   [source: <audio> el | oscillator (tone) | oscillator (arpeggio)]
 *     → lowpass (BiquadFilterNode)
 *     → highpass (BiquadFilterNode)
 *     → masterGain
 *     → destination
 *
 * `setDopplerSpeed` drives pitch (playbackRate for the file source,
 * oscillator.frequency multiplier for tone/arpeggio).
 * `setLowpassAmount` / `setHighpassAmount` drive the two light-beam filters.
 *
 * Must call `resume()` from inside a user-gesture event handler before
 * any sound is audible (browser autoplay policy).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private highpass: BiquadFilterNode | null = null;

  private mode: AudioSourceMode = 'tone';
  private dopplerRate = 1; // smoothed playbackRate-equivalent multiplier

  private audioEl: HTMLAudioElement | null = null;
  private mediaSourceNode: MediaElementAudioSourceNode | null = null;

  private oscillator: OscillatorNode | null = null;
  private baseToneFrequencyHz = AUDIO_CONFIG.defaultToneFrequencyHz;

  private arpeggioTimer: ReturnType<typeof setInterval> | null = null;
  private arpeggioIndex = 0;
  private arpeggioModeValue: ArpeggioMode = 'minor';

  /** Lazily creates the AudioContext + filter/gain chain. Safe to call multiple times. */
  private ensureGraph(): { ctx: AudioContext; lowpass: BiquadFilterNode; highpass: BiquadFilterNode } {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = AUDIO_CONFIG.lowpassOpenHz;

      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = AUDIO_CONFIG.highpassOpenHz;

      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.7;

      lowpass.connect(highpass);
      highpass.connect(masterGain);
      masterGain.connect(ctx.destination);

      this.ctx = ctx;
      this.lowpass = lowpass;
      this.highpass = highpass;
      this.masterGain = masterGain;
    }
    return { ctx: this.ctx, lowpass: this.lowpass!, highpass: this.highpass! };
  }

  /** Call from inside a user-gesture event handler (click/scroll/keydown). */
  async resume(): Promise<void> {
    const { ctx } = this.ensureGraph();
    if (ctx.state === 'suspended') await ctx.resume();
  }

  private teardownSource(): void {
    if (this.audioEl) {
      this.audioEl.pause();
      this.mediaSourceNode?.disconnect();
      this.audioEl = null;
      this.mediaSourceNode = null;
    }
    if (this.oscillator) {
      this.oscillator.stop();
      this.oscillator.disconnect();
      this.oscillator = null;
    }
    if (this.arpeggioTimer !== null) {
      clearInterval(this.arpeggioTimer);
      this.arpeggioTimer = null;
    }
  }

  /**
   * Switches the active source. `fileUrl` defaults to the bundled
   * /audio.mp3 (basePath-aware) when the user hasn't uploaded one.
   */
  setSource(
    mode: AudioSourceMode,
    opts: { fileUrl?: string | null; toneFrequencyHz?: number; arpeggioMode?: ArpeggioMode } = {}
  ): void {
    const { ctx, lowpass } = this.ensureGraph();
    this.teardownSource();
    this.mode = mode;

    if (mode === 'file') {
      const el = new Audio(opts.fileUrl ?? withBasePath(AUDIO_CONFIG.defaultMp3Path));
      el.loop = true;
      el.crossOrigin = 'anonymous';
      // Pitch must move WITH playbackRate for the doppler effect to be audible.
      (el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = false;
      (el as HTMLAudioElement & { mozPreservesPitch?: boolean }).mozPreservesPitch = false;
      (el as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = false;
      el.playbackRate = this.dopplerRate;
      const node = ctx.createMediaElementSource(el);
      node.connect(lowpass);
      el.play().catch(() => {
        /* blocked until resume() runs from a user gesture — retried by caller */
      });
      this.audioEl = el;
      this.mediaSourceNode = node;
      return;
    }

    if (mode === 'tone') {
      this.baseToneFrequencyHz = opts.toneFrequencyHz ?? this.baseToneFrequencyHz;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = this.baseToneFrequencyHz * this.dopplerRate;
      osc.connect(lowpass);
      osc.start();
      this.oscillator = osc;
      return;
    }

    // mode === 'arpeggio'
    this.arpeggioModeValue = opts.arpeggioMode ?? this.arpeggioModeValue;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.connect(lowpass);
    osc.start();
    this.oscillator = osc;
    this.arpeggioIndex = 0;
    this.arpeggioTimer = setInterval(() => this.stepArpeggio(), AUDIO_CONFIG.arpeggioNoteMs);
    this.stepArpeggio();
  }

  private stepArpeggio(): void {
    if (!this.oscillator || !this.ctx) return;
    const notes = AUDIO_CONFIG.arpeggioChords[this.arpeggioModeValue];
    const note = notes[this.arpeggioIndex % notes.length];
    this.arpeggioIndex++;
    this.oscillator.frequency.setTargetAtTime(note * this.dopplerRate, this.ctx.currentTime, PITCH_GLIDE_SECONDS);
  }

  /** Live-updates the tone frequency while in 'tone' mode (no-op otherwise). */
  setToneFrequency(hz: number): void {
    this.baseToneFrequencyHz = hz;
    if (this.mode === 'tone' && this.oscillator && this.ctx) {
      this.oscillator.frequency.setTargetAtTime(hz * this.dopplerRate, this.ctx.currentTime, PITCH_GLIDE_SECONDS);
    }
  }

  /** Live-updates the arpeggio key while in 'arpeggio' mode (no-op otherwise). */
  setArpeggioMode(mode: ArpeggioMode): void {
    this.arpeggioModeValue = mode;
  }

  /**
   * Called every animation frame with the current sphere speed
   * (world units/sec). Maps to a playbackRate-equivalent multiplier
   * and applies it to whichever source is active.
   */
  setDopplerSpeed(speedUnitsPerSec: number): void {
    const target = speedToPlaybackRate(speedUnitsPerSec, AUDIO_CONFIG);
    this.dopplerRate += (target - this.dopplerRate) * AUDIO_CONFIG.dopplerSmoothing;

    if (this.audioEl) {
      this.audioEl.playbackRate = this.dopplerRate;
    } else if (this.oscillator && this.ctx && this.mode === 'tone') {
      this.oscillator.frequency.setTargetAtTime(
        this.baseToneFrequencyHz * this.dopplerRate,
        this.ctx.currentTime,
        PITCH_GLIDE_SECONDS
      );
    }
    // Arpeggio mode picks up the new dopplerRate on its next stepArpeggio() tick.
  }

  /** amount: 0 = fully open (no effect), 1 = only bass frequencies remain. */
  setLowpassAmount(amount: number): void {
    if (!this.lowpass || !this.ctx) return;
    const hz = lerpLog(AUDIO_CONFIG.lowpassOpenHz, AUDIO_CONFIG.lowpassClosedHz, amount);
    this.lowpass.frequency.setTargetAtTime(hz, this.ctx.currentTime, FILTER_GLIDE_SECONDS);
  }

  /** amount: 0 = fully open (no effect), 1 = only treble frequencies remain. */
  setHighpassAmount(amount: number): void {
    if (!this.highpass || !this.ctx) return;
    const hz = lerpLog(AUDIO_CONFIG.highpassOpenHz, AUDIO_CONFIG.highpassClosedHz, amount);
    this.highpass.frequency.setTargetAtTime(hz, this.ctx.currentTime, FILTER_GLIDE_SECONDS);
  }

  dispose(): void {
    this.teardownSource();
    this.masterGain?.disconnect();
    this.lowpass?.disconnect();
    this.highpass?.disconnect();
    this.ctx?.close();
    this.ctx = null;
  }
}
```

- [ ] **Step 2: Manual check (source switching + doppler audible)**

This requires Task 12 (mounting the engine in `Section1`) to be wired first — come back to this checklist item after Task 12 lands:
Run `npm run dev`, open the debug menu (Task 10), select "tono puro," confirm a steady sine tone plays after the first click/scroll (autoplay policy). Move the mouse fast: pitch rises. Let it settle: pitch returns to the base frequency. Switch to "arpegio," confirm a repeating chord pattern. Switch to "archivo," confirm it falls back to `/audio.mp3` silently (or plays, if you've dropped a file there — note in the QA task that this file is NOT included in the repo and must be supplied).

- [ ] **Step 3: Commit**

```bash
git add app/lib/audioEngine.ts
git commit -m "feat: add AudioEngine (3 sources, doppler pitch, dual progressive filters)"
```

---

## Task 10: `DebugMenu` — Shift-activated panel (colors + audio source)

**Files:**
- Create: `app/components/DebugMenu.tsx`

- [ ] **Step 1: Implement the panel**

Create `app/components/DebugMenu.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useSceneControls } from '@/app/lib/SceneControlsContext';
import { DEFAULT_SCENE_COLORS, COLOR_PALETTE_PRESETS, AUDIO_CONFIG, type SceneColorKey } from '@/app/lib/sceneConfig';

const COLOR_LABELS: Record<SceneColorKey, string> = {
  flowBackground: 'Fondo del escenario',
  flowLineLavender: 'Líneas — lavanda',
  flowLinePink: 'Líneas — rosa',
  flowLineAmber: 'Líneas — ámbar',
  flowNearSphereGlow: 'Halo cerca de la esfera',
  sphereChromeHighlight: 'Brillo cromado (esfera)',
  starColor: 'Estrellas',
  beamLowpass: 'Haz — pasa bajos',
  beamHighpass: 'Haz — pasa altos',
  corridorWallStart: 'Pasillo — pared inicial',
  corridorWallEnd: 'Pasillo — pared final',
};

/**
 * Debug panel — press Shift to toggle. Two sections:
 *  1) Color pickers (per-element, native <input type="color">) + curated palette presets.
 *  2) Audio source: mp3 file (upload or default /audio.mp3), pure tone (frequency slider),
 *     or minor/major arpeggio.
 * All state lives in SceneControlsContext (app/lib/SceneControlsContext.tsx); this
 * component only renders controls for it.
 */
export default function DebugMenu() {
  const [open, setOpen] = useState(false);
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
  } = useSceneControls();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Shift' && !e.repeat) setOpen((v) => !v);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        width: 300,
        maxHeight: '90vh',
        overflowY: 'auto',
        zIndex: 1000,
        background: 'rgba(10, 8, 20, 0.92)',
        color: '#f0f0f5',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        borderRadius: 10,
        padding: 14,
        boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
        border: '1px solid rgba(255,255,255,0.12)',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, letterSpacing: '0.05em' }}>
        DEBUG MENU <span style={{ opacity: 0.5, fontWeight: 400 }}>(Shift para cerrar)</span>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Paletas</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {COLOR_PALETTE_PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => applyColorPreset(preset.colors)}
              style={{
                fontSize: 11,
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
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Colores</div>
        {(Object.keys(DEFAULT_SCENE_COLORS) as SceneColorKey[]).map((key) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
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

      <div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Fuente de audio</div>
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
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setUploadedFile(e.target.files?.[0] ?? null)}
            />
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
          <div style={{ marginLeft: 20 }}>
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
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual check**

Run: `npm run dev`. Press Shift: panel opens top-right. Press Shift again: it closes. Change a color: no visible scene effect yet (wired in Task 11). Switch audio source radios: UI updates; audible effect lands in Task 12.

- [ ] **Step 3: Commit**

```bash
git add app/components/DebugMenu.tsx
git commit -m "feat: add Shift-activated debug menu (color pickers, palettes, audio source controls)"
```

---

## Task 11: Wire debug-menu colors into the shader uniforms

**Files:**
- Modify: `app/components/Section1.tsx` (shader color constants → uniforms; add color-sync effect)

- [ ] **Step 1: Turn hardcoded shader colors into uniforms**

In `FLOW_FRAG` (inside `app/components/Section1.tsx`), add uniform declarations near the top (alongside the existing `uniform float uTime;` etc.):

```glsl
uniform vec3 uBgColor;
uniform vec3 uLineLavender;
uniform vec3 uLinePink;
uniform vec3 uLineAmber;
uniform vec3 uNearGlow;
```

Then replace the 5 hardcoded color lines inside `main()`:

```glsl
vec3 bg = uBgColor;
...
vec3  cLav   = uLineLavender;
vec3  cPink  = uLinePink;
vec3  cAmber = uLineAmber;
...
lineCol       = mix(lineCol, uNearGlow, nearSph * 0.72);
```

In `SPH_FRAG`, add `uniform vec3 uChromeHighlight;` and replace the key-light specular tint:

```glsl
vec3  metal = metalCol
            + uChromeHighlight * sp1
            + vec3(0.55, 0.38, 0.88) * sp2
            + vec3(0.90, 0.52, 0.10) * sp3;
```

In `STAR_VERT`, add `uniform vec3 uStarTint;` and tint the computed color right before it's written to the varying:

```glsl
vColor = hsv2rgb(vec3(hue, sat, twinkle)) * uStarTint;
```

- [ ] **Step 2: Expose the uniform objects outside the mount effect**

`flowUniforms`, `sphUniforms`, and `starUniforms` are currently `const`s local to the single mount `useEffect`. Add refs above it so a second effect can reach them:

```ts
const flowUniformsRef = useRef<Record<string, THREE.IUniform> | null>(null);
const sphUniformsRef  = useRef<Record<string, THREE.IUniform> | null>(null);
const starUniformsRef = useRef<Record<string, THREE.IUniform> | null>(null);
```

Inside the mount effect, after each uniforms object literal is created, assign it and add the 5 new color entries (default values come from `DEFAULT_SCENE_COLORS` so the very first frame — before the color-sync effect runs — already matches). Update the three uniform object literals:

```ts
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
```

```ts
const sphUniforms: Record<string, THREE.IUniform> = {
  uProgress: { value: 0 },
  uTime:     { value: 0 },
  uChromeHighlight: { value: new THREE.Color(DEFAULT_SCENE_COLORS.sphereChromeHighlight) },
};
sphUniformsRef.current = sphUniforms;
```

```ts
const starUniforms: Record<string, THREE.IUniform> = {
  uTime: { value: 0 },
  uStarTint: { value: new THREE.Color(DEFAULT_SCENE_COLORS.starColor) },
};
starUniformsRef.current = starUniforms;
```

Add the import: `import { DEFAULT_SCENE_COLORS } from '@/app/lib/sceneConfig';` (alongside the other `sceneConfig` imports from Task 6).

- [ ] **Step 3: Read the context and add the color-sync effect**

Add the import and hook call at the top of the `Section1` function body:

```ts
import { useSceneControls } from '@/app/lib/SceneControlsContext';
```

```ts
export default function Section1() {
  const { colors } = useSceneControls();
  // ...existing refs...
```

`animate()` is defined once inside the mount effect (`useEffect(() => {...}, [])`) and runs forever via `requestAnimationFrame` from that single closure — it will **never** see a fresh `colors` object on its own, because the mount effect doesn't re-run when context state changes. Anything inside `animate()` that needs the *current* colors (Task 19's corridor construction does) must read them off a ref, not off the `colors` variable directly. Add that ref now, next to the other top-level refs:

```ts
const colorsRef = useRef(colors);
useEffect(() => {
  colorsRef.current = colors;
}, [colors]);
```

Then add a second `useEffect`, after the mount effect, that pushes color changes into the live uniforms whenever the debug menu changes them — this one runs on React's normal render/commit cycle (not inside the rAF loop), so it always has the latest `colors`:

```ts
useEffect(() => {
  flowUniformsRef.current?.uBgColor.value.set(colors.flowBackground);
  flowUniformsRef.current?.uLineLavender.value.set(colors.flowLineLavender);
  flowUniformsRef.current?.uLinePink.value.set(colors.flowLinePink);
  flowUniformsRef.current?.uLineAmber.value.set(colors.flowLineAmber);
  flowUniformsRef.current?.uNearGlow.value.set(colors.flowNearSphereGlow);
  sphUniformsRef.current?.uChromeHighlight.value.set(colors.sphereChromeHighlight);
  starUniformsRef.current?.uStarTint.value.set(colors.starColor);
}, [colors]);
```

(Task 14 and Task 19 each extend this same effect with a couple more lines — for the beams' colors and the corridor's end-wall colors respectively.)

- [ ] **Step 4: Manual check**

Run: `npm run dev`. Press Shift, change "Fondo del escenario" — the plane background recolors live. Try "Líneas — lavanda/rosa/ámbar," "Halo cerca de la esfera," "Brillo cromado (esfera)," and "Estrellas" — each should visibly change its target element within the same frame. Click a palette preset ("Monochrome ice," "Sunset") — all its listed colors update together.

- [ ] **Step 5: Commit**

```bash
git add app/components/Section1.tsx
git commit -m "feat: wire debug-menu color pickers into live shader uniforms"
```

---

## Task 12: Mount `AudioEngine`, unlock on gesture, wire source/tone/arpeggio changes

**Files:**
- Modify: `app/components/Section1.tsx`

- [ ] **Step 1: Create the engine at mount, dispose on unmount**

Add imports and a ref at the top of `Section1.tsx`:

```ts
import { AudioEngine } from '@/app/lib/audioEngine';
```

```ts
const audioEngineRef = useRef<AudioEngine | null>(null);
```

At the very start of the existing mount `useEffect` body (before the renderer is created), instantiate it:

```ts
audioEngineRef.current = new AudioEngine();
```

In that same effect's cleanup function (where `renderer.dispose()` etc. already run), add:

```ts
audioEngineRef.current?.dispose();
audioEngineRef.current = null;
```

- [ ] **Step 2: Unlock audio on the first user gesture**

Add a second `useEffect`, mounted once, that resumes the (autoplay-blocked) context on the first interaction and then removes itself:

```ts
useEffect(() => {
  function unlock() {
    audioEngineRef.current?.resume();
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
```

- [ ] **Step 3: React to debug-menu audio changes — split by cost to avoid audio glitches**

Pull the audio prefs out of context (extend the existing `useSceneControls()` destructure from Task 11):

```ts
const { colors, audioSourceMode, toneFrequencyHz, arpeggioMode, uploadedFileUrl } = useSceneControls();
```

Add three effects. The first rebuilds the source graph (only on an actual mode/file switch — expensive, audible click is expected here):

```ts
useEffect(() => {
  audioEngineRef.current?.setSource(audioSourceMode, {
    fileUrl: uploadedFileUrl,
    toneFrequencyHz,
    arpeggioMode,
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [audioSourceMode, uploadedFileUrl]);
```

The other two are cheap live-parameter updates (e.g. dragging the frequency slider) that must NOT tear down/recreate the oscillator:

```ts
useEffect(() => {
  audioEngineRef.current?.setToneFrequency(toneFrequencyHz);
}, [toneFrequencyHz]);

useEffect(() => {
  audioEngineRef.current?.setArpeggioMode(arpeggioMode);
}, [arpeggioMode]);
```

- [ ] **Step 4: Manual check**

Run: `npm run dev`. Click anywhere on the page (unlocks audio), press Shift, confirm "Tono puro" is already playing a steady 220 Hz sine. Drag the frequency slider: pitch glides smoothly with no clicks/dropouts. Switch to "Arpegio": a repeating chord pattern starts (a brief click on the switch itself is expected — that's the new oscillator starting). Switch to "Archivo MP3" with no file uploaded: confirm no crash (browser blocks the 404 gracefully; leave a real `/public/audio.mp3` in place before doing final QA in Task 20).

- [ ] **Step 5: Commit**

```bash
git add app/components/Section1.tsx
git commit -m "feat: mount AudioEngine, unlock on gesture, wire debug-menu audio source changes"
```

---

## Task 13: Doppler pitch driven by sphere speed

**Files:**
- Modify: `app/components/Section1.tsx` (`animate()`)

- [ ] **Step 1: Compute sphere speed and feed it to the engine every frame**

In `animate()`, the spring physics block already computes `spring.vx`/`spring.vz` (position delta applied *this frame*, i.e. world-units-per-frame, not per-second). Right after the existing lines:

```ts
spring.x += spring.vx;
spring.z += spring.vz;
```

add:

```ts
/* World-units/second speed → drives the doppler pitch shift (Task 13). */
const sphereSpeed = dt > 0 ? Math.sqrt(spring.vx * spring.vx + spring.vz * spring.vz) / dt : 0;
audioEngineRef.current?.setDopplerSpeed(sphereSpeed);
```

(`dt` is already computed earlier in `animate()` as `Math.min(clock.getDelta(), 0.05)`.)

- [ ] **Step 2: Manual check**

Run: `npm run dev`, unlock audio (click), press Shift → confirm "Tono puro" selected. Hold the mouse still: pitch sits at the base frequency (220 Hz). Flick the mouse rapidly left-right: pitch rises noticeably above base. Stop moving: pitch eases back down to base over a fraction of a second (the `dopplerSmoothing` constant in `AUDIO_CONFIG`, `app/lib/sceneConfig.ts`, controls how snappy this feels — lower = smoother/slower). Confirm the effect is audible in "Arpegio" and "Archivo MP3" modes too (arpeggio notes shift key on their next tick; the mp3's tempo+pitch shift together, per the `preservesPitch = false` choice made in Task 9).

- [ ] **Step 3: Commit**

```bash
git add app/components/Section1.tsx
git commit -m "feat: drive audio doppler pitch from real-time sphere speed"
```

---

## Task 14: Light beams on the scenario + progressive lowpass/highpass on contact

**Files:**
- Modify: `app/components/Section1.tsx`

- [ ] **Step 1: Add the two beam meshes to the scene**

Add the import (alongside the other `sceneConfig` imports):

```ts
import { LIGHT_BEAMS } from '@/app/lib/sceneConfig';
import { stepContactAmount } from '@/app/lib/audioMath';
```

In the mount effect, after the sphere is added to the scene, add the two beams:

```ts
/* ── Light beams — contact triggers progressive audio filters ──── */
const BEAM_HEIGHT = 14;
function makeBeam(x: number, z: number, colorHex: string): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(0.6, 1.8, BEAM_HEIGHT, 24, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(colorHex),
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, BEAM_HEIGHT / 2, z);
  scene.add(mesh);
  return mesh;
}
const beamLowpassMesh = makeBeam(LIGHT_BEAMS.lowpass.position.x, LIGHT_BEAMS.lowpass.position.z, colors.beamLowpass);
const beamHighpassMesh = makeBeam(LIGHT_BEAMS.highpass.position.x, LIGHT_BEAMS.highpass.position.z, colors.beamHighpass);
```

Add matching refs above the effect (for color-sync and disposal) and assign them:

```ts
const beamLowpassMeshRef  = useRef<THREE.Mesh | null>(null);
const beamHighpassMeshRef = useRef<THREE.Mesh | null>(null);
```

```ts
beamLowpassMeshRef.current  = beamLowpassMesh;
beamHighpassMeshRef.current = beamHighpassMesh;
```

Add disposal in the effect's cleanup, next to the other `.dispose()` calls:

```ts
beamLowpassMesh.geometry.dispose();  (beamLowpassMesh.material as THREE.Material).dispose();
beamHighpassMesh.geometry.dispose(); (beamHighpassMesh.material as THREE.Material).dispose();
```

- [ ] **Step 2: Extend the Task 11 color-sync effect to recolor the beams**

Locate the `useEffect(() => { ... }, [colors])` block added in Task 11 and add two lines:

```ts
useEffect(() => {
  flowUniformsRef.current?.uBgColor.value.set(colors.flowBackground);
  flowUniformsRef.current?.uLineLavender.value.set(colors.flowLineLavender);
  flowUniformsRef.current?.uLinePink.value.set(colors.flowLinePink);
  flowUniformsRef.current?.uLineAmber.value.set(colors.flowLineAmber);
  flowUniformsRef.current?.uNearGlow.value.set(colors.flowNearSphereGlow);
  sphUniformsRef.current?.uChromeHighlight.value.set(colors.sphereChromeHighlight);
  starUniformsRef.current?.uStarTint.value.set(colors.starColor);
  (beamLowpassMeshRef.current?.material as THREE.MeshBasicMaterial | undefined)?.color.set(colors.beamLowpass);
  (beamHighpassMeshRef.current?.material as THREE.MeshBasicMaterial | undefined)?.color.set(colors.beamHighpass);
}, [colors]);
```

- [ ] **Step 3: Contact detection + progressive filter ramp, every frame**

Add refs above the mount effect:

```ts
const lowpassContactRef  = useRef(0); // [0,1] amount, ramped by stepContactAmount
const highpassContactRef = useRef(0);
```

In `animate()`, right after the `sphereSpeed`/`setDopplerSpeed` lines added in Task 13:

```ts
/* Light-beam contact → progressive lowpass / highpass (Task 14). */
const dxLow  = sphere.position.x - LIGHT_BEAMS.lowpass.position.x;
const dzLow  = sphere.position.z - LIGHT_BEAMS.lowpass.position.z;
const inLowpassBeam = Math.sqrt(dxLow * dxLow + dzLow * dzLow) < LIGHT_BEAMS.lowpass.radius;
lowpassContactRef.current = stepContactAmount(
  lowpassContactRef.current, inLowpassBeam, dt, AUDIO_CONFIG.filterRampSeconds, AUDIO_CONFIG.filterReleaseSeconds
);
audioEngineRef.current?.setLowpassAmount(lowpassContactRef.current);

const dxHigh = sphere.position.x - LIGHT_BEAMS.highpass.position.x;
const dzHigh = sphere.position.z - LIGHT_BEAMS.highpass.position.z;
const inHighpassBeam = Math.sqrt(dxHigh * dxHigh + dzHigh * dzHigh) < LIGHT_BEAMS.highpass.radius;
highpassContactRef.current = stepContactAmount(
  highpassContactRef.current, inHighpassBeam, dt, AUDIO_CONFIG.filterRampSeconds, AUDIO_CONFIG.filterReleaseSeconds
);
audioEngineRef.current?.setHighpassAmount(highpassContactRef.current);
```

Add `AUDIO_CONFIG` to the existing `sceneConfig` import line if not already imported.

- [ ] **Step 4: Manual check**

Run: `npm run dev`, unlock audio, select "Tono puro." Guide the sphere (mouse) into the beam at `LIGHT_BEAMS.lowpass.position` (default world `[14, -10]` — during Phase 0/side-view this corresponds to a specific mouse position; easiest to verify once the camera is in the zenith/top-down phase, ~25–55% scroll, where screen position maps directly to world XZ). Confirm the tone progressively loses its highs the longer the sphere stays in the beam, bottoming out at bass-only after `filterRampSeconds` (1.6s). Leave the beam: it reopens over `filterReleaseSeconds` (0.8s). Repeat for the highpass beam and confirm the tone progressively loses its lows instead.

- [ ] **Step 5: Commit**

```bash
git add app/components/Section1.tsx
git commit -m "feat: add light beams with progressive lowpass/highpass audio filters on contact"
```

---

## Task 15: Doppler wave compression on the scenario floor

**Why:** Requirement: the sphere's motion should compress the flow-field's wave lines ahead of it and space them out behind it — a visual Doppler effect on the "ondas" already drawn by `FLOW_FRAG`'s iso-contour lines — active only once the camera is "far from the scenario" (zenith phase onward, not the initial diagonal view), and it should linger briefly then ease back out, not cut instantly.

**Files:**
- Modify: `app/components/Section1.tsx`

- [ ] **Step 1: Add the two new `FLOW_FRAG` uniforms and modulate `lineFreq` directionally**

Add to `FLOW_FRAG`'s uniform block:

```glsl
uniform vec2  uSphereVel;
uniform float uDopplerCompress;
```

`delta` (`wxz - uSphereXZ`) is already computed earlier in `main()` for the potential-flow term — reuse it. Replace the existing `float lineFreq = 7.0;` line with:

```glsl
/* Doppler wave compression: lines compress ahead of the sphere's
 * motion, space out behind it. uDopplerCompress (JS-driven, decays
 * over time — see FLOOR_DOPPLER_CONFIG) scales the effect. */
float velLen   = length(uSphereVel);
vec2  velDir   = velLen > 0.0001 ? uSphereVel / velLen : vec2(1.0, 0.0);
vec2  towardFrag = length(delta) > 0.0001 ? normalize(delta) : vec2(1.0, 0.0);
float along    = dot(towardFrag, velDir); // +1 ahead of motion, -1 behind
float lineFreq = 7.0 + along * uDopplerCompress;
```

- [ ] **Step 2: Track sphere velocity + decaying intensity in JS**

Add imports:

```ts
import { stepFloorDopplerState, type DopplerFloorState } from '@/app/lib/audioMath';
import { FLOOR_DOPPLER_CONFIG, FLOOR_DOPPLER_MIN_CAMERA_PROGRESS } from '@/app/lib/sceneConfig';
```

Add a ref above the mount effect:

```ts
const floorDopplerStateRef = useRef<DopplerFloorState>({ intensity: 0, timeSinceActive: 0 });
```

Add the two new uniforms to the `flowUniforms` object literal (from Task 6/11):

```ts
uSphereVel:       { value: new THREE.Vector2(0, 0) },
uDopplerCompress: { value: 0 },
```

- [ ] **Step 3: Step the state and push uniforms every frame**

In `animate()`, right after the Task 14 filter block, add:

```ts
/* Floor doppler wave compression — only "active" (camera far from the
 * scenario) at/after FLOOR_DOPPLER_MIN_CAMERA_PROGRESS; forcing speed
 * to 0 below that threshold lets the hold+release curve ease it out
 * naturally instead of an abrupt cut. */
const floorEffectiveSpeed = progress >= FLOOR_DOPPLER_MIN_CAMERA_PROGRESS ? sphereSpeed : 0;
floorDopplerStateRef.current = stepFloorDopplerState(
  floorDopplerStateRef.current, floorEffectiveSpeed, dt, FLOOR_DOPPLER_CONFIG
);
flowUniforms.uSphereVel.value.set(dt > 0 ? spring.vx / dt : 0, dt > 0 ? spring.vz / dt : 0);
flowUniforms.uDopplerCompress.value = floorDopplerStateRef.current.intensity * FLOOR_DOPPLER_CONFIG.compressionStrength;
```

(`progress` is the existing `const progress = scrollRef.current;` already declared near the top of `animate()`.)

- [ ] **Step 4: Manual check**

Run: `npm run dev`. During the initial diagonal/side-view phase (scroll 0–25%), whip the mouse around: confirm the flow lines do **not** compress/expand — only their usual organic FBM drift is visible. Scroll to the zenith phase (~30%+) and whip the mouse again: lines visibly compress ahead of the sphere's travel direction and space out behind it. Stop moving: the compression holds briefly (`holdSeconds` = 1.5s) then eases back to the normal even spacing over `releaseSeconds` (2.5s) — not an instant snap.

- [ ] **Step 5: Commit**

```bash
git add app/components/Section1.tsx
git commit -m "feat: add doppler wave-compression effect on the scenario floor"
```

---

## Task 16: Final-phase pure math (sub-range remap, corridor travel distance)

**Files:**
- Create: `app/lib/finalPhase.ts`
- Test: `app/lib/finalPhase.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/lib/finalPhase.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { remapSubrange, corridorTravelDistance } from './finalPhase';

describe('remapSubrange', () => {
  const range = { start: 0.18, end: 0.32 };
  it('is 0 at and before the range start', () => {
    expect(remapSubrange(0.1, range)).toBe(0);
    expect(remapSubrange(0.18, range)).toBe(0);
  });
  it('is 1 at and after the range end', () => {
    expect(remapSubrange(0.32, range)).toBe(1);
    expect(remapSubrange(0.9, range)).toBe(1);
  });
  it('is linear in between', () => {
    expect(remapSubrange(0.25, range)).toBeCloseTo(0.5, 5);
  });
});

describe('corridorTravelDistance', () => {
  it('is 0 at t=0', () => {
    expect(corridorTravelDistance(0, 30, 0.75)).toBe(0);
  });
  it('stops sphereRadius short of the full corridor length at t=1 (cannot advance further)', () => {
    expect(corridorTravelDistance(1, 30, 0.75)).toBeCloseTo(29.25, 5);
  });
  it('clamps t outside [0,1]', () => {
    expect(corridorTravelDistance(-1, 30, 0.75)).toBe(0);
    expect(corridorTravelDistance(2, 30, 0.75)).toBeCloseTo(29.25, 5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- finalPhase`
Expected: FAIL — `Cannot find module './finalPhase'`

- [ ] **Step 3: Implement**

Create `app/lib/finalPhase.ts`:

```ts
export interface SubRange {
  start: number;
  end: number;
}

/** Linearly remaps `value` from `[range.start, range.end]` to `[0, 1]`, clamped. */
export function remapSubrange(value: number, range: SubRange): number {
  const span = range.end - range.start;
  if (span <= 0) return value >= range.end ? 1 : 0;
  return Math.max(0, Math.min(1, (value - range.start) / span));
}

/**
 * How far (world units) the sphere has traveled down the corridor for
 * a given travel progress `t` (0..1, already the output of
 * `remapSubrange` for the corridorTravel sub-range). Stops
 * `sphereRadius` short of `corridorLength` so the sphere's surface —
 * not its center — is what touches the end wall.
 */
export function corridorTravelDistance(t: number, corridorLength: number, sphereRadius: number): number {
  const clampedT = Math.max(0, Math.min(1, t));
  return clampedT * (corridorLength - sphereRadius);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- finalPhase`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add app/lib/finalPhase.ts app/lib/finalPhase.test.ts
git commit -m "feat: add unit-tested final-phase remap and corridor-travel math"
```

---

## Task 17: Final-phase camera zoom + floor "hole" reveal

**Why:** Requirement: past the last text block, continued scroll pulls the camera in until the sphere fills the screen (wherever it is), then the floor visibly parts under the sphere. This task adds the camera behavior and the parting-hole shader effect; Task 18–19 build what's revealed underneath.

**Files:**
- Modify: `app/components/Section1.tsx`

- [ ] **Step 1: Add the hole-mask uniforms to `FLOW_FRAG`**

Add to the uniform block:

```glsl
uniform vec2  uHoleCenter;
uniform float uHoleRadius;
```

Change the final line of `main()` from `gl_FragColor = vec4(color, 1.0);` to:

```glsl
float holeMask = smoothstep(uHoleRadius * 0.7, uHoleRadius, length(wxz - uHoleCenter));
gl_FragColor = vec4(color, holeMask);
```

(`uHoleRadius = 0` by default → `smoothstep(0,0,d)` is `1.0` everywhere except exactly `d=0`, i.e. effectively fully opaque — matches the "closed floor" default.)

Set `flowMat.transparent = true;` where `flowMat` is constructed (it currently defaults to `false`, which would make the alpha channel from `holeMask` a no-op).

- [ ] **Step 2: Add the corresponding uniform values + a ref for the flow mesh**

In the `flowUniforms` object literal, add:

```ts
uHoleCenter: { value: new THREE.Vector2(0, 0) },
uHoleRadius: { value: 0 },
```

Capture the flow mesh in a ref (currently it's added to the scene inline without being kept — `scene.add(new THREE.Mesh(planeGeo, flowMat));`). Change that line to:

```ts
const flowMesh = new THREE.Mesh(planeGeo, flowMat);
scene.add(flowMesh);
```

and add a ref above the effect:

```ts
const flowMeshRef = useRef<THREE.Mesh | null>(null);
```

assigned right after creation: `flowMeshRef.current = flowMesh;`.

- [ ] **Step 3: Add final-phase imports and camera/hole update function**

Add imports:

```ts
import { remapSubrange } from '@/app/lib/finalPhase';
import { FINAL_PHASE_START_INSTANCE, FINAL_PHASE_DURATION_INSTANCES, FINAL_PHASE_SUBRANGES } from '@/app/lib/sceneConfig';
```

Add, alongside `applyCamKeyframes` (same scope, defined once per mount effect so it can close over `camera`):

```ts
const FINAL_CLOSE_OFFSET = new THREE.Vector3(SPHERE_R * 3.0, SPHERE_R * 1.3, 0);
const HOLE_MAX_RADIUS = 34;

function applyFinalPhaseCamera(finalProgress: number, spherePos: THREE.Vector3) {
  const zoomT = ease(remapSubrange(finalProgress, FINAL_PHASE_SUBRANGES.zoomToSphere));
  const startPos    = new THREE.Vector3(...CAM[3].pos);
  const startTarget = new THREE.Vector3(...CAM[3].target);
  const dynamicPos  = spherePos.clone().add(FINAL_CLOSE_OFFSET);
  camera.position.copy(startPos.clone().lerp(dynamicPos, zoomT));
  camera.up.set(...CAM[3].up).normalize();
  camera.lookAt(startTarget.clone().lerp(spherePos, zoomT));
}
```

- [ ] **Step 4: Drive it from `animate()`**

Replace the existing camera-transition line:

```ts
applyCamKeyframes(progress);
```

with a branch that hands off to the final phase once the scroll timeline reaches it:

```ts
const finalPhaseProgress = remapSubrange(
  instance, // from Task 6's scrollInstanceRef — see below
  { start: FINAL_PHASE_START_INSTANCE, end: FINAL_PHASE_START_INSTANCE + FINAL_PHASE_DURATION_INSTANCES }
);
if (finalPhaseProgress <= 0) {
  applyCamKeyframes(progress);
} else {
  applyFinalPhaseCamera(finalPhaseProgress, sphere.position);
}
```

`instance` isn't yet a local in `animate()` — add it right after the existing `const progress = scrollRef.current;` line:

```ts
const instance = scrollInstanceRef.current;
```

Now drive the hole reveal from the `floorOpens` sub-range, and hide the flow disc entirely once it's fully open (the corridor, built in Task 18–19, takes over from there):

```ts
const holeT = remapSubrange(finalPhaseProgress, FINAL_PHASE_SUBRANGES.floorOpens);
flowUniforms.uHoleCenter.value.set(sphere.position.x, sphere.position.z);
flowUniforms.uHoleRadius.value = holeT * HOLE_MAX_RADIUS;
if (flowMeshRef.current) flowMeshRef.current.visible = holeT < 1;
```

Place both new blocks directly after the camera branch above.

- [ ] **Step 5: Manual check**

Run: `npm run dev`, scroll all the way through the intro and all 5 text blocks. Continued scrolling should now: (a) smoothly pull the camera in until the sphere fills most of the frame, tracking wherever the sphere currently sits (test this by parking the mouse in a corner before this phase starts); (b) once close, a circular hole should visibly grow in the floor centered on the sphere, revealing black void beneath; (c) once the hole is fully open, the flow disc disappears (no floor-plane pop/flicker at the transition — confirm the crossfade via `smoothstep` reads as smooth, not a hard cut).

- [ ] **Step 6: Commit**

```bash
git add app/components/Section1.tsx
git commit -m "feat: add final-phase camera zoom-to-sphere and floor-parting hole reveal"
```

---

## Task 18: Corridor scene builder module

**Why:** Isolating corridor construction in its own module (rather than inlining ~150 lines into `Section1.tsx`'s already-large mount effect) keeps it independently readable and matches the file-structure principle of one file, one responsibility.

**Files:**
- Create: `app/lib/corridor.ts`

- [ ] **Step 1: Define the two corridor-surface shaders**

Create `app/lib/corridor.ts`, starting with the shaders:

```ts
import * as THREE from 'three';
import { HASH_NOISE_FBM_GLSL } from '@/app/lib/shaders/common';
import { CORRIDOR_CONFIG } from '@/app/lib/sceneConfig';

/* Floor / ceiling / side walls: wave pattern for the first
 * `patternedPortion` of the corridor's length, then a solid color. */
const PATTERN_VERT = /* glsl */ `
  uniform float uMeshOffsetZ;
  uniform float uLength;
  varying float vPatternT; // 0 at the entrance, 1 at the end wall
  varying vec2  vSurfaceUV;
  void main() {
    float groupLocalZ = uMeshOffsetZ + position.z;
    vPatternT   = clamp(-groupLocalZ / uLength, 0.0, 1.0);
    vSurfaceUV  = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PATTERN_FRAG = /* glsl */ `
  precision highp float;
  ${HASH_NOISE_FBM_GLSL}
  uniform float uTime;
  uniform float uPatternedPortion;
  uniform vec3  uPatternColorA;
  uniform vec3  uPatternColorB;
  uniform vec3  uSolidColor;
  varying float vPatternT;
  varying vec2  vSurfaceUV;
  void main() {
    float n       = fbm(vSurfaceUV * 0.15 + vec2(uTime * 0.05, 0.0));
    float lines   = smoothstep(0.45, 0.50, fract(n * 6.0 + uTime * 0.1));
    vec3  patCol  = mix(uPatternColorA, uPatternColorB, n);
    vec3  patterned = mix(vec3(0.02, 0.02, 0.05), patCol, lines);
    float toSolid = smoothstep(uPatternedPortion * 0.85, uPatternedPortion, vPatternT);
    vec3  color   = mix(patterned, uSolidColor, toSolid);
    gl_FragColor  = vec4(color, 1.0);
  }
`;

/* End wall: flat color, lerping red → blue as the sphere approaches. */
const END_WALL_VERT = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const END_WALL_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3  uColorStart;
  uniform vec3  uColorEnd;
  uniform float uColorT;
  void main() {
    gl_FragColor = vec4(mix(uColorStart, uColorEnd, uColorT), 1.0);
  }
`;
```

- [ ] **Step 2: Build the geometry + assemble the group**

Continue in the same file:

```ts
export interface CorridorHandle {
  group: THREE.Group;
  /** World-space position of the corridor entrance (where the floor hole opened). */
  entrance: THREE.Vector3;
  /** Normalized travel direction, currently always world -Z. */
  axis: THREE.Vector3;
  length: number;
  crossSection: number;
  /** World-space center of the end wall — used for HTML-link screen projection (Task 20). */
  endWallCenter: THREE.Vector3;
  patternUniforms: Record<string, THREE.IUniform>;
  endWallUniforms: Record<string, THREE.IUniform>;
  dispose: () => void;
}

/**
 * Builds a straight tunnel starting at `entrancePosition`, extending
 * along world -Z. Length = 20× sphere diameter, cross-section (walls/
 * ceiling/floor size) = 4× sphere diameter — see CORRIDOR_CONFIG.
 * `wallColorStart`/`wallColorEnd` seed the end wall's red→blue lerp —
 * pass the CURRENT debug-menu colors (see Task 19), not static config.
 */
export function buildCorridor(
  sphereRadius: number,
  entrancePosition: THREE.Vector3,
  wallColorStart: string,
  wallColorEnd: string
): CorridorHandle {
  const diameter = sphereRadius * 2;
  const length = diameter * CORRIDOR_CONFIG.lengthMultiplier;
  const crossSection = diameter * CORRIDOR_CONFIG.crossSectionMultiplier;
  const thickness = sphereRadius * 0.12;

  const patternUniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uLength: { value: length },
    uPatternedPortion: { value: CORRIDOR_CONFIG.patternedPortion },
    uPatternColorA: { value: new THREE.Color(CORRIDOR_CONFIG.patternColorA) },
    uPatternColorB: { value: new THREE.Color(CORRIDOR_CONFIG.patternColorB) },
    uSolidColor: { value: new THREE.Color(CORRIDOR_CONFIG.solidColor) },
    uMeshOffsetZ: { value: 0 }, // overridden per-surface below
  };

  function surfaceMaterial(meshOffsetZ: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: PATTERN_VERT,
      fragmentShader: PATTERN_FRAG,
      uniforms: { ...patternUniforms, uMeshOffsetZ: { value: meshOffsetZ } },
      side: THREE.DoubleSide,
    });
  }

  const group = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  const materials: THREE.ShaderMaterial[] = [];

  // Floor: top surface at local y=0.
  const floorMat = surfaceMaterial(-length / 2);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(crossSection, thickness, length), floorMat);
  floor.position.set(0, -thickness / 2, -length / 2);

  // Ceiling: bottom surface at local y=crossSection.
  const ceilingMat = surfaceMaterial(-length / 2);
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(crossSection, thickness, length), ceilingMat);
  ceiling.position.set(0, crossSection + thickness / 2, -length / 2);

  // Side walls.
  const wallLeftMat = surfaceMaterial(-length / 2);
  const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(thickness, crossSection, length), wallLeftMat);
  wallLeft.position.set(-crossSection / 2 - thickness / 2, crossSection / 2, -length / 2);

  const wallRightMat = surfaceMaterial(-length / 2);
  const wallRight = new THREE.Mesh(new THREE.BoxGeometry(thickness, crossSection, length), wallRightMat);
  wallRight.position.set(crossSection / 2 + thickness / 2, crossSection / 2, -length / 2);

  meshes.push(floor, ceiling, wallLeft, wallRight);
  materials.push(floorMat, ceilingMat, wallLeftMat, wallRightMat);

  // End wall — separate flat-color shader (red → blue lerp, Task 20).
  // Colors are passed in (sourced from the live debug-menu state via
  // colorsRef, see Task 19) rather than read from CORRIDOR_CONFIG,
  // so the debug menu's "Pasillo — pared inicial/final" pickers —
  // which write to SceneControlsContext, not to sceneConfig's static
  // defaults — actually have an effect once the corridor is built.
  const endWallUniforms: Record<string, THREE.IUniform> = {
    uColorStart: { value: new THREE.Color(wallColorStart) },
    uColorEnd: { value: new THREE.Color(wallColorEnd) },
    uColorT: { value: 0 },
  };
  const endWallMat = new THREE.ShaderMaterial({
    vertexShader: END_WALL_VERT,
    fragmentShader: END_WALL_FRAG,
    uniforms: endWallUniforms,
  });
  const endWall = new THREE.Mesh(new THREE.BoxGeometry(crossSection, crossSection, thickness), endWallMat);
  endWall.position.set(0, crossSection / 2, -length - thickness / 2);
  meshes.push(endWall);
  materials.push(endWallMat);

  meshes.forEach((m) => group.add(m));
  group.position.copy(entrancePosition);
  group.position.y = 0;

  const axis = new THREE.Vector3(0, 0, -1);
  const endWallCenter = entrancePosition.clone().add(new THREE.Vector3(0, crossSection / 2, -length));

  return {
    group,
    entrance: entrancePosition.clone(),
    axis,
    length,
    crossSection,
    endWallCenter,
    patternUniforms,
    endWallUniforms,
    dispose: () => {
      meshes.forEach((m) => m.geometry.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
```

- [ ] **Step 3: Manual check (deferred)**

`buildCorridor` isn't called from anywhere yet — there's nothing to see until Task 19 adds it to the scene. Just confirm `npm run dev` still compiles cleanly (this file is inert until imported).

- [ ] **Step 4: Commit**

```bash
git add app/lib/corridor.ts
git commit -m "feat: add corridor scene builder (patterned-to-solid tunnel, color-lerp end wall)"
```

---

## Task 19: Integrate the corridor — spawn it, freeze mouse control, drive sphere travel from scroll

**Files:**
- Modify: `app/components/Section1.tsx`

- [ ] **Step 1: Add refs + imports**

```ts
import { buildCorridor, type CorridorHandle } from '@/app/lib/corridor';
import { corridorTravelDistance } from '@/app/lib/finalPhase';
```

```ts
const corridorRef = useRef<CorridorHandle | null>(null);
const prevTravelDistanceRef = useRef(0);
```

- [ ] **Step 2: Replace the mouse-spring/position block with a branched version**

This is the block built up across Tasks 13–15 — mouse input → spring physics → clamp → `sphere.position.x/y/z =` → `sphereSpeed` → `setDopplerSpeed`. Replace the whole thing (from `const mx = mouseRef.current.x;` down through the `setDopplerSpeed(sphereSpeed)` call) with:

```ts
const insideCorridorPhase = finalPhaseProgress > FINAL_PHASE_SUBRANGES.floorOpens.end;
let sphereSpeed: number;

if (!insideCorridorPhase) {
  /* ── Original disc/mouse-spring control (unchanged from Tasks 13/15) ── */
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
  sphere.position.y = SPHERE_R * 0.30;

  sphereSpeed = dt > 0 ? Math.sqrt(spring.vx * spring.vx + spring.vz * spring.vz) / dt : 0;
} else {
  /* ── Corridor: mouse control frozen; travel driven by scroll (Task 19) ── */
  if (!corridorRef.current) {
    // Read colors via the ref (Task 11), NOT the `colors` closure variable —
    // this callback lives inside the mount effect's one-time closure and
    // would otherwise always see the color state from the very first render.
    corridorRef.current = buildCorridor(
      SPHERE_R,
      sphere.position.clone(),
      colorsRef.current.corridorWallStart,
      colorsRef.current.corridorWallEnd
    );
    scene.add(corridorRef.current.group);
  }
  const corridor = corridorRef.current;
  const corridorTravelT = remapSubrange(finalPhaseProgress, FINAL_PHASE_SUBRANGES.corridorTravel);
  const travelDistance = corridorTravelDistance(corridorTravelT, corridor.length, SPHERE_R);

  sphere.position.copy(corridor.entrance).addScaledVector(corridor.axis, travelDistance);
  sphere.position.y = SPHERE_R * 0.30;

  sphereSpeed = dt > 0 ? Math.abs(travelDistance - prevTravelDistanceRef.current) / dt : 0;
  prevTravelDistanceRef.current = travelDistance;

  corridor.patternUniforms.uTime.value = time;
}

audioEngineRef.current?.setDopplerSpeed(sphereSpeed);
flowUniforms.uSphereXZ.value.set(sphere.position.x, sphere.position.z);
```

Everything Task 14 (light-beam contact) and Task 15 (floor doppler) added right after the old `setDopplerSpeed(sphereSpeed)` call stays exactly where it is — it now runs after this unified branch, using the same `sphereSpeed`/`sphere.position` values regardless of which branch produced them. (The light beams live only on the disc, so contact simply never triggers once inside the corridor — no extra guard needed.)

- [ ] **Step 3: Dispose the corridor on unmount**

In the mount effect's cleanup function, alongside the other `.dispose()` calls:

```ts
corridorRef.current?.dispose();
if (corridorRef.current) scene.remove(corridorRef.current.group);
```

- [ ] **Step 4: Manual check**

Run: `npm run dev`, scroll through intro + all 5 text blocks + the zoom/hole-reveal (Task 17). Continue scrolling: confirm (a) the corridor appears anchored exactly where the hole opened; (b) mouse movement no longer steers the sphere once inside; (c) further scroll moves the sphere in a straight line down the corridor's floor; (d) the sphere visibly cannot pass the end wall even if you keep scrolling (position stops advancing once `corridorTravelDistance` saturates); (e) the first ~20% of the corridor's floor/walls/ceiling show the animated wave pattern, transitioning smoothly to the solid color for the remaining ~80%.

- [ ] **Step 5: Commit**

```bash
git add app/components/Section1.tsx
git commit -m "feat: spawn corridor at the floor opening, drive sphere travel from scroll"
```

---

## Task 20: End-wall color lerp + clickable "IR A LA SIMULACION" link

**Files:**
- Modify: `app/components/Section1.tsx`

- [ ] **Step 1: Keep the corridor's end-wall colors live-editable after construction**

Task 19 seeds the end wall's colors once, at construction time, from `colorsRef.current`. To keep "Pasillo — pared inicial/final" editable in the debug menu *after* the corridor already exists (not just at the moment it's built), extend the Task 11 `useEffect(() => {...}, [colors])` color-sync block with two more lines:

```ts
corridorRef.current?.endWallUniforms.uColorStart.value.set(colors.corridorWallStart);
corridorRef.current?.endWallUniforms.uColorEnd.value.set(colors.corridorWallEnd);
```

- [ ] **Step 2: Drive the end-wall color lerp from corridor travel progress**

In the `else` (`insideCorridorPhase`) branch added in Task 19, right after `corridor.patternUniforms.uTime.value = time;`, add:

```ts
corridor.endWallUniforms.uColorT.value = corridorTravelT;
```

- [ ] **Step 3: Project the end-wall's world position to screen space and position the link**

Immediately after that, still inside the `else` branch:

```ts
const projected = corridor.endWallCenter.clone().project(camera);
if (endLinkRef.current) {
  endLinkRef.current.style.left = `${(projected.x * 0.5 + 0.5) * window.innerWidth}px`;
  endLinkRef.current.style.top  = `${(-projected.y * 0.5 + 0.5) * window.innerHeight}px`;
  const reached = corridorTravelT >= 0.97;
  endLinkRef.current.style.opacity = reached ? '1' : '0';
  endLinkRef.current.style.pointerEvents = reached ? 'auto' : 'none';
}
```

Also hide the link whenever the corridor isn't active (e.g. if the user scrolls back up before reaching this phase). In the `if (!insideCorridorPhase)` branch, at the end, add:

```ts
if (endLinkRef.current) {
  endLinkRef.current.style.opacity = '0';
  endLinkRef.current.style.pointerEvents = 'none';
}
```

- [ ] **Step 4: Add the ref and the `<a>` element**

Add the import (extend the existing `sceneConfig` import line):

```ts
import { CORRIDOR_CONFIG } from '@/app/lib/sceneConfig';
```

Add the ref above the mount effect:

```ts
const endLinkRef = useRef<HTMLAnchorElement>(null);
```

Add the link inside the sticky viewport `<div>`, after `<ScrollTextBlocks ref={textBlockRefs} />`:

```tsx
{/* ── End-of-corridor link — see CORRIDOR_CONFIG in sceneConfig.ts ── */}
<a
  ref={endLinkRef}
  href={CORRIDOR_CONFIG.finalLinkUrl}
  target="_blank"
  rel="noopener noreferrer"
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
    textShadow: '2px 2px 0px rgba(0,0,0,0.85)',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  }}
>
  {CORRIDOR_CONFIG.finalLinkText}
</a>
```

- [ ] **Step 5: Manual check**

Run: `npm run dev`, scroll all the way to the end of the corridor. Confirm: (a) the end wall visibly shifts from red toward blue as the sphere approaches, finishing at blue once the sphere reaches it; (b) "IR A LA SIMULACION" fades in, in the Michroma font, centered on the end wall from the camera's viewpoint, only once the sphere has actually stopped there (not earlier); (c) it tracks the wall's screen position correctly if you nudge the window size; (d) clicking it opens `https://efectodoppler.vercel.app` in a new tab; (e) scroll back up past the corridor-travel threshold — the link disappears again (no dangling clickable ghost link).

- [ ] **Step 6: Commit**

```bash
git add app/components/Section1.tsx
git commit -m "feat: add end-wall color lerp and clickable link to the external simulation"
```

---

## Task 21: Full manual QA pass + static-export build verification

**Why:** `next.config.ts` uses `output: "export"` for GitHub Pages — this must still produce a clean static build after all the above changes (all-client-side WebGL/audio code is compatible, but worth confirming nothing accidentally needs a server).

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit-test suite**

Run: `npm test`
Expected: PASS — all suites from Tasks 0–16 (`basePath`, `sceneConfig`, `scrollTimeline`, `audioMath`, `finalPhase`).

- [ ] **Step 2: Provide a real MP3 for final QA**

Drop any short looping mp3 at `my-3d-portfolio/public/audio.mp3` (not committed as part of this plan — it's user-supplied content, add it separately and gitignore it if it's not meant to be checked in). Without it, "Archivo MP3" mode will silently fail to produce sound but must not crash.

- [ ] **Step 3: Full walkthrough checklist**

Run `npm run dev` and go through, in order:

1. **Title** — reads "EFFECTO DOPPLER" in Michroma, white, short black shadow, no glitch/flicker/wave effects at any point.
2. **5 text blocks** — each appears after its configured scroll-instance count, 4 lines, fades in over 1 instance / holds 1 / fades out over 1, independent position per block, no overlap.
3. **Debug menu** — Shift opens/closes it; every color picker repaints its target live; palette presets apply multiple colors at once; the 3 audio-source radios switch source correctly (tone slider glides with no clicks; arpeggio cycles notes; file falls back to `/audio.mp3`).
4. **Doppler pitch** — idle mouse = neutral pitch; fast movement = higher pitch; slowing down returns to neutral smoothly, in all 3 source modes.
5. **Light-beam filters** — sphere in the lowpass beam progressively loses highs the longer it stays, releases on exit; highpass beam does the mirrored effect; no interaction between the two beams when only one is touched.
6. **Floor doppler waves** — no compression effect during the initial diagonal-camera phase; compression/expansion appears once the camera reaches the zenith phase; lingers briefly after the sphere stops, then eases back to normal spacing.
7. **Final phase** — camera zooms into the sphere wherever it is; floor visibly parts under the sphere; corridor appears anchored at that point; mouse control is frozen inside the corridor; sphere travels in a straight line down the corridor's floor as you scroll, unable to pass the end wall; corridor surfaces show the wave pattern for their first ~20% then solid color; end wall shifts red → blue as the sphere approaches; "IR A LA SIMULACION" (Michroma) appears once the sphere reaches the end and links to `https://efectodoppler.vercel.app` in a new tab.
8. Scroll all the way back to the top — nothing is left in a stuck/broken state (text blocks re-hide, debug menu still toggles, corridor link disappears).

- [ ] **Step 4: Verify the static export build still succeeds**

Run: `npm run build`
Expected: build completes and emits `out/` with no errors. (`output: "export"` means every runtime piece here — Three.js, Web Audio, React context — must be purely client-side; it already is, since `Section1.tsx` and `DebugMenu.tsx` are `'use client'` components and nothing added in this plan touches the filesystem or a server API.)

- [ ] **Step 5: Commit (if Step 4 required any fixes)**

```bash
git add -A
git commit -m "chore: fix static-export build issues found during final QA"
```

(Skip this commit if Step 4 passed cleanly with no changes needed.)

---

## Self-Review

**Spec coverage:**
- Título simplificado, fuente Michroma, blanco + sombra negra corta, texto exacto, variables fácilmente ubicables → Task 4 (`TITLE_CONFIG` in `sceneConfig.ts`).
- 5 bloques de texto, 4 líneas, timing 2/1/1/1 instancias, posición/tamaño/espaciado/justificación/sombra independientes y ubicables → Tasks 5–6 (`TEXT_BLOCKS`, `scrollTimeline.ts`, `ScrollTextBlocks.tsx`).
- Menú de debug con Shift, colores + paletas, 3 fuentes de audio → Tasks 7, 10 (`SceneControlsContext`, `DebugMenu.tsx`).
- Pitch por velocidad del mouse/esfera (doppler) → Tasks 8, 9, 13 (`audioMath.ts`, `AudioEngine`, per-frame speed).
- Filtros progresivos pasa-bajos / pasa-altos por contacto con haces → Task 14.
- Ondas doppler en el piso, solo fase alejada, decae lento → Task 15.
- Fase final: zoom a la esfera, apertura del piso, pasillo 20×/4× diámetro, patrón 20% inicial, pared roja→azul, link clickeable → Tasks 16–20.
- Todo con variables centralizadas y fácilmente ubicables → `app/lib/sceneConfig.ts` (Task 2), the single file every later task imports from.

**Placeholder scan:** no `TBD`/`fill in later` markers; every step has runnable code. The 5 text blocks' sample copy (Task 2) is real placeholder *content* (not a plan placeholder) — flagged as user-editable sample copy, which is expected since the user didn't supply exact marketing text.

**Type consistency:** `SceneColorKey`, `AudioSourceMode`, `ArpeggioMode`, `DopplerFloorState`, `CorridorHandle`, `TextBlockConfig` are each defined once and reused with identical names/shapes across every task that touches them (verified: `AudioEngine` imports `ArpeggioMode`/`AudioSourceMode` from `SceneControlsContext.tsx`, not redefining them; `corridor.ts`'s `CorridorHandle` fields — `entrance`, `axis`, `length`, `endWallCenter`, `patternUniforms`, `endWallUniforms` — match exactly what Tasks 19–20 read off it).

