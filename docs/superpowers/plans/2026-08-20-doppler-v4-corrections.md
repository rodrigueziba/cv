# Doppler V4 Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change 4 text-block debug defaults; replace the corridor's flat periodic-band wave pattern with a genuine port of the main stage's potential-flow technique (so it actually curves/swirls around the sphere like the reference); make the disc star field visible from EVERY camera angle (currently invisible during the whole final pre-corridor phase, since that camera looks almost straight down at the flow plane, entirely missing the world-anchored star field's position).

**Architecture:** All work happens in 2 existing files: `app/lib/sceneConfig.ts` (defaults) and `app/lib/corridor.ts` + `app/components/Section1.tsx` (shader rework + star-field-follows-camera).

**Tech Stack:** Next.js 16, React 19, TypeScript, raw Three.js (GLSL `ShaderMaterial`s), Vitest, Playwright (required for visual verification — Tasks 2 and 3 are pure visual/shader work with a documented history of needing thorough Playwright pixel-sampling, not just code review, to catch real defects).

---

## Task 1: Update text-block debug defaults

**Files:**
- Modify: `app/lib/sceneConfig.ts`

**What's requested:** Change 4 default values for the scroll text blocks' debug-adjustable appearance:
- Text alignment: `center` (was `justify`)
- Font size multiplier: `1.30` (was `1.0`)
- Shadow size multiplier: `1.70` (was `1.0`)
- Shadow intensity multiplier: `2.0` (was `1.0`)

- [ ] **Step 1: Change the alignment default**

In `app/lib/sceneConfig.ts` (currently line 67):
```ts
export const DEFAULT_TEXT_BLOCK_ALIGNMENT: TextBlockAlignment = 'justify';
```
to:
```ts
export const DEFAULT_TEXT_BLOCK_ALIGNMENT: TextBlockAlignment = 'center';
```

- [ ] **Step 2: Change the 3 multiplier defaults in `DEBUG_RANGES`**

