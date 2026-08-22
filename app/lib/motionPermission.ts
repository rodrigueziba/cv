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
