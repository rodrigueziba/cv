# Doppler V5 Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every missing accent mark and incorrect verb form (tú → vos) across the site's Spanish text; bump the text-block font-size debug default to 1.40; add 4 new floating narrative text blocks inside the corridor, positioned at the tunnel's cross-sectional center and timed to fade in/hold/fade-out as the sphere passes through each of the corridor's first four fifths.

**Architecture:** Text corrections touch `app/lib/sceneConfig.ts` (content) and `app/components/DebugMenu.tsx` (2 UI strings). The new corridor text blocks reuse the exact styling values (font, size, shadow) already defined for the main 5 scroll text blocks — sourced directly from `TEXT_BLOCKS[0]`, not duplicated — and reuse the exact fade-in/hold/fade-out math (`computeBlockOpacity`) already used for them, driven by a corridor-local "instance" derived from `corridorTravelT` instead of page-scroll instance. Screen positioning uses the same 3D→2D projection technique already established for the end-of-corridor link (`endLinkRef`).

**Tech Stack:** Next.js 16, React 19, TypeScript, raw Three.js, Vitest, Playwright (required for verifying the new corridor text blocks — a 3D-projected, scroll-position-of-sphere-gated feature that needs live visual confirmation, not just code review).

---

## Task 1: Text corrections — tildes, voseo, and the font-size default

**Files:**
- Modify: `app/lib/sceneConfig.ts`
- Modify: `app/components/DebugMenu.tsx`

**What's requested:** Add missing accent marks throughout the site's Spanish text, using Argentine/Latin-American voseo (not tuteo) for any imperative/verb forms. Also bump the text-block font-size multiplier's default from 1.30 to 1.40.

**Complete list of corrections found by auditing every Spanish string in the codebase (grepped directly, not from memory) — apply exactly these, nothing else:**

| File | Current | Corrected | Why |
|---|---|---|---|
| `sceneConfig.ts` `TITLE_CONFIG.text` | `'EFFECTO DOPPLER'` | `'EFECTO DOPPLER'` | Misspelling (double F) found while auditing all text — not a tilde issue, but an obvious drive-by fix to the site's main title while doing a full text-quality pass |
| `sceneConfig.ts` `TEXT_BLOCKS[1]` (block-2), 4th line | `'MAS AGUDO'` | `'MÁS AGUDO'` | Missing tilde on "más" (adverb "more", not "pero") |
| `sceneConfig.ts` `TEXT_BLOCKS[2]` (block-3), 4th line | `'MAS GRAVE'` | `'MÁS GRAVE'` | Same as above |
| `sceneConfig.ts` `TEXT_BLOCKS[3]` (block-4), 1st line | `'MOVE EL MOUSE PARA GUIAR'` | `'MOVÉ EL MOUSE PARA GUIAR'` | "MOVE" is neither correct tú imperative ("mueve") nor vos ("MOVÉ") — it's a typo; corrected to the proper vos imperative with tilde |
| `sceneConfig.ts` `TEXT_BLOCKS[3]` (block-4), 3rd line | `'Y ESCUCHA COMO CAMBIA'` | `'Y ESCUCHÁ CÓMO CAMBIA'` | "ESCUCHA" is tú imperative → vos imperative is "ESCUCHÁ"; "COMO" here is an indirect question ("listen to HOW it changes"), which keeps its accent in Spanish → "CÓMO" |
| `sceneConfig.ts` `TEXT_BLOCKS[4]` (block-5), 1st line | `'SEGUI SCROLLEANDO'` | `'SEGUÍ SCROLLEANDO'` | Already correct vos imperative, just missing its tilde |
| `sceneConfig.ts` `TEXT_BLOCKS[4]` (block-5), 4th line | `'SIMULACION COMPLETA'` | `'SIMULACIÓN COMPLETA'` | Missing tilde — every Spanish noun ending in "-ción" is accented |
| `sceneConfig.ts` `CORRIDOR_CONFIG.finalLinkText` | `'IR A LA SIMULACION'` | `'IR A LA SIMULACIÓN'` | Same as above |
| `sceneConfig.ts` `DEBUG_RANGES.textBlockFontSizeMultiplier.default` | `1.30` | `1.40` | Explicit request, unrelated to tildes |
| `DebugMenu.tsx` — the ✕ close button's `aria-label` | `"Cerrar menu de debug"` | `"Cerrar menú de debug"` | Missing tilde on "menú" |
| `DebugMenu.tsx` — the small hint line under the header | `(Shift para cerrar tambien)` | `(Shift para cerrar también)` | Missing tilde on "también" |

