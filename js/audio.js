// WebAudio only, no files. The context is created on the first user gesture (browsers refuse to
// start audio before that), resumed from any state that is not running or closed, and suspended
// when the tab hides. Adapted from Dusk Stack.

import { AUDIO } from './config.js';

/**
 * @param {{ muted: boolean }} options initial mute state
 * @returns {{ unlock: () => void, setMuted: (muted: boolean) => void, engine: (frame: object) => void,
 *   horn: () => void, chime: (kind: 'pickup'|'delivery'|'over') => void, crash: (strength: number) => void,
 *   nearMiss: () => void, bump: () => void, rain: (level: number) => void, suspend: () => void, resume: () => void }}
 */
export function createAudio({ muted }) {
  let isMuted = muted;
  let context = null;
  let master = null;
  let failed = false;
  let engineGain = null;
  let engineFilter = null;
  let engineOscillators = [];
  let noise = null;
  let rainGain = null;

  function noiseBuffer() {
    const length = Math.floor(context.sampleRate * AUDIO.noiseSeconds);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function buildEngine() {
    engineGain = context.createGain();
    engineGain.gain.value = 0;
    engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = AUDIO.engine.filterIdle;
    engineOscillators = ['sawtooth', 'square'].map((type, i) => {
      const osc = context.createOscillator();
      osc.type = type;
      osc.frequency.value = AUDIO.engine.idleHz * (i === 0 ? 1 : AUDIO.engine.detune);
      osc.connect(engineFilter);
      osc.start();
      return osc;
    });
    engineFilter.connect(engineGain).connect(master);
  }

  function buildRain() {
    noise = noiseBuffer();
    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = AUDIO.rain.filter;
    band.Q.value = AUDIO.rain.q;
    rainGain = context.createGain();
    rainGain.gain.value = 0;
    source.connect(band).connect(rainGain).connect(master);
    source.start();
  }

  function ensure() {
    if (context || failed) return context;
    const Context = window.AudioContext ?? window.webkitAudioContext;
    if (!Context) {
      failed = true;
      return null;
    }
    try {
      context = new Context();
      master = context.createGain();
      master.gain.value = isMuted ? 0 : AUDIO.master;
      master.connect(context.destination);
      buildEngine();
      buildRain();
    } catch {
      failed = true;
      context = null;
    }
    return context;
  }

  const running = () => context && context.state === 'running';

  function tone({ freq, endFreq = freq, delay = 0, seconds, gain, type = 'sine' }) {
    if (!running() || isMuted) return;
    const start = context.currentTime + delay;
    const osc = context.createOscillator();
    const env = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + seconds);
    env.gain.setValueAtTime(AUDIO.silent, start);
    env.gain.linearRampToValueAtTime(gain, start + 0.012);
    env.gain.exponentialRampToValueAtTime(AUDIO.silent, start + seconds);
    osc.connect(env).connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.05);
  }

  // A burst of noise through a low-pass, fading out: the crunch of a crash.
  function noiseBurst({ seconds, filter, gain }) {
    if (!running() || isMuted) return;
    const source = context.createBufferSource();
    source.buffer = noise;
    const low = context.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = filter;
    const env = context.createGain();
    const start = context.currentTime;
    env.gain.setValueAtTime(gain, start);
    env.gain.exponentialRampToValueAtTime(AUDIO.silent, start + seconds);
    source.connect(low).connect(env).connect(master);
    source.start(start);
    source.stop(start + seconds + 0.05);
  }

  // iOS Safari reports 'interrupted' (not 'suspended') after a phone call or lock screen.
  const needsResume = () => context && context.state !== 'running' && context.state !== 'closed';
  const mix = (a, b, t) => a + (b - a) * t;

  return {
    /** Call from a user gesture (pointerup, keydown). Safe to call repeatedly. */
    unlock() {
      ensure();
      if (needsResume()) context.resume().catch(() => {});
    },

    /** @param {boolean} value */
    setMuted(value) {
      isMuted = value;
      if (master) master.gain.setTargetAtTime(value ? 0 : AUDIO.master, context.currentTime, 0.02);
    },

    /**
     * The engine note follows speed. Silent unless a shift is being ridden.
     * @param {{ speedRatio: number, throttle: number, playing: boolean }} frame
     */
    engine({ speedRatio, throttle, playing }) {
      if (!running()) return;
      const e = AUDIO.engine;
      const t = context.currentTime;
      const lift = 1 + e.throttleLift * throttle;
      const hz = mix(e.idleHz, e.topHz, speedRatio) * lift;
      engineOscillators[0].frequency.setTargetAtTime(hz, t, e.follow);
      engineOscillators[1].frequency.setTargetAtTime(hz * e.detune, t, e.follow);
      engineFilter.frequency.setTargetAtTime(mix(e.filterIdle, e.filterTop, speedRatio), t, e.follow);
      engineGain.gain.setTargetAtTime(playing ? mix(e.gainIdle, e.gainTop, speedRatio) : 0, t, e.follow);
    },

    /** A two-tone buzz. */
    horn() {
      const h = AUDIO.horn;
      for (const freq of [h.low, h.high]) tone({ freq, seconds: h.seconds, gain: h.gain, type: 'square' });
    },

    /** @param {'pickup'|'delivery'|'over'} kind */
    chime(kind) {
      const notes = kind === 'pickup' ? AUDIO.pickupNotes : kind === 'delivery' ? AUDIO.deliveryNotes : AUDIO.overNotes;
      const gap = kind === 'over' ? AUDIO.overGap : AUDIO.deliveryGap;
      notes.forEach((step, i) => {
        const freq = AUDIO.scale[step];
        tone({ freq, delay: i * gap, seconds: AUDIO.noteSeconds, gain: AUDIO.noteGain, type: kind === 'over' ? 'triangle' : 'sine' });
        tone({ freq: freq * 2, delay: i * gap, seconds: AUDIO.noteSeconds * 0.6, gain: AUDIO.noteGain * 0.3, type: 'triangle' });
      });
    },

    /** @param {number} strength 0 to 1, from how hard the hit was */
    crash(strength) {
      const c = AUDIO.crash;
      const k = Math.min(1, Math.max(0.2, strength));
      tone({ freq: c.thudHz, endFreq: c.thudEndHz, seconds: c.thudSeconds, gain: c.gain * k });
      noiseBurst({ seconds: c.noiseSeconds, filter: c.noiseFilter, gain: c.gain * k * 0.7 });
    },

    /** A soft rising tone: that was close. */
    nearMiss() {
      const n = AUDIO.nearMiss;
      tone({ freq: n.from, endFreq: n.to, seconds: n.seconds, gain: n.gain, type: 'triangle' });
    },

    /** A short thump for a pothole or a speed bump. */
    bump() {
      const b = AUDIO.bump;
      tone({ freq: b.hz, endFreq: b.endHz, seconds: b.seconds, gain: b.gain });
    },

    /** @param {number} level 0 to 1 */
    rain(level) {
      if (!running()) return;
      rainGain.gain.setTargetAtTime(level * AUDIO.rain.gain, context.currentTime, AUDIO.rain.follow);
    },

    suspend() {
      if (context && context.state === 'running') context.suspend().catch(() => {});
    },

    resume() {
      if (needsResume()) context.resume().catch(() => {});
    },
  };
}
