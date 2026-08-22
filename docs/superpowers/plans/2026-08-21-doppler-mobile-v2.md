# Doppler Mobile V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-specific experience layer on top of the existing desktop Doppler site: a permission/start gate overlay (audio + device-motion), a hold-to-steer sphere-control button driven by device orientation (replacing mouse/touch-drag steering on mobile), a hamburger-triggered responsive debug menu, and adaptive text-block sizing/positioning that always stays clear of the new floating controls.

**Architecture:** All mobile-only behavior is gated behind a single `isMobileDevice()` check computed once per session. Desktop behavior is completely unchanged — every mobile code path is either a new file or an `if (isMobile)` branch alongside existing desktop code, never a replacement of it. New files: `app/lib/mobileDetect.ts`, `app/components/MobileGate.tsx`. Modified files: `app/lib/sceneConfig.ts` (new `MOBILE_CONFIG`), `app/lib/SceneControlsContext.tsx` (lifts the debug menu's open/closed state so a mobile hamburger button can toggle it), `app/components/DebugMenu.tsx`, `app/components/ScrollTextBlocks.tsx`, `app/components/Section1.tsx`.

**Tech Stack:** Next.js 16, React 19, TypeScript, raw Three.js, the `DeviceOrientationEvent`/`DeviceMotionEvent` Web APIs (iOS 13+ gates orientation access behind `DeviceOrientationEvent.requestPermission()`, callable only from inside a user-gesture handler; Android has no equivalent gate and just requires a secure — HTTPS — context, which this site already has), Vitest, Playwright (with mobile device emulation + synthetic `DeviceOrientationEvent` dispatch for the parts that can be automated; see the QA task for what genuinely needs a real phone).

---

## Design decisions made while writing this plan (read first)

The user's request was detailed but left some implementation-level specifics unstated. These are the calls made, and why — flagged here so they're visible, not buried in code:

1. **Close-button behavior on the permission gate — confirmed with the user directly:** tapping the X dismisses the overlay without activating anything. Nothing is permanently blocked: the sphere-control button requests device-motion permission itself the first time it's pressed (if not already granted), and sound can be activated afterward from the debug menu's existing play/pause control. This is implemented via one shared, idempotent `requestMotionPermissionIfNeeded()` function called from both the gate's CTA and the sphere-control button's first press.
2. **Mobile detection method:** `app/lib/mobileDetect.ts`'s `isMobileDevice()` combines a user-agent check for iOS/Android device strings with a touch-primary + coarse-pointer media-query check, so a touchscreen laptop (fine pointer available) is NOT treated as mobile, matching "cuando se detecta que no es un navegador de pc." Computed once per session (device type doesn't change mid-session) via a lazy `useState` initializer, so it's `false` during SSR and resolves correctly on the client without a hydration flash (this app's actual visible experience only renders inside a `useEffect`-driven Three.js mount anyway, so there's no server-rendered content that would visibly differ).
3. **Mobile floating controls (sphere-control button, hamburger) are hidden until the permission gate is dismissed** (either via the CTA or the close button) — showing controls tied to not-yet-decided permissions before the user has made that choice would be confusing. This is a local `mobileGateOpen` boolean in `Section1.tsx`, not lifted to context (nothing outside `Section1.tsx` needs it).
4. **The fingerprint icon is recreated as an inline SVG** (nested arc paths, no external asset), since the reference image was supplied inline in chat with no accessible file path to read from disk — "o crearlo vectorialmente" was the option taken.
5. **Text-block mobile positioning is uniform across all 5 blocks** (a single centered "safe zone" box, not each block's individual desktop position) — the request says blocks must "siempre queden visibles y centrados... tanto vertical como horizontal," which desktop's per-block edge-anchored layout (left-aligned upper-left, right-aligned upper-right, etc.) cannot satisfy on a narrow viewport. The existing `textBlockAlignment` debug control (justify/center/left/right) still governs the TEXT's internal alignment within that centered box — this plan doesn't force-override it, since the user's ask was about the block's on-screen position/visibility, not the already-shipped, separately-configurable internal text alignment.
6. **Landscape orientation's text safe-area right margin also clears the sphere-control button** (which relocates to the right side in landscape) — the user only specified the "10% above the button" clearance for portrait explicitly, but the same clear-the-button principle is applied consistently to landscape's button position too, since leaving it unstated would mean text can overlap the button in landscape.
7. **`app/lib/finalPhase.ts`, `app/lib/corridor.ts`, and everything corridor/text-block-in-3D-space related are UNTOUCHED** — the mobile adaptive-sizing requirement is scoped to the 5 main `ScrollTextBlocks`, matching where the user's numbered list appears in their message (right after describing the permission gate and before the sphere-control button, in the context of the general mobile layout, not the corridor). The corridor's own floating text blocks (a separate recent feature) already project via 3D camera math independent of `ScrollTextBlocks.tsx` and are out of scope for this plan.

### Corrections made during execution (post-hoc note — the task text below is unrevised)

Three patterns described in the task text below were proven wrong once actually built and were superseded in the shipped code. This note is the pointer; the task prose itself was intentionally left as-is rather than rewritten after the fact:

1. **Mobile detection:** the `const [isMobile] = useState(() => isMobileDevice())` pattern described in Task 2 Step 3 (and again in Task 5) causes a real hydration mismatch — the client's lazy initializer runs against the actual browser and can return `true` on the very first client render, disagreeing with the server-rendered (`false`) HTML. It was replaced with a `useIsMobile()` hook (`app/lib/mobileDetect.ts`) built on `useSyncExternalStore`, which renders `false` on the server and the client's first render, then corrects on a later render — no mismatch.
2. **Ref-mirroring for `isMobile`:** Task 3's claim "No ref-mirroring needed since it never changes mid-session" is wrong once `isMobile` comes from `useIsMobile()` instead of a `useState` initializer — its value is `false` on mount and corrects one render later, so a direct read inside `Section1.tsx`'s `[]`-dep mount-effect closure (the deviceorientation/mousemove/touchmove handlers, and `animate()`'s steering code) would be permanently stuck at the stale `false` value, silently disabling device-orientation steering on real mobile devices. Fixed with an `isMobileRef` mirror, kept in sync via a `useEffect`.
3. **Text-block sizing:** Task 5's shrink-to-fit measurement as originally written only accounted for height (`scaleForHeight`); it needed a width-aware measurement too (`scaleForWidth`, plus `minWidth: 0` / `maxWidth: 100%` on the inner flex item) — without it, a line wider than its safe zone could overflow the zone's side margins even at the default font-size multiplier, since flex items default to a content-based min-width that overrides flex-shrink.

---

## Task 1: Mobile detection utility, `MOBILE_CONFIG`, and lifting the debug menu's open state

**Files:**
- Create: `app/lib/mobileDetect.ts`
- Create: `app/lib/mobileDetect.test.ts`
- Modify: `app/lib/sceneConfig.ts`
- Modify: `app/lib/SceneControlsContext.tsx`
- Modify: `app/components/DebugMenu.tsx`

This task lays the shared groundwork every other task in this plan depends on: how to detect mobile, where the shared config values live, and making the debug menu's open/closed state externally toggleable (needed by Task 4's hamburger button).

- [ ] **Step 1: `app/lib/mobileDetect.ts`**

```ts
/**
 * True for iOS/Android mobile browsers, false for desktop (including
 * touchscreen laptops/desktops, which have a fine pointer available
 * even if they also support touch). Computed once per session — device
 * type doesn't change mid-session, so callers should compute this once
 * (e.g. via a lazy useState initializer) rather than on every render.
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  if (!isIOS && !isAndroid) return false;
  // Coarse-pointer + no-hover is what actually distinguishes a touch-only
  // mobile browser from a touchscreen laptop/desktop that also matches the
  // UA checks above (e.g. some Android-based Chromebooks) — require both.
  const isTouchPrimary =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches &&
    window.matchMedia('(hover: none)').matches;
  return isTouchPrimary;
}
```

- [ ] **Step 2: `app/lib/mobileDetect.test.ts`**

```ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { isMobileDevice } from './mobileDetect';

function mockEnv(ua: string, maxTouchPoints: number, coarsePointer: boolean) {
  vi.stubGlobal('navigator', { userAgent: ua, maxTouchPoints });
  vi.stubGlobal('window', {
    matchMedia: (query: string) => ({
      matches: query.includes('coarse') || query.includes('hover: none') ? coarsePointer : false,
    }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isMobileDevice', () => {
  it('returns true for an iPhone Safari user agent with a coarse touch pointer', () => {
    mockEnv(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      5,
      true
    );
    expect(isMobileDevice()).toBe(true);
  });

  it('returns true for an Android Chrome user agent with a coarse touch pointer', () => {
    mockEnv('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36', 5, true);
    expect(isMobileDevice()).toBe(true);
  });

  it('returns false for a desktop Chrome user agent', () => {
    mockEnv('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 0, false);
    expect(isMobileDevice()).toBe(false);
  });

  it('returns false for an Android user agent on a fine-pointer device (e.g. a Chromebook with a trackpad)', () => {
    mockEnv('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36', 5, false);
    expect(isMobileDevice()).toBe(false);
  });
});
```

- [ ] **Step 3: `MOBILE_CONFIG` in `app/lib/sceneConfig.ts`**

Add near the end of the file (after `FREE_CAMERA_CONFIG`, before `DEBUG_RANGES` — placement doesn't matter functionally):

```ts
/* ── MOBILE EXPERIENCE ─────────────────────────────────────────────
 * All mobile-only UI (permission gate, sphere-control button,
 * hamburger menu trigger, adaptive text safe-area) reads its layout
 * values from here — see app/lib/mobileDetect.ts for how "mobile" is
 * detected, and Section1.tsx / MobileGate.tsx / ScrollTextBlocks.tsx
 * for where each value is consumed. */
export const MOBILE_CONFIG = {
  gateOverlay: {
    ctaText: 'HABILITAR PERMISOS Y SONIDO E INICIAR LA EXPERIENCIA',
    closeAriaLabel: 'Cerrar',
  },
  sphereButton: {
    /** Portrait: centered horizontally, this % up from the bottom edge. */
    portraitBottomPercent: 20,
    /** Landscape: centered vertically, this % in from the right edge. */
    landscapeRightPercent: 20,
    sizePx: 64,
    ariaLabel: 'Mantené presionado para mover la esfera inclinando el teléfono',
  },
  textSafeArea: {
    /** Left/right margin, as a % of viewport width, on both orientations. */
    sideMarginPercent: 15,
    /** Top margin, as a % of viewport height, on both orientations. */
    topMarginPercent: 15,
    /** Portrait: extra clearance above the sphere-control button, and
     * (by the same principle, applied consistently) landscape: extra
     * clearance to the left of the sphere-control button's own margin. */
    gapAroundButtonPercent: 10,
  },
  hamburger: {
    /** From the top, horizontally centered, on both orientations. */
    topPercent: 15,
    ariaLabel: 'Abrir menú de debug',
  },
};
```

- [ ] **Step 4: Lift the debug menu's open state into `SceneControlsContext.tsx`**

`DebugMenu.tsx` currently owns its `open`/`setOpen` as local `useState`, toggled only by its internal Shift-key listener. Task 4's hamburger button (rendered from `Section1.tsx`, a different component) needs to toggle the SAME state, so it has to live in context.

Add to the `SceneControlsValue` interface (near the other boolean toggles, e.g. after `freeCameraEnabled`):
```ts
  debugMenuOpen: boolean;
  setDebugMenuOpen: (v: boolean) => void;
```

Add the state (near `freeCameraEnabled`'s `useState`):
```ts
  const [debugMenuOpen, setDebugMenuOpen] = useState(false);
```

Add `debugMenuOpen`/`setDebugMenuOpen` to the `value` object and `debugMenuOpen` to the `useMemo` dependency array (same pattern as every other field in this file).

- [ ] **Step 5: `DebugMenu.tsx` — read `open`/`setOpen` from context instead of local state**

Replace:
```ts
  const [open, setOpen] = useState(false);
```
with reading `debugMenuOpen, setDebugMenuOpen` from the existing `useSceneControls()` destructure (add them to the list), and replace every other use of `open`/`setOpen` in the file (`if (!open) return null;`, the Shift-listener's `setOpen((v) => !v)`, the ✕ button's `onClick={() => setOpen(false)}`) with `debugMenuOpen`/`setDebugMenuOpen`. The `useState` import from `react` may become unused in this file if nothing else in it needs local state — check before removing the import (it's still needed for `panelRef`'s `useRef`, which is a different hook, so keep the `react` import line but drop `useState` from it only if genuinely unused after this change).

- [ ] **Step 6: Verify**

`npx tsc --noEmit`, `npm run build`, `npm run lint`, `npm test` — all clean, including the new `mobileDetect.test.ts`. Playwright, dev server (desktop viewport): confirm the debug menu still opens/closes via Shift exactly as before (this task is a pure refactor of WHERE the state lives, not a behavior change) — press Shift, confirm it opens; click ✕, confirm it closes; press Shift again, confirm it reopens.

- [ ] **Step 7: Commit**

```bash
git add app/lib/mobileDetect.ts app/lib/mobileDetect.test.ts app/lib/sceneConfig.ts app/lib/SceneControlsContext.tsx app/components/DebugMenu.tsx
git commit -m "feat: add mobile detection utility, MOBILE_CONFIG, and lift debug-menu open state into context"
```

---

## Task 2: Permission/start gate overlay (`MobileGate.tsx`)

**Files:**
- Create: `app/components/MobileGate.tsx`
- Modify: `app/components/Section1.tsx`

**What's requested:** On mobile, before the experience is usable, show a 75%-opacity black overlay (background scene visible through it), with a close button top-right, and a centered button reading "HABILITAR PERMISOS Y SONIDO E INICIAR LA EXPERIENCIA" (center-aligned text) that — on tap — requests device-motion permission (iOS) and activates audio, then dismisses the overlay. The close button dismisses without activating anything (see Design Decision #1 above — nothing is permanently blocked; audio can be activated later via the debug menu, and motion permission is requested again on the sphere-control button's first press, built in Task 3).

- [ ] **Step 1: `app/components/MobileGate.tsx`**

```tsx
'use client';

import { useSceneControls } from '@/app/lib/SceneControlsContext';
import { MOBILE_CONFIG } from '@/app/lib/sceneConfig';
import { requestMotionPermissionIfNeeded } from '@/app/lib/motionPermission';

/**
 * Mobile-only permission/start gate. Rendered by Section1.tsx only when
 * isMobileDevice() is true and the user hasn't dismissed it yet (either
 * button closes it — see Section1.tsx's mobileGateOpen state). Requests
 * device-motion permission and activates audio on the CTA tap; the close
 * button dismisses without activating either (both are retryable later —
 * see requestMotionPermissionIfNeeded and the debug menu's play/pause
 * control).
 */
export default function MobileGate({ onDismiss }: { onDismiss: () => void }) {
  const { setAudioSourceMode, setAudioActivated, setIsPlaying } = useSceneControls();

  async function handleStart() {
    await requestMotionPermissionIfNeeded();
    setAudioSourceMode('file');
    setAudioActivated(true);
    setIsPlaying(true);
    onDismiss();
  }

  const michroma = 'var(--font-michroma), sans-serif';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <button
        onClick={onDismiss}
        aria-label={MOBILE_CONFIG.gateOverlay.closeAriaLabel}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 36,
          height: 36,
          borderRadius: 8,
          background: 'rgba(255,255,255,0.10)',
          border: '1px solid rgba(255,255,255,0.25)',
          color: '#ffffff',
          fontFamily: michroma,
          fontSize: 16,
          lineHeight: '34px',
          textAlign: 'center',
          cursor: 'pointer',
        }}
      >
        ✕
      </button>
      <button
        onClick={handleStart}
        style={{
          maxWidth: '80vw',
          padding: '20px 28px',
          borderRadius: 14,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.35)',
          color: '#ffffff',
          fontFamily: michroma,
          fontSize: 'clamp(14px, 4.2vw, 20px)',
          letterSpacing: '0.08em',
          textAlign: 'center',
          lineHeight: 1.6,
          cursor: 'pointer',
        }}
      >
        {MOBILE_CONFIG.gateOverlay.ctaText}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: `app/lib/motionPermission.ts`** (the shared, idempotent permission-request helper — used here AND by Task 3's sphere-control button)

```ts
/**
 * Requests iOS 13+'s device-orientation permission if the API for it
 * exists (Android and other browsers have no such gate — the function
 * is then a safe no-op). Idempotent and safe to call from multiple
 * places (the permission gate's CTA, and the sphere-control button's
 * first press) — repeat calls after a grant or a denial just resolve
 * again without re-showing a system prompt on most WebKit versions.
 * Errors (the API existing but the call itself failing) are swallowed —
 * the caller doesn't need to branch on the outcome; device-orientation
 * events (see Section1.tsx) simply won't fire meaningful data if this
 * was never granted, which the sphere-control button already tolerates
 * (holding it just does nothing).
 */
export async function requestMotionPermissionIfNeeded(): Promise<void> {
  const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } })
    .DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function') {
    try {
      await DOE.requestPermission();
    } catch {
      // Ignore — see the doc comment above.
    }
  }
}
```

- [ ] **Step 3: Wire `MobileGate` into `Section1.tsx`**

Add near the top-level state declarations (alongside `titleVisible` etc.):
```ts
  const [isMobile] = useState(() => isMobileDevice());
  const [mobileGateOpen, setMobileGateOpen] = useState(isMobile);
