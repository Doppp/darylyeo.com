const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

// Run the real scripts with deterministic time and a recording WebGL boundary.
// Assertions inspect submitted mesh vertices and public state, not implementation text.
function portrait({ idle = false, reduced = false, mask = false, transparentCorners = false } = {}) {
  let now = 0, serial = 0, hovered = false, vertices;
  const timers = new Map(), frames = new Map(), props = [], images = [];
  const handlers = { face: {}, document: {}, window: {}, motion: {} };
  const on = (target, name, fn) => (handlers[target][name] ||= []).push(fn);
  const dispatch = (target, name, event = {}) => (handlers[target][name] || []).forEach(fn => fn(event));
  const node = () => {
    const classes = new Set();
    return { style: { setProperty() {} }, setAttribute() {}, classList: {
      add: v => classes.add(v), remove: v => classes.delete(v),
      toggle(v, on) { if (on) classes.add(v); else classes.delete(v); }, contains: v => classes.has(v),
    } };
  };
  const gl = new Proxy({
    getProgramParameter: () => true, getAttribLocation: () => 0,
    bufferData: (_, value) => { if (value instanceof Float32Array) vertices = value.slice(); },
  }, { get: (obj, key) => key in obj ? obj[key] : (() => ({})) });
  const clip = mask ? { ownerSVGElement: { viewBox: { baseVal: { x: 0, y: 0, width: 420, height: 540 } }, dataset: { cut: 250 } }, getAttribute: () => 'M0 0h420v540H0z' } : null;
  const image = { complete: true, naturalWidth: 1106 };
  const face = Object.assign(node(), {
    dataset: {}, clientWidth: 190, clientHeight: 244,
    querySelector: selector => selector === 'img' ? image : clip,
    appendChild() {}, append: (...elements) => props.push(...elements), setPointerCapture() {},
    addEventListener: (name, fn) => on('face', name, fn),
    getBoundingClientRect: () => ({ left: 0, top: 0 }), matches: () => hovered,
  });
  const caption = { textContent: '' };
  const motion = { matches: reduced, addEventListener: (name, fn) => on('motion', name, fn) };
  const document = {
    hidden: false, getElementById: id => id === 'face' ? face : caption,
    addEventListener: (name, fn) => on('document', name, fn),
    createElement: tag => tag === 'canvas' ? {
      getContext: type => type === 'webgl' ? gl : {
        setTransform() {}, translate() {}, fillRect() {}, fill() {}, stroke() {}, drawImage() {},
        getImageData(x, y, width, height) {
          const data = new Uint8ClampedArray(width * height * 4).fill(255);
          if (transparentCorners) for (let row = 0; row < 24; row++) for (let col = 0; col < 24; col++) data[(row * width + col) * 4 + 3] = 0;
          return { data };
        },
      },
    } : node(),
  };
  const math = Object.create(Math); math.random = () => 0;
  const context = {
    document, window: { matchMedia: () => motion, addEventListener: (name, fn) => on('window', name, fn) },
    Image: class { set src(value) { images.push(value); this.onload(); } }, Path2D: class {},
    performance: { now: () => now }, Math: math, Float32Array, Uint16Array, Uint8Array,
    requestAnimationFrame: fn => { frames.set(++serial, fn); return serial; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (fn, delay) => { timers.set(++serial, { fn, at: now + delay }); return serial; },
    clearTimeout: id => timers.delete(id),
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'stretch.js'), 'utf8'), context);
  if (idle) vm.runInContext(fs.readFileSync(path.join(root, 'avatar-idle.js'), 'utf8'), context);
  return {
    face, document, props, motion, images, frames,
    get vertices() { return vertices; },
    event(name, x = 90, y = 110, id = 1) {
      if (name === 'pointerenter') hovered = true;
      if (name === 'pointerleave') hovered = false;
      const event = { type: name, pointerType: 'mouse', pointerId: id, button: 0, clientX: x, clientY: y, preventDefault() {} };
      dispatch('face', name, event);
      if (!['pointerenter', 'pointerleave'].includes(name)) {
        dispatch('document', name, event); dispatch('window', name, event);
      }
    },
    dispatch,
    advance(ms) {
      const until = now + ms;
      while (now < until) {
        now = Math.min(until, now + 16);
        for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
        const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now));
      }
    },
  };
}
function displacement(a, b) {
  return Math.max(...a.map((v, i) => i % 5 < 2 ? Math.abs(v - b[i]) : 0));
}

