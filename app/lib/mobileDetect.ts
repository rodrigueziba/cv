import { useSyncExternalStore } from 'react';

/**
 * True for iOS specifically (iPhone/iPad/iPod, or iPadOS's Mac-UA
 * disguise — detected via multi-touch on a "Macintosh" UA, since real
 * Macs report maxTouchPoints 0). Doesn't check for mobile/touch-primary
 * on its own — see isMobileDevice(), which layers that check on top.
 */
export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

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
  const isIOS = isIOSDevice();
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

// isMobileDevice() reads navigator/window, so it necessarily differs
// between the server (undefined window → false) and the client (actual
// UA/pointer checks) — the classic case useSyncExternalStore's
// getServerSnapshot param exists to solve. Using it here (rather than
// deciding isMobile in a mount-effect setState) avoids a hydration
// mismatch AND the extra render an effect-driven setState would cause.
// Module-scope (not defined inside the hook) so their identity is stable
// across renders — isMobileDevice() itself never changes within a
// session, so there's nothing to subscribe to.
function subscribeToNothing() {
  return () => {};
}
function getIsMobileServerSnapshot() {
  return false;
}

/**
 * Hydration-safe hook for "is this a mobile browser". Renders `false` on
 * the server and on the client's first (hydration-matching) render, then
 * corrects to the real client-side isMobileDevice() result on a
 * subsequent render — this is what avoids a hydration mismatch (a plain
 * `useState(() => isMobileDevice())` lazy initializer does NOT: server
 * renders false, but the client's own lazy initializer runs against the
 * real browser and can immediately return true, so the very first client
 * render could already disagree with the server-rendered HTML).
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribeToNothing, isMobileDevice, getIsMobileServerSnapshot);
}

function getIsIOSServerSnapshot() {
  return false;
}

/** Hydration-safe hook for "is this iOS specifically" — same rationale as
 * useIsMobile() above. */
export function useIsIOS(): boolean {
  return useSyncExternalStore(subscribeToNothing, isIOSDevice, getIsIOSServerSnapshot);
}