**Already correct — do NOT touch these, they're verified correct as-is:**
- `SPACE_PROMPT_CONFIG.text` = `'APRETÁ LA BARRA ESPACIADORA PARA ACTIVAR EL SONIDO'` — already correct vos imperative with its tilde.
- `TEXT_BLOCKS[0]` (block-1) — no verb forms, no missing tildes (`'EL EFECTO DOPPLER DESCRIBE'`, `'EL CAMBIO DE FRECUENCIA DE UNA ONDA'`, `'PERCIBIDO POR UN OBSERVADOR'`, `'CUANDO LA FUENTE SE MUEVE'`).
- Every `DebugMenu.tsx` label already checked and already correct: "Justificación de texto", "Cámara", "Cámara libre (WASD + Q/E + mouse)", "Tamaño de fuente", "Tamaño de sombra", "Intensidad de sombra", "Inercia del pitch (Doppler)", all `COLOR_LABELS` entries, "Fuente de audio", "Archivo MP3", "Tono puro", "Arpegio", "Sin archivo cargado: usa /public/audio.mp3 por defecto.".
- `"scroll"` (the scroll-indicator label) is a deliberate English word (a common tech term used as-is), not Spanish prose — leave untouched.

- [ ] **Step 1: Apply the 9 `sceneConfig.ts` corrections**

Make exactly the 9 edits listed in the table above under `sceneConfig.ts` — each is a single string/number literal change. Do not alter any other text in the file.

- [ ] **Step 2: Apply the 2 `DebugMenu.tsx` corrections**

Make exactly the 2 edits listed in the table above under `DebugMenu.tsx`.

- [ ] **Step 3: Verify**

