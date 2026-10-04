/* Hidden singularity button. Pressing it (or typing "boom") scrolls to the page's own black hole, flies the
   camera into it while everything else on the page is pulled in, holds on black, then a big bang rebuilds
   the page. Esc skips. Without WebGL (or with reduced motion) a drawn black hole stands in. */
(function () {
  const SP = window.SPACE || (window.SPACE = {});
  const STILL = SP.STILL;
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
  const block = (e) => { if (running) e.preventDefault(); };

  function run() {
    if (running) return; running = true;
    const W = innerWidth, H = innerHeight, cx = W / 2, cy = H / 2, diag = Math.hypot(W, H);
    const core = document.getElementById('scene-1');
    // the real ray-marched hole is used when its WebGL canvas is alive
    // (it starts up lazily when scrolled near, so this is decided on arrival)
    const alive = () => !STILL && core && core.classList.contains('sc-ready') && !core.classList.contains('sc-nogl') && !!core.querySelector('canvas');
    const travel = !STILL && core && !core.classList.contains('sc-nogl');
    let real = false;

    const layer = document.createElement('div'); layer.className = 'doom-layer';
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d'), dpr = Math.min(devicePixelRatio || 1, 1.5);
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const alert = document.createElement('div'); alert.className = 'doom-alert'; alert.innerHTML = '<b>SINGULARITY DETECTED</b>';
    const msg = document.createElement('div'); msg.className = 'doom-msg';
    const h = document.createElement('h3'); h.textContent = 'The Milky Way is gone.';
    const sub = document.createElement('p'); sub.textContent = 'restoring universe from last commit';
    msg.append(h, sub); layer.append(cv, alert, msg); document.body.append(layer);
    root.classList.add('doom-warn');
    addEventListener('wheel', block, { passive: false }); addEventListener('touchmove', block, { passive: false });

    // timeline in seconds: travel to the hole, fall in, hold on black, big bang
    const T = STILL ? { go: .01, suck: .4, dark: 2.2, bang: 2.6 } : { go: travel ? 2.1 : 1.1, suck: travel ? 6 : 4.6, dark: travel ? 7.9 : 6.4, bang: travel ? 9.6 : 8.1 };

    // 1. animated scroll so the hole sits in the middle of the screen
    const y0 = scrollY;
    let y1 = y0;
    if (travel) { const r = core.getBoundingClientRect(); y1 = Math.max(0, y0 + r.top + r.height / 2 - H / 2); }
    const oldBehavior = root.style.scrollBehavior; root.style.scrollBehavior = 'auto';

    // everything except the hole gets swallowed
    const main = document.querySelector('main'), wrap = document.querySelector('.wrap');
    let victims = [], anims = [], coreAnim = null;

    function swallow() {
      real = alive();
      victims = [...document.body.children].filter((n) => n !== layer && n !== wrap);
      if (real && wrap && main) victims = victims.concat([...wrap.children].filter((n) => n !== main), [...main.children].filter((n) => n !== core));
      else if (wrap) victims.push(wrap);
      victims = victims.filter((n) => !/SCRIPT|STYLE|LINK/.test(n.tagName));
      root.classList.remove('doom-warn'); root.classList.add('doom'); alert.remove();
      if (STILL) return;
      const dur = (T.suck - T.go) * 1000;
      victims.forEach((n) => {
        const r = n.getBoundingClientRect(); if (!r.width && !r.height) return;
        n.style.transformOrigin = `${cx - r.left}px ${cy - r.top}px`;
        anims.push(n.animate([{ transform: 'none', filter: 'none' }, { transform: 'rotate(140deg) scale(.5)', filter: 'blur(1px) saturate(1.6)', offset: .6 }, { transform: 'rotate(900deg) scale(0)', filter: 'blur(8px) brightness(2.4)' }],
          { duration: dur * .8, easing: 'cubic-bezier(.55,0,.9,.35)', fill: 'forwards' }));
      });
      if (real) {
        // grow the hole's own canvas until its opaque middle covers the whole screen
        const r = core.getBoundingClientRect(), k = Math.max(1.4, 1.12 * H / (r.height * .6), 1.05 * W / r.width);
        core.classList.add('doom-core');
        coreAnim = core.animate([{ transform: 'none' }, { transform: `scale(${k})` }], { duration: dur * .7, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
      }
    }
    function rebirth() {
      msg.classList.remove('on');
      anims.forEach((a) => a.cancel()); anims = [];
      if (coreAnim) { coreAnim.cancel(); coreAnim = null; }
      if (core) core.classList.remove('doom-core');
      SP.dive = 0;
      if (STILL) return;
      victims.concat(real ? [core] : []).forEach((n) => {
        const r = n.getBoundingClientRect();
        if (!n.style.transformOrigin) n.style.transformOrigin = `${cx - r.left}px ${cy - r.top}px`;
        const a = n.animate([{ transform: 'scale(0) rotate(-200deg)', filter: 'blur(14px) brightness(3)' }, { transform: 'none', filter: 'none' }], { duration: 1500, easing: 'cubic-bezier(.16,1.1,.3,1)' });
        a.onfinish = () => { n.style.transformOrigin = ''; };
      });
    }
    function finish() {
      anims.forEach((a) => a.cancel()); if (coreAnim) coreAnim.cancel();
      victims.forEach((n) => { n.style.transformOrigin = ''; });
      if (core) { core.classList.remove('doom-core'); core.style.transformOrigin = ''; }
      SP.dive = 0; layer.remove(); root.classList.remove('doom', 'doom-warn'); root.style.scrollBehavior = oldBehavior;
      removeEventListener('keydown', esc); removeEventListener('wheel', block); removeEventListener('touchmove', block);
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
      if (stage === 0) {
        const k = ease(t / T.go); scrollTo(0, y0 + (y1 - y0) * k);
        if (t >= T.go) { stage = 1; swallow(); }
      }
      if (stage === 1 && t >= T.suck) { stage = 2; msg.classList.add('on'); }
      if (stage === 2 && t >= T.dark) { stage = 3; rebirth(); }
      if (t >= T.bang) { finish(); return; }
      ctx.clearRect(0, 0, W, H);
      const unit = Math.min(W, H) / 900;

      if (t < T.dark) {
        const fall = ease((t - T.go) / (T.suck - T.go));              // 0..1 over the fall
        const dive = fall * fall * (3 - 2 * fall);
        if (real && stage >= 1) SP.dive = Math.min(1, dive);
        // radius inside which debris disappears; with the real hole this tracks its growing shadow
        const R = STILL ? diag * ease(t / T.suck) : real ? unit * (70 + 260 * fall) + Math.pow(fall, 5) * diag : fall * 120 * unit + Math.pow(ease((fall - .8) / .2), 2) * diag;
        if (!real) { ctx.fillStyle = `rgba(0,0,0,${.6 * fall})`; ctx.fillRect(0, 0, W, H); }
        if (!STILL && t >= T.go) {
          ctx.lineCap = 'round';
          for (const p of parts) {
            const px = cx + Math.cos(p.a) * p.r, py = cy + Math.sin(p.a) * p.r * .82;
            const pull = (70 + 60000 / Math.max(40, p.r)) * p.k * (0.4 + fall * 2.4);
            p.r -= pull * dt; p.a += (1.1 + 420 / Math.max(30, p.r)) * dt * (0.5 + fall);
            if (p.r < R * .9) { Object.assign(p, spawn(true)); continue; }
            const x = cx + Math.cos(p.a) * p.r, y = cy + Math.sin(p.a) * p.r * .82;
            ctx.strokeStyle = p.c; ctx.globalAlpha = Math.min(1, .25 + 140 / p.r); ctx.lineWidth = p.s;
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        if (!real && R > 1) {
          // stand-in hole: accretion glow, hot arcs, photon ring, shadow
          const eat = ease((fall - .8) / .2);
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
        // the last moment closes to pure black whatever the renderer did
        const shut = ease((fall - .86) / .14);
        if (shut > 0) { ctx.fillStyle = `rgba(0,0,0,${shut})`; ctx.fillRect(0, 0, W, H); }
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