test('hover contact changes expression and launches a local ripple without clicking', () => {
  const p = portrait(); const rest = p.vertices;
  p.event('pointerenter');
  assert.equal(p.face.dataset.expression, 'hover');
  p.advance(192);
  assert(displacement(rest, p.vertices) > 0.25, 'hover must physically disturb the mesh');
});

test('transparent corners do not react until the cursor actually touches the portrait', () => {
  const p = portrait({ transparentCorners: true });
  p.event('pointerenter', 2, 2); p.advance(160);
  assert.equal(p.face.dataset.expression, 'idle');
  p.event('pointerdown', 2, 2);
  assert.equal(p.face.dataset.expression, 'idle', 'transparent pixels cannot be grabbed');
  p.event('pointermove', 90, 110);
  assert.equal(p.face.dataset.expression, 'hover');
});

test('moving over the face rubs the skin, then the mesh settles on departure', () => {
  const p = portrait(); p.event('pointerenter'); p.advance(4500);
  const rest = p.vertices;
  p.event('pointermove', 125, 100); p.advance(100);
  assert(displacement(rest, p.vertices) > 0.25);
  p.event('pointerleave'); p.advance(6000);
  assert.equal(p.face.dataset.expression, 'idle');
  assert.equal(p.frames.size, 0);
  assert([...p.vertices].every(Number.isFinite));
});

test('hover immediately interrupts a recovery expression', () => {
  const p = portrait(); p.event('pointerdown'); p.event('pointermove', 230); p.event('pointerup');
  assert.equal(p.face.dataset.expression, 'dizzy');
  p.event('pointerenter');
  assert.equal(p.face.dataset.expression, 'hover');
  p.advance(2300);
  assert.equal(p.face.dataset.expression, 'hover', 'old recovery timer must not override hover');
});

test('eyes track cursor directions independently of the annoyed expression', () => {
  const p = portrait(); p.event('pointerenter');
  for (const [name, x, y] of [['look-e', 500, 88], ['look-w', -500, 88], ['look-s', 92, 600], ['look-nw', -400, -400]]) {
    p.dispatch('window', 'pointermove', { pointerType: 'mouse', clientX: x, clientY: y });
    assert.equal(p.face.dataset.expression, 'hover');
    assert.equal(p.face.dataset.gaze, name);
  }
  p.advance(1600);
  assert.equal(p.face.dataset.gaze, 'rest');
});

test('blink passes through half-closed and closed lids', () => {
  const p = portrait(); p.advance(2800); assert.equal(p.face.dataset.gaze, 'half');
  p.advance(60); assert.equal(p.face.dataset.gaze, 'closed');
  p.advance(90); assert.equal(p.face.dataset.gaze, 'half');
  p.advance(55); assert.equal(p.face.dataset.gaze, 'rest');
});

test('automatic blinks do not open eyes that are deliberately closed for dozing', () => {
  const p = portrait(); p.face.portrait.show('closed'); p.advance(2800);
  assert.equal(p.face.dataset.gaze, 'closed');
});

test('all 15 eye directions can change independently of the current face', () => {
  const p = portrait(); p.event('pointerenter');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/avatar/eyes/manifest.json')));
  const gazes = Object.keys(manifest.frames).filter(name => name.startsWith('look-'));
  assert.equal(gazes.length, 15);
  for (const gaze of gazes) {
    p.face.portrait.look(gaze);
    assert.equal(p.face.dataset.gaze, gaze);
    assert.equal(p.face.dataset.expression, 'hover');
  }
});

test('a tap or keyboard poke keeps the startled reaction visible after release', () => {
  const p = portrait(); p.event('pointerdown'); p.event('pointerup');
  assert.equal(p.face.dataset.expression, 'grab'); p.advance(360);
  assert.equal(p.face.dataset.expression, 'idle');
  p.dispatch('face', 'keydown', { key: 'Enter', repeat: false, preventDefault() {} });
  assert.equal(p.face.dataset.expression, 'grab'); p.advance(360);
  assert.equal(p.face.dataset.expression, 'idle');
});

