import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO } from '../js/config.js';
import { createAudio } from '../js/audio.js';

// A stand-in for the browser's AudioContext: it records what is started and lets a test change
// its state. It cannot say how anything sounds, only that the right nodes were started.
const made = [];
class FakeParam {
  constructor() { this.value = 0; }
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
  setTargetAtTime(value) { this.value = value; }
}
class FakeNode {
  constructor(context) { this.context = context; this.gain = new FakeParam(); this.frequency = new FakeParam(); this.Q = new FakeParam(); }
  connect(next) { return next; }
  start() { this.context.started.push(this); }
  stop() {}
}
class FakeContext {
  constructor() {
    this.state = 'suspended';
    this.sampleRate = 8000;
    this.currentTime = 0;
    this.destination = new FakeNode(this);
    this.started = [];
    this.resumes = 0;
    this.listeners = [];
    made.push(this);
  }

  addEventListener(type, fn) { if (type === 'statechange') this.listeners.push(fn); }
  resume() { this.resumes += 1; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  setState(state) { this.state = state; this.listeners.forEach((fn) => fn()); }
  createGain() { return new FakeNode(this); }
  createOscillator() { return new FakeNode(this); }
  createBiquadFilter() { return new FakeNode(this); }
  createBufferSource() { return new FakeNode(this); }
  createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
}

let realWindow;
beforeEach(() => {
  made.length = 0;
  realWindow = globalThis.window;
  globalThis.window = { AudioContext: FakeContext };
});
afterEach(() => {
  globalThis.window = realWindow;
});

const oscillatorsStarted = (context) => context.started.length;

test('no sound context exists before a gesture, and sounds asked for then are silent, not errors', () => {
  const audio = createAudio({ muted: false });
  audio.chime('start');
  audio.horn();
  audio.crash(1);
  assert.equal(made.length, 0);
});

test('the first gesture creates one context and asks it to run; later gestures do not make more', () => {
  const audio = createAudio({ muted: false });
  audio.unlock();
  audio.unlock();
  audio.unlock();
  assert.equal(made.length, 1);
  assert.ok(made[0].resumes >= 1, 'resume was requested inside the gesture');
});

test('a context that is already running is not asked to resume again', () => {
  const audio = createAudio({ muted: false });
  audio.unlock();
  made[0].setState('running');
  const before = made[0].resumes;
  audio.unlock();
  assert.equal(made[0].resumes, before);
});

test('a sound asked for while the context is still waking plays as soon as it runs', () => {
  const audio = createAudio({ muted: false });
  audio.unlock();
  const [context] = made;
  const base = oscillatorsStarted(context);
  audio.chime('start');
  assert.equal(oscillatorsStarted(context), base, 'nothing yet: the context is suspended');
  context.setState('running');
  assert.ok(oscillatorsStarted(context) > base, 'the chime started once the context ran');
});

test('a sound that waited longer than the grace time is dropped, not played late', (t) => {
  let now = 1000;
  t.mock.method(performance, 'now', () => now);
  const audio = createAudio({ muted: false });
  audio.unlock();
  const [context] = made;
  audio.horn();
  now += AUDIO.wakeGraceSeconds * 1000 + 50;
  const base = oscillatorsStarted(context);
  context.setState('running');
  assert.equal(oscillatorsStarted(context), base);
});

test('a running context plays at once', () => {
  const audio = createAudio({ muted: false });
  audio.unlock();
  made[0].setState('running');
  const base = oscillatorsStarted(made[0]);
  audio.chime('delivery');
  assert.ok(oscillatorsStarted(made[0]) > base);
});

test('muted means silent, and unmuting restores the master volume', () => {
  const audio = createAudio({ muted: true });
  audio.unlock();
  const [context] = made;
  context.setState('running');
  const base = oscillatorsStarted(context);
  audio.chime('pickup');
  audio.horn();
  assert.equal(oscillatorsStarted(context), base, 'nothing starts while muted');
  audio.setMuted(false);
  audio.chime('pickup');
  assert.ok(oscillatorsStarted(context) > base);
});

test('an interrupted context (phone call, lock screen) is resumed by the next gesture', () => {
  const audio = createAudio({ muted: false });
  audio.unlock();
  made[0].setState('running');
  made[0].setState('interrupted');
  const before = made[0].resumes;
  audio.unlock();
  assert.equal(made[0].resumes, before + 1);
});

test('suspend and resume follow the tab: resume only wakes a context that is not running', () => {
  const audio = createAudio({ muted: false });
  audio.unlock();
  made[0].setState('running');
  audio.suspend();
  assert.equal(made[0].state, 'suspended');
  const before = made[0].resumes;
  audio.resume();
  assert.equal(made[0].resumes, before + 1);
});

test('a browser with no audio support, or one that refuses a context, never throws', () => {
  globalThis.window = {};
  const none = createAudio({ muted: false });
  none.unlock();
  none.chime('start');
  globalThis.window = { AudioContext: class { constructor() { throw new Error('blocked'); } } };
  const blocked = createAudio({ muted: false });
  blocked.unlock();
  blocked.unlock();
  blocked.horn();
});

test('the gestures that unlock sound include the ones iOS Safari counts', () => {
  for (const type of ['touchend', 'click', 'keydown', 'pointerup']) assert.ok(AUDIO.unlockEvents.includes(type), type);
});
