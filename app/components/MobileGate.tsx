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
