/* cosmos.js — the page-wide real deep-space backdrop.
   1. Photographic layers (Hubble/Webb/ESO/GALEX): deep field, Milky Way band, galaxies, nebulae, Saturn.
      Each is a CSS-transformed <img> with its own scroll depth, so the page scrolls *through* space.
   2. One shared canvas: real asteroid cut-outs tumbling at several depths, an asteroid belt mid-page,
      a meteor shower with occasional fireballs, coloured spiked stars and drifting dust.
   Everything is appended inside the fixed .sky layer; nothing here listens for or blocks input. */
(function () {
  const sky = document.querySelector('.sky');
  if (!sky) return;
  const STILL = !!(window.SPACE && window.SPACE.STILL);
  const DIR = 'assets/cosmos/';
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const starCanvas = sky.querySelector('#stars');

  let W = innerWidth, H = innerHeight, base = 1, small = false;
  let p = 0, ps = 0;                 // scroll progress 0..1 (raw, smoothed)
  let mx = 0, my = 0, pmx = 0, pmy = 0; // pointer -0.5..0.5 (raw, smoothed)
  let lastScroll = scrollY, vel = 0;   // smoothed scroll velocity, px/frame

  function progress() {
    const max = document.documentElement.scrollHeight - innerHeight;
    return max > 0 ? clamp(scrollY / max, 0, 1) : 0;
  }

  /* ------------------------------------------------------------------ photographic layers */
  const photos = document.createElement('div');
  photos.className = 'cosmos-photos';
  const deep = document.createElement('div');
  deep.className = 'cosmos-deep';
  photos.appendChild(deep);
  sky.insertBefore(photos, starCanvas || sky.firstChild);
  { const im = new Image(); im.onload = () => deep.classList.add('is-in'); im.src = DIR + 'deepfield.webp'; }

  /* a    : [section id, fraction down that section] the object belongs to; resolved to `at` by anchor()
     at   : scroll progress (0..1) where the object sits at its home position (fallback if the section is missing)
     x, y : home position, fraction of the viewport (centre of the image)
     size : width as a fraction of the layout base (≈ viewport width)
     k    : viewports travelled over the whole page (bigger = nearer = faster)
     dx   : sideways drift, in viewport widths per unit of vertical travel
     op   : peak opacity; spin: deg/second; rot: starting angle; mob: [x, size] overrides on phones */
  const OBJECTS = [
    { src: 'milkyway.webp', at: .5, x: .5, y: .5, size: 2.3, k: .9, op: .62, rot: -27, spin: 0, wide: 99, mob: [.5, 3.4] },
    { src: 'andromeda.webp', at: .02, x: .9, y: .9, size: .46, k: 4, op: .5, rot: 8, spin: .12, mob: [.8, .9] },
    { src: 'carina.webp', a: ['experience', .5], at: .17, x: .12, y: .62, size: .78, k: 4.4, op: .42, rot: -6, spin: 0, mob: [.3, 1.5] },
    { src: 'm51.webp', a: ['permissions', .35], at: .3, x: .93, y: .42, size: .5, k: 4.6, op: .44, rot: 0, spin: .5, mob: [.85, 1] },
    { src: 'saturn.webp', a: ['ledger', .1], at: .4, x: .1, y: .3, size: .15, k: 7.5, dx: -.09, op: .85, rot: -18, spin: 0, mob: [.2, .34] },
    { src: 'orion.webp', a: ['ledger', .7], at: .47, x: .06, y: .6, size: .56, k: 4.4, op: .46, rot: 20, spin: 0, mob: [.15, 1.1] },
    { src: 'sombrero.webp', a: ['projects', .4], at: .6, x: .92, y: .4, size: .46, k: 4.8, op: .55, rot: -14, spin: .1, mob: [.85, .95] },
    { src: 'helix.webp', a: ['recognition', .5], at: .72, x: .07, y: .55, size: .36, k: 5, op: .5, rot: 0, spin: .25, mob: [.15, .75] },
    { src: 'ngc1300.webp', a: ['toolkit', .5], at: .85, x: .9, y: .45, size: .56, k: 4.6, op: .5, rot: 12, spin: .4, mob: [.85, 1.05] },
  ];
  OBJECTS.forEach((o, i) => {
    const el = new Image();
    el.className = 'cosmos-obj'; el.alt = ''; el.decoding = 'async'; el.draggable = false;
    el.onload = () => { o.ready = true; o.ratio = el.naturalHeight / el.naturalWidth; layoutPhoto(o); o.shown = null; if (STILL) placePhotos(0); };
    el.onerror = () => { if (!o.retried) { o.retried = true; setTimeout(() => { el.src = DIR + o.src + '?r=1'; }, 1500); } };  // one retry on a flaky connection
    photos.appendChild(el);
    o.el = el; o.depth = .25 + i * .08; o.seed = Math.random() * 360;
    el.src = DIR + o.src;
  });

  /* tie every object to the section it decorates, so the journey survives the page growing or being reordered */
  const BELT = { a: ['projects', .96], at: .74 };
  function anchor() {
    const max = document.documentElement.scrollHeight - innerHeight;
    if (max <= 0) return;
    for (const o of OBJECTS.concat(BELT)) {
      const el = o.a && document.getElementById(o.a[0]);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      o.at = clamp((r.top + scrollY + r.height * o.a[1] - innerHeight / 2) / max, 0, 1);
    }
  }

  function layoutPhoto(o) {
    if (!o.ready) return;
    o.w = (small && o.mob ? o.mob[1] : o.size) * base;
    o.h = o.w * o.ratio;
    o.el.style.width = o.w + 'px';
  }

  function placePhotos(t) {
    // far texture: creeps upward a few percent over the whole journey
    deep.style.transform = `translate3d(${(-pmx * 14).toFixed(1)}px,${((.5 - ps) * H * .16 - pmy * 10).toFixed(1)}px,0)`;
    for (const o of OBJECTS) {
      if (!o.ready) continue;
      const d = (o.at - ps) * o.k;                         // viewports away from home
      const reach = o.wide || 1.25;
      const near = Math.abs(d) < reach;
      if (near !== o.shown) {
        o.shown = near;
        o.el.style.visibility = near ? 'visible' : 'hidden';
        o.el.classList.toggle('is-near', near);
      }
      if (!near) continue;
      const fade = o.wide ? 1 : clamp(1 - (Math.abs(d) - .5) / .7, 0, 1);
      const hx = small && o.mob ? o.mob[0] : o.x;
      const x = hx * W + d * (o.dx || 0) * W - pmx * o.depth * 46 - o.w / 2;
      const y = o.y * H + d * H - pmy * o.depth * 34 - o.h / 2;
      const r = o.rot + (STILL ? 0 : t * .001 * o.spin);
      o.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${r.toFixed(2)}deg)`;
      o.el.style.opacity = (o.op * fade * fade * (small ? .8 : 1)).toFixed(3);
    }
  }

  /* ------------------------------------------------------------------ shared canvas */
  const cv = document.createElement('canvas');
  cv.id = 'cosmos-fx';
  sky.appendChild(cv);
  const ctx = cv.getContext('2d');
  let dpr = 1;

  /* real asteroid cut-outs (alpha made from the black sky of the original frames) */
  const ROCKS = ['bennu', 'eros', 'gaspra', 'ida', 'vesta', 'phobos', 'deimos', 'mathilde'].map((n) => {
    const s = { img: new Image(), ok: false, soft: null, tiny: null, far: null };
    s.img.onload = () => {
      s.ok = true;
      s.soft = shrink(s.img, 120, .78, 3);  // out-of-focus and in shadow: a rock close to the lens
      s.tiny = shrink(s.img, 30, 0, 0);    // cheap sprite for belt pebbles
      s.far = shrink(s.img, 30, .38, 0);   // distant rocks catch less light
      if (STILL) requestStill();
    };
    s.img.onerror = () => { if (!s.retried) { s.retried = true; setTimeout(() => { s.img.src = `${DIR}rock-${n}.webp?r=1`; }, 1500); } };
    s.img.src = `${DIR}rock-${n}.webp`;
    return s;
  });
  /* small pre-rendered copy of a rock: optionally darkened (rocks stay opaque and hide the stars behind them,
     so distance is shown by light, not transparency) and optionally defocused */
  function shrink(img, px, shade, blur) {
    const c = document.createElement('canvas'), k = px / Math.max(img.naturalWidth, img.naturalHeight), pad = blur * 3;
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    c.width = w + pad * 2; c.height = h + pad * 2;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    if (blur && 'filter' in g) g.filter = `blur(${blur}px)`;
    else if (blur) {                       // no canvas filter (older Safari): blur by down- then up-scaling
      const t = shrink(img, 26, 0, 0); g.drawImage(t, pad, pad, w, h); blur = 0;
    }
    if (blur || !pad) g.drawImage(img, pad, pad, w, h);
    g.filter = 'none';
    if (shade) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(0,0,0,${shade})`; g.fillRect(0, 0, c.width, c.height); }
    return c;
  }

  /* glow sprites: one soft dot per tint, reused for meteor heads, sparks and star cores */
  function glowSprite(rgb, size) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), r = size / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.12, `rgba(${rgb},.95)`);
    gr.addColorStop(.38, `rgba(${rgb},.28)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return c;
  }
  /* a star with telescope diffraction spikes */
  function spikeSprite(rgb) {
    const S = 96, c = glowSprite(rgb, S), g = c.getContext('2d'), r = S / 2;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 2; i++) {
      const lg = i ? g.createLinearGradient(r, 0, r, S) : g.createLinearGradient(0, r, S, r);
      lg.addColorStop(0, `rgba(${rgb},0)`); lg.addColorStop(.5, `rgba(${rgb},.9)`); lg.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = lg;
      if (i) g.fillRect(r - .6, 0, 1.2, S); else g.fillRect(0, r - .6, S, 1.2);
    }
    return c;
  }
  const TINTS = ['255,255,255', '170,205,255', '255,214,160', '160,255,205', '255,170,130'];
  const GLOW = TINTS.map((c) => glowSprite(c, 64));
  const SPIKE = ['190,215,255', '255,222,180', '255,176,140', '235,240,255'].map(spikeSprite);

  let rocks = [], belt = [], dust = [], gems = [], meteors = [], sparks = [];
  let nextMeteor = 600, nextFireball = 5000;

  function populate() {
    const area = W * H / (1440 * 900);
    const nFar = small ? 10 : Math.round(clamp(20 * area, 14, 28));
    const nMid = small ? 2 : 4, nNear = small ? 1 : 2;
    rocks = [];
    const mk = (z, size, alpha, speed) => {
      const a = rnd(0, TAU);
      rocks.push({ s: (Math.random() * ROCKS.length) | 0, x: rnd(0, W), y: rnd(0, H), z, size, alpha,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * .6, rot: rnd(0, TAU), vr: rnd(.04, .22) * (Math.random() < .5 ? -1 : 1) * (1.4 - z), flip: Math.random() < .5 ? -1 : 1 });
    };
    for (let i = 0; i < nFar; i++) { const z = rnd(.08, .3); mk(z, rnd(6, 20), 1, rnd(3, 9)); }
    for (let i = 0; i < nMid; i++) { const z = rnd(.4, .62); mk(z, rnd(34, 76), 1, rnd(7, 15)); }
    for (let i = 0; i < nNear; i++) { const z = rnd(.9, 1.25); mk(z, rnd(200, 340) * (small ? .6 : 1), 1, rnd(12, 24)); }
    rocks.sort((a, b) => a.z - b.z);

    // asteroid belt: a diagonal river of pebbles that crosses the viewport around mid-page
    const nBelt = small ? 46 : Math.round(clamp(130 * area, 90, 170));
    belt = Array.from({ length: nBelt }, () => {
      const g = (Math.random() + Math.random() + Math.random()) / 3 - .5;   // bunch towards the centre line
      const big = Math.random() < .08;
      return { s: (Math.random() * ROCKS.length) | 0, u: Math.random(), v: g * 2, size: big ? rnd(20, 40) : rnd(3, 13),
        sp: rnd(.004, .012), rot: rnd(0, TAU), vr: rnd(-.5, .5), alpha: 1, z: rnd(.8, 1.2) };
    });

    dust = Array.from({ length: small ? 26 : 60 }, () => ({ x: rnd(0, W), y: rnd(0, H), z: rnd(.5, 1.5), r: rnd(.5, 1.3), a: rnd(.1, .3), vx: rnd(-5, 5), vy: rnd(-3, 3) }));
    gems = Array.from({ length: small ? 6 : 13 }, () => ({ x: rnd(0, W), y: rnd(0, H), z: rnd(.03, .09), size: rnd(14, 44), c: (Math.random() * SPIKE.length) | 0, ph: rnd(0, TAU), sp: rnd(.4, 1.3) }));
  }

  function size() {
    W = innerWidth; H = innerHeight; small = W < 720;
    base = Math.max(W, H * .85, 620);
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    OBJECTS.forEach(layoutPhoto);
    populate();
  }

  const wrap = (v, max, m) => ((((v + m) % (max + 2 * m)) + (max + 2 * m)) % (max + 2 * m)) - m;

  function sprite(img, x, y, w, rot, flip, alpha) {
    const h = w * img.height / img.width, c = Math.cos(rot) * dpr, s = Math.sin(rot) * dpr;
    ctx.setTransform(c * flip, s * flip, -s, c, x * dpr, y * dpr);
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  }

  function spawnMeteor(fire) {
    // most meteors share a radiant (a real shower), the rest are sporadics from anywhere
    const shower = Math.random() < .72;
    const ang = shower ? rnd(2.25, 2.7) : (Math.random() < .5 ? rnd(.35, 1.0) : rnd(2.0, 2.95));  // radians, heading downwards
    const sp = fire ? rnd(520, 760) : rnd(780, 1700);
    const dirx = Math.cos(ang), diry = Math.sin(ang);
    // start along the top edge or the upstream side edge
    let x, y;
    if (Math.random() < .68) { x = rnd(-.1, 1.1) * W - dirx * H * .15; y = -30; }
    else { x = dirx < 0 ? W + 30 : -30; y = rnd(0, .55) * H; }
    const tint = fire ? (Math.random() < .5 ? 3 : 2) : (Math.random() < .5 ? 0 : Math.random() < .6 ? 1 : Math.random() < .5 ? 2 : 3);
    meteors.push({ x, y, vx: dirx * sp, vy: diry * sp, age: 0, life: fire ? rnd(1.5, 2.2) : rnd(.45, 1.05),
      len: fire ? rnd(300, 460) : rnd(90, 260), w: fire ? rnd(2.6, 3.8) : rnd(.8, 1.9), tint, fire, peak: fire ? 1 : rnd(.55, 1) });
  }

  function drawMeteors(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const m of meteors) {
      m.age += dt; m.x += m.vx * dt; m.y += m.vy * dt;
      const k = m.age / m.life;
      // brighten fast, burn, fade: the light curve of a real meteor
      const a = m.peak * (k < .15 ? k / .15 : Math.pow(1 - (k - .15) / .85, 1.4));
      if (!(a > .004)) continue;
      const sp = Math.hypot(m.vx, m.vy), ux = m.vx / sp, uy = m.vy / sp;
      const len = m.len * Math.min(1, m.age * 5);
      const tx = m.x - ux * len, ty = m.y - uy * len, rgb = TINTS[m.tint];
      const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
      // toFixed: a tiny alpha would print as 1e-7, which is not a valid CSS colour
      g.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`); g.addColorStop(.12, `rgba(${rgb},${(a * .7).toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = m.w;
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke();
      if (m.fire) {   // wide soft wake + shed sparks
        ctx.lineWidth = m.w * 4; ctx.globalAlpha = .22;
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - ux * len * .6, m.y - uy * len * .6); ctx.stroke();
        if (Math.random() < .6) sparks.push({ x: m.x, y: m.y, vx: m.vx * .25 + rnd(-60, 60), vy: m.vy * .25 + rnd(-60, 60), life: rnd(.3, .8), age: 0, tint: m.tint });
        if (!m.popped && k > .82) { m.popped = true; for (let i = 0; i < 14; i++) sparks.push({ x: m.x, y: m.y, vx: m.vx * .3 + rnd(-170, 170), vy: m.vy * .3 + rnd(-170, 170), life: rnd(.4, 1), age: 0, tint: m.tint }); }
      }
      const hs = (m.fire ? 46 : 12 + m.w * 7) * (.6 + a * .6);
      ctx.globalAlpha = Math.min(1, a * 1.2);
      ctx.drawImage(GLOW[m.tint], m.x - hs / 2, m.y - hs / 2, hs, hs);
    }
    for (const s of sparks) {
      s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= .97; s.vy *= .97;
      const a = 1 - s.age / s.life; if (a <= 0) continue;
      ctx.globalAlpha = a * .9; ctx.drawImage(GLOW[s.tint], s.x - 4, s.y - 4, 8, 8);
    }
    meteors = meteors.filter((m) => m.age < m.life && m.x > -500 && m.x < W + 500 && m.y < H + 500);
    sparks = sparks.filter((s) => s.age < s.life);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  function draw(t, dt, dScroll) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const rush = Math.min(Math.abs(vel), 16);

    // coloured stars with diffraction spikes: far, almost fixed, slowly breathing
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (const s of gems) {
      s.y = wrap(s.y - dScroll * s.z, H, 50);
      const tw = STILL ? .8 : .62 + .38 * Math.sin(t * .001 * s.sp + s.ph), d = s.size * (.8 + tw * .3);
      ctx.globalAlpha = tw * .8;
      ctx.drawImage(SPIKE[s.c], s.x - pmx * 6 - d / 2, s.y - pmy * 6 - d / 2, d, d);
    }
    // dust motes close to the lens: streak with scroll speed
    ctx.fillStyle = '#cfd6e6';
    for (const m of dust) {
      m.x = wrap(m.x + m.vx * dt, W, 10); m.y = wrap(m.y + m.vy * dt - dScroll * m.z * .55, H, 10);
      ctx.globalAlpha = m.a;
      ctx.fillRect(m.x - pmx * m.z * 30, m.y - pmy * m.z * 30, m.r, m.r + rush * m.z * .9);
    }
    ctx.globalCompositeOperation = 'source-over';

    // asteroid belt, anchored mid-page and travelling fast (it is close)
    const bd = (BELT.at - ps) * 8.5, cy = H * .5 + bd * H;
    if (Math.abs(bd) < 1.25) {
      const x0 = -.12 * W, x1 = 1.12 * W, slope = -.2 * H, thick = Math.min(H * .2, 170);
      for (const b of belt) {
        b.u = (b.u + b.sp * dt + 1) % 1; b.rot += b.vr * dt * (1 + rush * .08);
        const S = ROCKS[b.s]; if (!S.ok) continue;
        const x = x0 + (x1 - x0) * b.u - pmx * 40 * b.z;
        const y = cy + (b.u - .5) * slope * 2 + b.v * thick + (b.z - 1) * bd * H * .35 - pmy * 30 * b.z;
        if (y < -50 || y > H + 50) continue;
        sprite(b.size > 16 ? S.img : S.tiny, x, y, b.size, b.rot, 1, b.alpha);
      }
    }

    // free-drifting rocks, far to near
    for (const r of rocks) {
      const S = ROCKS[r.s]; if (!S.ok) continue;
      const m = r.size * .8;
      r.x = wrap(r.x + r.vx * dt, W, m);
      r.y = wrap(r.y + r.vy * dt - dScroll * r.z * .5, H, m);
      r.rot += r.vr * dt * (1 + rush * .12);
      const close = r.z > .85;
      if (close && W < 700) continue;                         // no big defocused rocks over text on phones
      const src = close ? S.soft : r.size < 26 ? S.far : S.img;
      sprite(src, r.x - pmx * r.z * 60, r.y - pmy * r.z * 44, r.size, r.rot, r.flip, close ? r.alpha * .55 : r.alpha);
    }

    if (!STILL) {
      nextMeteor -= dt * 1000; nextFireball -= dt * 1000;
      if (nextMeteor <= 0) {
        spawnMeteor(false);
        if (Math.random() < .18) spawnMeteor(false);            // pairs happen in showers
        nextMeteor = (small ? rnd(700, 1900) : rnd(280, 1150));
      }
      if (nextFireball <= 0) { spawnMeteor(true); nextFireball = rnd(11000, 21000); }
      drawMeteors(dt);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ loop */
  let last = 0, running = false, anchored = -1e9;
  function frame(t) {
    if (document.hidden) { running = false; return; }
    const dt = Math.min(.05, (t - last) / 1000 || .016); last = t;
    const sy = scrollY, dScroll = sy - lastScroll; lastScroll = sy;
    vel += (dScroll - vel) * .2;
    if (t - anchored > 900) { anchored = t; anchor(); }   // sections can grow (e.g. the ledger expanding)
    p = progress(); ps += (p - ps) * Math.min(1, dt * 7);
    pmx += (mx - pmx) * Math.min(1, dt * 3); pmy += (my - pmy) * Math.min(1, dt * 3);
    placePhotos(t);
    draw(t, dt, dScroll);
    requestAnimationFrame(frame);
  }
  function start() { if (!running && !STILL && !document.hidden) { running = true; last = performance.now(); lastScroll = scrollY; requestAnimationFrame(frame); } }

  /* reduced motion: no loop at all, just one still frame, refreshed when the page is scrolled or resized */
  let stillQueued = false;
  function requestStill() {
    if (stillQueued) return; stillQueued = true;
    requestAnimationFrame(() => {
      stillQueued = false;
      const sy = scrollY, d = sy - lastScroll; lastScroll = sy; vel = 0;
      anchor(); p = ps = progress(); placePhotos(0); draw(0, 0, d);
    });
  }

  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (innerWidth !== W || Math.abs(innerHeight - H) > 120) { size(); if (STILL) requestStill(); } }, 150);
  });
  addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') return; mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; }, { passive: true });
  document.addEventListener('visibilitychange', start);

  size();
  anchor();
  p = ps = progress();
  if (STILL) { addEventListener('scroll', requestStill, { passive: true }); requestStill(); }
  else start();
})();