Currently (lines 365-374):
```ts
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
Change ONLY the first 3 lines' `default` values (leave `min`/`max`/`step` and every other entry untouched):
```ts
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
```
(`textBlockShadowIntensityMultiplier`'s new default of `2.0` sits exactly at its `max` — that's intentional and valid, not a bug; `shadowToCss()`'s `intensityMult` clamps alpha to `[0,1]` internally, so a `2.0` multiplier on a base alpha of `0.80` (the text blocks' configured shadow alpha) still clamps correctly to `1.0`, it doesn't overflow anything.)

- [ ] **Step 3: Verify**

`npx tsc --noEmit`, `npm run build`, `npm run lint`, `npm test` — all clean (no test asserts these specific default values, confirmed by grep). Playwright, dev server: scroll to a visible text block, open the debug menu, confirm the alignment select shows "Centrado" and the 3 sliders show 1.30/1.70/2.00 as their current (not just default-on-reset) values on a FRESH page load — i.e., confirm `useState`'s initial value actually reflects the new defaults, not just that the config constant changed.

- [ ] **Step 4: Commit**

```bash
git add app/lib/sceneConfig.ts
git commit -m "feat: update text-block debug defaults (center alignment, 1.30 font/1.70 shadow-size/2.0 shadow-intensity)"
```

---

## Task 2: Corridor wave pattern — port the main stage's actual potential-flow technique

**Files:**
- Modify: `app/lib/corridor.ts`

**The problem (user-reported, with a screenshot):** The corridor's current floor/ceiling/wall pattern (added in the prior plan) uses a 1D periodic band function — `fract(vLocalZ * lineFreq + warp*1.4 + uTime*0.12)` — which only varies along the tunnel's length (Z axis). This produces plain, straight, evenly-spaced ripples running across the tunnel width — visually flat and repetitive, not organic. The user wants it to look like the main stage's flow field (`FLOW_FRAG` in `Section1.tsx`), which uses a genuine 2D potential-flow stream function (`ψ = U_cross · (1 − R²/r²)`) that makes iso-contour lines actually CURVE/SWIRL around the sphere's position — that curving, organic quality is the whole visual character that's currently missing from the corridor.

**The fix:** Replace the 1D band math with a real 2D potential-flow field on EACH surface's own local plane, directly porting `FLOW_FRAG`'s technique (same stream-function formula, same fbm organic warp, same near-sphere falloff), using the sphere's actual corridor position as the flow's deflection point — so the pattern genuinely curves around wherever the sphere currently is, exactly like the main stage does around the sphere in the disc phase.

**Design notes (read first):**
- Each corridor surface's mesh already provides 2 useful local coordinates that combine into a natural per-surface "flow plane": `vSurfaceUV.x` (the geometry's local X) is the meaningful "width" axis for the floor/ceiling (their X range spans the full `crossSection`, while their Y is a near-zero `thickness`) — and `vSurfaceUV.y` (local Y) is the meaningful "height" axis for the walls (their Y range spans the full `crossSection`, while their X is a near-zero `thickness`). Since exactly one of `vSurfaceUV.x`/`vSurfaceUV.y` is always near-zero for any given surface, `vSurfaceUV.x + vSurfaceUV.y` cleanly gives "the meaningful secondary axis, whichever one it is" for ANY of the 4 surfaces, without needing a per-surface flag. Paired with `vLocalZ` (already available, the length axis — same one `uSpherePosZ` is expressed in), this gives a genuine 2D "flow plane" per surface, directly analogous to `FLOW_FRAG`'s `vWorldPos.xz`.
- The "reactive first half / calm second half" requirement from the prior plan is KEPT, but implemented more correctly this time: instead of just scaling the compression's magnitude by `reactiveZone` (which left the underlying curvature still tracking the sphere even in the "calm" zone — a subtle bug the user's screenshot didn't happen to expose but is worth fixing while rewriting this), the fix blends the potential-flow field's OWN distance term (`r²`) toward a very large value as `reactiveZone` fades to 0. Since potential flow naturally straightens to parallel, uncurved lines as distance from the deflection point grows (this is literally what "far from sphere" already looks like in `FLOW_FRAG` at progress=0), forcing a large effective distance in the calm zone makes those lines straighten out AUTOMATICALLY, using the same physics-consistent math — not an artificial separate code path. This is what makes the calm zone genuinely "tal cual el inicio del escenario en el inicio del scroll" (literally the same underlying formula producing the same undisturbed-parallel-lines look), not just a different, unrelated pattern that happens to look calm.
- Corridor colors stay within the existing `CORRIDOR_CONFIG.patternColorA`/`patternColorB` 2-tone palette (already tuned in an earlier round for visibility under this app's ACES tonemapping) — this task ports the LINE-CURVING technique, not `FLOW_FRAG`'s separate rainbow-Phase-3 coloring (which is tied to the main stage's own `uProgress` concept that the corridor doesn't have an equivalent of).
- The directional-shading block at the end (floor/ceiling/wall distinct-surface fix) is UNCHANGED — copy it byte-for-byte from the current file, do not reformat or reword its comments even slightly (this exact code was flagged in the prior round for accidentally losing its rationale comment when "unrelated" edits nearby reformatted it).

- [ ] **Step 1: Replace `PATTERN_FRAG` in `app/lib/corridor.ts`**

`PATTERN_VERT` is UNCHANGED — leave it exactly as-is. Replace only `PATTERN_FRAG` (currently the whole block from `const PATTERN_FRAG = ...` through its closing `` ` ``, roughly lines 28-92) with:

```ts
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
    /*
     * Direct port of FLOW_FRAG's potential-flow technique (see
     * Section1.tsx) onto this surface's own local plane, instead of the
     * old 1D periodic-band pattern — this is what makes the lines
     * genuinely CURVE around wherever the sphere currently is, instead
     * of reading as flat, repetitive ripples.
     *
     * "secondaryAxis" is whichever of this surface's two in-plane local
     * axes actually varies across the surface's width/height (floor/
     * ceiling: local X; walls: local Y) — exactly one of vSurfaceUV.x/.y
     * is always near-zero for any given surface (the thin "thickness"
     * axis), so summing them cleanly picks out the meaningful one
     * without a per-surface flag.
     */
    float secondaryAxis = vSurfaceUV.x + vSurfaceUV.y;
    vec2  planeXZ        = vec2(secondaryAxis, vLocalZ);   // this surface's flow plane, analogous to FLOW_FRAG's vWorldPos.xz
    vec2  spherePos2D    = vec2(0.0, uSpherePosZ);          // the sphere always sits at secondaryAxis=0 (tunnel centerline) in corridor-local space

    // Reactive only in the tunnel's first uReactivePortion — smoothstepped
    // over a short band so there's no visible seam at the boundary.
    float reactiveZone = 1.0 - smoothstep(uReactivePortion - 0.06, uReactivePortion, vPatternT);

    vec2  delta   = planeXZ - spherePos2D;
    float trueR2  = dot(delta, delta) + 0.0001;
    // In the calm zone, blend the DISTANCE term itself toward "very far"
    // rather than just damping the compression's magnitude — potential
    // flow naturally straightens to parallel, undisturbed lines far from
    // the deflection point (exactly what FLOW_FRAG looks like at
    // progress=0, sphere far from a given patch of the plane), so this
    // reuses the SAME formula to genuinely reproduce that look, rather
    // than an artificial separate "calm" code path. This also means the
    // calm zone truly ignores the sphere's actual position, not just its
    // magnitude — regardless of how close the sphere physically gets.
    float effectiveR2 = mix(1.0e6, trueR2, reactiveZone);
    float r            = sqrt(effectiveR2);

    /* Flow direction: mostly along the tunnel's length, with a slight
     * cross-component so the curve reads as directional, not perfectly
     * symmetric (mirrors FLOW_FRAG's diagonal U vector). */
    vec2  U      = normalize(vec2(0.22, 1.0));
    float Ucross = U.x * delta.y - U.y * delta.x;

    float R    = uLength * 0.09; // deflection radius, scaled to this tunnel's own size
    float psi  = Ucross * (1.0 - (R * R) / effectiveR2);

    // Organic fbm warp — fades out with distance from the (effective)
    // deflection point, same as FLOW_FRAG's farBlend.
    float farBlend = smoothstep(0.0, R * 5.0, r);
    float warp     = (fbm(planeXZ * 0.09 + vec2(uTime * 0.05, uTime * 0.03)) - 0.5) * 0.85 * farBlend;
    psi += warp;

    // Doppler-compression line-frequency swing — also gated by
    // reactiveZone so the calm zone's line spacing never pulses.
    float compress = uDopplerCompress * reactiveZone;
    float lineFreq = 5.5 + compress * 0.9;
    float lw       = 0.10;
    float lp       = fract(psi * lineFreq + uTime * 0.10);
    float line     = smoothstep(0.0, lw, lp) * smoothstep(2.0 * lw, lw, lp);
    line           = pow(line, 0.55);

    vec3  lineCol = mix(uPatternColorA, uPatternColorB, fract(secondaryAxis * 0.02 + uTime * 0.02));
    // Subtle glow right where the sphere is (gated by the same effective
    // distance, so it only appears in the reactive zone).
    float nearSph = 1.0 - smoothstep(0.0, R * 1.6, r);
    lineCol       = mix(lineCol, uPatternColorB * 1.4 + vec3(0.15), nearSph * 0.5);

    vec3 bg    = vec3(0.03, 0.02, 0.07);
    vec3 color = mix(bg, lineCol * 1.1, line);

    // Simple fake directional lighting so floor/ceiling/walls read as
    // distinct 3D surfaces instead of one flat, unlit color fill — this
    // is what makes the corridor actually look like a tunnel rather than
    // a colored void for the ~80% of its length past the patterned zone.
    vec3  N       = normalize(vNormal);
    vec3  lightDir = normalize(vec3(0.4, 1.0, 0.3));
    float ndotl   = max(dot(N, lightDir), 0.0);
    float shade   = 0.45 + 0.55 * ndotl; // ambient floor + directional term
    // The key light above clamps to the same 0.45 ambient floor for both
    // the ceiling (N ~ (0,-1,0)) and the right wall (N ~ (-1,0,0)), since
    // both have a negative dot product with lightDir — making them
    // pixel-identical. Fix with a small fixed per-axis tint keyed off the
    // *sign* of each face's dominant normal component: every one of the
    // 4 cardinal faces (+Y/-Y/+X/-X) gets a distinct constant offset, so
    // none of them can tie regardless of what the key light contributes.
    shade += 0.05 * N.y - 0.03 * N.x;
    color        *= shade;
    gl_FragColor  = vec4(color, 1.0);
  }
`;
```

`buildCorridor()`'s `patternUniforms` object does NOT need any changes — it already has every uniform this new shader references (`uTime`, `uReactivePortion`, `uLength`, `uSpherePosZ`, `uDopplerCompress`, `uPatternColorA`, `uPatternColorB`, `uMeshOffsetZ`), unchanged from the prior task. `Section1.tsx`'s per-frame wiring of `uSpherePosZ`/`uDopplerCompress` is also unchanged — this is a pure shader-body rewrite, nothing else in the codebase needs to change.

- [ ] **Step 2: Verify — code + THOROUGH Playwright visual verification against the user's actual complaint**

This task exists specifically because the PRIOR shader passed every automated check and a thorough Playwright review, yet still didn't look right to the user — so passing checks alone is not sufficient evidence here. Compare directly against the two reference screenshots the user provided: (1) the corridor's current bad flat-stripe look, (2) the main stage's `FLOW_FRAG` look (rainbow phase, but the relevant character to match is the LINE CURVATURE around the sphere, not the rainbow coloring).

1. `npx tsc --noEmit`, `npm run build`, `npm run lint`, `npm test` — all clean.
2. Playwright, dev server: scroll deep into the corridor. At a first-half depth, screenshot the floor/walls and visually confirm the lines actually CURVE — they should bend/deflect around wherever the sphere currently is, not run as straight, evenly-spaced bands. Move the sphere (scroll) to different corridor depths and confirm the curve visibly follows it.
3. At a second-half (calm-zone) depth, confirm the lines are genuinely straight/parallel/undisturbed (matching the "start of scroll" look) and — critically, re-testing the specific bug this rewrite fixes — confirm they stay straight even when the sphere is scrolled to be PHYSICALLY close to that depth (not just when it's far away), proving the calm zone truly ignores sphere proximity via the `effectiveR2` blend, not just a magnitude-only dampening that still curves.
4. Confirm no seam at the 50% boundary; confirm floor/ceiling/walls still shade as 4 distinct surfaces (the directional-shading block is unchanged, but verify empirically); confirm no ACES-crushed near-black void anywhere (sample real pixel RGB values); confirm the end-wall lerp and "IR A LA SIMULACION" link are unaffected; confirm scrolling back out and into the corridor works cleanly with no console errors.
5. Take a final full-tunnel screenshot and do an honest visual comparison against the user's 2 reference images — does the corridor now read as organic, curving, flow-like lines (image 2's character) rather than flat repetitive stripes (image 1's problem)? If your own visual judgment says it still doesn't match, you have latitude to retune constants (the `U` vector, `R`'s scale factor, `lineFreq`, warp strength) — document any deviation from this plan's literal numbers and why, same as the prior round's retuning was handled.

- [ ] **Step 3: Commit**

```bash
git add app/lib/corridor.ts
git commit -m "fix: port the main stage's actual potential-flow technique to the corridor pattern, replacing the flat periodic-band approximation"
```

---

## Task 3: Make the disc star field visible from every camera angle (currently invisible in the final pre-corridor phase)

**Files:**
- Modify: `app/components/Section1.tsx`

**The problem (user-reported):** In the final phase before entering the corridor (the whole scroll range where the camera is locked at its 4th/"rotated" keyframe — `pos: [0.5, 8, 0], target: [0, 0, 0]`, which points almost straight down at the flow plane), no stars are visible in the sky. This isn't a rendering bug — it's a geometry/framing fact: the disc star field (`Section1.tsx` ~lines 557-590) is placed at a FIXED position in world space (roughly centered on the origin, radius 30-55 units, always-positive Y i.e. "above the horizon"), but a camera looking nearly straight down from y=8 at a target 8 units below has a visible ground footprint radius of only a few units — nowhere near the star field's 30-55 unit radius. The stars were never geometrically reachable from that camera angle; this has nothing to do with the corridor-entrance star field added in the prior task (that one is unaffected and correctly scoped to the corridor's own local space — leave it alone).

**The fix:** Make the star field follow the camera every frame (re-centered on `camera.position`) and distribute stars across a FULL sphere around it (not just an "upper hemisphere" biased toward a fixed world position) — the standard skybox technique. This guarantees stars are visible from ANY camera angle/position in ANY phase (not just a narrow fix for this one phase), with zero parallax (correct for a field meant to read as "at infinity"), while the flow plane's own opaque geometry naturally occludes whichever hemisphere of stars would otherwise be "underground" relative to the current view, via ordinary depth testing — no extra code needed for that part.

- [ ] **Step 1: Generate a full-sphere star distribution (not upper-hemisphere-only)**

In `Section1.tsx`'s star-field generation loop (currently ~lines 562-572):
```ts
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
```
replace with:
```ts
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
```

- [ ] **Step 2: Capture the star `Points` object and re-center it on the camera every frame**

Change (currently `scene.add(new THREE.Points(starGeo, starMat));`):
```ts
    scene.add(new THREE.Points(starGeo, starMat));
