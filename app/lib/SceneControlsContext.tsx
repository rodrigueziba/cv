'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SCENE_COLORS, DEBUG_RANGES, DEFAULT_TEXT_BLOCK_ALIGNMENT, type SceneColorKey, type TextBlockAlignment } from '@/app/lib/sceneConfig';

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
  /** Index into AUDIO_CONFIG.playlistPaths for the currently-selected
   * bundled track (ignored when uploadedFileUrl is set — a custom upload
   * always takes precedence and loops on its own). A special sentinel
   * value, CORRIDOR_AUDIO_OVERRIDE_TRACK_INDEX (see Section1.tsx), selects
   * AUDIO_CONFIG.corridorOverridePath instead of a playlist entry — used
   * only by the corridor's 50%-crossing override, never set by the UI. */
  currentTrackIndex: number;
  setCurrentTrackIndex: (i: number) => void;
  /** Object URL of a user-uploaded mp3, or null to use the default /audio.mp3 */
  uploadedFileUrl: string | null;
  setUploadedFile: (file: File | null) => void;

  /** Has the user pressed Space at least once this session? Drives the
   * "press space to activate" prompt's visibility. */
  audioActivated: boolean;
  setAudioActivated: (activated: boolean) => void;
  /** Is audio currently playing (vs. paused)? Space bar + the debug
   * menu's media control both read/write this. */
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;

  textBlockFontSizeMultiplier: number;
  setTextBlockFontSizeMultiplier: (v: number) => void;
  textBlockShadowSizeMultiplier: number;
  setTextBlockShadowSizeMultiplier: (v: number) => void;
  textBlockShadowIntensityMultiplier: number;
  setTextBlockShadowIntensityMultiplier: (v: number) => void;
  textBlockAlignment: TextBlockAlignment;
  setTextBlockAlignment: (v: TextBlockAlignment) => void;

  freeCameraEnabled: boolean;
  setFreeCameraEnabled: (v: boolean) => void;
  debugMenuOpen: boolean;
  setDebugMenuOpen: (v: boolean) => void;
  cameraFovDeg: number;
  setCameraFovDeg: (v: number) => void;

  pitchInertiaMultiplier: number;
  setPitchInertiaMultiplier: (v: number) => void;
  floorDopplerIntensityMultiplier: number;
  setFloorDopplerIntensityMultiplier: (v: number) => void;
  floorDopplerInertiaMultiplier: number;
  setFloorDopplerInertiaMultiplier: (v: number) => void;
  corridorWaveSpeedMultiplier: number;
  setCorridorWaveSpeedMultiplier: (v: number) => void;
}

const SceneControlsContext = createContext<SceneControlsValue | null>(null);

