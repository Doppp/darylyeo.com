// Shared behaviour for the agent-CLI pages: theme switching, the status spinner,
// and the prompt with its "/" command menu. Page links come from <body data-*>.
(function () {
  const links = document.body.dataset;
  const face = document.getElementById('face');

  // --- Theme --------------------------------------------------------------------------

  function theme() {
    return document.documentElement.dataset.theme ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  function setTheme(next) {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
  }

  // --- Spinner: cycles while the face is reacting, rests on ✻ otherwise ---------------

  const spin = document.getElementById('spin');
  if (spin && face) {
    const frames = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
    let i = 0;
    setInterval(() => {
      const e = face.dataset.expression;
      const busy = face.classList.contains('is-grabbing') || face.dataset.activity || (e && e !== 'idle' && e !== 'blink');
      spin.textContent = busy ? frames[i++ % frames.length] : '✻';
    }, 120);
  }

  // --- Prompt: "/" opens a filtered command menu; anything else is emailed to Daryl ---

  const form = document.getElementById('prompt');
  const input = document.getElementById('prompt-input');
  const menu = document.getElementById('menu');
  if (!form || !input || !menu) return;

  const open = (url) => { location.href = url; };
  const here = location.pathname;
  const COMMANDS = [
    here !== links.home && ['/home', 'Back to the start', () => open(links.home)],
    ['/email', 'Write to daryl@darylyeo.com', () => open('mailto:daryl@darylyeo.com')],
    ['/github', 'Open github.com/doppp', () => open('https://github.com/doppp')],
    ['/linkedin', 'Open linkedin.com/in/darylyeo', () => open('https://www.linkedin.com/in/darylyeo')],
    ['/x', 'Open x.com/darylyeo', () => open('https://x.com/darylyeo')],
    here !== links.ai && ['/ai-transparency', 'Read the AI transparency statement', () => open(links.ai)],
    face && ['/pull', 'Give the face a tug', () => face.playPortraitAct?.('tug')],
    ['/theme', () => `Switch to ${theme() === 'dark' ? 'light' : 'dark'} mode`, () => setTheme(theme() === 'dark' ? 'light' : 'dark')],
  ].filter(Boolean);
  let matches = [], selected = 0;

  function render() {
    const q = input.value.trim().toLowerCase();
    matches = q.startsWith('/') ? COMMANDS.filter(([name]) => name.startsWith(q.split(' ')[0])) : [];
    selected = Math.min(selected, Math.max(0, matches.length - 1));
    menu.hidden = !matches.length;
    menu.innerHTML = '';
    matches.forEach(([name, help], i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === selected));
      li.textContent = name;
      const span = document.createElement('span');
      span.textContent = typeof help === 'function' ? help() : help;
      li.append(span);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); run(i); });
      menu.append(li);
    });
  }

  function run(i) {
    const command = matches[i];
    input.value = '';
    render();
    if (command) command[2]();
  }

  input.addEventListener('input', () => { selected = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (!matches.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      selected = (selected + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length;
      render();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      input.value = matches[selected][0];
      render();
    } else if (e.key === 'Escape') {
      input.value = '';
      render();
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (text.startsWith('/')) {
      run(matches.length ? selected : -1);
      return;
    }
    open(`mailto:daryl@darylyeo.com?subject=${encodeURIComponent('Hello from darylyeo.com')}&body=${encodeURIComponent(text)}`);
    input.value = '';
  });
})();
