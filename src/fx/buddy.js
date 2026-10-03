/* "Built with Claude Code" badge. A spark character that floats, blinks, watches the pointer and reacts when clicked. */
(function () {
  const footer = document.querySelector('footer'); if (!footer) return;
  const STILL = window.SPACE && window.SPACE.STILL;
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.append(n); return n; };

  const wrap = document.createElement('div'); wrap.className = 'buddy';
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'buddy-btn'; btn.id = 'buddy';
  btn.setAttribute('aria-label', 'Say hi to the Claude Code spark');
  const svg = s('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' });
  const body = s('g', { class: 'buddy-body' }, svg);
  const rays = s('g', { class: 'buddy-rays' }, body);
  const lens = [44, 36, 42, 34, 45, 37, 41, 35, 44, 36, 40, 34];
  lens.forEach((len, i) => { const l = s('line', { x1: 50, y1: 50, x2: 50, y2: 50 - len }, rays); l.style.setProperty('--a', i * 30 + 'deg'); l.style.setProperty('--i', i); });
  s('circle', { class: 'buddy-face', cx: 50, cy: 50, r: 23 }, body);
  s('circle', { class: 'buddy-cheek', cx: 35, cy: 54, r: 4 }, body);
  s('circle', { class: 'buddy-cheek', cx: 65, cy: 54, r: 4 }, body);
  const eyes = [41, 59].map((x) => {
    s('circle', { class: 'buddy-eye', cx: x, cy: 44, r: 6.2 }, body);
    const p = s('circle', { class: 'buddy-pupil', cx: x, cy: 44, r: 3 }, body);
    s('rect', { class: 'buddy-lid', x: x - 7, y: 37, width: 14, height: 14, rx: 6 }, body);
    return p;
  });
  const MOUTHS = { smile: 'M42 57 Q50 64 58 57', grin: 'M40 55 Q50 69 60 55', oh: 'M47 58 Q50 53 53 58 Q50 64 47 58', flat: 'M43 59 Q50 60 57 59' };
  const mouth = s('path', { class: 'buddy-mouth', d: MOUTHS.smile }, body);
  const say = document.createElement('span'); say.className = 'buddy-say'; say.setAttribute('role', 'status');
  btn.append(svg, say);

  const text = document.createElement('p'); text.className = 'buddy-text';
  const link = document.createElement('a'); link.href = 'https://claude.com/claude-code'; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Claude Code';
  const small = document.createElement('small'); small.textContent = 'Click the spark. It reacts.';
  text.append('Designed and built with ', link, small);
  wrap.append(btn, text); footer.prepend(wrap);

  /* eyes follow the pointer */
  addEventListener('pointermove', (e) => {
    const b = btn.getBoundingClientRect(); if (b.bottom < 0 || b.top > innerHeight) return;
    const dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height * .44), d = Math.hypot(dx, dy) || 1, k = Math.min(2.6, d / 40);
    eyes.forEach((p) => { p.style.transform = `translate(${dx / d * k}px,${dy / d * k}px)`; });
  }, { passive: true });

  /* blink now and then */
  const blink = () => { btn.classList.add('blink'); setTimeout(() => btn.classList.remove('blink'), 140); };
  if (!STILL) (function loop() { setTimeout(() => { blink(); loop(); }, 2200 + Math.random() * 3200); })();

  function sparks(n) {
    if (STILL || !btn.animate) return;
    const colors = ['#D97757', '#FFB347', '#FFF3EA', '#5FD8FF', '#FF7AB6'];
    for (let i = 0; i < n; i++) {
      const d = document.createElement('i'); d.className = 'buddy-spark'; d.style.background = colors[i % colors.length]; btn.append(d);
      const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 60;
      d.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * r}px,${Math.sin(a) * r - 20}px) scale(0)`, opacity: 0 }],
        { duration: 600 + Math.random() * 500, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => d.remove();
    }
  }

  /* each click plays the next reaction */
  const n = (window.SPACE && window.SPACE.merged) ? window.SPACE.merged.length : 0;
  const ACTS = [
    { cls: 'jump', mouth: 'grin', line: 'Hi! I helped build this site.', sparks: 12 },
    { cls: 'spin', mouth: 'oh', line: 'Wheee!', sparks: 8 },
    { cls: 'pop', mouth: 'grin', line: n ? `${n} merged PRs. Rishi did that part.` : 'Rishi did the hard part.', sparks: 16 },
    { cls: 'shake', mouth: 'flat', line: 'Hey, that tickles.', sparks: 0 },
    { cls: 'jump', mouth: 'grin', line: 'Every planet up there is real work.', sparks: 12 },
    { cls: 'spin', mouth: 'smile', line: 'Okay, now go email Rishi.', sparks: 20 },
  ];
  let turn = 0, timer = 0;
  btn.addEventListener('click', () => {
    const act = ACTS[turn++ % ACTS.length];
    btn.classList.remove('jump', 'spin', 'shake', 'pop'); void btn.offsetWidth;   // restart the animation
    btn.classList.add(act.cls, 'happy');
    mouth.setAttribute('d', MOUTHS[act.mouth]);
    say.textContent = act.line; say.classList.add('on');
    sparks(act.sparks);
    clearTimeout(timer);
    timer = setTimeout(() => { say.classList.remove('on'); btn.classList.remove('happy', act.cls); mouth.setAttribute('d', MOUTHS.smile); }, 2600);
  });
})();