1. `npx tsc --noEmit`, `npm run build`, `npm run lint`, `npm test` — all clean. `sceneConfig.test.ts` doesn't assert exact text content or the font-size default (confirm via grep first), so no test changes should be needed.
2. Playwright, dev server: scroll through all 5 main text blocks and confirm each corrected line renders with its tilde (read the DOM text content directly, don't just eyeball a screenshot — tildes are easy to miss visually at small sizes). Confirm the title reads "EFECTO DOPPLER" (not "EFFECTO"). Confirm the corridor end-link reads "IR A LA SIMULACIÓN". Open the debug menu and confirm the font-size slider's value is 1.40 on a fresh page load, and confirm the ✕ button's `aria-label` and the "(Shift para cerrar también)" hint both read correctly (inspect the DOM attribute/text directly).

- [ ] **Step 4: Commit**

```bash
git add app/lib/sceneConfig.ts app/components/DebugMenu.tsx
git commit -m "fix: add missing tildes and correct voseo across all Spanish text; bump text-block font-size default to 1.40"
```

---

## Task 2: Floating narrative text blocks inside the corridor

**Files:**
- Modify: `app/lib/sceneConfig.ts`
- Modify: `app/components/Section1.tsx`

**What's requested:** 4 new text blocks that float inside the corridor (tunnel), each centered in the tunnel's cross-section (equidistant from both walls, floor, and ceiling — not on a wall like the end-link), always center-aligned text, using the exact same font/size/shadow as the existing 5 scroll text blocks, and fading in/holding/fading out with scroll exactly like those blocks do. The corridor's length is divided into 5 equal segments; each of the 4 blocks sits in one of the first four segments and becomes active as the sphere passes through that specific segment.

**Design notes (read first):**

- **Reuse, don't duplicate, the existing text-block styling.** `TEXT_BLOCKS[0].shadow`, `TEXT_BLOCKS[0].fontSizeClamp`, and `TEXT_BLOCKS[0].letterSpacing` already hold the exact values every one of the 5 main blocks shares (confirmed identical across all 5 in `sceneConfig.ts`) — reference these directly from `Section1.tsx` rather than re-typing literals, so "misma fuente, tamaño, sombra" is guaranteed by construction, not just visual similarity.
- **Reuse the existing fade timing math.** `computeBlockOpacity(instance, startInstance, durationInstances)` (already imported in `Section1.tsx` for the main blocks) is a pure function — it works identically for any "instance" axis, not just page-scroll instance. This task defines a corridor-local instance axis: `corridorInstance = corridorTravelT * CORRIDOR_TEXT_BLOCK_SEGMENTS` (`corridorTravelT` is already computed every frame, 0..1 over the corridor's full traversal; `CORRIDOR_TEXT_BLOCK_SEGMENTS = 5`, a new constant). Using the SAME `TEXT_BLOCK_DURATION_INSTANCES` (= 3: 1 unit fade-in, 1 unit held, 1 unit fade-out) and setting block `i`'s `startInstance = i - 1`, the HELD window (`[startInstance+1, startInstance+durationInstances-1)`) works out to exactly `[i, i+1)` — i.e., each block is at full opacity precisely while the sphere occupies its own segment `i`, ramping in during the segment before it and ramping out during the segment after. (Block 0's ramp-in window starts before the corridor phase begins, so it appears at full opacity immediately on entry rather than visibly fading in — this is an accepted, minor edge case, not a bug to work around.)

  > **Superseded during execution.** The formula above (`corridorInstance = corridorTravelT * CORRIDOR_TEXT_BLOCK_SEGMENTS`, `startInstance = i - 1`) caused adjacent corridor blocks' opacity windows to actually overlap in practice — it was replaced by a rescaled instance axis (`corridorInstance = corridorTravelT * CORRIDOR_TEXT_BLOCK_SEGMENTS * TEXT_BLOCK_DURATION_INSTANCES`, `startInstance = i * TEXT_BLOCK_DURATION_INSTANCES`) in commit `53a46de`. The "block 0 pops in" note above is likewise obsolete under the corrected formula. See the execution ledger and `app/lib/scrollTimeline.ts` (`corridorInstanceFromTravel` / `corridorBlockStartInstance`) for the shipped, tested version.
- **Positioning is a genuine 3D→2D projection**, not CSS percentages — these blocks float at a real point in 3D space (centered in the tunnel), so their screen position must be computed every frame the same way `endLinkRef`'s position already is (`Section1.tsx`, the `insideCorridorPhase` branch that projects `corridor.endWallCenter`). Each block's 3D anchor: `corridor.entrance.clone().add(new THREE.Vector3(0, corridor.crossSection / 2, blockLocalZ))`, where `blockLocalZ = -(i + 0.5) * (corridor.length / CORRIDOR_TEXT_BLOCK_SEGMENTS)` — centered in local X (midway between the two walls), at `crossSection / 2` in local Y (midway between floor and ceiling), and at the center-Z of segment `i`.
- **Guard against behind-camera projection glitches.** Three.js's `.project()` doesn't special-case points behind the camera — it can produce a nonsensical screen position. Because the chase camera trails the sphere by a fixed offset (`CORRIDOR_CONFIG.chaseDistanceMultiplier`× the sphere's diameter) that's roughly comparable to one segment's length, a block's tail-end fade-out window could plausibly land slightly behind the camera. Each block's opacity must be forced to 0 whenever its anchor point is behind the camera (checked via a dot product against the camera's forward vector), regardless of what `computeBlockOpacity` would otherwise return.
- **Reuse the wrapping/margin technique** already built for the end-link (`EDGE_FRACTION = 0.42` edge-projection → `maxWidth`) so long lines wrap safely within the tunnel's visible width instead of overflowing.
- **Text alignment is hardcoded to `'center'`** for these 4 blocks specifically — this does NOT read from the global `textBlockAlignment` debug control (which only governs the 5 main scroll blocks); the user's requirement here is a fixed "always centered", not a toggle.
- **Force-hide outside the corridor phase**, mirroring `endLinkRef`'s existing `else` branch.

- [ ] **Step 1: Add the corridor text-block config to `sceneConfig.ts`**

Add near `CORRIDOR_CONFIG` (after it, or anywhere at the top level — placement within the file doesn't matter functionally, but group it near the corridor-related config for readability):

```ts
/* ── CORRIDOR FLOATING TEXT BLOCKS ─────────────────────────────────
 * 4 short narrative lines that float inside the corridor, centered
 * in its cross-section (midway between both walls and between floor
 * and ceiling — not on a wall, unlike the end-of-corridor link).
 * Styling (font/size/shadow) is intentionally NOT duplicated here —
 * Section1.tsx reads it directly from TEXT_BLOCKS[0], which all 5
 * main text blocks already share identically. Positioning/timing
 * logic also lives in Section1.tsx (it needs the corridor's runtime
 * length, only known once buildCorridor() runs). */
export const CORRIDOR_TEXT_BLOCK_SEGMENTS = 5; // the corridor's length is divided into this many equal parts

export const CORRIDOR_TEXT_BLOCKS: string[] = [
  'EL EFECTO DOPPLER NO SÓLO AFECTA A LAS ONDAS ACÚSTICAS.',
  'TAMBIÉN SE DESCUBRIÓ QUE AFECTA A LAS ONDAS VISIBLES COMO LA LUZ.',
  'CUANDO LAS GALAXIAS O ESTRELLAS SE ALEJAN DE NOSOTROS, SU LUZ SE VE ROJA.',
  'Y A MEDIDA QUE SE ACERCAN, SE VEN MÁS AZULES.',
];
```

- [ ] **Step 2: Add the ref and destructure the 3 debug multipliers — `Section1.tsx`**

Extend the `sceneConfig` import (currently lines 23-40) to also bring in `CORRIDOR_TEXT_BLOCKS`, `CORRIDOR_TEXT_BLOCK_SEGMENTS`, and `TEXT_BLOCK_DURATION_INSTANCES`.

Extend the top-level `useSceneControls()` destructure (currently lines 307-323) to also read `textBlockFontSizeMultiplier`, `textBlockShadowSizeMultiplier`, `textBlockShadowIntensityMultiplier` (these are read directly here — a normal reactive React read, NOT inside the `animate()` rAF closure — because they only drive static JSX style props re-rendered by React when the debug sliders move, the same way `ScrollTextBlocks.tsx` already consumes them; no ref-mirroring needed since nothing inside the imperative per-frame loop depends on their value).

Add a new ref near `textBlockRefs` (currently ~line 341):
```ts
  const corridorTextRefs = useRef<HTMLDivElement[]>([]);
```

- [ ] **Step 3: Per-frame projection + opacity — inside `animate()`'s `insideCorridorPhase` branch**

Find the existing end-link block (`Section1.tsx`, the `if (insideCorridorPhase) { ... } else if (endLinkRef.current) { ... }` structure, currently starting ~line 909 and ending ~line 943). Add the corridor text blocks' logic INSIDE the same `if (insideCorridorPhase)` branch, right after the existing end-link `if (endLinkRef.current) { ... }` block closes (i.e., after the line `endLinkRef.current.setAttribute('aria-hidden', reached ? 'false' : 'true');` and its closing `}`, still before that branch's own closing `}`):

```ts
        // Floating narrative text blocks — same fade-in/hold/fade-out
        // envelope as the main scroll text blocks (computeBlockOpacity),
        // but driven by how far the sphere has traveled through the
        // corridor (corridorTravelT) instead of page-scroll instance.
        const corridorInstance = corridorTravelT * CORRIDOR_TEXT_BLOCK_SEGMENTS; // superseded, see note below
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
          if (!inFront) {
            el.style.opacity = '0';
            return;
          }
          const projected = anchor.clone().project(camera);
          const leftEdge2D  = anchor.clone().add(new THREE.Vector3(-corridor.crossSection * 0.42, 0, 0)).project(camera);
          const rightEdge2D = anchor.clone().add(new THREE.Vector3( corridor.crossSection * 0.42, 0, 0)).project(camera);
          const wallWidthPx = Math.abs(rightEdge2D.x - leftEdge2D.x) * 0.5 * window.innerWidth;
          el.style.left = `${(projected.x * 0.5 + 0.5) * window.innerWidth}px`;
          el.style.top  = `${(-projected.y * 0.5 + 0.5) * window.innerHeight}px`;
          el.style.maxWidth = `${Math.max(120, wallWidthPx)}px`;
          el.style.opacity = String(computeBlockOpacity(corridorInstance, i - 1, TEXT_BLOCK_DURATION_INSTANCES));
        });
```

> **Superseded during execution.** This `corridorInstance`/`startInstance = i - 1` code block caused adjacent corridor blocks to visibly overlap; it was replaced by the rescaled-axis formula from commit `53a46de` (now `corridorInstanceFromTravel(...)` / `corridorBlockStartInstance(i, ...)` in `app/lib/scrollTimeline.ts`). See the execution ledger for details — this snippet is kept as-is for historical record, not as current documentation.

In the SAME branch's `else if (endLinkRef.current) { ... }` counterpart (the force-hide-outside-corridor path, currently ~lines 938-943), add force-hiding for the new blocks too:
```ts
      } else if (endLinkRef.current) {
        endLinkRef.current.style.opacity = '0';
        endLinkRef.current.style.pointerEvents = 'none';
        endLinkRef.current.tabIndex = -1;
        endLinkRef.current.setAttribute('aria-hidden', 'true');
        corridorTextRefs.current.forEach((el) => {
          if (el) el.style.opacity = '0';
        });
      }
```

- [ ] **Step 4: Render the 4 divs — JSX**

Near the existing end-link `<a>` element in the JSX (after it is a reasonable place, but anywhere inside the same overlay container works), add:

```tsx
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
              color: '#ffffff',
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
```

(`TEXT_BLOCKS` and `shadowToCss` are both already imported in this file.)

- [ ] **Step 5: Verify — code + THOROUGH Playwright visual verification**

This is a new 3D-projected, timing-gated feature — code review alone cannot confirm it actually works as intended.

1. `npx tsc --noEmit`, `npm run build`, `npm run lint`, `npm test` — all clean.
2. Playwright, dev server: scroll into the corridor and progress slowly all the way through it. For EACH of the 4 blocks:
   - Confirm it fades in, holds at full opacity, and fades out, roughly while the sphere is within (or approaching/leaving) its own segment — sample opacity at a few scroll positions per block and confirm the trapezoid shape (0 → rising → 1 → falling → 0) rather than an instant pop or a stuck value.
   - Confirm the text is horizontally centered on screen relative to the tunnel's walls at that depth (not offset toward one wall) — this is the "midway between both walls, floor, and ceiling" requirement; screenshot and visually confirm it looks vertically centered within the tunnel cross-section too, not glued to the floor or ceiling.
   - Confirm the font size, shadow, and letter-spacing visually match the main scroll text blocks (drag the debug menu's font-size/shadow-size/shadow-intensity sliders and confirm these blocks respond identically to the main blocks — proving the shared-source-values approach actually wired through).
3. Confirm block 4 (the last one, in segment index 3) finishes fading out at or before the sphere reaches the end wall — it shouldn't still be visible when the "IR A LA SIMULACIÓN" link appears (no overlap/clutter).
4. Confirm scrolling BACKWARD through the corridor correctly reverses the fade sequence (blocks reappear/fade in the correct reverse order) — this should work automatically since `computeBlockOpacity` is a pure function of instance, but verify empirically since it's a new consumer of that function.
5. Specifically test the behind-camera guard: scroll to a point where a block should be near the end of its fade-out window (its segment just passed) and confirm there's no visual glitch — no flash of the text jumping to a wrong screen position, no console error from a degenerate projection.
6. Confirm the end-link and the reactive/calm wave pattern (both pre-existing, unrelated to this task) are unaffected.
7. Confirm no console errors throughout a full corridor traversal in both directions.

- [ ] **Step 6: Commit**

```bash
git add app/lib/sceneConfig.ts app/components/Section1.tsx
git commit -m "feat: add 4 floating narrative text blocks inside the corridor, timed to each of its first four fifths"
```

---

## Task 3: Full QA pass

**Files:** none (verification only; fix genuine bugs found, don't invent scope)

- [ ] **Step 1: Run the full unit-test suite**

Run: `npm test` — expect ALL suites green.

- [ ] **Step 2: Verify the production build**

Run: `npm run build` — must complete cleanly (normal Next.js/Vercel build, `.next/` output). Run: `npm run lint` — 0 errors/warnings except any pre-existing failures confirmed unrelated to this plan's files (e.g. a stray nested worktree directory, if still present — check first, don't assume).

- [ ] **Step 3: Live walkthrough checklist**

For each item, confirm live via Playwright against the dev server:

1. **Text corrections (Task 1)** — every corrected string from the table renders with its tilde; title reads "EFECTO DOPPLER"; font-size debug default is 1.40 on fresh load; the 2 debug-menu label fixes are present.
2. **Corridor floating text blocks (Task 2)** — all 4 blocks appear/disappear in sync with the sphere passing through their respective segments, centered in the tunnel's cross-section, styled identically to the main text blocks, no behind-camera glitches, correctly reversible on backward scroll.
3. **Cross-cutting / no regressions from prior work** — the end-of-corridor link still appears correctly and is unaffected by the new blocks; the reactive/calm corridor wave pattern is unaffected; the disc star field and corridor-entrance star field are unaffected; mp3 file upload in the debug menu still works; title/first-text-block scroll sync still works.
4. No new `react-hooks/exhaustive-deps` warnings; no orphaned state.

- [ ] **Step 4: Report**

Summarize pass/fail for all items. For any genuine bug found, the controller will dispatch a targeted fix before considering the plan complete.

---

## Self-Review

**Spec coverage:**
- Corrección — tildes + voseo across all site text → Task 1.
- Corrección — font-size default 1.40 → Task 1.
- Modificación — 4 floating corridor text blocks, centered in cross-section, same styling, fade in/out like existing blocks, positioned across the first four-fifths of the corridor, activated as the sphere passes each segment → Task 2.
- Task 3 closes the loop with full-suite verification and a live walkthrough.

**Placeholder scan:** no `TBD`/`fill in later` markers; every task has complete, literal code and text content for every step, derived from a direct grep audit of the current codebase and from the user's exact supplied sentences (corrected for tildes/casing to match the established all-caps text-block convention).

**Type consistency:** `CORRIDOR_TEXT_BLOCKS` is a plain `string[]`, consumed identically wherever `Section1.tsx` maps over it (Step 3's `forEach` and Step 4's JSX `.map`) — same array, same index-based correspondence, no separate config object needed since positioning/timing are purely derived from the index and shared corridor geometry, not per-block config. `computeBlockOpacity`'s signature (`instance, startInstance, durationInstances?`) is unchanged and already exported/imported — this task is a new caller, not a new implementation, so no signature drift risk.
