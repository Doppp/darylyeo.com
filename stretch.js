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
    uniform vec2 uSize;
    uniform float uRadius;
    varying vec2 vUv;
    varying float vShade;
    void main() {
      vec2 p = (vUv - 0.5) * uSize;
      vec2 q = abs(p) - (uSize * 0.5 - uRadius);
      float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
      float alpha = clamp(0.5 - d, 0.0, 1.0);
      vec3 c = texture2D(uTex, vUv).rgb;
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
  const uSize = gl.getUniformLocation(program, 'uSize');
  const uRadius = gl.getUniformLocation(program, 'uRadius');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  function uploadTexture() {
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
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
    gl.uniform2f(uSize, w, h);
    gl.uniform1f(uRadius, parseFloat(getComputedStyle(img).borderTopLeftRadius) || 0);
    render();
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
        if (grabbing && weight[i] > 0.001) {
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
    const targetSway = grabbing ? Math.max(-0.3, Math.min(0.3, pullX / w * 0.35)) : 0;
    swayV += (120 * (targetSway - sway) - 7 * swayV) * dt;
    sway += swayV * dt;
    const targetX = grabbing ? pullX * 0.12 : 0;
    const targetY = grabbing ? pullY * 0.12 : 0;
    shiftVX += (160 * (targetX - shiftX) - 8 * shiftVX) * dt;
    shiftVY += (160 * (targetY - shiftY) - 8 * shiftVY) * dt;
    shiftX += shiftVX * dt;
    shiftY += shiftVY * dt;

    return energy / N + sway * sway * 1e4 + swayV * swayV * 100 + shiftX * shiftX + shiftY * shiftY + shiftVX * shiftVX * 0.01;
  }

  // --- Rendering ----------------------------------------------------------------------

  function render() {
    const sx = w / COLS, sy = h / ROWS;
    const cos = Math.cos(sway), sin = Math.sin(sway);
    const pivotX = w / 2, pivotY = h;
    const offX = w * PAD + shiftX, offY = h * PAD + shiftY;

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
    if (grabbing || energy > 0.01) {
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
  let pulls = 0, lastPullAt = 0, moodTimer = 0;

  function say(text, holdMs) {
    if (caption && caption.textContent !== text) caption.textContent = text;
    clearTimeout(moodTimer);
    if (holdMs) moodTimer = setTimeout(() => say(face.matches(':hover') ? 'Don’t even think about it.' : IDLE), holdMs);
  }

  // --- Input --------------------------------------------------------------------------

  function local(e) {
    const rect = face.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  face.addEventListener('pointerenter', (e) => {
    if (!grabbing && e.pointerType === 'mouse') say('Don’t even think about it.');
  });
  face.addEventListener('pointerleave', () => {
    if (!grabbing) say(IDLE);
  });

  face.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    face.setPointerCapture(e.pointerId);
    [grabX, grabY] = local(e);
    pullX = pullY = maxPull = 0;

    const sigma = 0.17 * w;
    for (let r = 0; r <= ROWS; r++) {
      for (let c = 0; c <= COLS; c++) {
        const ddx = (c / COLS) * w + dx[r * C1 + c] - grabX;
        const ddy = (r / ROWS) * h + dy[r * C1 + c] - grabY;
        weight[r * C1 + c] = Math.exp(-(ddx * ddx + ddy * ddy) / (2 * sigma * sigma));
      }
    }
    grabbing = true;
    face.classList.add('is-grabbing');
    say('Hey!');
    wake();
  });

  face.addEventListener('pointermove', (e) => {
    if (!grabbing) return;
    const [x, y] = local(e);
    const rawX = x - grabX, rawY = y - grabY;
    const len = Math.hypot(rawX, rawY);
    const limit = 0.9 * w;
    const soft = len > 0 ? (limit * Math.tanh(len / limit)) / len : 0;
    pullX = rawX * soft;
    pullY = rawY * soft;
    maxPull = Math.max(maxPull, len);
    if (len > 0.3 * w) say('Ow ow ow!');
  });

  function release() {
    if (!grabbing) return;
    grabbing = false;
    face.classList.remove('is-grabbing');
    if (maxPull > 0.3 * w) {
      const now = performance.now();
      pulls = now - lastPullAt < 6000 ? pulls + 1 : 1;
      lastPullAt = now;
      if (pulls >= 3) {
        pulls = 0;
        say('…Really? Three times?', 3500);
      } else {
        say('Whoa. Dizzy.', 2200);
      }
    } else {
      say(IDLE);
    }
    wake();
  }

  face.addEventListener('pointerup', release);
  face.addEventListener('pointercancel', release);

  // --- Boot ---------------------------------------------------------------------------

  function start() {
    face.appendChild(canvas);
    uploadTexture();
    resize();
    face.classList.add('is-live');
    window.addEventListener('resize', resize);
  }

  if (img.complete && img.naturalWidth) start();
  else img.addEventListener('load', start, { once: true });
})();
