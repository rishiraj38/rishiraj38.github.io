/* ============================================================
   fx/orbit.js — global polish layer
     1. launch intro (once per session, skippable, never blocks)
     2. shared FX canvas: spaceship cursor trail, click bursts, copy rocket
     3. mission HUD (scroll waypoints + distance-to-Earth readout)
     4. Earth-from-orbit finale in .contact (three.js, CSS fallback)
     5. small delights: heading scramble, magnetic buttons, name tilt
   Each part is isolated: one failing never stops the others.
   ============================================================ */
(function () {
  'use strict';

  const root = document.documentElement;
  const STILL = !!(window.SPACE && window.SPACE.STILL) || matchMedia('(prefers-reduced-motion:reduce)').matches;
  const FINE = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const TAU = Math.PI * 2;
  const $ = (s, p) => (p || document).querySelector(s);
  const $$ = (s, p) => Array.from((p || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mk = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const part = (name, fn) => { try { fn(); } catch (e) { console.warn('fx/orbit: ' + name + ' skipped', e); } };

  /* ------------------------------------------------------------
     1. LAUNCH INTRO
     A transparent mission-control overlay: the page content is held back so the
     starfield's arrival streak plays behind the countdown, then the overlay splits
     along its seam, the name flies through the camera and the page fades in.
     ------------------------------------------------------------ */
  part('intro', function intro() {
    root.classList.remove('orbit-pre');            // optional head-level hook, always released
    if (STILL) return;
    let seen = false;
    try { seen = sessionStorage.getItem('orbit-intro') === '1'; sessionStorage.setItem('orbit-intro', '1'); } catch (e) { /* private mode: just play it */ }
    if (seen || scrollY > 40 || location.hash.length > 1) return;   // returning visitor, restored scroll or deep link

    const letters = (w, from) => '<em>' + w.split('').map((c, i) => `<span style="--i:${from + i}">${c}</span>`).join('') + '</em>';
    const node = mk('div', 'orbit-intro',
      '<i class="oi-ring"></i>' +
      '<span class="oi-c oi-tl">Mission RR-38 / portfolio</span>' +
      '<span class="oi-c oi-tr">Telemetry nominal</span>' +
      '<span class="oi-c oi-bl">Trajectory: Sun &rarr; Earth orbit</span>' +
      '<span class="oi-c oi-br">Click or press any key to skip</span>' +
      '<div class="oi-core">' +
        '<div class="oi-up"><p class="oi-t"><i></i>T-minus <b>00:03</b></p>' +
        '<p class="oi-name">' + letters('RISHI', 0) + letters('RAJ', 5) + '</p></div>' +
        '<i class="oi-seam"></i>' +
        '<div class="oi-down"><p class="oi-checks"><span style="--i:0">Guidance <b>go</b></span><span style="--i:1">Propulsion <b>go</b></span><span style="--i:2">Open source <b>go</b></span></p></div>' +
      '</div>');
    node.setAttribute('aria-hidden', 'true');

    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const skipEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    let leaving = false, done = false;

    function finish() {                             // idempotent: always leaves the page clean
      if (done) return; done = true;
      timers.forEach(clearTimeout);
      skipEvents.forEach((ev) => removeEventListener(ev, skip, true));
      removeEventListener('scroll', onScroll);
      node.remove();
      root.classList.remove('orbit-intro-on', 'orbit-intro-fade');
    }
    function leave(fast) {
      if (leaving) return; leaving = true;
      if (fast) node.classList.add('fast');
      node.classList.add('out');
      root.classList.add('orbit-intro-fade');
      root.classList.remove('orbit-intro-on');
      // replay the hero name's rise so it lands as the page appears
      $$('#name .l').forEach((l) => { l.style.animation = 'none'; void l.offsetWidth; l.style.animation = ''; });
      later(finish, fast ? 420 : 880);
    }
    function skip() { leave(true); }
    function onScroll() { if (scrollY > 24) leave(true); }   // a real page scroll, not a nested scroller

    // failsafe first: whatever happens below, the overlay is gone within 2.2 s
    setTimeout(finish, 2200);
    root.classList.add('orbit-intro-on');
    document.body.appendChild(node);
    skipEvents.forEach((ev) => addEventListener(ev, skip, { capture: true, passive: true }));
    addEventListener('scroll', onScroll, { passive: true });

    const clock = $('.oi-t b', node), label = $('.oi-t', node);
    later(() => { clock.textContent = '00:02'; }, 340);
    later(() => { clock.textContent = '00:01'; }, 680);
    later(() => { clock.remove(); label.lastChild.textContent = 'Liftoff'; }, 1020);
    later(() => leave(false), 1120);
  });

  /* ------------------------------------------------------------
     2. FX CANVAS — one fixed, click-through canvas shared by the cursor's thruster
     trail, click bursts and the copy-button rocket. It only runs a frame loop
     while something is alive.
     ------------------------------------------------------------ */
  const FX = (function () {
    if (STILL) return null;
    let cv = null, ctx = null, W = 0, H = 0, dpr = 1, raf = 0, last = 0;
    const parts = [], rings = [], rockets = [], hooks = [];
    const COLORS = { ice: [95, 216, 255], nebula: [139, 108, 255], sun: [255, 179, 71], rose: [255, 122, 182], white: [255, 255, 255], aurora: [91, 227, 161] };

    function ensure() {
      if (cv) return;
      cv = mk('canvas', 'orbit-fx'); cv.setAttribute('aria-hidden', 'true');
      document.body.appendChild(cv); ctx = cv.getContext('2d');
      size(); addEventListener('resize', size);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
    }
    function size() {
      dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    }
    function spark(x, y, vx, vy, life, size, color, drag, grav) {
      if (parts.length > 520) parts.shift();
      parts.push({ x, y, vx, vy, life, max: life, size, c: color, drag: drag == null ? 2.2 : drag, g: grav || 0 });
    }
    function burst(x, y, n, speed, palette, size) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, v = speed * (.35 + Math.random() * .85);
        spark(x, y, Math.cos(a) * v, Math.sin(a) * v, .45 + Math.random() * .55, (size || 2) * (.6 + Math.random() * .9), palette[i % palette.length], 2.6, 60);
      }
      rings.push({ x, y, r: 4, vr: speed * .9, life: .45, max: .45, c: palette[0] });
    }
    function rocket(x, y) {
      rockets.push({ x, y, vx: (Math.random() - .5) * 60, vy: -120, t: 0, top: Math.max(70, y - clamp(innerHeight * .5, 220, 520)) });
    }
    function frame(now) {
      raf = 0;
      const dt = Math.min((now - last) / 1000 || .016, .05); last = now;
      let alive = false;
      for (const h of hooks) alive = h(dt, now) || alive;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.t += dt; r.vy -= 1500 * dt; r.vx += Math.sin(r.t * 9) * 220 * dt;
        r.x += r.vx * dt; r.y += r.vy * dt;
        for (let k = 0; k < 3; k++) spark(r.x + (Math.random() - .5) * 4, r.y + 10, (Math.random() - .5) * 70, 120 + Math.random() * 160, .35 + Math.random() * .35, 2.2, k ? COLORS.sun : COLORS.white, 1.5, 0);
        const a = Math.atan2(r.vy, r.vx) + Math.PI / 2;
        ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(a); ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#EEECFF'; ctx.beginPath(); ctx.moveTo(0, -11); ctx.quadraticCurveTo(5, -3, 4, 7); ctx.lineTo(-4, 7); ctx.quadraticCurveTo(-5, -3, 0, -11); ctx.fill();
        ctx.fillStyle = '#FF7AB6'; ctx.beginPath(); ctx.moveTo(-4, 3); ctx.lineTo(-8, 10); ctx.lineTo(-4, 7); ctx.moveTo(4, 3); ctx.lineTo(8, 10); ctx.lineTo(4, 7); ctx.fill();
        ctx.fillStyle = '#5FD8FF'; ctx.beginPath(); ctx.arc(0, -2, 1.8, 0, TAU); ctx.fill();
        ctx.restore(); ctx.globalCompositeOperation = 'lighter';
        if (r.y <= r.top || r.t > 1.6) {
          burst(r.x, r.y, 54, 420, [COLORS.sun, COLORS.white, COLORS.ice, COLORS.rose, COLORS.nebula], 2.6);
          rings.push({ x: r.x, y: r.y, r: 8, vr: 520, life: .7, max: .7, c: COLORS.ice });
          rockets.splice(i, 1);
        }
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= dt;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        const k = Math.exp(-p.drag * dt);
        p.vx *= k; p.vy = p.vy * k + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        const a = p.life / p.max;
        ctx.fillStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${a * .9})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(.3, p.size * (.35 + a * .65)), 0, TAU); ctx.fill();
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.life -= dt;
        if (r.life <= 0) { rings.splice(i, 1); continue; }
        r.r += r.vr * dt; r.vr *= Math.exp(-3 * dt);
        ctx.strokeStyle = `rgba(${r.c[0]},${r.c[1]},${r.c[2]},${(r.life / r.max) * .8})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      if ((alive || parts.length || rings.length || rockets.length) && !document.hidden) raf = requestAnimationFrame(frame);
    }
    function kick() { ensure(); if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    return { kick, spark, burst, rocket, COLORS, onFrame: (fn) => hooks.push(fn) };
  })();

  /* ------------------------------------------------------------
     2b. SPACESHIP CURSOR — a reticle sits exactly on the pointer, the ship chases it
     with easing and turns toward its direction of travel, venting a thruster trail.
     The native cursor stays on text fields and the selectable e-mail address.
     ------------------------------------------------------------ */
  part('cursor', function cursor() {
    if (STILL || !FINE || !FX) return;
    const LINK = 'a,button,[role="button"],summary,label,select,.chips button,[data-cursor="link"]';
    const TEXT = 'input,textarea,[contenteditable=""],[contenteditable="true"],.addr';
    const ret = mk('div', 'orbit-ret', '<i></i>');
    const ship = mk('div', 'orbit-ship',
      '<svg viewBox="0 0 26 26" aria-hidden="true">' +
      '<path class="flame" d="M10 19 L13 27 L16 19 Z" fill="#FFB347"/>' +
      '<path d="M13 1 C16 7 19.5 14 21 21 L13 17.5 L5 21 C6.5 14 10 7 13 1 Z" fill="#EEECFF" stroke="#5FD8FF" stroke-width="1" stroke-linejoin="round"/>' +
      '<circle cx="13" cy="10.5" r="2" fill="#8B6CFF"/></svg>');
    ret.setAttribute('aria-hidden', 'true'); ship.setAttribute('aria-hidden', 'true');

    let on = false, px = 0, py = 0, sx = 0, sy = 0, ang = -Math.PI / 4, emit = 0;

    function start(e) {
      on = true; px = sx = e.clientX; py = sy = e.clientY;
      document.body.append(ret, ship);
      root.classList.add('orbit-cursor');
    }
    function classify(t) {
      const el = t && t.closest ? t : null;
      const text = !!(el && el.closest(TEXT));
      const link = !text && !!(el && (el.closest(LINK) || (el.tagName === 'CANVAS' && el.style.cursor === 'pointer')));
      root.classList.toggle('orbit-cursor-text', text);
      root.classList.toggle('orbit-cursor-link', link);
    }
    addEventListener('pointermove', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (!on) start(e);
      px = e.clientX; py = e.clientY;
      root.classList.remove('orbit-cursor-away');
      classify(e.target);
      ret.style.transform = `translate3d(${px}px,${py}px,0)`;
      FX.kick();
    }, { passive: true });
    addEventListener('pointerdown', (e) => {
      if (!on || (e.pointerType && e.pointerType !== 'mouse')) return;
      root.classList.add('orbit-cursor-down');
      const C = FX.COLORS;
      FX.burst(e.clientX, e.clientY, 16, 230, root.classList.contains('orbit-cursor-link') ? [C.sun, C.white, C.rose] : [C.ice, C.white, C.nebula], 2);
      FX.kick();
    }, { passive: true });
    addEventListener('pointerup', () => root.classList.remove('orbit-cursor-down'), { passive: true });
    root.addEventListener('mouseleave', () => root.classList.add('orbit-cursor-away'));
    addEventListener('blur', () => root.classList.add('orbit-cursor-away'));

    FX.onFrame((dt) => {
      if (!on) return false;
      const k = 1 - Math.exp(-dt * 16);
      const nx = lerp(sx, px, k), ny = lerp(sy, py, k);
      const vx = (nx - sx) / dt, vy = (ny - sy) / dt, speed = Math.hypot(vx, vy);
      sx = nx; sy = ny;
      if (speed > 30) {                              // turn the nose toward travel, by the shortest arc
        const target = Math.atan2(vy, vx);
        let d = target - ang; d = Math.atan2(Math.sin(d), Math.cos(d));
        ang += d * (1 - Math.exp(-dt * 14));
      }
      ship.style.transform = `translate3d(${sx}px,${sy}px,0) rotate(${ang + Math.PI / 2}rad)`;
      const hidden = root.classList.contains('orbit-cursor-text') || root.classList.contains('orbit-cursor-away');
      if (speed > 60 && !hidden) {                   // thruster particles, more of them the faster it flies
        emit += Math.min(speed / 260, 3.2);
        const C = FX.COLORS, cx = Math.cos(ang), cy = Math.sin(ang);
        while (emit >= 1) {
          emit -= 1;
          const j = (Math.random() - .5) * .9, back = 60 + Math.random() * 90;
          FX.spark(sx - cx * 11, sy - cy * 11, -Math.cos(ang + j) * back, -Math.sin(ang + j) * back,
            .35 + Math.random() * .45, 1.2 + Math.random() * 1.8, Math.random() < .25 ? C.sun : Math.random() < .5 ? C.nebula : C.ice, 2.4, 0);
        }
      }
      return Math.hypot(px - sx, py - sy) > .3;
    });
  });

  /* ------------------------------------------------------------
     2c. COPY BUTTON — a rocket lifts off from the button and bursts into stars.
     Listens only; the page's own click handler does the copying.
     ------------------------------------------------------------ */
  part('copy-rocket', function () {
    const btn = $('#copy');
    if (!btn || !FX) return;
    btn.addEventListener('click', () => {
      const b = btn.getBoundingClientRect(), C = FX.COLORS;
      FX.burst(b.left + b.width / 2, b.top + b.height / 2, 22, 260, [C.sun, C.white, C.rose], 2.2);
      FX.rocket(b.left + b.width / 2, b.top);
      FX.kick();
    });
  });

  /* ------------------------------------------------------------
     3. MISSION HUD — a slim rail in the right gutter: each section is a waypoint
     planet (a real anchor link), a ship rides the track with scroll and a readout
     counts the distance down from the Sun (1 AU) to low Earth orbit (408 km).
     ------------------------------------------------------------ */
  part('hud', function hud() {
    const defs = [
      { id: 'top', label: 'Launch', c: '#FFB347', el: $('.hero') || document.body },
      { id: 'experience', label: 'Experience', c: '#8B6CFF' },
      { id: 'permissions', label: 'Case study', c: '#FF7AB6' },
      { id: 'ledger', label: 'Pull requests', c: '#5FD8FF' },
      { id: 'projects', label: 'Projects', c: '#5BE3A1' },
      { id: 'writing', label: 'Writing', c: '#FFB347', alt: 'recognition' },
      { id: 'toolkit', label: 'Toolkit', c: '#FF8A5B' },
      { id: 'contact', label: 'Earth orbit', c: '#3C8BE8', earth: true },
    ];
    const stops = [];
    defs.forEach((d) => {
      const el = d.el || document.getElementById(d.id) || (d.alt && document.getElementById(d.alt));
      if (el) stops.push(Object.assign({}, d, { el, id: d.el ? d.id : el.id }));
    });
    if (stops.length < 3) return;

    const nav = mk('nav', 'orbit-hud'); nav.setAttribute('aria-label', 'Mission progress');
    const track = mk('div', 'oh-track'), fill = mk('i', 'oh-fill'), ship = mk('i', 'oh-ship');
    track.append(fill);
    stops.forEach((s) => {
      const a = mk('a', 'oh-wp' + (s.earth ? ' earth' : ''), '<span></span>');
      a.href = '#' + s.id; a.style.setProperty('--c', s.c);
      a.setAttribute('aria-label', s.label); a.firstChild.textContent = s.label;
      s.a = a; track.append(a);
    });
    track.append(ship);
    const read = mk('p', 'oh-read', '<b></b> to Earth'); read.setAttribute('aria-hidden', 'true');
    const num = read.firstChild;
    nav.append(track, read);
    document.body.appendChild(nav);

    const AU = 149597870, LEO = 408;
    const fmt = (km) => km >= 1e6 ? (km / 1e6).toFixed(km >= 1e8 ? 1 : 2) + 'M km' : Math.round(km).toLocaleString('en-US') + ' km';
    let max = 1, th = 1, current = -1, queued = false;

    // waypoint positions follow the real document offsets, kept at least 20px apart
    function measure() {
      max = Math.max(1, root.scrollHeight - innerHeight);
      th = track.offsetHeight || 1;
      stops.forEach((s, i) => { s.top = i === 0 ? 0 : s.el.getBoundingClientRect().top + scrollY; s.f = clamp(s.top / max, 0, 1); s.y = s.f * th; });
      for (let i = stops.length - 2; i >= 0; i--) stops[i].y = Math.min(stops[i].y, stops[i + 1].y - 20);
      for (let i = 1; i < stops.length; i++) stops[i].y = Math.max(stops[i].y, stops[i - 1].y + 20);
      stops.forEach((s) => { s.a.style.top = s.y + 'px'; });
      update();
    }
    function update() {
      queued = false;
      const p = clamp(scrollY / max, 0, 1);
      // map scroll to the (possibly nudged) waypoint positions, piecewise-linearly
      let y = stops[stops.length - 1].y;
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i], b = stops[i + 1];
        if (p <= b.f || i === stops.length - 2) { y = b.f > a.f ? lerp(a.y, b.y, clamp((p - a.f) / (b.f - a.f), 0, 1)) : (p >= b.f ? b.y : a.y); break; }
      }
      ship.style.transform = `translate3d(0,${y}px,0)`;
      fill.style.transform = `scaleY(${clamp(y / th, 0, 1)})`;
      num.textContent = fmt(LEO * Math.pow(AU / LEO, 1 - p));
      const probe = scrollY + innerHeight * .4;
      let cur = 0;
      stops.forEach((s, i) => { if (s.top <= probe) cur = i; });
      if (p > .995) cur = stops.length - 1;
      if (cur !== current) {
        current = cur;
        stops.forEach((s, i) => { s.a.classList.toggle('on', i === cur); s.a.classList.toggle('past', i < cur); if (i === cur) s.a.setAttribute('aria-current', 'true'); else s.a.removeAttribute('aria-current'); });
      }
    }
    const request = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    addEventListener('scroll', request, { passive: true });
    addEventListener('resize', measure);
    addEventListener('load', measure);
    if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);   // ledger filters etc. change the page height
    measure();
  });

  /* ------------------------------------------------------------
     4. EARTH FINALE — the contact section ends in low orbit: a real Blue Marble globe
     rises from the bottom edge with city lights on its night side, a drifting cloud
     deck, a blue atmospheric limb, a sunrise flare, the Moon and the ISS.
     ------------------------------------------------------------ */
  part('earth', function earth() {
    const sec = document.getElementById('contact') || $('.contact');
    if (!sec) return;
    const DIR = 'assets/orbit/';
    // The stage is a body-level layer (behind the content column, above the starfield) that spans the
    // full viewport width from the top of the contact section to the end of the page, so the globe is
    // never clipped by the content column and the footer sits over its night side.
    const host = mk('div', 'orbit-earth'); host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
    const column = sec.closest('.wrap') || sec;

    // Where the globe sits: its limb clears the contact text, its radius is chosen so the
    // visible cap spans the viewport, capped so the 2k texture is never stretched too far.
    function layout() {
      const W = root.clientWidth, sb = sec.getBoundingClientRect();
      const top = Math.round(sb.top + scrollY);
      const H = Math.max(200, Math.floor(Math.max(sb.bottom, column.getBoundingClientRect().bottom) + scrollY - top));
      host.style.top = top + 'px'; host.style.height = H + 'px';
      const anchor = $('.socials', sec) || $('.mail', sec) || $('h2', sec);
      const textBottom = anchor ? anchor.offsetTop + anchor.offsetHeight : H * .5;
      const gap = clamp(W * .08, 56, 130);
      const limbTop = Math.min(textBottom + gap, H - 120);
      const cap = H - limbTop, d = cap * .5;
      const R = Math.min(Math.max((d * d + W * W / 4) / (2 * d), W * .6, cap * 1.15), 1200);
      // the canvas only covers the part of the stage that can hold pixels: from a sky margin above the limb down
      const y0 = Math.max(0, Math.floor(limbTop - clamp(W * .3, 200, 420)));
      return { W, H, gap, limbTop, cap, R, y0, Hc: H - y0, limbC: limbTop - y0 };
    }

    function cssFallback() {
      host.innerHTML = '<div class="oe-disc"></div>';
      const place = () => { const L = layout(); host.style.setProperty('--r', L.R + 'px'); host.style.setProperty('--top', L.limbTop + 'px'); };
      place(); addEventListener('resize', place);
      if ('ResizeObserver' in window) new ResizeObserver(place).observe(document.body);
    }

    const T = window.THREE;
    const canvas = document.createElement('canvas');
    const attrs = { alpha: true, antialias: true, premultipliedAlpha: true, depth: true, stencil: false, powerPreference: 'high-performance' };
    let gl = null;
    if (T) { try { gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs); } catch (e) { gl = null; } }
    if (!gl) return cssFallback();

    // software rasterisers (SwiftShader, llvmpipe) get a lighter globe: fewer pixels, fewer triangles, fewer frames
    let gpu = '';
    try {
      gpu = String(gl.getParameter(gl.RENDERER) || '');
      if (!gpu || /webkit webgl/i.test(gpu)) { const ext = gl.getExtension('WEBGL_debug_renderer_info'); if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || ''); }
    } catch (e) { gpu = ''; }
    const SOFT = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu);
    const BUDGET = SOFT ? .8e6 : 3.2e6, EVERY = SOFT ? 4 : 1;

    const renderer = new T.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true, premultipliedAlpha: true });
    renderer.setClearColor(0x000000, 0);
    host.appendChild(canvas);

    const scene = new T.Scene();
    const cam = new T.OrthographicCamera(-1, 1, 1, -1, 1, 10);
    // the Sun sits up, to the right and slightly behind: day toward the upper right limb, night in the foreground left
    const SUN = new T.Vector3(.5, .5, -.42).normalize();
    const HOT = new T.Vector2(0, 1);                 // where on the limb the sunrise flare sits (kept on screen)

    /* --- Earth: one shader blends day map, night lights and clouds across the terminator --- */
    const NOISE = 'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}' +
      'float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}';
    const earthMat = new T.ShaderMaterial({
      uniforms: { tDay: { value: null }, tNight: { value: null }, tClouds: { value: null }, uSun: { value: SUN }, uHot: { value: HOT }, uShift: { value: 0 }, uFlare: { value: 0 } },
      vertexShader: 'varying vec2 vUv;varying vec3 vN;void main(){vUv=uv;vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `
        uniform sampler2D tDay, tNight, tClouds; uniform vec3 uSun; uniform vec2 uHot; uniform float uShift, uFlare;
        varying vec2 vUv; varying vec3 vN;
        ${NOISE}
        void main(){
          vec3 N = normalize(vN);
          float ndl = dot(N, uSun);
          float day = smoothstep(-.16, .30, ndl);                       // soft terminator
          vec2 cuv = vec2(vUv.x + uShift, vUv.y);                        // clouds drift over the surface
          float n = vnoise(cuv * vec2(720., 360.)) * .6 + vnoise(cuv * vec2(1900., 950.)) * .4;
          float c = smoothstep(.05, .92, texture2D(tClouds, cuv).r * (.84 + .32 * n));
          float shade = texture2D(tClouds, cuv + vec2(.0034, .0018)).r;  // cloud shadow on the ground
          vec3 d = texture2D(tDay, vUv).rgb;
          float ocean = smoothstep(0., .08, d.b - d.r * 1.3);
          d = d * 1.28 + vec3(0., .012, .03);
          d *= .93 + .14 * n;
          float sun = max(ndl, 0.);
          vec3 lit = d * (.22 + .98 * sun) * (1. - shade * .32);
          vec3 hv = normalize(uSun + vec3(0., 0., 1.));
          lit += vec3(1., .9, .74) * pow(max(dot(N, hv), 0.), 42.) * ocean * .6 * (1. - c);   // sun glint on water
          lit = mix(lit, vec3(.36 + .86 * sun), c * .93);
          float tw = exp(-pow((ndl - .03) / .13, 2.));                   // warm light along the terminator
          lit += vec3(1., .42, .16) * tw * (.08 + .5 * c);
          vec3 night = max(texture2D(tNight, vUv).rgb - .035, 0.);
          night = pow(night, vec3(1.25)) * vec3(1.3, .98, .62) * 3. * (1. - c * .78) + d * vec3(.018, .028, .06);
          vec3 col = mix(night, lit, day);
          float rim = pow(1. - max(N.z, 0.), 3.2);                       // air glow toward the limb
          col += vec3(.25, .55, 1.) * rim * (.14 + .95 * day);
          float toward = max(dot(normalize(N.xy + 1e-5), uHot), 0.);
          col += vec3(1., .62, .32) * rim * pow(toward, 48.) * 1.1 * uFlare;
          gl_FragColor = vec4(col, 1.);
        }`,
    });
    const globe = new T.Mesh(new T.SphereGeometry(1, SOFT ? 128 : 256, SOFT ? 64 : 128), earthMat);
    // north pole tipped toward the viewer, so tropics and mid-latitudes slide along the limb
    const AXIS = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(.12, -.34, .93).normalize());
    const SPIN = new T.Quaternion(), UP = new T.Vector3(0, 1, 0);
    scene.add(globe);

    /* --- atmosphere halo: a full-screen pass, analytic glow around the limb --- */
    const haloMat = new T.ShaderMaterial({
      uniforms: { uC: { value: new T.Vector2() }, uR: { value: 1 }, uSun: { value: SUN }, uHot: { value: HOT }, uFlare: { value: 0 } },
      vertexShader: 'void main(){gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `
        uniform vec2 uC, uHot; uniform float uR, uFlare; uniform vec3 uSun;
        void main(){
          vec2 v = gl_FragCoord.xy - uC; float dist = length(v); vec2 dir = v / max(dist, 1.);
          float t = (dist - uR) / uR;
          float lit = smoothstep(-.5, .4, dot(dir, uSun.xy));
          float glow = t > 0. ? exp(-t * 52.) * .9 + exp(-t * 12.) * .24 : exp(t * 170.) * 1.14;   // continuous across the limb, which also hides its stair-steps
          float hot = pow(max(dot(dir, uHot), 0.), 70.) * uFlare;
          vec3 col = mix(vec3(.14, .4, 1.), vec3(.6, .85, 1.), exp(-abs(t) * 80.));
          col = mix(col, vec3(1., .74, .46), clamp(hot * .9, 0., 1.));
          float I = glow * (.1 + .9 * lit) * (1. + hot * 1.6);
          gl_FragColor = vec4(col * I, I * .5);                          // premultiplied, half additive
        }`,
      transparent: true, depthTest: false, depthWrite: false,
      blending: T.CustomBlending, blendEquation: T.AddEquation, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor,
    });
    const halo = new T.Mesh(new T.PlaneGeometry(2, 2), haloMat);
    halo.frustumCulled = false; halo.renderOrder = 1;
    scene.add(halo);

    /* --- Moon (lit by the same Sun) --- */
    const light = new T.DirectionalLight(0xffffff, 1.25); light.position.copy(SUN).multiplyScalar(10);
    scene.add(light, new T.AmbientLight(0x8fa8ff, .09));
    const moon = new T.Mesh(new T.SphereGeometry(1, 40, 24), new T.MeshLambertMaterial({ color: 0xffffff }));
    moon.visible = false; scene.add(moon);

    /* --- ISS: a real fly-around photo, cut out, drawn as a sprite --- */
    const iss = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthTest: false, opacity: .96 }));
    iss.visible = false; iss.renderOrder = 3; scene.add(iss);

    /* --- sunrise flare on the limb (drawn, additive) --- */
    function flareTexture() {
      const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
      const x = c.getContext('2d'), h = s / 2;
      let g = x.createRadialGradient(h, h, 0, h, h, h);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.05, 'rgba(255,244,214,.9)'); g.addColorStop(.14, 'rgba(255,190,110,.34)');
      g.addColorStop(.42, 'rgba(120,150,255,.08)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
      x.globalCompositeOperation = 'lighter';
      [[1, .035, .5], [.035, 1, .28], [.7, .02, .2, Math.PI / 4], [.7, .02, .2, -Math.PI / 4]].forEach(([sx, sy, a, rot]) => {   // streaks
        x.save(); x.translate(h, h); x.rotate(rot || 0); x.scale(sx, sy);
        g = x.createRadialGradient(0, 0, 0, 0, 0, h);
        g.addColorStop(0, `rgba(255,236,200,${a})`); g.addColorStop(1, 'rgba(255,236,200,0)');
        x.fillStyle = g; x.beginPath(); x.arc(0, 0, h, 0, TAU); x.fill(); x.restore();
      });
      return new T.CanvasTexture(c);
    }
    const flare = new T.Sprite(new T.SpriteMaterial({ map: flareTexture(), blending: T.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false }));
    flare.renderOrder = 4; scene.add(flare);

    /* --- textures --- */
    const loader = new T.TextureLoader();
    let need = 3, dead = false, ready = false;
    const fail = () => {                            // e.g. opened from file://: fall back to the CSS globe
      if (dead) return; dead = true; ready = false;
      cancelAnimationFrame(raf); canvas.remove(); renderer.dispose(); cssFallback();
    };
    const tex = (file, done) => loader.load(DIR + file, (t) => {
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      t.wrapS = T.RepeatWrapping;
      done(t);
    }, undefined, fail);
    const got = () => { if (--need === 0 && !dead) { ready = true; host.classList.add('ready'); resize(); wake(); } };
    tex('earth-day.jpg', (t) => { earthMat.uniforms.tDay.value = t; got(); });
    tex('earth-night.jpg', (t) => { earthMat.uniforms.tNight.value = t; got(); });
    tex('earth-clouds.jpg', (t) => { earthMat.uniforms.tClouds.value = t; got(); });
    loader.load(DIR + 'moon.jpg', (t) => { moon.material.map = t; moon.material.needsUpdate = true; moon.visible = true; wake(); }, undefined, () => {});
    loader.load(DIR + 'iss.png', (t) => { iss.material.map = t; iss.material.needsUpdate = true; iss.userData.ratio = t.image.height / t.image.width; iss.visible = true; wake(); }, undefined, () => {});

    /* --- sizing --- */
    let L = layout(), scale = 1, sized = '';
    function resize() {
      L = layout();
      if (!L.W || !L.H) return;
      canvas.style.top = L.y0 + 'px'; canvas.style.height = L.Hc + 'px';
      const key = L.W + 'x' + L.Hc + ':' + L.limbC + '@' + devicePixelRatio;   // the page above may only have moved us
      if (key === sized) { if (STILL) draw(0); return; }
      sized = key;
      let dpr = Math.min(devicePixelRatio || 1, 2);
      dpr = Math.max(Math.min(dpr, Math.sqrt(BUDGET / (L.W * L.Hc))), SOFT ? .5 : .75);   // keep the buffer within budget
      renderer.setPixelRatio(dpr);
      renderer.setSize(L.W, L.Hc, false);
      scale = dpr;
      cam.left = -L.W / 2; cam.right = L.W / 2; cam.top = L.Hc / 2; cam.bottom = -L.Hc / 2;
      cam.near = 1; cam.far = L.R * 8; cam.position.set(0, 0, L.R * 4); cam.updateProjectionMatrix();
      globe.scale.setScalar(L.R);
      if (STILL) draw(0);
    }

    /* --- frame --- */
    let raf = 0, last = 0, clock = 40, onScreen = false, flareI = STILL ? 1 : 0, tick = 0;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    function draw(dt) {
      if (!ready || dead) return;
      clock += dt;
      // how far the section has scrolled in: the globe rises as you arrive
      const b = sec.getBoundingClientRect();
      const p = STILL ? 1 : clamp((innerHeight - b.top - b.height * .25) / (b.height * .75), 0, 1);
      const rise = ease(p);
      const R = L.R, cx = 0, cy = L.Hc / 2 - L.limbC - R - (1 - rise) * L.cap * .5;

      SPIN.setFromAxisAngle(UP, clock * TAU / 300);
      globe.quaternion.copy(AXIS).multiply(SPIN);
      globe.position.set(cx, cy, 0);
      earthMat.uniforms.uShift.value = clock * .00042;

      flareI = STILL ? 1 : lerp(flareI, p > .55 ? 1 : 0, 1 - Math.exp(-dt * 1.6));
      const shimmer = STILL ? 1 : .92 + .08 * Math.sin(clock * 1.7) + .03 * Math.sin(clock * 4.3);
      earthMat.uniforms.uFlare.value = flareI;
      haloMat.uniforms.uFlare.value = flareI * shimmer;
      haloMat.uniforms.uR.value = R * scale;
      haloMat.uniforms.uC.value.set((L.W / 2 + cx) * scale, (L.Hc / 2 + cy) * scale);
      const fs = clamp(L.W * .34, 220, 520) * (.55 + .45 * flareI) * shimmer;
      const fa = Math.min(Math.atan2(SUN.x, SUN.y), Math.asin(Math.min(1, L.W * .36 / R)));   // toward the Sun, but never off screen
      HOT.set(Math.sin(fa), Math.cos(fa));
      flare.position.set(cx + HOT.x * R, cy + HOT.y * R, R * 1.5);
      flare.scale.set(fs, fs, 1);
      flare.material.opacity = flareI;

      // Moon: a slow pass above the limb, left to right
      const mr = clamp(L.gap * .23, 10, 28), mo = R + L.gap * .52;
      const mA = Math.asin(Math.min(1, (L.W / 2 + mr * 2) / mo));
      const mT = lerp(-mA, mA, (clock / 150 + .46) % 1);
      moon.position.set(cx + Math.sin(mT) * mo, cy + Math.cos(mT) * mo, -R * 1.6);
      moon.scale.setScalar(mr); moon.rotation.y = clock * .05 + 1.8;

      // ISS: a faster prograde pass, hugging the atmosphere
      const iw = clamp(L.W * .058, 46, 86), io = R + Math.max(22, L.gap * .2);
      const iA = Math.asin(Math.min(1, (L.W / 2 + iw) / io));
      const iT = lerp(iA, -iA, (clock / 46 + .32) % 1);
      iss.position.set(cx + Math.sin(iT) * io, cy + Math.cos(iT) * io, R * 1.2);
      iss.scale.set(iw * 1.2, iw * 1.2 * (iss.userData.ratio || .5), 1);
      iss.material.rotation = -iT;

      renderer.render(scene, cam);
    }
    function frame(now) {
      raf = 0;
      if (++tick % EVERY === 0) {
        const dt = Math.min((now - last) / 1000 || .016, .05 * EVERY); last = now;
        draw(dt);
      }
      if (running()) raf = requestAnimationFrame(frame);
    }
    const running = () => ready && !dead && !STILL && onScreen && !document.hidden;
    function wake() {
      if (dead || !ready) return;
      if (STILL) { draw(0); return; }
      if (running() && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => { onScreen = es[es.length - 1].isIntersecting; wake(); }, { rootMargin: '200px 0px' }).observe(sec);
    } else onScreen = true;
    document.addEventListener('visibilitychange', wake);
    addEventListener('resize', resize);
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(document.body);   // content above can grow or shrink
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; });
    canvas.addEventListener('webglcontextrestored', () => { resize(); wake(); });
    resize();
  });

  /* ------------------------------------------------------------
     5. SMALL DELIGHTS
     ------------------------------------------------------------ */
  // section headings decode themselves as they come into view (layout stays put: only a 3-glyph window changes)
  part('scramble', function () {
    if (STILL || !('IntersectionObserver' in window)) return;
    const GLYPHS = '01<>/\\[]{}#*+=_';
    const heads = $$('section .sh h2, .duo h2, .contact h2').filter((h) => !h.children.length && h.textContent.trim().length > 3);
    function run(h) {
      const text = h.textContent, n = text.length, dur = clamp(380 + n * 22, 500, 1150), t0 = performance.now();
      const done = document.createTextNode(''), hot = mk('span', 'orbit-scr'), rest = mk('span', 'orbit-rest');
      if (!h.hasAttribute('aria-label')) { h.setAttribute('aria-label', text); h.dataset.orbitLabel = '1'; }
      h.textContent = ''; h.append(done, hot, rest);
      (function step(now) {
        const k = clamp((now - t0) / dur, 0, 1), i = Math.floor(k * n), j = Math.min(n, i + 3);
        if (k >= 1 || !h.isConnected) {
          h.textContent = text;
          if (h.dataset.orbitLabel) { h.removeAttribute('aria-label'); delete h.dataset.orbitLabel; }
          return;
        }
        done.data = text.slice(0, i);
        hot.textContent = text.slice(i, j).replace(/\S/g, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]);
        rest.textContent = text.slice(j);
        requestAnimationFrame(step);
      })(t0);
    }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); run(e.target); } }), { threshold: .35 });
    heads.forEach((h) => io.observe(h));
  });

  // buttons and nav links lean toward the pointer
  part('magnetic', function () {
    if (STILL || !FINE) return;
    $$('#copy, .top nav a, .socials a').forEach((n) => {
      const grow = n.id === 'copy' ? ' scale(1.06)' : '';
      n.classList.add('orbit-mag');
      n.addEventListener('pointermove', (e) => {
        const b = n.getBoundingClientRect();
        const x = (e.clientX - b.left - b.width / 2) * .28, y = (e.clientY - b.top - b.height / 2) * .4;
        n.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)${grow}`;
      });
      n.addEventListener('pointerleave', () => { n.style.transform = ''; });
    });
  });

  // the big name tilts a few degrees toward the pointer
  part('tilt', function () {
    const name = document.getElementById('name');
    if (STILL || !FINE || !name) return;
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    name.classList.add('orbit-tilt');
    function step() {
      raf = 0;
      x = lerp(x, tx, .09); y = lerp(y, ty, .09);
      name.style.transform = `perspective(1400px) rotateX(${(-y * 7).toFixed(2)}deg) rotateY(${(x * 9).toFixed(2)}deg)`;
      if (Math.abs(tx - x) + Math.abs(ty - y) > .002) raf = requestAnimationFrame(step);
    }
    addEventListener('pointermove', (e) => {
      if (scrollY > innerHeight) return;            // only while the hero is around
      tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5;
      if (!raf) raf = requestAnimationFrame(step);
    }, { passive: true });
  });
})();
