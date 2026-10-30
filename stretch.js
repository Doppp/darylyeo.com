// Stretchy portrait: grab and pull the photo like soft skin.
// A spring-mesh of displacements drives a WebGL grid; neighbours are coupled so pulls
// ripple outward, and the whole head sways and bounces back on release.
(function () {
  const face = document.getElementById('face');
  const caption = document.getElementById('face-caption');
  const img = face && face.querySelector('img');
  if (!face || !img) return;

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: true });
  if (!gl) return;

  const COLS = 24;
  const ROWS = 31;
  const C1 = COLS + 1;
  const N = C1 * (ROWS + 1);
  const PAD = 1.2; // canvas extends this many face-widths/heights beyond the photo

  const K_ANCHOR = 150;
  const K_NEIGHBOUR = 2500;
  const K_GRAB = 3000;
  const DAMPING = 5;
  const STEP = 1 / 240;

  const dx = new Float32Array(N), dy = new Float32Array(N);
  const vx = new Float32Array(N), vy = new Float32Array(N);
  const weight = new Float32Array(N);
  const data = new Float32Array(N * 5);

  let w = 0, h = 0, cw = 0, ch = 0;
  let grabbing = false, grabX = 0, grabY = 0, pullX = 0, pullY = 0, maxPull = 0;
  let activePointer = null;
  let demo = false, idleTilt = 0, idleDrop = 0;
  let hovering = false, hoverX = 0, hoverY = 0;
  const HIT_WIDTH = 96, HIT_HEIGHT = 124;
  let hitPixels = null;
  let sway = 0, swayV = 0, shiftX = 0, shiftY = 0, shiftVX = 0, shiftVY = 0;
  let running = false, lastTime = 0, accumulator = 0;

  // --- GL setup ---------------------------------------------------------------------

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, `
    attribute vec2 aPos;
    attribute vec2 aUv;
    attribute float aShade;
    uniform vec2 uRes;
    varying vec2 vUv;
    varying float vShade;
    void main() {
      vUv = aUv;
      vShade = aShade;
      gl_Position = vec4(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0, 0.0, 1.0);
    }
  `));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform sampler2D uTex;
    uniform sampler2D uNextTex;
    uniform float uBlend;
    uniform sampler2D uMask;
    uniform float uUseMask;
    uniform sampler2D uEyeFrom;
    uniform sampler2D uEyeTo;
    uniform float uEyeBlend;
    uniform float uEyeStrength;
    varying vec2 vUv;
    varying float vShade;
    float eyeMask(vec2 centre) {
      float distance = length((vUv - centre) / vec2(0.071, 0.027));
      return 1.0 - smoothstep(0.78, 1.0, distance);
    }
    void main() {
      vec4 texel = mix(texture2D(uTex, vUv), texture2D(uNextTex, vUv), uBlend);
      // Eye textures contain only a registered strip from the 1106 × 1422 master.
      vec2 eyeUv = (vUv * vec2(1106.0, 1422.0) - vec2(330.0, 455.0)) / vec2(410.0, 110.0);
      vec4 eyes = mix(texture2D(uEyeFrom, eyeUv), texture2D(uEyeTo, eyeUv), uEyeBlend);
      float eyeArea = max(eyeMask(vec2(0.385, 0.359)), eyeMask(vec2(0.582, 0.359)));
      texel = mix(texel, eyes, eyeArea * uEyeStrength);
      float alpha = texel.a;
      alpha *= mix(1.0, texture2D(uMask, vUv).a, uUseMask);
      vec3 c = texel.rgb;
      c = c * min(vShade, 1.0) + max(vShade - 1.0, 0.0) * 0.6;
      gl_FragColor = vec4(c * alpha, alpha);
    }
  `));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  const indices = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * C1 + c;
      indices.push(i, i + 1, i + C1, i + 1, i + C1 + 1, i + C1);
    }
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  const attr = (name, size, offset) => {
    const loc = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 20, offset);
  };
  attr('aPos', 2, 0);
  attr('aUv', 2, 8);
  attr('aShade', 1, 16);

  const uRes = gl.getUniformLocation(program, 'uRes');
  const uBlend = gl.getUniformLocation(program, 'uBlend');
  gl.uniform1i(gl.getUniformLocation(program, 'uTex'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'uNextTex'), 1);
  gl.uniform1i(gl.getUniformLocation(program, 'uMask'), 2);
  gl.uniform1i(gl.getUniformLocation(program, 'uEyeFrom'), 3);
  gl.uniform1i(gl.getUniformLocation(program, 'uEyeTo'), 4);
  const uUseMask = gl.getUniformLocation(program, 'uUseMask');
  const uEyeBlend = gl.getUniformLocation(program, 'uEyeBlend');
  const uEyeStrength = gl.getUniformLocation(program, 'uEyeStrength');

  // Optional backdrop: an <svg class="backdrop"> laid over the face box, whose
  // <path data-clip> the shoulders are clipped to below its data-cut line (viewBox units).
  const clipShape = face.querySelector('.backdrop [data-clip]');
  const maskCanvas = document.createElement('canvas');
  const maskTexture = gl.createTexture();
  // Keep the optional sampler complete even on pages without a backdrop mask.
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, maskTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array([255, 255, 255, 255]));
  gl.activeTexture(gl.TEXTURE0);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const textures = new Map();
  const EYE_FRAMES = {
    rest: 'idle', closed: 'blink', half: 'eyes-half',
    'look-e': 'look-right', 'look-w': 'look-left', 'look-n': 'look-up',
    'look-ese': 'look-ese', 'look-se': 'look-se', 'look-sse': 'look-sse',
    'look-s': 'look-s', 'look-ssw': 'look-ssw', 'look-sw': 'look-sw',
    'look-wsw': 'look-wsw', 'look-wnw': 'look-wnw', 'look-nw': 'look-nw',
    'look-nnw': 'look-nnw', 'look-ne': 'look-ne', 'look-ene': 'look-ene',
  };
  const GAZES = {
    'look-e': [1, 0], 'look-ese': [0.9239, 0.3827], 'look-se': [0.7071, 0.7071],
    'look-sse': [0.3827, 0.9239], 'look-s': [0, 1], 'look-ssw': [-0.3827, 0.9239],
    'look-sw': [-0.7071, 0.7071], 'look-wsw': [-0.9239, 0.3827], 'look-w': [-1, 0],
    'look-wnw': [-0.9239, -0.3827], 'look-nw': [-0.7071, -0.7071],
    'look-nnw': [-0.3827, -0.9239], 'look-n': [0, -1],
    'look-ne': [0.7071, -0.7071], 'look-ene': [0.9239, -0.3827],
  };
  const FACE_FRAMES = ['idle', 'hover', 'grab', 'grit', 'pain', 'dizzy', 'speechless',
    'yawn-start', 'yawn-opening', 'yawn', 'yawn-recovery', 'whistle', 'whistle-puff'];
  const ASSETS = [...FACE_FRAMES, ...Object.keys(EYE_FRAMES).map(name => `eye:${name}`)];
  let mood = 'idle', blinkPose = null, blinkToken = 0, eyePose = 'rest', gazeTimer = 0;
  let eyeTexture = null, previousEyeTexture = null, eyeAt = -Infinity;
  let currentTexture = null, previousTexture = null, expressionAt = -Infinity;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function uploadTexture(source, name) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    textures.set(name, texture);
  }

  function loadExpression(name) {
    const source = new Image();
    source.onload = () => {
      uploadTexture(source, name);
      render();
    };
    source.src = name.startsWith('eye:')
      ? `/assets/avatar/eyes/${name.slice(4)}.webp`
      : `/assets/avatar/${name}.webp`;
  }

  function resize() {
    w = face.clientWidth;
    h = face.clientHeight;
    cw = w * (1 + PAD * 2);
    ch = h * (1 + PAD * 2);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, cw, ch);
    buildMask(dpr);
    render();
  }

  function buildMask(dpr) {
    gl.uniform1f(uUseMask, clipShape ? 1 : 0);
    if (!clipShape) return;
    const svg = clipShape.ownerSVGElement;
    const box = svg.viewBox.baseVal;
    maskCanvas.width = Math.round(w * dpr);
    maskCanvas.height = Math.round(h * dpr);
    const ctx = maskCanvas.getContext('2d');
    ctx.setTransform(maskCanvas.width / box.width, 0, 0, maskCanvas.height / box.height, 0, 0);
    ctx.translate(-box.x, -box.y);
    ctx.fillRect(box.x, box.y, box.width, parseFloat(svg.dataset.cut || 0) - box.y);
    const shape = new Path2D(clipShape.getAttribute('d'));
    ctx.fill(shape);
    ctx.lineWidth = (2 * box.width) / maskCanvas.width; // overlap the backdrop edge by a pixel
    ctx.stroke(shape);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, maskTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);
    gl.activeTexture(gl.TEXTURE0);
  }

  // --- Physics ------------------------------------------------------------------------

  function step(dt) {
    for (let r = 0; r <= ROWS; r++) {
      for (let c = 0; c <= COLS; c++) {
        const i = r * C1 + c;
        let lx = 0, ly = 0, n = 0;
        if (c > 0) { lx += dx[i - 1]; ly += dy[i - 1]; n++; }
        if (c < COLS) { lx += dx[i + 1]; ly += dy[i + 1]; n++; }
        if (r > 0) { lx += dx[i - C1]; ly += dy[i - C1]; n++; }
        if (r < ROWS) { lx += dx[i + C1]; ly += dy[i + C1]; n++; }
        lx -= n * dx[i];
        ly -= n * dy[i];

        let ax = -K_ANCHOR * dx[i] + K_NEIGHBOUR * lx - DAMPING * vx[i];
        let ay = -K_ANCHOR * dy[i] + K_NEIGHBOUR * ly - DAMPING * vy[i];
        if ((grabbing || demo) && weight[i] > 0.001) {
          const k = K_GRAB * weight[i];
          ax += k * (weight[i] * pullX - dx[i]);
          ay += k * (weight[i] * pullY - dy[i]);
        }
        vx[i] += ax * dt;
        vy[i] += ay * dt;
      }
    }
    let energy = 0;
    for (let i = 0; i < N; i++) {
      dx[i] += vx[i] * dt;
      dy[i] += vy[i] * dt;
      energy += vx[i] * vx[i] + vy[i] * vy[i] + dx[i] * dx[i] + dy[i] * dy[i];
    }

    // Whole-head sway and drift follow the pull, then spring back.
    const targetSway = grabbing || demo ? Math.max(-0.3, Math.min(0.3, pullX / w * 0.35)) : idleTilt;
    swayV += (120 * (targetSway - sway) - 7 * swayV) * dt;
    sway += swayV * dt;
    const targetX = grabbing || demo ? pullX * 0.12 : 0;
    const targetY = grabbing || demo ? pullY * 0.12 : idleDrop * h;
    shiftVX += (160 * (targetX - shiftX) - 8 * shiftVX) * dt;
    shiftVY += (160 * (targetY - shiftY) - 8 * shiftVY) * dt;
    shiftX += shiftVX * dt;
    shiftY += shiftVY * dt;

    return energy / N + sway * sway * 1e4 + swayV * swayV * 100 + shiftX * shiftX + shiftY * shiftY + shiftVX * shiftVX * 0.01;
  }

  // --- Rendering ----------------------------------------------------------------------

  function render() {
    const expression = mood;
    const nextTexture = textures.get(expression) || textures.get('idle');
    if (nextTexture !== currentTexture) {
      previousTexture = currentTexture || nextTexture;
      currentTexture = nextTexture;
      expressionAt = performance.now();
      wake();
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, previousTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
    const eyeName = blinkPose || eyePose;
    const nextEyes = textures.get(`eye:${eyeName}`) || textures.get('eye:rest') || textures.get('idle');
    if (nextEyes !== eyeTexture) {
      previousEyeTexture = eyeTexture || nextEyes;
      eyeTexture = nextEyes;
      eyeAt = performance.now();
      wake();
    }
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, previousEyeTexture);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, eyeTexture);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(uBlend, reducedMotion.matches ? 1 : Math.min(1, (performance.now() - expressionAt) / 110));
    gl.uniform1f(uEyeBlend, reducedMotion.matches ? 1 : Math.min(1, (performance.now() - eyeAt) / 60));
    const mayLook = ['idle', 'hover', 'whistle', 'whistle-puff'].includes(mood);
    gl.uniform1f(uEyeStrength, mayLook && textures.has(`eye:${eyeName}`) ? 1 : 0);
    face.dataset.gaze = eyeName;
    const sx = w / COLS, sy = h / ROWS;
    const cos = Math.cos(sway), sin = Math.sin(sway);
    const pivotX = w / 2, pivotY = h;
    const offX = w * PAD + shiftX, offY = h * PAD + shiftY;
    face.style.setProperty('--sway', `${sway}rad`);
    face.style.setProperty('--shift-x', `${shiftX}px`);
    face.style.setProperty('--shift-y', `${shiftY}px`);

    for (let r = 0; r <= ROWS; r++) {
      for (let c = 0; c <= COLS; c++) {
        const i = r * C1 + c;
        const u = c / COLS, v = r / ROWS;
        const lx = u * w + dx[i] - pivotX;
        const ly = v * h + dy[i] - pivotY;

        // Stretched skin catches light; compressed skin falls into shadow.
        const iL = c > 0 ? i - 1 : i, iR = c < COLS ? i + 1 : i;
        const iU = r > 0 ? i - C1 : i, iD = r < ROWS ? i + C1 : i;
        const div = (dx[iR] - dx[iL]) / (sx * (iR - iL || 1)) + (dy[iD] - dy[iU]) / (sy * ((iD - iU) / C1 || 1));
        const hL = Math.hypot(dx[iL], dy[iL]), hR = Math.hypot(dx[iR], dy[iR]);
        const hU = Math.hypot(dx[iU], dy[iU]), hD = Math.hypot(dx[iD], dy[iD]);
        const slope = ((hR - hL) / (2 * sx)) * 0.6 + ((hD - hU) / (2 * sy)) * 0.8;
        const shade = Math.max(0.7, Math.min(1.25, 1 + 0.22 * div + 0.12 * slope));

        const o = i * 5;
        data[o] = offX + pivotX + lx * cos - ly * sin;
        data[o + 1] = offY + pivotY + lx * sin + ly * cos;
        data[o + 2] = u;
        data[o + 3] = v;
        data[o + 4] = shade;
      }
    }

    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
  }

  function frame(time) {
    const elapsed = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;
    accumulator += elapsed;
    let energy = 0;
    while (accumulator >= STEP) {
      energy = step(STEP);
      accumulator -= STEP;
    }
    render();
    if (grabbing || demo || idleTilt || idleDrop || energy > 0.01 ||
        performance.now() - expressionAt < 110 || performance.now() - eyeAt < 60) {
      requestAnimationFrame(frame);
    } else {
      dx.fill(0); dy.fill(0); vx.fill(0); vy.fill(0);
      sway = swayV = shiftX = shiftY = shiftVX = shiftVY = 0;
      render();
      running = false;
    }
  }

  function wake() {
    if (running) return;
    running = true;
    lastTime = performance.now();
    accumulator = 0;
    requestAnimationFrame(frame);
  }

  // --- Moods --------------------------------------------------------------------------

  const IDLE = 'Go on, give it a pull.';
  let pulls = 0, lastPullAt = 0, moodTimer = 0, recovering = false;

  function say(text, expression = 'idle', holdMs = 0) {
    if (caption && caption.textContent !== text) caption.textContent = text;
    mood = expression;
    face.dataset.expression = expression;
    blinkPose = null;
    blinkToken++;
    render();
    clearTimeout(moodTimer);
    recovering = holdMs > 0;
    if (holdMs) moodTimer = setTimeout(rest, holdMs);
  }

  function rest() {
    say(hovering ? 'Don’t even think about it.' : IDLE, hovering ? 'hover' : 'idle');
  }

  function scheduleBlink() {
    setTimeout(() => {
      if (!document.hidden && !reducedMotion.matches && ['idle', 'hover'].includes(mood) &&
          !['half', 'closed'].includes(eyePose)) {
        const token = ++blinkToken;
        const pose = (name) => {
          if (token !== blinkToken) return;
          blinkPose = name;
          render();
        };
        pose('half');
        setTimeout(() => pose('closed'), 55);
        setTimeout(() => pose('half'), 145);
        setTimeout(() => pose(null), 200);
      }
      scheduleBlink();
    }, 2800 + Math.random() * 3200);
  }

  function look(name = 'rest') {
    if (!Object.hasOwn(EYE_FRAMES, name)) return;
    clearTimeout(gazeTimer);
    eyePose = name;
    render();
  }

  function watch(clientX, clientY) {
    const rect = face.getBoundingClientRect();
    const x = clientX - rect.left - w * 0.485;
    const y = clientY - rect.top - h * 0.359;
    const length = Math.hypot(x, y);
    let nearest = 'rest', best = -Infinity;
    if (length > w * 0.1) {
      for (const [name, [gx, gy]] of Object.entries(GAZES)) {
        const dot = (gx * x + gy * y) / length;
        if (dot > best) { best = dot; nearest = name; }
      }
    }
    look(nearest);
    return nearest;
  }

  // --- Input --------------------------------------------------------------------------

  function local(e) {
    const rect = face.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  function onPortrait(x, y) {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    if (!hitPixels) return true;
    const col = Math.min(HIT_WIDTH - 1, Math.floor(x / w * HIT_WIDTH));
    const row = Math.min(HIT_HEIGHT - 1, Math.floor(y / h * HIT_HEIGHT));
    return hitPixels[(row * HIT_WIDTH + col) * 4 + 3] > 32;
  }

  function contact(e) {
    if (e.pointerType !== 'mouse') return;
    const [x, y] = local(e);
    const wasOver = hovering;
    hovering = onPortrait(x, y);
    if (hovering && !wasOver && !grabbing) {
      // Contact is physical even without a click: a small prod launches a wave.
      disturb(x, y, 0, -h * 0.025);
      say('Don’t even think about it.', 'hover');
    } else if (hovering && !grabbing) {
      disturb(x, y, x - hoverX, y - hoverY);
    } else if (wasOver && !grabbing && !recovering) {
      say(IDLE);
    }
    hoverX = x;
    hoverY = y;
  }

  face.addEventListener('pointerenter', contact);
  face.addEventListener('pointerleave', () => {
    hovering = false;
    if (!grabbing && !recovering) say(IDLE);
  });

  function disturb(x, y, moveX, moveY) {
    if (reducedMotion.matches) return;
    const radius = w * 0.16;
    const limit = w * 0.12;
    const impulseX = Math.max(-limit, Math.min(limit, moveX)) * 16;
    const impulseY = Math.max(-limit, Math.min(limit, moveY)) * 16;
    for (let r = 0; r <= ROWS; r++) {
      for (let c = 0; c <= COLS; c++) {
        const i = r * C1 + c;
        const xDist = c / COLS * w + dx[i] - x;
        const yDist = r / ROWS * h + dy[i] - y;
        const falloff = Math.exp(-(xDist * xDist + yDist * yDist) / (2 * radius * radius));
        vx[i] += impulseX * falloff;
        vy[i] += impulseY * falloff;
      }
    }
    wake();
  }

  function setWeights(x, y) {
    const sigma = 0.17 * w;
    for (let r = 0; r <= ROWS; r++) {
      for (let c = 0; c <= COLS; c++) {
        const ddx = (c / COLS) * w + dx[r * C1 + c] - x;
        const ddy = (r / ROWS) * h + dy[r * C1 + c] - y;
        weight[r * C1 + c] = Math.exp(-(ddx * ddx + ddy * ddy) / (2 * sigma * sigma));
      }
    }
  }

  face.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || grabbing) return;
    const [x, y] = local(e);
    if (!onPortrait(x, y)) return;
    e.preventDefault();
    face.setPointerCapture(e.pointerId);
    activePointer = e.pointerId;
    demo = false;
    idleTilt = idleDrop = 0;
    grabX = x; grabY = y;
    pullX = pullY = maxPull = 0;
    setWeights(grabX, grabY);
    grabbing = true;
    face.classList.add('is-grabbing');
    say('Hey!', 'grab');
    wake();
  });

  face.addEventListener('pointermove', (e) => {
    if (!grabbing && e.pointerType === 'mouse') {
      contact(e);
      return;
    }
    if (!grabbing || e.pointerId !== activePointer) return;
    const [x, y] = local(e);
    const rawX = x - grabX, rawY = y - grabY;
    const len = Math.hypot(rawX, rawY);
    const limit = 0.9 * w;
    const soft = len > 0 ? (limit * Math.tanh(len / limit)) / len : 0;
    pullX = rawX * soft;
    pullY = rawY * soft;
    maxPull = Math.max(maxPull, len);
    if (len > 0.55 * w) say('Ow ow ow!', 'pain');
    else if (len > 0.2 * w) say('Easy…', 'grit');
    else say('Hey!', 'grab');
  });

  function release(e) {
    if (!grabbing || e.pointerId !== activePointer) return;
    grabbing = false;
    activePointer = null;
    face.classList.remove('is-grabbing');
    if (e.type !== 'pointerup') {
      rest();
    } else if (maxPull > 0.3 * w) {
      const now = performance.now();
      pulls = now - lastPullAt < 6000 ? pulls + 1 : 1;
      lastPullAt = now;
      if (pulls >= 3) {
        pulls = 0;
        say('…Really? Three times?', 'speechless', 3500);
      } else {
        say('Whoa. Dizzy.', 'dizzy', 2200);
      }
    } else {
      disturb(grabX, grabY, 0, -h * 0.02);
      say('Hey!', 'grab', 350);
    }
    wake();
  }

  face.addEventListener('pointerup', release);
  face.addEventListener('pointercancel', release);
  face.addEventListener('lostpointercapture', release);
  face.addEventListener('keydown', (e) => {
    if (grabbing || e.repeat || !['Enter', ' '].includes(e.key)) return;
    e.preventDefault();
    disturb(w * 0.5, h * 0.46, 0, -h * 0.025);
    say('Hey!', 'grab', 350);
  });

  // --- Boot ---------------------------------------------------------------------------

  function start() {
    face.tabIndex = 0;
    face.setAttribute('role', 'button');
    face.setAttribute('aria-label', 'Daryl’s interactive portrait. Grab and pull, or press Enter or Space to poke.');
    const hitCanvas = document.createElement('canvas');
    hitCanvas.width = HIT_WIDTH;
    hitCanvas.height = HIT_HEIGHT;
    const hitContext = hitCanvas.getContext('2d', { willReadFrequently: true });
    if (hitContext && hitContext.getImageData) {
      hitContext.drawImage(img, 0, 0, HIT_WIDTH, HIT_HEIGHT);
      hitPixels = hitContext.getImageData(0, 0, HIT_WIDTH, HIT_HEIGHT).data;
    }
    face.appendChild(canvas);
    uploadTexture(img, 'idle');
    resize();
    face.classList.add('is-live');
    face.dataset.expression = 'idle';
    ASSETS.filter(name => name !== 'idle').forEach(loadExpression);
    // A small interface for the idle choreography; input always takes priority.
    face.portrait = {
      get busy() { return grabbing || recovering; },
      get hovered() { return hovering; },
      get ready() { return ASSETS.every(name => textures.has(name)); },
      show(expression, text = IDLE) {
        if (grabbing || recovering) return;
        const alias = { 'look-left': 'look-w', 'look-right': 'look-e', 'look-up': 'look-n', blink: 'closed' };
        const eyes = alias[expression] || expression;
        if (Object.hasOwn(EYE_FRAMES, eyes)) {
          say(text, 'idle');
          look(eyes);
        } else {
          say(text, expression);
        }
      },
      look, watch,
      prod(u = 0.5, v = 0.45, x = 0, y = -0.03) { disturb(u * w, v * h, x * w, y * h); },
      pose(tilt = 0, drop = 0) { idleTilt = tilt; idleDrop = drop; wake(); },
      tug(u, v, x, y) {
        if (grabbing) return;
        if (!demo) setWeights(u * w, v * h);
        demo = true;
        pullX = x * w;
        pullY = y * h;
        wake();
      },
      stopTug() { demo = false; wake(); },
      reset() {
        demo = false;
        idleTilt = idleDrop = 0;
        eyePose = 'rest';
        if (!grabbing && !recovering) rest();
        wake();
      },
    };
    scheduleBlink();
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || grabbing || document.hidden || reducedMotion.matches) return;
      watch(e.clientX, e.clientY);
      clearTimeout(gazeTimer);
      gazeTimer = setTimeout(() => look('rest'), 1500 + Math.random() * 1500);
    }, { passive: true });
    document.addEventListener('mouseleave', () => look('rest'));
    window.addEventListener('resize', resize);
  }

  if (img.complete && img.naturalWidth) start();
  else img.addEventListener('load', start, { once: true });
})();
