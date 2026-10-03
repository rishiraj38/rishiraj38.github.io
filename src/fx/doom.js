/* Hidden singularity button. Pressing it (or typing "boom") collapses the page into a black hole, holds on black, then a big bang rebuilds everything. Esc skips. */
(function () {
  const STILL = window.SPACE && window.SPACE.STILL;
  const TAU = Math.PI * 2, root = document.documentElement;
  const btn = document.createElement('button');
  btn.id = 'singularity'; btn.type = 'button'; btn.setAttribute('aria-label', 'A mysterious button. Do not press.');
  const dot = document.createElement('i'), lab = document.createElement('span'); lab.textContent = 'do not press';
  btn.append(dot, lab); document.body.append(btn);

  let running = false, typed = '';
  btn.addEventListener('click', run);
  addEventListener('keydown', (e) => {
    if (e.key && e.key.length === 1 && !/input|textarea/i.test((e.target.tagName || ''))) { typed = (typed + e.key.toLowerCase()).slice(-4); if (typed === 'boom') run(); }
  });

  const ease = (x) => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);

  function run() {
    if (running) return; running = true;
    const W = innerWidth, H = innerHeight, cx = W / 2, cy = H / 2, diag = Math.hypot(W, H);
    const layer = document.createElement('div'); layer.className = 'doom-layer';
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d'), dpr = Math.min(devicePixelRatio || 1, 1.5);
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const alert = document.createElement('div'); alert.className = 'doom-alert'; alert.innerHTML = '<b>SINGULARITY DETECTED</b>';
    const msg = document.createElement('div'); msg.className = 'doom-msg';
    const h = document.createElement('h3'); h.textContent = 'The Milky Way is gone.';
    const sub = document.createElement('p'); sub.textContent = 'restoring universe from last commit';
    msg.append(h, sub); layer.append(cv, alert, msg); document.body.append(layer);
    root.classList.add('doom', 'doom-warn');

    // everything on the page, to be swallowed
    const victims = [...document.body.children].filter((n) => n !== layer && !/SCRIPT|STYLE|LINK/.test(n.tagName));
    let anims = [];
    const T = STILL ? { warn: 0, suck: .4, eat: .5, dark: 2.2, bang: 2.6 } : { warn: 1.1, suck: 4.3, eat: 5.1, dark: 6.9, bang: 8.6 };

    function swallow() {
      root.classList.remove('doom-warn'); alert.remove();
      if (STILL) return;
      victims.forEach((n) => {
        const r = n.getBoundingClientRect(); if (!r.width && !r.height) return;
        n.style.transformOrigin = `${cx - r.left}px ${cy - r.top}px`;
        anims.push(n.animate([{ transform: 'none', filter: 'none' }, { transform: 'rotate(120deg) scale(.55)', filter: 'blur(1px) saturate(1.6)', offset: .55 }, { transform: 'rotate(900deg) scale(0)', filter: 'blur(8px) brightness(2.4)' }],
          { duration: (T.suck - T.warn) * 1000, easing: 'cubic-bezier(.55,0,.9,.35)', fill: 'forwards' }));
      });
    }
    function rebirth() {
      msg.classList.remove('on');
      anims.forEach((a) => a.cancel()); anims = [];
      if (STILL) return;
      victims.forEach((n) => {
        if (!n.style.transformOrigin) return;
        const a = n.animate([{ transform: 'scale(0) rotate(-200deg)', filter: 'blur(14px) brightness(3)' }, { transform: 'none', filter: 'none' }], { duration: 1500, easing: 'cubic-bezier(.16,1.1,.3,1)' });
        a.onfinish = () => { n.style.transformOrigin = ''; };
      });
    }
    function finish() {
      anims.forEach((a) => a.cancel()); victims.forEach((n) => { n.style.transformOrigin = ''; });
      layer.remove(); root.classList.remove('doom', 'doom-warn'); removeEventListener('keydown', esc);
      lab.textContent = 'again?'; running = false;
    }
    const esc = (e) => { if (e.key === 'Escape') finish(); };
    addEventListener('keydown', esc);

    // debris spiralling in
    const COLORS = ['#FFFFFF', '#9FE6FF', '#FFD9A0', '#B9A6FF', '#FF9E6B'];
    const N = W < 700 ? 500 : 1500;
    const spawn = (far) => ({ a: Math.random() * TAU, r: far ? diag * (.52 + Math.random() * .2) : 60 + Math.random() * diag * .6, s: .6 + Math.random() * 1.8, c: COLORS[(Math.random() * COLORS.length) | 0], k: .6 + Math.random() * .9, out: Math.random() });
    const parts = Array.from({ length: N }, () => spawn(false));

    const t0 = performance.now(); let last = t0, stage = 0;
    function frame(now) {
      if (!running) return;
      const t = (now - t0) / 1000, dt = Math.min(.05, (now - last) / 1000); last = now;
      if (stage === 0 && t >= T.warn) { stage = 1; swallow(); }
      if (stage === 1 && t >= T.eat) { stage = 2; msg.classList.add('on'); }
      if (stage === 2 && t >= T.dark) { stage = 3; rebirth(); }
      if (t >= T.bang) { finish(); return; }
      ctx.clearRect(0, 0, W, H);
      const unit = Math.min(W, H) / 900;

      if (t < T.dark) {
        const grow = ease((t - T.warn) / (T.suck - T.warn)), eat = ease((t - T.suck) / (T.eat - T.suck));
        const R = STILL ? diag * ease(t / T.eat) : grow * 120 * unit + eat * eat * diag;
        // space darkens as light is pulled in
        ctx.fillStyle = `rgba(0,0,0,${.6 * grow})`; ctx.fillRect(0, 0, W, H);
        if (!STILL && t >= T.warn) {
          ctx.lineCap = 'round';
          for (const p of parts) {
            const px = cx + Math.cos(p.a) * p.r, py = cy + Math.sin(p.a) * p.r * .82;
            const pull = (70 + 60000 / Math.max(40, p.r)) * p.k * (0.4 + grow * 2.4);
            p.r -= pull * dt; p.a += (1.1 + 420 / Math.max(30, p.r)) * dt * (0.5 + grow);
            if (p.r < R * .9) { Object.assign(p, spawn(true)); continue; }
            const x = cx + Math.cos(p.a) * p.r, y = cy + Math.sin(p.a) * p.r * .82;
            ctx.strokeStyle = p.c; ctx.globalAlpha = Math.min(1, .25 + 140 / p.r); ctx.lineWidth = p.s;
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        if (R > 1) {
          // accretion glow, hot inner ring, photon ring, then the shadow itself
          const g = ctx.createRadialGradient(cx, cy, R * .9, cx, cy, R * 3.2);
          g.addColorStop(0, 'rgba(255,240,210,.95)'); g.addColorStop(.12, 'rgba(255,170,70,.75)'); g.addColorStop(.4, 'rgba(210,70,30,.28)'); g.addColorStop(1, 'rgba(120,30,90,0)');
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(-.35); ctx.scale(1, .42 + eat * .58); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 3.2, 0, TAU); ctx.fill(); ctx.restore();
          for (let i = 0; i < 3; i++) {
            const a0 = t * (2.4 + i) + i * 2.1;
            ctx.strokeStyle = `rgba(255,${220 - i * 40},${160 - i * 50},${.8 - i * .2})`; ctx.lineWidth = Math.max(1.5, R * (.08 - i * .02));
            ctx.beginPath(); ctx.arc(cx, cy, R * (1.08 + i * .1), a0, a0 + 2.2); ctx.stroke();
          }
          ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(255,245,225,.9)'; ctx.lineWidth = Math.max(1, 2.5 * unit); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
        }
      } else {
        // big bang: flash, shock rings, matter thrown back out
        const u = (t - T.dark) / (T.bang - T.dark), e = 1 - Math.pow(1 - u, 3);
        ctx.fillStyle = `rgba(0,0,0,${1 - ease(u * 1.6)})`; ctx.fillRect(0, 0, W, H);
        const fl = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, e * diag * .9));
        fl.addColorStop(0, `rgba(255,255,255,${1 - u})`); fl.addColorStop(.35, `rgba(190,170,255,${(1 - u) * .7})`); fl.addColorStop(.7, `rgba(95,216,255,${(1 - u) * .3})`); fl.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fl; ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 4; i++) {
          const rr = e * diag * (.25 + i * .2);
          ctx.strokeStyle = `rgba(255,255,255,${(1 - u) * (.8 - i * .15)})`; ctx.lineWidth = (1 - u) * (10 - i * 2) + .5;
          ctx.beginPath(); ctx.ellipse(cx, cy, rr, rr * (.7 + i * .1), i * .5, 0, TAU); ctx.stroke();
        }
        for (const p of parts) {
          const rr = e * diag * (.1 + p.out * .7), x = cx + Math.cos(p.a) * rr, y = cy + Math.sin(p.a) * rr;
          ctx.globalAlpha = (1 - u) * .95; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(x, y, p.s * (1.6 - u), 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
})();