```

Add the import:
```ts
import { isMobileDevice } from '@/app/lib/mobileDetect';
import MobileGate from '@/app/components/MobileGate';
```

In the JSX, inside the sticky-viewport `<div>` (the same container that already holds `<ScrollTextBlocks ... />` and the end-link `<a>`), add, right after the Three.js canvas mount `<div ref={mountRef} .../>`:
```tsx
        {isMobile && mobileGateOpen && (
          <MobileGate onDismiss={() => setMobileGateOpen(false)} />
        )}
```

- [ ] **Step 4: Verify**

1. `npx tsc --noEmit`, `npm run build`, `npm run lint`, `npm test` — all clean.
2. Playwright with mobile device emulation (`playwright.devices['iPhone 13']` or equivalent — set viewport + `hasTouch: true` + a mobile `userAgent` string matching what `isMobileDevice()` checks for): load the page, confirm the gate overlay IS visible (75% opacity black, background scene visible through it, close button top-right, centered CTA button with the exact requested text, center-aligned). Tap the CTA: confirm the overlay disappears, confirm `audioActivated`/`isPlaying` became true (check via the debug menu's play/pause button label, or inspect context state through a test hook if easier). Reload, this time tap the ✕ close button: confirm the overlay disappears WITHOUT activating audio (play/pause button should still read "▶ REPRODUCIR" / `isPlaying` false).
3. Playwright with a DESKTOP viewport/user-agent: confirm the gate NEVER renders at all — this is the most important regression check for this task, since a bug here would break the entire desktop experience.
4. Confirm no console errors in either mode.

- [ ] **Step 5: Commit**

```bash
git add app/components/MobileGate.tsx app/lib/motionPermission.ts app/components/Section1.tsx
git commit -m "feat: add mobile permission/start gate overlay"
```

---

## Task 3: Sphere-control button (fingerprint icon, hold-to-steer via device orientation)

**Files:**
- Modify: `app/components/Section1.tsx`

**What's requested:** Disable mouse/touch-drag sphere steering on mobile, replace it with a press-and-hold button (invisible background, white fingerprint icon with a black shadow) that, while held, steers the sphere via the phone's motion sensors instead of mouse/touch position. Portrait: centered horizontally, 20% up from the bottom. Landscape: centered vertically, 20% in from the right.

**Design note:** The existing disc-phase steering code (`Section1.tsx`, inside `animate()`) already reads `mouseRef.current.{x,y}` and runs it through spring physics to move the sphere — this is NOT being rewritten. Instead, on mobile, what feeds `mx`/`my` changes: instead of `mouseRef.current.x/.y` (driven by `mousemove`/`touchmove`, which mobile stops listening to), it reads a new `deviceTiltRef.current.x/.y` (driven by a `deviceorientation` listener), but ONLY while the sphere-control button is actively held — otherwise it's `(0, 0)`, which the existing spring physics already interprets as "no input, return toward center." This reuses 100% of the existing steering math; only the INPUT SOURCE changes.

- [ ] **Step 1: Add the new refs**

Near `mouseRef` (currently `const mouseRef = useRef({ x: 0, y: 0 });`), add:
```ts
  const deviceTiltRef = useRef({ x: 0, y: 0 });
  const sphereControlHeldRef = useRef(false);
