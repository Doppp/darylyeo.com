// Original idle choreography inspired by rameerez.com, using Daryl's own photos.
(function () {
  const face = document.getElementById('face');
  if (!face) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fly = document.createElement('span');
  fly.className = 'portrait-fly';
  fly.setAttribute('aria-hidden', 'true');
  fly.innerHTML = '<svg viewBox="0 0 40 40"><g class="fly-wings"><ellipse cx="11" cy="16" rx="9" ry="5"/><ellipse cx="29" cy="16" rx="9" ry="5"/></g><path d="M14 22l-6 5m18-5 6 5M15 17l-5-5m15 5 5-5"/><ellipse class="fly-body" cx="20" cy="23" rx="5" ry="8"/><circle class="fly-head" cx="20" cy="13" r="5"/></svg>';
  const hand = document.createElement('span');
  hand.className = 'portrait-hand';
  hand.setAttribute('aria-hidden', 'true');
  hand.innerHTML = '<svg viewBox="0 0 40 48"><path d="M13 27V8c0-5 7-5 7 0v13-4c0-4 6-4 6 0v5-2c0-4 6-4 6 0v5-1c0-4 6-4 6 0v11c0 6-4 10-10 10h-8c-4 0-7-2-9-5L3 29c-3-5 2-9 6-5l4 3z"/></svg>';
  const puff = document.createElement('span');
  puff.className = 'portrait-puff';
  puff.setAttribute('aria-hidden', 'true');
  puff.textContent = '≋';
  const notes = document.createElement('span');
  notes.className = 'portrait-notes';
  notes.setAttribute('aria-hidden', 'true');
  notes.textContent = '♪ ♫';
  face.append(fly, hand, puff, notes);

  const shot = (expression, duration, extra = {}) => ({ expression, duration, ...extra });
  const NOSE = [0.51, 0.46];
  const ACTS = {
    yawn: [
      shot('yawn-start', 360), shot('yawn-opening', 320),
      shot('yawn', 1010, { tilt: -0.025 }), shot('yawn-opening', 270),
      shot('yawn-recovery', 830), shot('idle', 250),
    ],
    shifty: [
      shot('look-left', 420), shot('look-right', 360), shot('look-left', 280),
      shot('look-right', 480), shot('idle', 250),
    ],
    eyeroll: [
      shot('look-w', 290), shot('look-wnw', 120), shot('look-nw', 120),
      shot('look-nnw', 130), shot('look-n', 220), shot('look-ne', 130),
      shot('look-ene', 120), shot('look-e', 330), shot('rest', 340),
    ],
    whistle: [
      shot('whistle', 650, { notes: true, bob: true }),
      shot('whistle-puff', 600, { notes: true, bob: true }),
      shot('whistle', 600, { notes: true, bob: true }),
      shot('whistle-puff', 500, { notes: true, bob: true }), shot('idle', 250),
    ],
    doze: [
      shot('half', 1300, { tilt: 0.025 }),
      shot('closed', 900, { tilt: 0.055, drop: 0.01 }),
      shot('half', 600, { tilt: 0.02 }),
      shot('closed', 4650, { tilt: 0.12, drop: 0.025 }),
      shot('grab', 760, { tilt: -0.06, drop: -0.02, jolt: true }), shot('idle', 300),
    ],
    tug: [
      shot('look-right', 600, { hand: [1.18, 0.6] }),
      shot('grab', 300, { hand: [0.72, 0.52] }),
      shot('grit', 600, { hand: [1.03, 0.5], tug: [0.31, -0.02] }),
      shot('pain', 300, { hand: [1.1, 0.56], tug: [0.38, 0.04] }),
      shot('grit', 260, { hand: [0.98, 0.48], tug: [0.26, -0.04] }),
      shot('pain', 300, { hand: [1.08, 0.53], tug: [0.36, 0.01] }),
      shot('dizzy', 1100, { hand: [1.4, 0.2] }), shot('idle', 300),
    ],
    fly: [
      shot('hover', 600, { fly: [1.05, 0.2], watch: true }),
      shot('hover', 650, { fly: [-0.1, 0.34], watch: true }),
      shot('hover', 600, { fly: [0.5, 0.08], watch: true }),
      shot('hover', 600, { fly: [1.03, 0.5], watch: true }),
      shot('hover', 600, { fly: [0.15, 0.56], watch: true }),
      shot('hover', 650, { fly: NOSE }),
      shot('speechless', 1100, { fly: NOSE, landed: true }),
      shot('whistle', 350, { fly: NOSE, landed: true, puff: true }),
      shot('hover', 400, { fly: [0.5, 0.25], watch: true }),
      shot('hover', 500, { fly: NOSE }),
      shot('speechless', 750, { fly: NOSE, landed: true }),
      shot('whistle-puff', 400, { fly: NOSE, puff: true }),
      shot('hover', 900, { fly: [1.6, -0.3], watch: true }), shot('idle', 350),
    ],
  };

  let idleTimer = 0, animation = 0, active = false, bag = [], first = true;
  let activeName = '';
  let wakeTimer = 0, waking = false;
  const api = () => face.portrait;
  function hiddenProps() {
    [fly, hand, puff, notes].forEach(el => el.classList.remove('is-visible'));
  }
  function schedule(delay = 2000 + Math.random() * 2500) {
    clearTimeout(idleTimer);
    if (document.hidden || reducedMotion.matches) return;
    idleTimer = setTimeout(() => {
      if (!api() || !api().ready || api().busy || api().hovered || face.matches(':focus-visible')) {
        schedule(1500);
        return;
      }
      if (!bag.length) bag = Object.keys(ACTS).sort(() => Math.random() - 0.5);
      const name = first ? 'tug' : bag.pop();
      first = false;
      play(name);
    }, delay);
  }
  function cancel() {
    cancelAnimationFrame(animation);
    animation = 0;
    if (active) {
      active = false;
      activeName = '';
      delete face.dataset.activity;
      hiddenProps();
      api()?.reset();
    }
  }
  function activity() {
    clearTimeout(wakeTimer);
    if (waking) { waking = false; api()?.reset(); }
    const wasDozing = activeName === 'doze';
    cancel();
    if (wasDozing && !document.hidden && !reducedMotion.matches && !api().busy && !api().hovered && !face.matches(':focus-visible')) {
      api().show('grab');
      api().prod();
      waking = true;
      wakeTimer = setTimeout(() => { waking = false; api()?.reset(); }, 450);
    }
    schedule();
  }
  function place(el, point) {
    el.style.transform = `translate(${point[0] * face.clientWidth}px, ${point[1] * face.clientHeight}px) translate(-50%, -50%)`;
  }
  function play(name) {
    if (!ACTS[name] || !api() || api().busy || reducedMotion.matches || document.hidden) return;
    cancel();
    clearTimeout(idleTimer);
    active = true;
    activeName = name;
    face.dataset.activity = name;
    const sequence = ACTS[name];
    let index = 0, began = performance.now(), entered = -1;
    let previousFly = [1.4, -0.1], previousHand = [1.35, 0.8];
    let previousTug = [0, 0];
    function tick(now) {
      if (!active || activeName !== name) return;
      const frame = sequence[index];
      const progress = Math.min(1, (now - began) / frame.duration);
      if (entered !== index) {
        entered = index;
        api().show(frame.expression);
        if (frame.jolt) api().prod();
        if (!frame.tug) api().stopTug();
        hiddenProps();
        if (frame.fly) fly.classList.add('is-visible');
        if (frame.hand) hand.classList.add('is-visible');
        if (frame.puff) puff.classList.add('is-visible');
        if (frame.notes) notes.classList.add('is-visible');
        fly.classList.toggle('is-landed', !!frame.landed);
      }
      api().pose((frame.tilt || 0) + (frame.bob ? Math.sin(now / 140) * 0.015 : 0), frame.drop || 0);
      const ease = progress * progress * (3 - 2 * progress);
      const interpolate = (from, to) => from.map((v, i) => v + (to[i] - v) * ease);
      if (frame.fly) {
        const point = interpolate(previousFly, frame.fly);
        if (!frame.landed) {
          point[0] += Math.sin(now / 31) * 0.012;
          point[1] += Math.cos(now / 43) * 0.009;
        }
        place(fly, point);
        if (frame.watch) {
          const rect = face.getBoundingClientRect();
          api().watch(rect.left + point[0] * face.clientWidth, rect.top + point[1] * face.clientHeight);
        }
      }
      if (frame.hand) place(hand, interpolate(previousHand, frame.hand));
      if (frame.tug) {
        const pull = interpolate(previousTug, frame.tug);
        api().tug(0.72, 0.52, pull[0], pull[1]);
      }
      if (progress >= 1) {
        if (frame.fly) previousFly = frame.fly;
        if (frame.hand) previousHand = frame.hand;
        previousTug = frame.tug || [0, 0];
        index++;
        began = now;
        if (index >= sequence.length) {
          cancel();
          schedule();
          return;
        }
      }
      animation = requestAnimationFrame(tick);
    }
    animation = requestAnimationFrame(tick);
  }

  // Used for manual previews as well as automated choreography checks.
  face.playPortraitAct = play;
  ['pointerenter', 'pointerdown', 'focus'].forEach(name => face.addEventListener(name, activity));
  ['pointermove', 'pointerdown', 'keydown', 'scroll'].forEach(name => document.addEventListener(name, activity, { passive: true }));
  document.addEventListener('visibilitychange', activity);
  reducedMotion.addEventListener('change', activity);
  schedule(4000);
})();
