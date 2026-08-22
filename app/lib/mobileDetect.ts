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