```

- [ ] **Step 2: Add the `deviceorientation` listener (mobile only)**

In the mount effect, alongside the existing `window.addEventListener('scroll', onScroll, ...)` etc. block, add a mobile-gated listener. First add the handler function near `onTouch`:
```ts
    function onDeviceOrientation(e: DeviceOrientationEvent) {
      // beta: front-back tilt (-180..180, 0 = flat), gamma: left-right tilt
      // (-90..90, 0 = flat). Normalize to roughly -1..1 the same way
      // mouseRef's x/y are, so this can drive the EXACT SAME downstream
      // spring-physics code the mouse does. Clamped, since beta can
      // exceed the "comfortable tilt" range if the phone is held at an
      // unusual angle — clamping avoids the sphere pinning at max
      // deflection for any tilt beyond a modest, comfortable range.
      const gamma = e.gamma ?? 0;
      const beta = e.beta ?? 0;
      deviceTiltRef.current = {
        x: THREE.MathUtils.clamp(gamma / 30, -1, 1),
        y: THREE.MathUtils.clamp(-(beta - 45) / 30, -1, 1), // ~45° = comfortable "neutral" hold angle
      };
    }
```

Then, right after the existing `window.addEventListener('touchmove', onTouch, { passive: true });` line, add:
```ts
    if (isMobile) {
      window.addEventListener('deviceorientation', onDeviceOrientation);
    } else {
      window.addEventListener('mousemove', onMouse);
      window.addEventListener('touchmove', onTouch, { passive: true });
    }
