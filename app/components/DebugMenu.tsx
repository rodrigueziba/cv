'use client';

import { useEffect, useRef } from 'react';
import { useSceneControls } from '@/app/lib/SceneControlsContext';
import {
  DEFAULT_SCENE_COLORS,
  COLOR_PALETTE_PRESETS,
  AUDIO_CONFIG,
  DEBUG_RANGES,
  type SceneColorKey,
} from '@/app/lib/sceneConfig';

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

/** Shared label+range-input row — used by every new debug slider. */
function SliderRow({
  label,
  value,
  onChange,
  min,
  max,
  step,
  formatValue,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  formatValue?: (v: number) => string;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ opacity: 0.7 }}>{formatValue ? formatValue(value) : value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  );
}

/**
 * Debug panel — press Shift, or click the ✕, to toggle. Sections:
 *  1) Color pickers + palette presets.
 *  2) Audio source (mp3/tone/arpeggio) + play/pause media control.
 *  3) Text-block appearance (font size, shadow size/intensity).
 *  4) Camera (FOV, free-fly toggle).
 *  5) Effect tuning (pitch inertia, floor-doppler intensity/inertia,
 *     corridor wave speed).
 * All state lives in SceneControlsContext; this component only renders
 * controls for it. Responsive: narrows to a near-full-width sheet on
 * small viewports (see the injected <style> block below).
 */
export default function DebugMenu() {
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    debugMenuOpen,
    setDebugMenuOpen,
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
  } = useSceneControls();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Shift' || e.repeat) return;
      const target = e.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      setDebugMenuOpen(!debugMenuOpen);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [debugMenuOpen, setDebugMenuOpen]);

  if (!debugMenuOpen) return null;

  const michroma = 'var(--font-michroma), sans-serif';

  return (
    <>
      <style>{`
        .dbgPanel { width: 300px; }
        @media (max-width: 560px) {
          .dbgPanel { width: calc(100vw - 24px) !important; right: 12px !important; left: 12px !important; max-height: 85vh !important; }
        }
      `}</style>
      <div
        ref={panelRef}
        className="dbgPanel"
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          maxHeight: '90vh',
          overflowY: 'auto',
          zIndex: 1000,
          background: 'rgba(10, 8, 20, 0.94)',
          color: '#f0f0f5',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 12,
          borderRadius: 10,
          padding: 14,
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <div style={{ fontFamily: michroma, fontWeight: 400, fontSize: 12, letterSpacing: '0.05em' }}>
            DEBUG MENU
          </div>
          <button
            onClick={() => setDebugMenuOpen(false)}
            aria-label="Cerrar menú de debug"
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#f0f0f5',
              borderRadius: 6,
              width: 22,
              height: 22,
              lineHeight: '20px',
              textAlign: 'center',
              cursor: 'pointer',
              padding: 0,
              fontFamily: michroma,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ opacity: 0.5, marginBottom: 12 }}>(Shift para cerrar también)</div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: michroma, fontWeight: 400, marginBottom: 6 }}>Paletas</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {COLOR_PALETTE_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyColorPreset(preset.colors)}
                style={{
                  fontSize: 11,
                  fontFamily: michroma,
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
          <div style={{ fontFamily: michroma, fontWeight: 400, marginBottom: 6 }}>Colores</div>
          {(Object.keys(DEFAULT_SCENE_COLORS) as SceneColorKey[]).map((key) => (
            <label
              key={key}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}
            >
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

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: michroma, fontWeight: 400, marginBottom: 6 }}>Fuente de audio</div>
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
              <input type="file" accept="audio/*" onChange={(e) => setUploadedFile(e.target.files?.[0] ?? null)} />
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
            <div style={{ marginLeft: 20, marginBottom: 8 }}>
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

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              width: '100%',
              marginTop: 4,
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.2)',
              background: isPlaying ? 'rgba(120,255,170,0.18)' : 'rgba(255,255,255,0.06)',
              color: '#f0f0f5',
              cursor: 'pointer',
              fontFamily: michroma,
              fontSize: 11,
              letterSpacing: '0.05em',
            }}
          >
            {isPlaying ? '⏸ PAUSAR' : '▶ REPRODUCIR'}
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: michroma, fontWeight: 400, marginBottom: 6 }}>Texto — bloques</div>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span>Justificación de texto</span>
            <select
              value={textBlockAlignment}
              onChange={(e) => setTextBlockAlignment(e.target.value as typeof textBlockAlignment)}
              style={{ marginLeft: 8 }}
            >
              <option value="justify">Justificado</option>
              <option value="center">Centrado</option>
              <option value="left">Izquierda</option>
              <option value="right">Derecha</option>
            </select>
          </label>
          <SliderRow
            label="Tamaño de fuente"
            value={textBlockFontSizeMultiplier}
            onChange={setTextBlockFontSizeMultiplier}
            {...DEBUG_RANGES.textBlockFontSizeMultiplier}
          />
          <SliderRow
            label="Tamaño de sombra"
            value={textBlockShadowSizeMultiplier}
            onChange={setTextBlockShadowSizeMultiplier}
            {...DEBUG_RANGES.textBlockShadowSizeMultiplier}
          />
          <SliderRow
            label="Intensidad de sombra"
            value={textBlockShadowIntensityMultiplier}
            onChange={setTextBlockShadowIntensityMultiplier}
            {...DEBUG_RANGES.textBlockShadowIntensityMultiplier}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: michroma, fontWeight: 400, marginBottom: 6 }}>Cámara</div>
          <SliderRow
            label="FOV"
            value={cameraFovDeg}
            onChange={setCameraFovDeg}
            formatValue={(v) => `${Math.round(v)}°`}
            {...DEBUG_RANGES.cameraFovDeg}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <input type="checkbox" checked={freeCameraEnabled} onChange={(e) => setFreeCameraEnabled(e.target.checked)} />
            <span>Cámara libre (WASD + Q/E + mouse)</span>
          </label>
        </div>

        <div>
          <div style={{ fontFamily: michroma, fontWeight: 400, marginBottom: 6 }}>Efectos</div>
          <SliderRow
            label="Inercia del pitch (Doppler)"
            value={pitchInertiaMultiplier}
            onChange={setPitchInertiaMultiplier}
            {...DEBUG_RANGES.pitchInertiaMultiplier}
          />
          <SliderRow
            label="Intensidad — ondas del piso"
            value={floorDopplerIntensityMultiplier}
            onChange={setFloorDopplerIntensityMultiplier}
            {...DEBUG_RANGES.floorDopplerIntensityMultiplier}
          />
          <SliderRow
            label="Inercia — ondas del piso"
            value={floorDopplerInertiaMultiplier}
            onChange={setFloorDopplerInertiaMultiplier}
            {...DEBUG_RANGES.floorDopplerInertiaMultiplier}
          />
          <SliderRow
            label="Velocidad — ondas del pasillo"
            value={corridorWaveSpeedMultiplier}
            onChange={setCorridorWaveSpeedMultiplier}
            {...DEBUG_RANGES.corridorWaveSpeedMultiplier}
          />
        </div>
      </div>
    </>
  );
}