export function SceneControlsProvider({ children }: { children: ReactNode }) {
  const [colors, setColors] = useState<Record<SceneColorKey, string>>({ ...DEFAULT_SCENE_COLORS });
  const [audioSourceMode, setAudioSourceMode] = useState<AudioSourceMode>('tone');
  const [toneFrequencyHz, setToneFrequencyHz] = useState(220);
  const [arpeggioMode, setArpeggioMode] = useState<ArpeggioMode>('minor');
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  // Mirrors uploadedFileUrl so the unmount-only cleanup effect below can read
  // the latest value without needing uploadedFileUrl in its dependency array.
  const uploadedFileUrlRef = useRef<string | null>(null);

  const [audioActivated, setAudioActivated] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const [textBlockFontSizeMultiplier, setTextBlockFontSizeMultiplier] = useState(
    DEBUG_RANGES.textBlockFontSizeMultiplier.default
  );
  const [textBlockShadowSizeMultiplier, setTextBlockShadowSizeMultiplier] = useState(
    DEBUG_RANGES.textBlockShadowSizeMultiplier.default
  );
  const [textBlockShadowIntensityMultiplier, setTextBlockShadowIntensityMultiplier] = useState(
    DEBUG_RANGES.textBlockShadowIntensityMultiplier.default
  );
  const [textBlockAlignment, setTextBlockAlignment] = useState<TextBlockAlignment>(DEFAULT_TEXT_BLOCK_ALIGNMENT);

  const [freeCameraEnabled, setFreeCameraEnabled] = useState(false);
  const [debugMenuOpen, setDebugMenuOpen] = useState(false);
  const [cameraFovDeg, setCameraFovDeg] = useState(DEBUG_RANGES.cameraFovDeg.default);

  const [pitchInertiaMultiplier, setPitchInertiaMultiplier] = useState(
    DEBUG_RANGES.pitchInertiaMultiplier.default
  );
  const [floorDopplerIntensityMultiplier, setFloorDopplerIntensityMultiplier] = useState(
    DEBUG_RANGES.floorDopplerIntensityMultiplier.default
  );
  const [floorDopplerInertiaMultiplier, setFloorDopplerInertiaMultiplier] = useState(
    DEBUG_RANGES.floorDopplerInertiaMultiplier.default
  );
  const [corridorWaveSpeedMultiplier, setCorridorWaveSpeedMultiplier] = useState(
    DEBUG_RANGES.corridorWaveSpeedMultiplier.default
  );

  const setUploadedFile = (file: File | null) => {
    if (uploadedFileUrlRef.current) URL.revokeObjectURL(uploadedFileUrlRef.current);
    const next = file ? URL.createObjectURL(file) : null;
    uploadedFileUrlRef.current = next;
    setUploadedFileUrl(next);
  };

  // Unmount-only cleanup: revoke whatever URL is current when the provider unmounts.
  // Per-selection revoke is already handled synchronously in setUploadedFile above.
  useEffect(() => {
    return () => {
      if (uploadedFileUrlRef.current) URL.revokeObjectURL(uploadedFileUrlRef.current);
    };
  }, []);

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
      currentTrackIndex,
      setCurrentTrackIndex,
      uploadedFileUrl,
      setUploadedFile,
      audioActivated,
      setAudioActivated,
      isPlaying,
      setIsPlaying,
      textBlockFontSizeMultiplier,
      setTextBlockFontSizeMultiplier,
      textBlockShadowSizeMultiplier,
      setTextBlockShadowSizeMultiplier,
      textBlockShadowIntensityMultiplier,
      setTextBlockShadowIntensityMultiplier,
      textBlockAlignment,
      setTextBlockAlignment,
      freeCameraEnabled,
      setFreeCameraEnabled,
      debugMenuOpen,
      setDebugMenuOpen,
      cameraFovDeg,
      setCameraFovDeg,
      pitchInertiaMultiplier,
      setPitchInertiaMultiplier,
      floorDopplerIntensityMultiplier,
      setFloorDopplerIntensityMultiplier,
      floorDopplerInertiaMultiplier,
      setFloorDopplerInertiaMultiplier,
      corridorWaveSpeedMultiplier,
      setCorridorWaveSpeedMultiplier,
    }),
    [
      colors,
      audioSourceMode,
      toneFrequencyHz,
      arpeggioMode,
      currentTrackIndex,
      uploadedFileUrl,
      audioActivated,
      isPlaying,
      textBlockFontSizeMultiplier,
      textBlockShadowSizeMultiplier,
      textBlockShadowIntensityMultiplier,
      textBlockAlignment,
      freeCameraEnabled,
      debugMenuOpen,
      cameraFovDeg,
      pitchInertiaMultiplier,
      floorDopplerIntensityMultiplier,
      floorDopplerInertiaMultiplier,
      corridorWaveSpeedMultiplier,
    ]
  );

  return <SceneControlsContext.Provider value={value}>{children}</SceneControlsContext.Provider>;
}

export function useSceneControls(): SceneControlsValue {
  const ctx = useContext(SceneControlsContext);
  if (!ctx) throw new Error('useSceneControls must be used within SceneControlsProvider');
  return ctx;
}