```
and remove the now-unconditional versions of those two `addEventListener` calls that this replaces (i.e., this `if/else` REPLACES the existing unconditional `mousemove`/`touchmove` listener registration — don't leave both). Update the matching cleanup in the effect's `return () => { ... }` block the same way:
```ts
      if (isMobile) {
        window.removeEventListener('deviceorientation', onDeviceOrientation);
      } else {
        window.removeEventListener('mousemove', onMouse);
        window.removeEventListener('touchmove', onTouch);
      }
```
(replacing the existing unconditional `removeEventListener('mousemove', ...)`/`removeEventListener('touchmove', ...)` lines there).

- [ ] **Step 3: Use device-tilt-when-held instead of mouseRef on mobile, in the steering code**

Replace (currently in the `!insideCorridorPhase` branch):
```ts
        const mx = mouseRef.current.x;
        const my = mouseRef.current.y; // +1 = top, −1 = bottom
```
with:
```ts
        const mx = isMobile ? (sphereControlHeldRef.current ? deviceTiltRef.current.x : 0) : mouseRef.current.x;
        const my = isMobile ? (sphereControlHeldRef.current ? deviceTiltRef.current.y : 0) : mouseRef.current.y; // +1 = top, −1 = bottom
```

(`isMobile` is the same session-constant boolean from Task 2's Step 3 — it's a plain value captured in the mount effect's closure, already in scope here since the mount effect and `animate()` share the same closure. No ref-mirroring needed since it never changes mid-session.)

- [ ] **Step 4: The sphere-control button JSX + press-hold handlers**

Add a fingerprint icon SVG constant near the top of the file (alongside the other shader string constants, or just above the component — either is fine, group it near other visual constants):
```tsx
const FINGERPRINT_SVG_PATHS = [
  'M20,82 C20,42 30,16 50,16 C70,16 80,42 80,82',
  'M28,82 C28,47 36,26 50,26 C64,26 72,47 72,82',
  'M36,82 C36,52 42,36 50,36 C58,36 64,52 64,82',
  'M44,82 C44,57 47,46 50,46 C53,46 56,57 56,82',
  'M50,82 L50,62',
];
```

Add refs near `mobileGateOpen`:
```ts
  const sphereButtonElRef = useRef<HTMLButtonElement>(null);
