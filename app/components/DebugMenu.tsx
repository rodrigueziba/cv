'use client';

import { useEffect, useRef, useState } from 'react';
import { useSceneControls } from '@/app/lib/SceneControlsContext';
import { DEFAULT_SCENE_COLORS, COLOR_PALETTE_PRESETS, AUDIO_CONFIG, type SceneColorKey } from '@/app/lib/sceneConfig';

const COLOR_LABELS: Record<SceneColorKey, string> = {
  flowBackground: 'Fondo del escenario',
  flowLineLavender: 'Líneas — lavanda',
  flowLinePink: 'Líneas — rosa',
  flowLineAmber: 'Líneas — ámbar',
  flowNearSphereGlow: 'Halo cerca de la esfera',
  sphereChromeHighlight: 'Brillo cromado (esfera)',
  starColor: 'Estrellas',
  corridorWallStart: 'Pasillo — pared inicial',
  corridorWallEnd: 'Pasillo — pared final',
};

/**
 * Debug panel — press Shift to toggle. Two sections:
 *  1) Color pickers (per-element, native <input type="color">) + curated palette presets.
 *  2) Audio source: mp3 file (upload or default /audio.mp3), pure tone (frequency slider),
 *     or minor/major arpeggio.
 * All state lives in SceneControlsContext (app/lib/SceneControlsContext.tsx); this
 * component only renders controls for it.
 */
export default function DebugMenu() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    colors,
    setColor,
    applyColorPreset,
    audioSourceMode,
    setAudioSourceMode,
    toneFrequencyHz,
    setToneFrequencyHz,
    arpeggioMode,
    setArpeggioMode,
    setUploadedFile,
  } = useSceneControls();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Shift' || e.repeat) return;
      const target = e.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      setOpen((v) => !v);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        width: 300,
        maxHeight: '90vh',
        overflowY: 'auto',
        zIndex: 1000,
        background: 'rgba(10, 8, 20, 0.92)',
        color: '#f0f0f5',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        borderRadius: 10,
        padding: 14,
        boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
        border: '1px solid rgba(255,255,255,0.12)',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, letterSpacing: '0.05em' }}>
        DEBUG MENU <span style={{ opacity: 0.5, fontWeight: 400 }}>(Shift para cerrar)</span>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Paletas</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {COLOR_PALETTE_PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => applyColorPreset(preset.colors)}
              style={{
                fontSize: 11,
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.06)',
                color: '#f0f0f5',
                cursor: 'pointer',
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Colores</div>
        {(Object.keys(DEFAULT_SCENE_COLORS) as SceneColorKey[]).map((key) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span>{COLOR_LABELS[key]}</span>
            <input
              type="color"
              value={colors[key]}
              onChange={(e) => setColor(key, e.target.value)}
              style={{ width: 28, height: 20, border: 'none', background: 'none', cursor: 'pointer' }}
            />
          </label>
        ))}
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Fuente de audio</div>
        <label style={{ display: 'block', marginBottom: 4 }}>
          <input
            type="radio"
            name="audio-source"
            checked={audioSourceMode === 'file'}
            onChange={() => setAudioSourceMode('file')}
          />{' '}
          Archivo MP3
        </label>
        {audioSourceMode === 'file' && (
          <div style={{ marginLeft: 20, marginBottom: 8 }}>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setUploadedFile(e.target.files?.[0] ?? null)}
            />
            <div style={{ opacity: 0.6, marginTop: 4 }}>
              Sin archivo cargado: usa <code>/public/audio.mp3</code> por defecto.
            </div>
          </div>
        )}

        <label style={{ display: 'block', marginBottom: 4 }}>
          <input
            type="radio"
            name="audio-source"
            checked={audioSourceMode === 'tone'}
            onChange={() => setAudioSourceMode('tone')}
          />{' '}
          Tono puro
        </label>
        {audioSourceMode === 'tone' && (
          <div style={{ marginLeft: 20, marginBottom: 8 }}>
            <input
              type="range"
              min={AUDIO_CONFIG.toneFrequencyRangeHz.min}
              max={AUDIO_CONFIG.toneFrequencyRangeHz.max}
              value={toneFrequencyHz}
              onChange={(e) => setToneFrequencyHz(Number(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ opacity: 0.7 }}>{Math.round(toneFrequencyHz)} Hz</div>
          </div>
        )}

        <label style={{ display: 'block', marginBottom: 4 }}>
          <input
            type="radio"
            name="audio-source"
            checked={audioSourceMode === 'arpeggio'}
            onChange={() => setAudioSourceMode('arpeggio')}
          />{' '}
          Arpegio
        </label>
        {audioSourceMode === 'arpeggio' && (
          <div style={{ marginLeft: 20 }}>
            <select
              value={arpeggioMode}
              onChange={(e) => setArpeggioMode(e.target.value as 'minor' | 'major')}
              style={{ width: '100%' }}
            >
              <option value="minor">Menor</option>
              <option value="major">Mayor</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
