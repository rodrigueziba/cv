'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  const [uploadedFile, setUploadedFileState] = useState<File | null>(null);
  const uploadedFileUrl = useMemo(
    () => (uploadedFile ? URL.createObjectURL(uploadedFile) : null),
    [uploadedFile]
  );

  // Revoke the previous object URL once it's no longer in use (file changed or unmounted).
  useEffect(() => {
    if (!uploadedFileUrl) return;
    return () => URL.revokeObjectURL(uploadedFileUrl);
  }, [uploadedFileUrl]);

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
      setUploadedFile: setUploadedFileState,
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