```

Add `MOBILE_CONFIG` to the existing `sceneConfig` import list in `Section1.tsx` (it isn't imported yet — this is its first use in this file; `requestMotionPermissionIfNeeded` also needs importing, from `@/app/lib/motionPermission`, alongside the `MobileGate` import added in Task 2):
```ts
import { requestMotionPermissionIfNeeded } from '@/app/lib/motionPermission';
```

Add the press-hold handlers, defined inside the component body (not inside the mount effect — these are plain React event handlers, called from JSX):
```ts
  function handleSphereControlPress() {
    sphereControlHeldRef.current = true;
    requestMotionPermissionIfNeeded();
  }
  function handleSphereControlRelease() {
    sphereControlHeldRef.current = false;
  }
```
(Import `requestMotionPermissionIfNeeded` from `@/app/lib/motionPermission`, alongside the `MobileGate` import from Task 2.)

Add the button JSX, in the sticky-viewport container, right after the `MobileGate` conditional block added in Task 2:
```tsx
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
```

Add the landscape repositioning via a small injected `<style>` block (simplest way to express "different position depending on orientation" without JS-tracked state) placed right next to the button:
```tsx
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
```
(Place this `<style>` block immediately before or after the button element — order relative to the button doesn't matter, both are siblings inside the same conditional.)

- [ ] **Step 5: Verify**

1. `npx tsc --noEmit`, `npm run build`, `npm run lint`, `npm test` — all clean.
2. Playwright with mobile emulation: load, dismiss the gate (either button), confirm the sphere-control button IS now visible (it must NOT be visible while the gate is still open — re-verify that too, going back and checking it's absent before dismissal). Confirm its portrait position matches the spec (centered horizontally, roughly 20% up from the bottom — check via `getBoundingClientRect()`). Switch the emulated viewport to landscape (swap width/height) and confirm the button relocates to vertically-centered, ~20% from the right.
3. Simulate device orientation input: Playwright can dispatch a synthetic `DeviceOrientationEvent` via `page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: ..., gamma: ... })))`. With the button NOT held, dispatch a large tilt and confirm the sphere does NOT move (position unchanged) — then simulate `pointerdown` on the button (or call `page.evaluate` to fire it programmatically, since real touch/pointer simulation varies by Playwright API version — use whichever reliably fires the React `onPointerDown` handler), dispatch the same tilt, and confirm the sphere DOES now move; then simulate `pointerup`/release and confirm the sphere's position stops responding to further orientation events (springs back toward center, matching desktop's "no input" behavior).
4. Confirm the OLD touch-drag steering does NOT move the sphere on mobile anymore — dispatch a `touchmove` event and confirm no sphere movement results (should be a no-op now since the touch listener isn't even attached on mobile).
5. Playwright DESKTOP viewport/user-agent: confirm the sphere-control button never renders, and confirm mouse-driven steering still works exactly as before (drag test — this is the most important regression check in this task).
6. No console errors in either mode.

- [ ] **Step 6: Commit**

```bash
git add app/components/Section1.tsx
git commit -m "feat: add hold-to-steer sphere-control button driven by device orientation on mobile"
```

---

## Task 4: Hamburger icon (mobile debug-menu trigger)

**Files:**
- Modify: `app/components/Section1.tsx`
- Modify: `app/components/DebugMenu.tsx`

**What's requested:** A hamburger icon, 15% from the top, horizontally centered, white with a black shadow at 50% opacity, opening the debug menu (which needs to be responsive/adaptive — it already has a `<560px` breakpoint from an earlier plan; this task reviews and tightens that for real mobile viewports, and wires the new hamburger trigger).

- [ ] **Step 1: Hamburger button JSX in `Section1.tsx`**

Add, in the sticky-viewport container, right after the sphere-control button block from Task 3:
```tsx
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
```

Add `debugMenuOpen, setDebugMenuOpen` to the top-level `useSceneControls()` destructure in `Section1.tsx` (they're not currently read there — Task 1 only added them to the context/DebugMenu.tsx).

- [ ] **Step 2: Tighten `DebugMenu.tsx`'s mobile responsiveness**

Read the current `<style>` block (the `.dbgPanel` rule with its `@media (max-width: 560px)` override) and the panel's own inline styles first. Extend the existing media query to also reduce padding and cap `maxHeight` a bit more aggressively for genuinely small phone screens, and ensure it doesn't render UNDER the new hamburger button (`zIndex: 1000` already exceeds the hamburger's `zIndex: 30`, so panel-over-hamburger is already correct — no change needed there, just confirm it while verifying).

Replace the existing `<style>` block:
```tsx
      <style>{`
        .dbgPanel { width: 300px; }
        @media (max-width: 560px) {
          .dbgPanel { width: calc(100vw - 24px) !important; right: 12px !important; left: 12px !important; max-height: 85vh !important; }
        }
      `}</style>
