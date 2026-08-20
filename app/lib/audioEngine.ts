import { AUDIO_CONFIG } from '@/app/lib/sceneConfig';
import { lerpLog, speedToPlaybackRate } from '@/app/lib/audioMath';
import { withBasePath } from '@/app/lib/basePath';
import type { ArpeggioMode, AudioSourceMode } from '@/app/lib/SceneControlsContext';

const FILTER_GLIDE_SECONDS = 0.05;
const PITCH_GLIDE_SECONDS = 0.08;
const DEFAULT_MASTER_GAIN = 0.7;

/** Vendor-prefixed pitch-preservation flags we disable so playbackRate audibly shifts pitch. */
type PitchPreservingAudio = HTMLAudioElement & {
  preservesPitch?: boolean;
  mozPreservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
};

/**
 * Owns the entire Web Audio graph for the Doppler experience:
 *
 *   [source: <audio> el | oscillator (tone) | oscillator (arpeggio)]
 *     → lowpass (BiquadFilterNode)
 *     → highpass (BiquadFilterNode)
 *     → masterGain
 *     → destination
 *
 * `setDopplerSpeed` drives pitch (playbackRate for the file source,
 * oscillator.frequency multiplier for tone/arpeggio).
 * `setLowpassAmount` / `setHighpassAmount` drive the two light-beam filters.
 *
 * Must call `resume()` from inside a user-gesture event handler before
 * any sound is audible (browser autoplay policy).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private highpass: BiquadFilterNode | null = null;

  private mode: AudioSourceMode = 'tone';
  private dopplerRate = 1; // smoothed playbackRate-equivalent multiplier

  private audioEl: HTMLAudioElement | null = null;
  private mediaSourceNode: MediaElementAudioSourceNode | null = null;

  private oscillator: OscillatorNode | null = null;
  private baseToneFrequencyHz = AUDIO_CONFIG.defaultToneFrequencyHz;

  private arpeggioTimer: ReturnType<typeof setInterval> | null = null;
  private arpeggioIndex = 0;
  private arpeggioModeValue: ArpeggioMode = 'minor';

  /** Lazily creates the AudioContext + filter/gain chain. Safe to call multiple times. */
  private ensureGraph(): { ctx: AudioContext; lowpass: BiquadFilterNode; highpass: BiquadFilterNode } {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = AUDIO_CONFIG.lowpassOpenHz;

      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = AUDIO_CONFIG.highpassOpenHz;

      const masterGain = ctx.createGain();
      masterGain.gain.value = DEFAULT_MASTER_GAIN;

      lowpass.connect(highpass);
      highpass.connect(masterGain);
      masterGain.connect(ctx.destination);

      this.ctx = ctx;
      this.lowpass = lowpass;
      this.highpass = highpass;
      this.masterGain = masterGain;
    }
    return { ctx: this.ctx, lowpass: this.lowpass!, highpass: this.highpass! };
  }

  /** Call from inside a user-gesture event handler (click/scroll/keydown). */
  async resume(): Promise<void> {
    const { ctx } = this.ensureGraph();
    if (ctx.state === 'suspended') await ctx.resume();
    // If setSource('file', ...) ran before the context was resumed, its
    // el.play() call was rejected with NotAllowedError. Retry it now that
    // we're (hopefully) inside/after a user gesture.
    if (this.audioEl && this.audioEl.paused) {
      this.audioEl.play().catch(() => {
        /* still blocked — e.g. browser requires play() itself inside the gesture handler (Safari) */
      });
    }
  }

  private teardownSource(): void {
    if (this.audioEl) {
      this.audioEl.pause();
      this.mediaSourceNode?.disconnect();
      this.audioEl = null;
      this.mediaSourceNode = null;
    }
    if (this.oscillator) {
      this.oscillator.stop();
      this.oscillator.disconnect();
      this.oscillator = null;
    }
    if (this.arpeggioTimer !== null) {
      clearInterval(this.arpeggioTimer);
      this.arpeggioTimer = null;
    }
  }

  /**
   * Switches the active source. `fileUrl` defaults to the bundled
   * /audio.mp3 (basePath-aware) when the user hasn't uploaded one.
   */
  setSource(
    mode: AudioSourceMode,
    opts: { fileUrl?: string | null; toneFrequencyHz?: number; arpeggioMode?: ArpeggioMode } = {}
  ): void {
    const { ctx, lowpass } = this.ensureGraph();
    this.teardownSource();
    this.mode = mode;

    if (mode === 'file') {
      const el = new Audio(opts.fileUrl ?? withBasePath(AUDIO_CONFIG.defaultMp3Path));
      el.loop = true;
      el.crossOrigin = 'anonymous';
      // Pitch must move WITH playbackRate for the doppler effect to be audible.
      const pitchPreservingEl = el as PitchPreservingAudio;
      pitchPreservingEl.preservesPitch = false;
      pitchPreservingEl.mozPreservesPitch = false;
      pitchPreservingEl.webkitPreservesPitch = false;
      el.playbackRate = this.dopplerRate;
      const node = ctx.createMediaElementSource(el);
      node.connect(lowpass);
      el.play().catch((err) => {
        // NotAllowedError just means resume() hasn't run yet from a user gesture —
        // resume() retries el.play() itself once it does. Anything else (404,
        // corrupt file, bad MIME) is a real failure and should surface a
        // diagnostic instead of going silently mute.
        if (err?.name !== 'NotAllowedError') {
          console.warn('[AudioEngine] file source failed to play', err);
        }
      });
      this.audioEl = el;
      this.mediaSourceNode = node;
      return;
    }

    if (mode === 'tone') {
      this.baseToneFrequencyHz = opts.toneFrequencyHz ?? this.baseToneFrequencyHz;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = this.baseToneFrequencyHz * this.dopplerRate;
      osc.connect(lowpass);
      osc.start();
      this.oscillator = osc;
      return;
    }

    // mode === 'arpeggio'
    this.arpeggioModeValue = opts.arpeggioMode ?? this.arpeggioModeValue;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.connect(lowpass);
    osc.start();
    this.oscillator = osc;
    this.arpeggioIndex = 0;
    this.arpeggioTimer = setInterval(() => this.stepArpeggio(), AUDIO_CONFIG.arpeggioNoteMs);
    // Fire the first note immediately rather than waiting for the first interval tick.
    this.stepArpeggio();
  }

  private stepArpeggio(): void {
    if (!this.oscillator || !this.ctx) return;
    const notes = AUDIO_CONFIG.arpeggioChords[this.arpeggioModeValue];
    const note = notes[this.arpeggioIndex % notes.length];
    this.arpeggioIndex++;
    this.oscillator.frequency.setTargetAtTime(note * this.dopplerRate, this.ctx.currentTime, PITCH_GLIDE_SECONDS);
  }

  /** Live-updates the tone frequency while in 'tone' mode (no-op otherwise). */
  setToneFrequency(hz: number): void {
    this.baseToneFrequencyHz = hz;
    if (this.mode === 'tone' && this.oscillator && this.ctx) {
      this.oscillator.frequency.setTargetAtTime(hz * this.dopplerRate, this.ctx.currentTime, PITCH_GLIDE_SECONDS);
    }
  }

  /** Live-updates the arpeggio key while in 'arpeggio' mode (no-op otherwise). */
  setArpeggioMode(mode: ArpeggioMode): void {
    this.arpeggioModeValue = mode;
  }

  /**
   * Called every animation frame with the current sphere speed
   * (world units/sec). Maps to a playbackRate-equivalent multiplier
   * and applies it to whichever source is active.
   */
  setDopplerSpeed(speedUnitsPerSec: number): void {
    const target = speedToPlaybackRate(speedUnitsPerSec, AUDIO_CONFIG);
    this.dopplerRate += (target - this.dopplerRate) * AUDIO_CONFIG.dopplerSmoothing;

    if (this.audioEl) {
      this.audioEl.playbackRate = this.dopplerRate;
    } else if (this.oscillator && this.ctx && this.mode === 'tone') {
      this.oscillator.frequency.setTargetAtTime(
        this.baseToneFrequencyHz * this.dopplerRate,
        this.ctx.currentTime,
        PITCH_GLIDE_SECONDS
      );
    }
    // Arpeggio mode picks up the new dopplerRate on its next stepArpeggio() tick.
  }

  /** amount: 0 = fully open (no effect), 1 = only bass frequencies remain. */
  setLowpassAmount(amount: number): void {
    if (!this.lowpass || !this.ctx) return;
    const hz = lerpLog(AUDIO_CONFIG.lowpassOpenHz, AUDIO_CONFIG.lowpassClosedHz, amount);
    this.lowpass.frequency.setTargetAtTime(hz, this.ctx.currentTime, FILTER_GLIDE_SECONDS);
  }

  /** amount: 0 = fully open (no effect), 1 = only treble frequencies remain. */
  setHighpassAmount(amount: number): void {
    if (!this.highpass || !this.ctx) return;
    const hz = lerpLog(AUDIO_CONFIG.highpassOpenHz, AUDIO_CONFIG.highpassClosedHz, amount);
    this.highpass.frequency.setTargetAtTime(hz, this.ctx.currentTime, FILTER_GLIDE_SECONDS);
  }

  dispose(): void {
    this.teardownSource();
    this.masterGain?.disconnect();
    this.lowpass?.disconnect();
    this.highpass?.disconnect();
    this.ctx?.close();
    this.ctx = null;
    this.masterGain = null;
    this.lowpass = null;
    this.highpass = null;
  }
}
