# Doppler V3 Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two V2 regressions (debug-menu mp3 upload, title/text-block scroll sync) and ship four new features (global text-block alignment control, a fully reworked reactive/static corridor wave pattern, a corridor-entrance star field, and margin-safe wrapping end-wall link text).

**Architecture:** Every change is additive/corrective on top of the already-merged V1+V2 doppler experience (`app/components/Section1.tsx`, `app/lib/sceneConfig.ts`, `app/lib/corridor.ts`, `app/lib/SceneControlsContext.tsx`, `app/components/DebugMenu.tsx`, `app/components/ScrollTextBlocks.tsx`). No new files; all work happens in these 6 existing files.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, raw Three.js (GLSL `ShaderMaterial`s), Web Audio API, Vitest, Playwright (for visual verification during review — this project is a 3D/visual/audio experience and prior rounds have repeatedly shown code-only review misses real defects).

---

## Task 1: Fix debug-menu mp3 file-upload bug (production basePath mismatch)

**Files:**
- Modify: `next.config.ts`
- Delete: `.github/deploy.yml`

**Bug report (user, verbatim):** "En el menú de debug al elegir la opción de elegir archivo de audio mp3, no permite cargar archivo porque se cierra" — selecting "Archivo MP3" in the debug menu and trying to load a file doesn't work because it closes.

