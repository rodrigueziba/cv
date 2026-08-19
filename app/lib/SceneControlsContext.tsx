'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  // Mirrors uploadedFileUrl so the unmount-only cleanup effect below can read
  // the latest value without needing uploadedFileUrl in its dependency array.
  const uploadedFileUrlRef = useRef<string | null>(null);

  const setUploadedFile = (file: File | null) => {
    setUploadedFileUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      const next = file ? URL.createObjectURL(file) : null;
      uploadedFileUrlRef.current = next;
      return next;
    });
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
      uploadedFileUrl,
      setUploadedFile,
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