```
to:
```ts
    const starPoints = new THREE.Points(starGeo, starMat);
    scene.add(starPoints);
```

In `animate()`, right next to the existing `starUniforms.uTime.value = time;` line, add:
```ts
      starUniforms.uTime.value     = time;
      starPoints.position.copy(camera.position);
```
(`starPoints` is a plain local `const` in the same mount-effect closure as `animate()` — no ref needed, same as `starUniforms` itself already works.)

- [ ] **Step 3: Verify**

1. `npx tsc --noEmit`, `npm run build`, `npm run lint`, `npm test` — all clean.
2. Playwright, dev server: scroll to the final pre-corridor phase (the whole range where the last text block is visible, camera locked at the "rotated" keyframe — this is the exact phase the user's reference screenshot was taken from) and confirm stars ARE now visible in-frame, with a genuine twinkle over time (pixel-sample, don't just eyeball). Then check at least 2 OTHER camera phases too (e.g. the initial side view at scroll instance 0, and the zenith/zoom phases around instance 1-3) and confirm stars are visible there as well — this should be true almost everywhere now, not just the one previously-broken phase.
3. Confirm the flow plane still properly occludes stars that would be "behind" it from the camera's perspective (i.e., you shouldn't see stars appearing to render THROUGH the opaque flow plane or sphere) — screenshot a phase where the flow plane fills most of the frame and confirm no stray bright points appear where the plane should be fully opaque.
4. Confirm the corridor-entrance star field (added in the prior task, `corridor.group`-local, untouched by this task) still works correctly and independently — scroll into the corridor and confirm those stars still appear at the entrance as before.
5. Confirm no console errors and no visual regression in the disc star field's basic appearance/density when viewed from the original side-view angle (instance 0) compared to before this change.

- [ ] **Step 4: Commit**

```bash
git add app/components/Section1.tsx
git commit -m "fix: make the disc star field follow the camera (full-sphere skybox) so stars are visible from every camera angle, including the final pre-corridor phase"
```

---

## Task 4: Full QA pass

**Files:** none (verification only; fix genuine bugs found, don't invent scope)

- [ ] **Step 1: Run the full unit-test suite**

Run: `npm test` — expect ALL suites green.

- [ ] **Step 2: Verify the production build**

Run: `npm run build` — must complete cleanly (normal Next.js/Vercel build, `.next/` output, no static `out/` expected). Run: `npm run lint` — must be 0 errors AND 0 warnings, except any pre-existing failures confirmed unrelated to this plan's files (e.g. from a stray nested worktree directory, if still present — check first, don't assume).

- [ ] **Step 3: Live walkthrough checklist**

For each item, confirm live via Playwright against the dev server:

1. **Text-block defaults (Task 1)** — fresh page load, scroll to a visible block, debug menu shows alignment=Centrado, font-size=1.30, shadow-size=1.70, shadow-intensity=2.00 as the CURRENT values (not requiring a manual reset).
2. **Corridor wave pattern (Task 2)** — lines visibly curve around the sphere's position in the first half; lines stay straight/parallel in the second half regardless of sphere proximity; no seam; floor/ceiling/walls still shade distinctly; no ACES-crushed void; end-wall/link unaffected.
3. **Star field (Task 3)** — stars visible in the final pre-corridor phase (previously broken) AND at least 2 other camera phases; twinkle confirmed via pixel-sampling; flow plane still properly occludes stars behind it; corridor-entrance stars (separate, prior-task feature) still work.
4. **Cross-cutting** — no new `react-hooks/exhaustive-deps` warnings; no orphaned state; nothing from the prior (V3) plan regressed (spot-check: mp3 file upload still works, title/text-block scroll sync still works, end-wall link margins still work).

- [ ] **Step 4: Report**

Summarize pass/fail for all items. For any genuine bug found, the controller will dispatch a targeted fix before considering the plan complete.

---

## Self-Review

**Spec coverage:**
- Text-block defaults (justificación=centrado, tamaño de fuente=1.30, tamaño de sombra=1.70, intensidad de sombra=2.0) → Task 1.
- Corridor wall/floor effect looks bad, should match the main stage's wave effect → Task 2.
- Stars not visible in the sky in the final phase before entering the corridor → Task 3.
- Task 4 closes the loop with full-suite verification and a live walkthrough.

**Placeholder scan:** no `TBD`/`fill in later` markers; every task has complete, literal code for every step, derived directly from reading both the current `corridor.ts`/`FLOW_FRAG` source and the user's 2 reference screenshots before writing this plan.

**Type consistency:** `PATTERN_FRAG`'s new body consumes exactly the uniforms/varyings already declared by the unchanged `PATTERN_VERT` and the unchanged `patternUniforms` object in `buildCorridor()` — no interface/type changes ripple anywhere else. Task 3's `starPoints` is a plain local `const`, not a new ref or context field, so no type surface changes there either.