```
with:
```tsx
      <style>{`
        .dbgPanel { width: 300px; }
        @media (max-width: 560px) {
          .dbgPanel { width: calc(100vw - 24px) !important; right: 12px !important; left: 12px !important; max-height: 85vh !important; }
        }
        @media (max-width: 400px) {
          .dbgPanel { top: 8px !important; padding: 10px !important; max-height: 90vh !important; font-size: 11px !important; }
        }
      `}</style>
```

- [ ] **Step 3: Verify**

1. `npx tsc --noEmit`, `npm run build`, `npm run lint`, `npm test` — all clean.
2. Playwright mobile emulation: confirm the hamburger renders only after the gate is dismissed, at the correct position (15% from top, horizontally centered — check via `getBoundingClientRect()`), with `opacity: 0.5` and the drop-shadow filter applied. Tap it: confirm the debug menu opens. Tap it again: confirm it closes (toggle behavior). Confirm the debug menu, once open on a narrow (e.g. 375px-wide) viewport, fits within the screen without horizontal overflow and all its controls remain reachable (scroll within the panel if needed — `overflowY: auto` already handles this).
3. Playwright desktop: confirm the hamburger never renders, and confirm Shift still opens/closes the debug menu exactly as before.
4. No console errors.

- [ ] **Step 4: Commit**

```bash
git add app/components/Section1.tsx app/components/DebugMenu.tsx
git commit -m "feat: add mobile hamburger button to open the debug menu, tighten its small-screen responsiveness"
```

---

## Task 5: Adaptive text-block safe-area and shrink-to-fit sizing

**Files:**
- Modify: `app/components/ScrollTextBlocks.tsx`

**What's requested:** On mobile, all 5 scroll text blocks must always render fully visible, centered on screen both horizontally and vertically, with at least 15% side margins, 15% top margin, and 10% clearance above the sphere-control button — shrinking the font size adaptively as needed to guarantee this.

**Design note (read first):** `transform: scale(...)` doesn't affect an element's own layout metrics (`scrollHeight`/`scrollWidth`) — only its painted/visual size. That means: (a) the block's WIDTH constraint can be satisfied purely with CSS (`left`/`right` percentages, no JS needed — the browser wraps text to fit automatically), and (b) whether the wrapped text's HEIGHT fits the vertical safe zone can be measured directly via `el.scrollHeight` regardless of what scale is currently applied, making a clean measure → compute-scale → apply-scale loop possible without any iteration/guessing.

- [ ] **Step 1: Add the safe-area CSS values and the shrink-to-fit measurement**

Replace the whole file with:

```tsx
'use client';

import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import { TEXT_BLOCKS, MOBILE_CONFIG, shadowToCss } from '@/app/lib/sceneConfig';
import { useSceneControls } from '@/app/lib/SceneControlsContext';
import { isMobileDevice } from '@/app/lib/mobileDetect';

const { sideMarginPercent, topMarginPercent, gapAroundButtonPercent } = MOBILE_CONFIG.textSafeArea;
const { portraitBottomPercent, landscapeRightPercent } = MOBILE_CONFIG.sphereButton;

/**
 * Renders the 5 scroll-timed text blocks. Opacity is NOT driven by
 * React state (would re-render every scroll frame) — Section1's
 * rAF loop writes `style.opacity` directly onto these refs each
 * frame via `blockRefs`. See app/lib/scrollTimeline.ts for the math
 * and app/lib/sceneConfig.ts TEXT_BLOCKS for position/size/timing.
 *
 * On mobile (isMobileDevice()), desktop's per-block edge-anchored
 * positioning (left-aligned upper-left, right-aligned upper-right,
 * etc.) is replaced by ONE shared, centered "safe zone" — see
 * MOBILE_CONFIG.textSafeArea — with an additional per-block shrink
 * scale computed via a real DOM measurement (useLayoutEffect below)
 * so long lines never overflow that zone regardless of viewport size
 * or the debug menu's font-size multiplier.
 */