**Confirmed root cause** (via live Playwright investigation against both `next dev` and a read of `next.config.ts`'s history): commit `2b165a7` ("fix: remove basePath for Vercel deployment") removed `output: "export"` and `basePath: ... "/cv"` from `next.config.ts` so the app deploys correctly on Vercel (which serves it at the root, not under `/cv`) — but it left `NEXT_PUBLIC_BASE_PATH` still conditionally set to `/cv` whenever `NODE_ENV === "production"` (`next.config.ts` line 12). In production, this means `app/lib/basePath.ts`'s `withBasePath('/audio.mp3')` still resolves to `/cv/audio.mp3`, a path Vercel never serves anything at. The instant the user selects "Archivo MP3" in the debug menu — BEFORE they've picked a file — `Section1.tsx`'s `[audioSourceMode]` effect (lines 1121-1131) calls `AudioEngine.setSource('file', { fileUrl: null, ... })`, which falls back to this broken default-mp3 URL; the resulting `<audio>` element 404s, fires its `error` listener (`audioEngine.ts` lines 131-135), and `onFileSourceError` flips `audioSourceMode` back to `'tone'` — which immediately unmounts the file-input UI (`DebugMenu.tsx` line 239's `{audioSourceMode === 'file' && (...)}` conditional), exactly matching "no permite cargar archivo porque se cierra": the section vanishes before the user can even reach the native file picker.

This was reproduced against `next dev` and found NOT to occur there (since `NODE_ENV` isn't `"production"` in dev, so `NEXT_PUBLIC_BASE_PATH` is already `""`) — confirming the bug is specific to the deployed/production build, matching what a user testing the live Vercel site would experience.

**Confirmed with the user:** the project is Vercel-only going forward (no more GitHub Pages deployment) — so the fix is to make `NEXT_PUBLIC_BASE_PATH` always resolve to the root (never `/cv`, in any environment), and retire the now-broken GitHub Pages deploy workflow (it expects `next build` to emit a static `./out` folder via `output: "export"`, which commit `2b165a7` already removed — that workflow no longer works regardless of this fix, and is confirmed to no longer be needed).

- [ ] **Step 1: Simplify `next.config.ts` — no more basePath, ever**

Replace the entire file:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
```

(This removes the now-dead `repoBase`/`GITHUB_PAGES_BASE_PATH` logic and the `NEXT_PUBLIC_BASE_PATH` env var entirely. `app/lib/basePath.ts`'s `withBasePath()` reads `process.env.NEXT_PUBLIC_BASE_PATH ?? ''` — with the env var no longer set anywhere, this always evaluates to `''`, so `withBasePath()` becomes a correct no-op on Vercel. Leave `app/lib/basePath.ts` and its call sites unchanged — it's harmless, still-correct infrastructure, not dead code, and removing it would be unnecessary extra churn for no behavior change.)

- [ ] **Step 2: Delete the GitHub Pages deploy workflow**

```bash
git rm .github/deploy.yml
```

- [ ] **Step 3: Verify**

1. `npx tsc --noEmit`, `npm run build`, `npm run lint` — all clean. `npm test` — confirm `basePath.test.ts` still passes (it only checks that `withBasePath('/audio.mp3')` ends in `/audio.mp3` and that absolute URLs pass through unchanged — it doesn't hardcode the `/cv` prefix, so it's unaffected by this fix either way).
2. Build production-mode and confirm the mp3 default path is no longer prefixed: `NODE_ENV=production npx next build` (or simply inspect the built output/`next start` if available in this environment) — confirm no reference to a `/cv/` prefix remains in the built client bundle for `audio.mp3`.
3. Playwright, dev server is sufficient for the interactive check (the bug's trigger condition is now removed for every environment, not just dev): open the debug menu, select "Archivo MP3", confirm the file-input section stays visible; use `setInputFiles()` to pick `public/audio.mp3`, confirm it loads without any console error and (after pressing Space to satisfy the gesture-gated autoplay policy) plays.
4. Confirm switching between all 3 audio-source radios (file/tone/arpeggio) still works cleanly.

- [ ] **Step 4: Commit**

```bash
git add next.config.ts
git rm .github/deploy.yml
git commit -m "fix: stop prefixing asset URLs with a stale /cv basePath in production (Vercel serves at root); retire the now-broken GitHub Pages workflow"
```

---

## Task 2: Sync title auto-hide with the first text block's appearance

**Files:**
- Modify: `app/lib/sceneConfig.ts`
- Modify: `app/components/Section1.tsx`

**The problem:** The title currently hides via a wall-clock timer — `TITLE_HIDE_DELAY_SECONDS = 5` real seconds after the user's first scroll-away from the top (`app/lib/sceneConfig.ts` line 55, consumed in `Section1.tsx`'s `onScroll()` ~line 964-991 via `setTimeout`). Text block 1 fades in starting at `scrollInstance = TEXT_BLOCKS[0].startInstance` (currently `1`, i.e. one viewport-height of scroll) — a purely scroll-position-based trigger, wired in `computeBlockOpacity()` (`app/lib/scrollTimeline.ts`). These two triggers are driven by unrelated signals (wall-clock vs. scroll distance), so depending on how fast the user scrolls, the title can still be fully visible when the first text block starts fading in (fast scroll — under 5s to reach instance 1), or the title can have already been gone for a while before any text block appears (slow scroll). The user wants the text block to start appearing "immediately after the title disappears, in terms of both time and scroll position" — the only way to guarantee both simultaneously, regardless of scroll speed, is to drive BOTH off the same signal.

**The fix:** Replace the wall-clock timer with a scroll-instance threshold, set to exactly `TEXT_BLOCKS[0].startInstance`, so the title starts hiding at the EXACT scroll position the first text block starts appearing — same trigger, so they're always simultaneous regardless of how fast or slow the user scrolls. The existing `transition: 'opacity 1s ease'` CSS on the title (`Section1.tsx` ~line 1259) already provides a smooth crossfade once the `titleVisible` boolean flips — that infrastructure is untouched, only the trigger condition changes.

- [ ] **Step 1: Replace `TITLE_HIDE_DELAY_SECONDS` with a scroll-instance constant**

In `app/lib/sceneConfig.ts`, delete this block (lines 51-55):

```ts
/* ── TITLE AUTO-HIDE ────────────────────────────────────────────────
 * The hero title disappears this many REAL seconds after the user
 * starts scrolling (not scroll-distance-based), and only reappears
 * once scrolled back to the very top of the page. */
export const TITLE_HIDE_DELAY_SECONDS = 5;
```

Add this instead, placed AFTER the `TEXT_BLOCKS` array (so it can reference `TEXT_BLOCKS[0].startInstance` directly — right after the existing `LAST_TEXT_BLOCK_END_INSTANCE` export, ~line 169):

```ts
/* ── TITLE AUTO-HIDE ────────────────────────────────────────────────
 * The hero title starts hiding the moment the scroll position reaches
 * this instance — deliberately the SAME value as TEXT_BLOCKS[0]'s
 * startInstance (not just a similar one) so the title's fade-out and
 * the first text block's fade-in always begin at the exact same
 * scroll position, and therefore the same moment in time regardless
 * of how fast the user scrolls. Reappears (instantly) only once
 * scrolled back to the very top of the page. */
export const TITLE_HIDE_TRIGGER_INSTANCE = TEXT_BLOCKS[0].startInstance;
```

- [ ] **Step 2: Update the import in `Section1.tsx`**

Change (line 38):
```ts
  TITLE_HIDE_DELAY_SECONDS,
```
to:
```ts
  TITLE_HIDE_TRIGGER_INSTANCE,
```

- [ ] **Step 3: Remove the timer refs and simplify `onScroll()`**

Delete these two ref declarations (lines 333-334):
```ts
  const titleHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleHideTimerArmedRef = useRef(false);
```

Replace the `onScroll()` title-hide logic (currently lines 973-991):
```ts
      if (instance <= 0.01) {
        // Back at the very top — cancel any pending hide, show the title immediately,
        // and disarm so the NEXT scroll-away restarts a fresh 5-second countdown.
        if (titleHideTimerRef.current !== null) {
          clearTimeout(titleHideTimerRef.current);
          titleHideTimerRef.current = null;
        }
        titleHideTimerArmedRef.current = false;
        if (!titleVisibleRef.current) {
          titleVisibleRef.current = true;
          setTitleVisible(true);
        }
      } else if (!titleHideTimerArmedRef.current) {
        titleHideTimerArmedRef.current = true;
        titleHideTimerRef.current = setTimeout(() => {
          titleVisibleRef.current = false;
          setTitleVisible(false);
        }, TITLE_HIDE_DELAY_SECONDS * 1000);
      }
```
with:
```ts
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
```

- [ ] **Step 4: Remove the now-dead timer cleanup in the unmount effect**

In the mount effect's cleanup function (~lines 1038-1039), delete:
```ts
      if (titleHideTimerRef.current !== null) clearTimeout(titleHideTimerRef.current);
      titleHideTimerArmedRef.current = false;
```

- [ ] **Step 5: Verify**

1. `npx tsc --noEmit`, `npm run build`, `npm run lint` — all clean. `npm test` — the existing `sceneConfig.test.ts` doesn't reference the old constant (confirmed), so no test file needs updating, but re-run the suite to be sure.
2. Playwright, dev server: scroll SLOWLY (e.g. many small increments over 10+ seconds) past instance 1 — confirm the title's computed opacity hits 0 at essentially the same scroll position (not wall-clock time) that text block 1's opacity starts rising above 0, with no visible gap or overlap. Then reload and scroll FAST (a single large jump straight past instance 1, e.g. under 1 second) — confirm the SAME thing: title gone, block 1 visible, no state where both are simultaneously mid-transition in a way that looks wrong (some brief CSS-transition overlap during the crossfade itself is fine/expected — that's the point of the shared trigger).
3. Confirm scrolling back to the top still instantly re-shows the title (unchanged behavior).
4. Confirm the corridor-phase force-hide logic (which reads `titleVisibleRef.current` on the corridor-exit restore branch, `Section1.tsx` ~line 757-759) still works correctly — this task doesn't touch that logic, but `titleVisibleRef`'s write sites just changed, so re-verify: scroll into the corridor after the title has hidden, scroll back out to a mid-scroll position, confirm the title stays hidden (doesn't wrongly reappear) — this exact regression was fixed in a prior round and must not come back.

- [ ] **Step 6: Commit**

```bash
git add app/lib/sceneConfig.ts app/components/Section1.tsx
git commit -m "fix: sync title auto-hide with the first text block's appearance (same scroll-instance trigger, not a wall-clock timer)"
```

---

## Task 3: Debug-menu text-block alignment control (default: justify)

**Files:**
- Modify: `app/lib/sceneConfig.ts`
- Modify: `app/lib/SceneControlsContext.tsx`
- Modify: `app/components/ScrollTextBlocks.tsx`
- Modify: `app/components/DebugMenu.tsx`

**What's requested:** A debug-menu control to switch all 5 scroll text blocks' text alignment between centered / justified / left / right, defaulting to justified.

**Design notes (read first):**
- Each `TEXT_BLOCKS[i]` currently has its own static `textAlign: 'left' | 'center' | 'right'` field — this is being REPLACED by one global, debug-adjustable value (all 5 blocks share the same alignment at any given time), so the per-block field is being removed as part of this task, not left as dead unused config.
- For `text-align: justify` to have any visible effect, a box needs (a) an explicit `width` (not just `max-width`) so there's actual room to stretch into, and (b) `text-align-last: justify` — because each of the 4 lines in a block is already pre-authored as its own separate `<div>` (see `ScrollTextBlocks.tsx`), every line IS the last (and only) line of its own block-level box, and CSS's `text-align: justify` never stretches a block's last line by default. Both of these are addressed below (each `TEXT_BLOCKS[i].position`'s `maxWidth` becomes `width`, and `textAlignLast` is conditionally set).

- [ ] **Step 1: Update `sceneConfig.ts` — types, default, and the 5 blocks' config**

Change the `TextBlockConfig` interface (currently lines 71-82):
```ts
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
```
to:
```ts
export type TextBlockAlignment = 'left' | 'center' | 'right' | 'justify';

export const DEFAULT_TEXT_BLOCK_ALIGNMENT: TextBlockAlignment = 'justify';

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
```

In each of the 5 `TEXT_BLOCKS` entries: delete the `textAlign: '...',` line, and rename `maxWidth:` to `width:` in the `position` object (same value). E.g. block-1 (currently lines 96, 99):
```ts
    textAlign: 'left',
```
→ delete entirely, and:
```ts
    position: { top: '30%', left: '8%', maxWidth: '34ch' },
```
→
```ts
    position: { top: '30%', left: '8%', width: '34ch' },
```
Apply the same two edits (delete `textAlign`, rename `maxWidth`→`width`) to all 5 blocks (block-1 through block-5, currently at lines 96/99, 112/115, 128/131, 144/147, 160/163).

- [ ] **Step 2: Add context state — `app/lib/SceneControlsContext.tsx`**

Add the import: extend the existing `sceneConfig` import to also bring in `DEFAULT_TEXT_BLOCK_ALIGNMENT` and `type TextBlockAlignment`:
```ts
import { DEFAULT_SCENE_COLORS, DEBUG_RANGES, DEFAULT_TEXT_BLOCK_ALIGNMENT, type SceneColorKey, type TextBlockAlignment } from '@/app/lib/sceneConfig';
```

Add to the `SceneControlsValue` interface, alongside the other `textBlock*` fields:
```ts
  textBlockAlignment: TextBlockAlignment;
  setTextBlockAlignment: (v: TextBlockAlignment) => void;
```

Add the state, alongside the other `textBlock*` `useState` calls:
```ts
  const [textBlockAlignment, setTextBlockAlignment] = useState<TextBlockAlignment>(DEFAULT_TEXT_BLOCK_ALIGNMENT);
```

Add `textBlockAlignment` and `setTextBlockAlignment` to the `value` object (in the `useMemo`'s returned object) and add `textBlockAlignment` to its dependency array (setter functions from `useState` are stable and don't need to be listed, matching the existing convention for every other setter in this file).

- [ ] **Step 3: Use it in `ScrollTextBlocks.tsx`**

Replace:
```ts
  const { textBlockFontSizeMultiplier, textBlockShadowSizeMultiplier, textBlockShadowIntensityMultiplier } =
    useSceneControls();
```
with:
```ts
  const { textBlockFontSizeMultiplier, textBlockShadowSizeMultiplier, textBlockShadowIntensityMultiplier, textBlockAlignment } =
    useSceneControls();
```

Replace the per-block `transformOrigin` computation (currently reads `block.textAlign`):
```ts
        const transformOrigin =
          block.textAlign === 'left' ? 'top left' : block.textAlign === 'right' ? 'top right' : 'top center';
```
with:
```ts
        const transformOrigin =
          textBlockAlignment === 'left' ? 'top left' : textBlockAlignment === 'right' ? 'top right' : 'top center';
```

Replace `textAlign: block.textAlign,` in the `<div>`'s style object with:
```ts
              textAlign: textBlockAlignment,
              // text-align: justify never stretches a block's LAST line by
              // default — and since each line here is already its own
              // separate <div> (see the .map below), every line IS the last
              // line of its own box. text-align-last forces it to justify too.
              textAlignLast: textBlockAlignment === 'justify' ? 'justify' : undefined,
```

- [ ] **Step 4: Add the debug-menu control — `app/components/DebugMenu.tsx`**

Extend the `useSceneControls()` destructure to also read `textBlockAlignment, setTextBlockAlignment`.

In the "Texto — bloques" section (currently the 3 `SliderRow`s for font size / shadow size / shadow intensity, ~lines 313-333), add a `<select>` row above the sliders:
```tsx
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span>Justificación de texto</span>
            <select
              value={textBlockAlignment}
              onChange={(e) => setTextBlockAlignment(e.target.value as typeof textBlockAlignment)}
              style={{ marginLeft: 8 }}
            >
              <option value="justify">Justificado</option>
              <option value="center">Centrado</option>
              <option value="left">Izquierda</option>
              <option value="right">Derecha</option>
            </select>
          </label>
```

- [ ] **Step 5: Verify**

1. `npx tsc --noEmit`, `npm run build`, `npm run lint` — all clean. `npm test` — confirm `sceneConfig.test.ts` still passes (it doesn't assert per-block `textAlign` or `maxWidth`, confirmed by grep, so no test changes needed).
2. Playwright, dev server: scroll to a point where a text block is visible. Confirm the default alignment is `'justify'` (open the debug menu, confirm the select shows "Justificado" selected). Inspect the block's computed style: confirm `text-align: justify` AND `text-align-last: justify` are both applied, and that lines visibly stretch to fill the block's fixed `width` (compare a short line vs. a long line in the same block — with justify, short lines should show visibly wider inter-word gaps than they would at their natural/shrink-wrapped width). Switch the debug-menu select through all 4 options and confirm each visibly changes the block's text alignment (and, for left/right, confirm `transformOrigin` still anchors the debug font-size-multiplier scale correctly at that edge, not center).

- [ ] **Step 6: Commit**

```bash
git add app/lib/sceneConfig.ts app/lib/SceneControlsContext.tsx app/components/ScrollTextBlocks.tsx app/components/DebugMenu.tsx
git commit -m "feat: add debug-menu text-block alignment control (left/center/right/justify, default justify)"
```

---

## Task 4: Corridor wave pattern rework — reactive first half, calm/static second half

**Files:**
- Modify: `app/lib/corridor.ts`
- Modify: `app/lib/sceneConfig.ts`
- Modify: `app/components/Section1.tsx`

**What's requested:** For the first 50% of the corridor's length (floor/ceiling/2 walls), the wave pattern should be the SAME TYPE as the main stage's flow field and REACT to the sphere's movement through the corridor (the corridor's own "doppler wave compression," mirroring what the main disc's floor already does). For the last 50%, the lines should be FIXED/calm — reading like the main stage's flow field at the very start of the page's scroll, when the sphere is far away and the lines are undisturbed, parallel, and static-looking.

This fully replaces the current scheme (first 20% = animated noise pattern, last 80% = flat solid color) — there is no more "solid zone"; the entire tunnel length now shows a line pattern, split into a reactive half and a calm half.

**Grounding for "reactive to the sphere's trajectory":** Inside the corridor, the sphere moves along a single axis (world -Z, i.e. decreasing local Z within the corridor group) — `Section1.tsx`'s `animate()` already tracks this every frame as `travelDistance` (`app/lib/finalPhase.ts`'s `corridorTravelDistance()`) and computes `sphereSpeed` from its frame-to-frame delta (~line 821-832). Separately, `floorDopplerStateRef`/`stepFloorDopplerState` (`app/lib/audioMath.ts`) is ALREADY being stepped every frame using this exact speed, INCLUDING while inside the corridor (confirmed: `floorEffectiveSpeed = progress >= FLOOR_DOPPLER_MIN_CAMERA_PROGRESS ? sphereSpeed : 0`, and `progress` is pinned at `1.0` throughout the corridor phase since `scrollRef.current` is clamped to `instance / INTRO_CAMERA_INSTANCES` and corridor instances are far past `INTRO_CAMERA_INSTANCES`), and its output already drives `flowUniforms.uDopplerCompress.value` (the exact scalar the main stage's flow field uses for its own doppler-compression wave effect, `FLOW_FRAG` line ~168). This task reuses that SAME already-inertia-tuned scalar for the corridor's own wave pattern — no new physics/state machine needed, just new shader math and one new uniform wired to an existing value.

- [ ] **Step 1: Rewrite `PATTERN_VERT`/`PATTERN_FRAG` in `app/lib/corridor.ts`**

Replace the file's top block (currently lines 5-59: the comment, `PATTERN_VERT`, and `PATTERN_FRAG`) with:

```ts
/* Floor / ceiling / side walls: a flow-line pattern (same visual
 * family as the main stage's FLOW_FRAG) for the corridor's full
 * length — reactive to the sphere's movement in the first
 * `uReactivePortion` of the length, then calm/static (reading like
 * the main stage's undisturbed lines at the very start of the page's
 * scroll) for the rest. */
const PATTERN_VERT = /* glsl */ `
  uniform float uMeshOffsetZ;
  uniform float uLength;
  varying float vPatternT;  // 0 at the entrance, 1 at the end wall
  varying vec2  vSurfaceUV;
  varying vec3  vNormal;
  varying float vLocalZ;    // this fragment's local Z, SAME space/units as uSpherePosZ (0 at entrance, negative toward the end wall)
  void main() {
    float groupLocalZ = uMeshOffsetZ + position.z;
    vPatternT   = clamp(-groupLocalZ / uLength, 0.0, 1.0);
    vLocalZ     = groupLocalZ;
    vSurfaceUV  = position.xy;
    vNormal     = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PATTERN_FRAG = /* glsl */ `
  precision highp float;
  ${HASH_NOISE_FBM_GLSL}
  uniform float uTime;
  uniform float uReactivePortion; // fraction (0..1) of the tunnel's length that reacts to the sphere — the rest is calm/static
  uniform float uLength;
  uniform float uSpherePosZ;      // sphere's current local Z inside the corridor group — same space as vLocalZ
  uniform float uDopplerCompress; // same scalar the main stage's flow field (FLOW_FRAG) uses for its doppler-compression effect
  uniform vec3  uPatternColorA;
  uniform vec3  uPatternColorB;
  varying float vPatternT;
  varying vec2  vSurfaceUV;
  varying vec3  vNormal;
  varying float vLocalZ;
  void main() {
    // How close this fragment is along the tunnel's length to the sphere —
    // a 1D analogue of FLOW_FRAG's radial falloff around the sphere.
    float distFromSphere = abs(vLocalZ - uSpherePosZ);
    float falloff = 1.0 - smoothstep(0.0, uLength * 0.30, distFromSphere);
    // Reactive only in the tunnel's first uReactivePortion; the back half
    // always reads like the calm, undisturbed lines at the very start of
    // the page's scroll (sphere far away) — smoothstepped over a short
    // band so there's no visible seam at the 50% boundary.
    float reactiveZone = 1.0 - smoothstep(uReactivePortion - 0.06, uReactivePortion, vPatternT);
    float compress = uDopplerCompress * falloff * reactiveZone;

    // ── Flow-style iso-lines running along the tunnel's length ──────
    // Same spirit as FLOW_FRAG's iso-contour bands: fbm warp + a
    // periodic function whose local frequency rises near the sphere.
    float warp     = fbm(vSurfaceUV * 0.12 + vec2(vLocalZ * 0.02, uTime * 0.05)) - 0.5;
    float lineFreq = 0.55 + compress * 0.12;
    float lp       = fract(vLocalZ * lineFreq + warp * 1.4 + uTime * 0.12);
    float lw       = 0.10;
    float band     = smoothstep(0.0, lw, lp) * smoothstep(2.0 * lw, lw, lp);
    band           = pow(band, 0.6);

    vec3 patCol = mix(uPatternColorA, uPatternColorB, fract(vLocalZ * 0.01 + uTime * 0.015));
    vec3 color  = mix(vec3(0.03, 0.02, 0.07), patCol, band);

    // ── Directional shading (unchanged from the prior corridor-lighting
    // fix — floor/ceiling/walls must keep reading as distinct 3D
    // surfaces, not a flat void; see the round-4 fix this comment block
    // is carried over from) ──────────────────────────────────────────
    vec3  N        = normalize(vNormal);
    vec3  lightDir = normalize(vec3(0.4, 1.0, 0.3));
    float ndotl    = max(dot(N, lightDir), 0.0);
    float shade    = 0.45 + 0.55 * ndotl;
    shade         += 0.05 * N.y - 0.03 * N.x;
    color         *= shade;
    gl_FragColor   = vec4(color, 1.0);
  }
`;
```

- [ ] **Step 2: Update the pattern uniforms in `buildCorridor()`**

Replace (currently lines 110-118):
```ts
  const patternUniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uLength: { value: length },
    uPatternedPortion: { value: CORRIDOR_CONFIG.patternedPortion },
    uPatternColorA: { value: new THREE.Color(CORRIDOR_CONFIG.patternColorA) },
    uPatternColorB: { value: new THREE.Color(CORRIDOR_CONFIG.patternColorB) },
    uSolidColor: { value: new THREE.Color(CORRIDOR_CONFIG.solidColor) },
    uMeshOffsetZ: { value: 0 }, // overridden per-surface below
  };
```
with:
```ts
  const patternUniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uLength: { value: length },
    uReactivePortion: { value: CORRIDOR_CONFIG.reactivePortion },
    uSpherePosZ: { value: 0 },
    uDopplerCompress: { value: 0 },
    uPatternColorA: { value: new THREE.Color(CORRIDOR_CONFIG.patternColorA) },
    uPatternColorB: { value: new THREE.Color(CORRIDOR_CONFIG.patternColorB) },
    uMeshOffsetZ: { value: 0 }, // overridden per-surface below
  };
```

- [ ] **Step 3: Update `sceneConfig.ts`'s `CORRIDOR_CONFIG`**

Replace (currently lines 326 and 338):
```ts
  patternedPortion: 0.2, // first 20% of length keeps the wave pattern
```
with:
```ts
  reactivePortion: 0.5, // first 50% of length reacts to the sphere; the rest is calm/static
```
and DELETE the `solidColor: '#4a3a72',` line and its long explanatory comment above it (lines ~329-338) — there's no more solid zone, the whole tunnel is now patterned, so this is dead config.

- [ ] **Step 4: Wire `uSpherePosZ`/`uDopplerCompress` per frame in `Section1.tsx`**

In the corridor branch of `animate()` (where `corridor.patternUniforms.uTime.value` is already set, ~lines 834-836):
```ts
        corridorTimeAccumRef.current += dt * corridorWaveSpeedMultRef.current;
        corridor.patternUniforms.uTime.value = corridorTimeAccumRef.current;
        corridor.endWallUniforms.uColorT.value = corridorTravelT;
```
add one line:
```ts
        corridorTimeAccumRef.current += dt * corridorWaveSpeedMultRef.current;
        corridor.patternUniforms.uTime.value = corridorTimeAccumRef.current;
        corridor.endWallUniforms.uColorT.value = corridorTravelT;
        corridor.patternUniforms.uSpherePosZ.value = -travelDistance;
```
(`travelDistance` is already in scope here — it's declared a few lines above in this same branch.)

Right after the existing `flowUniforms.uDopplerCompress.value = ...` assignment (~lines 940-941):
```ts
      flowUniforms.uDopplerCompress.value =
        floorDopplerStateRef.current.intensity * FLOOR_DOPPLER_CONFIG.compressionStrength * floorDopplerIntensityMultRef.current;
```
add:
```ts
      flowUniforms.uDopplerCompress.value =
        floorDopplerStateRef.current.intensity * FLOOR_DOPPLER_CONFIG.compressionStrength * floorDopplerIntensityMultRef.current;
      corridor.patternUniforms.uDopplerCompress.value = flowUniforms.uDopplerCompress.value;
```
(This line runs unconditionally every frame, same as the line above it — harmless when not in the corridor phase, since the corridor isn't in view then.)

- [ ] **Step 5: Verify — code + THOROUGH Playwright visual verification**

This is a shader-heavy visual task in the exact area (`corridor.ts`'s surface shading) that took 4 rounds of fixes in the prior plan to get right — do not skip visual verification.

1. `npx tsc --noEmit`, `npm run build`, `npm run lint` — all clean. `npm test` — confirm no test references the removed `patternedPortion`/`solidColor` (grep first; none do, per a prior check of this exact codebase).
2. Playwright, dev server: scroll deep into the corridor (well past the last text block, into the final phase). At MULTIPLE depths spanning the FIRST half (e.g. ~10%, 25%, 40% of the tunnel's length) and MULTIPLE depths spanning the SECOND half (e.g. ~60%, 75%, 90%), across all 4 surfaces (floor/ceiling/left wall/right wall) each time:
   - Confirm floor/ceiling/walls still read as visually DISTINCT surfaces (not a flat/identical fill) — re-verify the directional-shading fix from the prior round is intact (this shader carries that code over unchanged, but confirm empirically, not just by reading the diff).
   - In the first-half samples: scroll SLOWLY through a stretch of the first half while the sphere is actively moving, and confirm the line pattern's local density/frequency visibly increases near wherever the sphere currently is (compare a screenshot with the sphere near a given depth vs. a screenshot with the sphere far from that same depth).
   - In the second-half samples: confirm the lines look calm/static — i.e., their spacing does NOT visibly change as the sphere moves through the corridor (screenshot the same second-half depth at two different sphere positions and confirm the pattern there is materially the same both times, unlike the reactive first half).
   - Confirm there's no jarring visual seam/discontinuity right at the 50% boundary (the smoothstep band should make this a gradual transition, not a hard cut).
   - Confirm no part of the tunnel looks like a crushed near-black flat void under the app's ACES tonemapping (a real risk empirically discovered in the prior plan — sample actual pixel RGB values via screenshot, don't just eyeball it, and confirm the pattern's dark background base color and bright line color are both clearly distinguishable on screen, not crushed to near-identical near-black).
3. Confirm the corridor's end-wall (red→blue lerp) and the "IR A LA SIMULACION" link are unaffected (this task doesn't touch `END_WALL_VERT`/`END_WALL_FRAG`).
4. Confirm scrolling back out of the corridor and back in still works cleanly (no console errors, no stuck shader state).

- [ ] **Step 6: Commit**

```bash
git add app/lib/corridor.ts app/lib/sceneConfig.ts app/components/Section1.tsx
git commit -m "feat: rework corridor wave pattern — reactive to the sphere in the first half, calm/static in the second half"
```

---

## Task 5: Corridor-entrance star field

**Files:**
- Modify: `app/components/Section1.tsx`

**What's requested:** At the first camera position where the camera sits outside the corridor (i.e., the very start of the corridor phase — the chase camera, positioned behind and above the sphere, starts out just outside/behind the tunnel's mouth before the sphere has traveled any real distance in), stars should be visible in the sky background, with random brightness variation.

**Why this doesn't already work:** The existing star field (`Section1.tsx` ~lines 559-592, a single `THREE.Points` added directly to `scene`) is positioned near world Y∈[1.5, ~80] around world-origin X/Z — anchored to the main disc scene. The corridor sits at `CORRIDOR_CONFIG.yOffset = -80` — 80+ units below the existing stars — so they're never in view from anywhere in the corridor phase, including its very first frame. The star SHADER already has random-brightness twinkle built in (`STAR_VERT`'s `twinkle = 0.30 + 0.70 * abs(sin(uTime * (0.5 + aPhase) + aPhase * 6.28))`, driven by each star's own random `aPhase`) — that part of the request is already satisfied by the existing shader; this task just needs a SECOND small star field positioned where the corridor's camera can actually see it, reusing the same shader/material (so the twinkle behavior comes for free).

- [ ] **Step 1: Add a second star `Points` object as a child of `corridor.group`**

In the mount effect, right after the existing disc star field is added to the scene (`scene.add(new THREE.Points(starGeo, starMat));`, ~line 592), add:

```ts
    /* ── Corridor-entrance star field ──────────────────────────────
     * The disc star field above is anchored near world Y∈[0,80] around
     * the main scenario — far above the corridor (CORRIDOR_CONFIG.yOffset
     * = -80), so it's never in view once the camera teleports down there.
     * This is a second, smaller field positioned in the corridor's own
     * local space (added as a child of corridor.group, so it moves with
     * it automatically), reusing the SAME material/uniforms as the disc
     * field — same shader, same random-brightness twinkle, for free —
     * just different geometry/positions. Placed above and a bit behind
     * the tunnel entrance (local +Z, since the tunnel extends toward -Z),
     * matching where the very first corridor-phase camera position
     * (behind + above the sphere, chase-cam) actually looks. */
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
```

(`corridor` and `starMat` are both already in scope at this point in the mount effect — `corridor` from the earlier `buildCorridor()` call, `starMat` from the disc star field a few lines above.)

- [ ] **Step 2: Dispose the new geometry on unmount**

In the mount effect's cleanup function, next to the existing `starGeo.dispose(); starMat.dispose();` (~line 1032), add:
```ts
      corridorStarGeo.dispose();
```
(`starMat` is shared between both `Points` objects and only needs disposing once — already covered.)

- [ ] **Step 3: Verify**

1. `npx tsc --noEmit`, `npm run build`, `npm run lint` — all clean.
2. Playwright, dev server: scroll to the very start of the corridor phase (`finalPhaseProgress` just above 0 — the sphere has barely started traveling). Screenshot the frame and confirm stars are visible in the upper portion of the view. Wait ~1-2 seconds and screenshot again — confirm at least some stars show a visibly different brightness between the two screenshots (the twinkle effect, sampled via pixel RGB at a few star positions, not just eyeballed).
3. Scroll further into the corridor (sphere well down the tunnel) and confirm the corridor-entrance stars are no longer in view (expected — the chase camera has moved well past the entrance by then; this isn't a "stars visible everywhere" feature, just at the entrance).
4. Scroll back out of the corridor phase entirely and confirm the original disc star field is unaffected (still visible/twinkling as before).

- [ ] **Step 4: Commit**

```bash
git add app/components/Section1.tsx
git commit -m "feat: add a corridor-entrance star field, visible from the first corridor-phase camera position"
```

---

## Task 6: End-wall link text — margins, wrapping, always centered

**Files:**
- Modify: `app/components/Section1.tsx`

**What's requested:** The "IR A LA SIMULACION" link, projected onto the corridor's end wall, should always keep a margin from the wall's physical edges (never touch them) and wrap onto multiple lines if the text is too large for the available width — while staying centered.

**Current gap:** The link's screen position is computed every frame by projecting only the wall's CENTER point (`corridor.endWallCenter`) — there's no `width`/`max-width` at all on the element, so long text (or a large font size, e.g. via very wide viewports where `clamp(16px, 2.2vw, 28px)` grows) has no margin/wrapping constraint and can overflow past the wall's visible bounds.

- [ ] **Step 1: Project the wall's edges (not just its center) and set a pixel-accurate `maxWidth`**

In the corridor branch of `animate()` where the link's position is computed (`Section1.tsx`, currently ~lines 867-884):
```ts
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
```
replace with:
```ts
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
      } else if (endLinkRef.current) {
```

(`corridor.crossSection` is already exposed on `CorridorHandle` and already used elsewhere in this same file, e.g. `applyCorridorCamera`'s `tunnelCenterY` calc — no interface changes needed. The element is `position: absolute`, which forces block-level box generation per the CSS spec regardless of `<a>`'s default `display: inline` — so `max-width` already applies correctly and default `white-space: normal` already wraps; no other style changes are needed, just this new `maxWidth` constraint.)

- [ ] **Step 2: Verify**

1. `npx tsc --noEmit`, `npm run build`, `npm run lint` — all clean.
2. Playwright, dev server: scroll to the very end of the corridor (link visible, `reached === true`). Screenshot and confirm the link text sits with visible margin from both the wall's rendered left/right extent — not flush against it. Confirm the link stays horizontally centered (its computed `left` position should still track the wall's actual center, unaffected by the new `maxWidth`).
3. Temporarily test wrapping: in the Playwright script, use `page.evaluate()` to temporarily inject much longer text into the link (or shrink the viewport significantly, since `clamp()` font-size + a fixed max-width interact) and confirm it wraps onto multiple lines rather than overflowing past the margin — then confirm the ORIGINAL text/viewport still renders as a single line (it should, given the current short text and reasonably-sized wall) with the same centered/margined appearance as before this change.
4. Confirm this doesn't regress anything about WHEN the link appears/disappears (`reached` gating, opacity, pointer-events, tabIndex, aria-hidden) — this task only adds `maxWidth`, doesn't touch that logic.

- [ ] **Step 3: Commit**

```bash
git add app/components/Section1.tsx
git commit -m "fix: give the end-wall link text a margin-safe, wrapping max-width instead of unconstrained overflow"
```

---

## Task 7: Full QA pass

**Files:** none (verification only; fix genuine bugs found, don't invent scope)

- [ ] **Step 1: Run the full unit-test suite**

Run: `npm test` — expect ALL suites green, including any that reference the config touched by Tasks 2-4 (`sceneConfig.test.ts`, `finalPhase.test.ts`, `audioMath.test.ts`, `scrollTimeline.test.ts`, `basePath.test.ts` — whatever the current suite is).

- [ ] **Step 2: Verify the production build**

Run: `npm run build` — must complete cleanly with no errors (Task 1 removes the last remnant of static-export config, so this is now a normal Next.js/Vercel build emitting `.next/`, not a static `out/` folder — don't expect or require `out/` to exist). Run: `npm run lint` — must be 0 errors AND 0 warnings.

- [ ] **Step 3: Full code-level + live walkthrough checklist**

For each item, verify by READING the final code (file:line) AND, where the item is visual/interactive, confirm live via Playwright against the dev server — do not just trust a prior task's own report:

1. **File-upload bug (Task 1)** — selecting "Archivo MP3" in the debug menu keeps the file-input section visible and lets a file actually be picked and played; confirm the fix's root cause explanation still holds after all of Tasks 2-6's changes (nothing later in this plan touches audio wiring, but confirm).
2. **Title/text-block sync (Task 2)** — `TITLE_HIDE_TRIGGER_INSTANCE` equals `TEXT_BLOCKS[0].startInstance` by construction (re-read the config); live-test both a slow and a fast scroll past instance 1 and confirm the title hides and block 1 appears in sync both times; confirm scrolling back to the top still instantly restores the title; confirm the corridor-exit title-visibility restore logic (a previously-fixed regression) still works.
3. **Text alignment control (Task 3)** — default is `'justify'`; the debug-menu select has all 4 options and each visibly changes all 5 blocks' alignment; `text-align-last: justify` is applied only when the mode is `'justify'`; no block-level `textAlign` field remains in `TEXT_BLOCKS`' config (grep to confirm).
4. **Corridor wave pattern (Task 4)** — no `patternedPortion`/`solidColor` reference remains anywhere in `app/` (grep to confirm); the first half of the tunnel visibly reacts to the sphere's position (live-test at 2+ depths), the second half stays visually calm/static regardless of sphere position (live-test at 2+ depths); floor/ceiling/walls still read as distinct 3D surfaces (the directional-shading fix from the prior plan is intact); no crushed-to-black void anywhere (sample real pixel RGB values).
5. **Corridor-entrance stars (Task 5)** — visible with a live twinkle (brightness genuinely changes over ~1-2s, confirmed via pixel sampling) at the very start of the corridor phase; the pre-existing disc star field is unaffected.
6. **End-wall link margins (Task 6)** — link never touches the wall's rendered edges at the standard end-of-corridor viewing position; wraps onto multiple lines under an artificially-lengthened test string rather than overflowing; stays centered; `reached`-gated visibility/opacity/pointer-events/tabIndex/aria-hidden behavior is unchanged.
7. **Cross-cutting** — every new context field from Task 3 (`textBlockAlignment`/`setTextBlockAlignment`) has a default, a setter used somewhere, and is actually read somewhere driving real behavior; no orphaned/unused state; no new `react-hooks/exhaustive-deps` warnings introduced by any task's context/effect changes.

- [ ] **Step 4: Report**

Summarize pass/fail for all 7 checklist items. For any genuine bug found, the controller will dispatch a targeted fix (implementer + spec review + code-quality review, same pattern as every task above) before considering the plan complete.

---

## Self-Review

**Spec coverage** (every item from the user's message, mapped to a task):
- Corrección 1 — mp3 file-upload closes before a file can be picked → Task 1.
- Corrección 2 — text blocks start immediately after the title disappears, in both time and scroll place → Task 2.
- Modificación 1 — debug-menu text-alignment control (justify/center/left/right, default justify) → Task 3.
- Modificación 2a — corridor first-50% reactive wave pattern, last-50% calm/static → Task 4.
- Modificación 2b — stars with random brightness at the corridor's first exterior camera position → Task 5.
- Modificación 2c — end-wall text margins, wrapping, centered → Task 6.
- Task 7 closes the loop with full-suite verification and a live walkthrough of every item above.

**Placeholder scan:** no `TBD`/`fill in later` markers; every task has complete, literal code for every step. Task 1's root cause was independently confirmed (live Playwright investigation + `next.config.ts` git history) before this plan was finalized, and the user confirmed the Vercel-only deployment target before Task 1's fix was written.

**Type consistency:** `TextBlockAlignment` (Task 3) is defined once in `sceneConfig.ts` and consumed identically in `SceneControlsContext.tsx` and `ScrollTextBlocks.tsx`. `CORRIDOR_CONFIG.reactivePortion` (Task 4) replaces `patternedPortion` with the same shape (a plain 0..1 number) so no consumer-side type changes ripple beyond what's listed. `CorridorHandle`'s interface (`corridor.ts`) is unchanged in shape by both Task 4 and Task 6 — Task 4 only changes uniform contents (still `Record<string, THREE.IUniform>`), Task 6 only reads the already-exposed `crossSection`/`endWallCenter` fields, so no consumer elsewhere in `Section1.tsx` needs any type-level change.