test('activity away from the face jolts a dozing portrait awake', () => {
  const p = portrait({ idle: true }); p.face.playPortraitAct('doze'); p.advance(3000);
  p.dispatch('document', 'keydown', { key: 'a' });
  assert.equal(p.face.dataset.activity, undefined);
  assert.equal(p.face.dataset.expression, 'grab'); p.advance(460);
  assert.equal(p.face.dataset.expression, 'idle');
});

test('grabs, pull intensity, three-pull reaction, and pointer cancellation still work', () => {
  const p = portrait();
  for (let i = 0; i < 3; i++) {
    p.event('pointerdown'); assert.equal(p.face.dataset.expression, 'grab');
    p.event('pointermove', 145); assert.equal(p.face.dataset.expression, 'grit');
    p.event('pointermove', 230); assert.equal(p.face.dataset.expression, 'pain');
    p.event('pointerup');
    assert.equal(p.face.dataset.expression, i === 2 ? 'speechless' : 'dizzy');
  }
  p.advance(3600);
  p.event('pointerdown'); p.event('pointermove', 230, 110, 2);
  assert.equal(p.face.dataset.expression, 'grab', 'second pointer cannot move the first grab');
  p.event('pointercancel'); assert.equal(p.face.dataset.expression, 'idle');
});

test('hover interrupts every idle act without cancelling the physical ripple', () => {
  for (const act of ['yawn', 'shifty', 'eyeroll', 'whistle', 'doze', 'tug', 'fly']) {
    const p = portrait({ idle: true }); p.face.playPortraitAct(act); p.advance(192);
    assert.equal(p.face.dataset.activity, act);
    const before = p.vertices;
    p.event('pointerenter'); p.advance(96);
    assert.equal(p.face.dataset.activity, undefined);
    assert.equal(p.face.dataset.expression, 'hover');
    assert(p.props.every(el => !el.classList.contains('is-visible')));
    assert(displacement(before, p.vertices) > 0.25, `${act} interruption keeps contact ripple`);
  }
});

test('idle acts finish and their props clear', () => {
  for (const act of ['yawn', 'shifty', 'eyeroll', 'whistle', 'doze', 'tug', 'fly']) {
    const p = portrait({ idle: true }); p.face.playPortraitAct(act);
    let elapsed = 0;
    while (p.face.dataset.activity && elapsed < 15000) { p.advance(16); elapsed += 16; }
    assert.equal(p.face.dataset.activity, undefined, `${act} completes`);
    assert(p.props.every(el => !el.classList.contains('is-visible')));
    assert([...p.vertices].every(Number.isFinite));
  }
});

test('the face stays unhappy whenever the fly is visible, including its approach', () => {
  const p = portrait({ idle: true }); p.face.playPortraitAct('fly');
  let sawFly = false;
  for (let elapsed = 0; elapsed < 9000 && p.face.dataset.activity; elapsed += 16) {
    p.advance(16);
    if (p.props[0].classList.contains('is-visible')) {
      sawFly = true;
      assert(['hover', 'speechless', 'whistle', 'whistle-puff'].includes(p.face.dataset.expression),
        `fly must not use the smiling ${p.face.dataset.expression} frame`);
    }
  }
  assert(sawFly);
});

test('reduced motion preserves expression changes without hover ripples or idle acts', () => {
  const p = portrait({ idle: true, reduced: true }); const rest = p.vertices;
  p.event('pointerenter'); p.advance(200);
  assert.equal(p.face.dataset.expression, 'hover');
  assert.equal(displacement(rest, p.vertices), 0);
  p.face.playPortraitAct('fly'); assert.equal(p.face.dataset.activity, undefined);
});

test('optional mockup backdrop masks remain compatible', () => {
  const p = portrait({ mask: true }); p.event('pointerenter'); p.advance(100);
  assert.equal(p.face.dataset.expression, 'hover');
  assert([...p.vertices].every(Number.isFinite));
});

test('every requested expression has a local production asset', () => {
  const p = portrait();
  assert.equal(p.images.length, 30, '13 portrait textures plus 18 eye strips, including the loaded neutral');
  for (const uri of p.images) assert(fs.existsSync(path.join(root, uri)), uri);
});