const ScrollTextBlocks = forwardRef<HTMLDivElement[], object>(function ScrollTextBlocks(_props, ref) {
  const { textBlockFontSizeMultiplier, textBlockShadowSizeMultiplier, textBlockShadowIntensityMultiplier, textBlockAlignment } =
    useSceneControls();
  const [isMobile] = useState(() => isMobileDevice());
  const innerElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const [mobileFitScale, setMobileFitScale] = useState<number[]>(() => TEXT_BLOCKS.map(() => 1));

  useLayoutEffect(() => {
    if (!isMobile) return;
    function measure() {
      // Portrait's safe-zone bottom boundary sits above the sphere-control
      // button (which is near the screen bottom there); landscape has no
      // such vertical constraint (the button moves to the side), so only
      // the top margin bounds it on that axis.
      const isPortrait = window.innerHeight >= window.innerWidth;
      const safeHeightPercent = isPortrait
        ? 100 - topMarginPercent - portraitBottomPercent - gapAroundButtonPercent
        : 100 - topMarginPercent * 2;
      const safeHeightPx = (safeHeightPercent / 100) * window.innerHeight;
      setMobileFitScale(
        TEXT_BLOCKS.map((_, i) => {
          const el = innerElsRef.current[i];
          if (!el) return 1;
          const naturalHeightPx = el.scrollHeight;
          if (naturalHeightPx <= 0) return 1;
          const scale = safeHeightPx / (naturalHeightPx * textBlockFontSizeMultiplier);
          return Math.max(0.3, Math.min(1, scale));
        })
      );
    }
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [isMobile, textBlockFontSizeMultiplier]);

  return (
    <>
      {/* The landscape override below also resets `bottom` to the plain
          top-margin value (not the portrait button-clearance value) so the
          CSS box's actual height matches what measure()'s isPortrait branch
          assumes (100 - topMarginPercent*2) — otherwise the safe-zone box
          would keep a large, unnecessary bottom gap in landscape even
          though the sphere-control button has moved to the side. */}
      <style>{`
        @media (orientation: landscape) {
          .textSafeZone {
            right: ${landscapeRightPercent + gapAroundButtonPercent}% !important;
            bottom: ${topMarginPercent}% !important;
          }
        }
      `}</style>
      {TEXT_BLOCKS.map((block, i) => {
        const totalScale = textBlockFontSizeMultiplier * (isMobile ? mobileFitScale[i] : 1);
        const textStyle = {
          textAlign: textBlockAlignment,
          // text-align: justify never stretches a block's LAST line by
          // default — and since each line here is already its own
          // separate <div> (see the .map below), every line IS the last
          // line of its own box. text-align-last forces it to justify too.
          textAlignLast: textBlockAlignment === 'justify' ? ('justify' as const) : undefined,
          color: block.color,
          fontFamily: 'var(--font-michroma), sans-serif',
          fontSize: block.fontSizeClamp,
          letterSpacing: block.letterSpacing,
          lineHeight: 1.6,
          textShadow: shadowToCss(block.shadow, textBlockShadowSizeMultiplier, textBlockShadowIntensityMultiplier),
        };

        if (isMobile) {
          return (
            <div
              key={block.id}
              className="textSafeZone"
              style={{
                position: 'absolute',
                zIndex: 10,
                top: `${topMarginPercent}%`,
                bottom: `${portraitBottomPercent + gapAroundButtonPercent}%`,
                left: `${sideMarginPercent}%`,
                right: `${sideMarginPercent}%`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <div
                ref={(el) => {
                  innerElsRef.current[i] = el;
                  if (!ref || typeof ref === 'function') return;
                  if (el && ref.current) ref.current[i] = el;
                }}
                style={{
                  opacity: 0,
                  userSelect: 'none',
                  transformOrigin: 'center',
                  transform: `scale(${totalScale})`,
                  ...textStyle,
                }}
              >
                {block.lines.map((line, li) => (
                  <div key={li}>{line}</div>
                ))}
              </div>
            </div>
          );
        }

        // Desktop — unchanged from before this task.
        const transformOrigin =
          textBlockAlignment === 'left' ? 'top left' : textBlockAlignment === 'right' ? 'top right' : 'top center';
        const positionTransform = block.position.transform;
        const combinedTransform = positionTransform
          ? `${positionTransform} scale(${totalScale})`
          : `scale(${totalScale})`;
        return (
          <div
            key={block.id}
            ref={(el) => {
              if (!ref || typeof ref === 'function') return;
              if (el && ref.current) ref.current[i] = el;
            }}
            style={{
              position: 'absolute',
              zIndex: 10,
              opacity: 0,
              pointerEvents: 'none',
              userSelect: 'none',
              transformOrigin,
              ...block.position,
              transform: combinedTransform, // explicitly last — overrides any block.position.transform, combining it with the scale instead of losing it
              ...textStyle,
            }}
          >
            {block.lines.map((line, li) => (
              <div key={li}>{line}</div>
            ))}
          </div>
        );
      })}
    </>
  );
});

export default ScrollTextBlocks;
```

(Note: on mobile, the `ref` callback that Section1.tsx's `textBlockRefs` receives now points to the INNER div — the one whose `opacity`/`transform` actually change — matching exactly what Section1.tsx's per-frame loop already expects to control. `innerElsRef` is a SEPARATE, purely-local ref used only for the shrink-to-fit measurement; it doesn't need to be exposed outside this component.)

- [ ] **Step 2: Verify**

1. `npx tsc --noEmit`, `npm run build`, `npm run lint`, `npm test` — all clean.
2. Playwright mobile emulation, PORTRAIT: scroll to each of the 5 text blocks in turn. For each, confirm via `getBoundingClientRect()` on the rendered (inner, opacity-driven) element: its bounding box's left edge is `>= 15vw` and right edge `<= 85vw` (respecting the 15% side margins), its top edge is `>= 15vh` (top margin), and its bottom edge stays clear of the sphere-control button's top edge by roughly the intended gap (compute the button's own bounding box and compare). Confirm the debug menu's font-size slider, when dragged to its maximum, does NOT cause any block to visually overflow the safe zone (the shrink-to-fit scale should compensate) — this is the key correctness check for this task.
3. Playwright mobile emulation, LANDSCAPE (swap emulated viewport dimensions): re-run the same per-block boundary checks, confirming the right margin now clears the relocated sphere-control button (not just the flat 15% side margin).
4. Resize the emulated viewport mid-scroll (simulating an orientation change while a block is visible) and confirm the block's fit-scale recomputes (no longer clipped/overflowing at the new dimensions).
5. Playwright desktop viewport: confirm text blocks render EXACTLY as before this task (same positions, same per-block left/right/center desktop layout) — this is the most important regression check, since this task's desktop code path is meant to be byte-for-byte unchanged logic, just restructured into the same component.
6. No console errors in either mode.

- [ ] **Step 3: Commit**

```bash
git add app/components/ScrollTextBlocks.tsx
git commit -m "feat: adaptive centered safe-area layout and shrink-to-fit sizing for text blocks on mobile"
```

---

## Task 6: Full QA pass

**Files:** none (verification only; fix genuine bugs found, don't invent scope)

**Note on testing limits:** Playwright can emulate mobile viewports/touch/user-agent and dispatch synthetic `DeviceOrientationEvent`s, which covers the app's OWN logic thoroughly. It CANNOT drive the real native iOS/Android permission-prompt UI (the actual OS-level dialog asking "Allow motion & orientation access?") — that requires a real device or an emulator with the real OS chrome. This task verifies everything automatable; note explicitly what still needs a real-device check before considering the mobile experience fully proven.

- [ ] **Step 1: Run the full unit-test suite**

Run: `npm test` — expect ALL suites green, including the new `mobileDetect.test.ts`.

- [ ] **Step 2: Verify the production build**

Run: `npm run build` — must complete cleanly. Run: `npm run lint` — 0 errors/warnings except any pre-existing failures confirmed unrelated to this plan's files (check first, don't assume).

- [ ] **Step 3: Live walkthrough checklist (Playwright, mobile emulation unless noted)**

1. **Full mobile flow, portrait** — load → gate overlay visible (75% black, background visible through it, close top-right, centered CTA with exact text, center-aligned) → tap CTA → gate disappears, audio activated, sphere-control button and hamburger now visible → hold sphere-control button + dispatch synthetic device-orientation events → sphere moves; release → sphere stops responding to orientation → tap hamburger → debug menu opens, fits screen, closable → all 5 text blocks stay within their safe-zone margins across the full scroll, shrinking as needed at high debug font-size-multiplier settings.
2. **Full mobile flow, portrait, close-button path** — reload → tap ✕ instead of CTA → gate disappears, audio NOT activated, sphere-control button visible but inert → hold it once → confirm it (successfully or as a no-op depending on the simulated permission API) attempts the permission request path → confirm audio can still be activated afterward via the debug menu's play/pause control.
3. **Landscape** — re-run the position/margin checks from Tasks 3-5 with a landscape-emulated viewport; confirm the sphere-control button, and the text safe-zone's right margin, both relocate correctly.
4. **Desktop regression sweep** — load with a desktop viewport/user-agent and confirm: no gate overlay, no sphere-control button, no hamburger button ever render; mouse-drag sphere steering works exactly as before; Shift still opens/closes the debug menu; all 5 text blocks render at their original desktop positions; nothing else in the existing experience (corridor phase, audio doppler, star fields, etc.) is affected — this plan's diff should be additive-only for desktop users.
5. **Cross-cutting** — no new `react-hooks/exhaustive-deps` warnings; no orphaned context state; `debugMenuOpen` correctly defaults to closed on both mobile and desktop.

- [ ] **Step 4: Report**

Summarize pass/fail for all items, and explicitly list what still needs verification on a REAL iOS device and a REAL Android device before this can be considered fully proven (at minimum: the actual native permission-prompt UI and its accept/deny paths, real accelerometer/gyroscope responsiveness and comfortable tilt range — the `beta`/`gamma` normalization constants in Task 3 are a reasonable starting guess, not something Playwright's synthetic events can validate as "feels right to hold and tilt"). For any genuine bug found in the automatable checks, the controller will dispatch a targeted fix before considering the plan complete.

---

## Self-Review

**Spec coverage:**
- Mobile detection gating "cuando se detecta que no es un navegador de pc" → Task 1.
- Permission gate: 75% black overlay, responsive, close button, Michroma text, centered CTA with exact text and center alignment, tap → audio + motion permission request → activates audio → overlay disappears → Task 2.
- Text blocks always visible/centered with the specified margins, adaptive shrink → Task 5.
- Disable mouse/touch steering on mobile, replace with hold-to-activate button-gated device-orientation steering, fingerprint icon (vector, white, black shadow), portrait/landscape positioning → Task 3.
- Hamburger icon (position, color, shadow, opacity) opening a responsive debug menu → Task 4.
- Task 6 closes the loop with full-suite verification, a live walkthrough, and an explicit list of what still needs a real device.

**Placeholder scan:** no `TBD`/`fill in later` markers; every task has complete, literal code for every step, including the fingerprint SVG (hand-authored nested-arc paths, since the reference image had no accessible file path — see Design Decision #4) and the exact permission/audio-activation logic (reusing the same 3 context setters the existing desktop Space-bar handler already calls).

**Type consistency:** `MOBILE_CONFIG` is a single new export consumed identically by `MobileGate.tsx`, `Section1.tsx`, and `ScrollTextBlocks.tsx` — no shape drift risk since only Task 1 defines it and every other task's code was written against that exact shape. `requestMotionPermissionIfNeeded()` has one signature, defined once in Task 2, called identically (no arguments, fire-and-forget or awaited) from both Task 2's `MobileGate.tsx` and Task 3's `Section1.tsx` press handler. `debugMenuOpen`/`setDebugMenuOpen` follow the exact same context-field pattern as every other boolean toggle already in `SceneControlsContext.tsx` (interface entry, `useState`, `useMemo` value + dep array) — Task 1 adds it once, Tasks 2/4 are the only consumers, with no signature mismatch risk since `DebugMenu.tsx`'s existing internal usage of `open`/`setOpen` is a pure rename to the context fields, not a new shape.
