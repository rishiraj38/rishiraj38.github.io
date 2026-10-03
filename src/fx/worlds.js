/* =====================================================================
   fx/worlds.js
   A. Project planets: each card's <i data-planet> becomes a lit, rotating
      sphere sampled per pixel from a real equirectangular map, with rings,
      moons and an atmosphere in the card's accent colour.
   B. Skills constellation: an interactive star map in #constellation.
   No libraries. Both parts sleep while off screen or in a hidden tab, and
   draw a single still frame when the visitor prefers reduced motion.
   ===================================================================== */

/* ------------------------------------------------------------------ */
/* A. project planets                                                  */
/* ------------------------------------------------------------------ */
(function worlds() {
  const STILL = !!(window.SPACE && window.SPACE.STILL);
  const DIR = 'assets/worlds/';
  const TW = 1024, TH = 512;                 // every map is 1024 x 512 (longitude wraps with & 1023)
  const TAU = Math.PI * 2;

  /* sun: optional light direction (x right, y down, z towards the viewer).
     tilt: axis roll on screen (deg, clockwise). lean: north pole tipped towards the viewer (deg).
     period: seconds per rotation (negative = retrograde). atm: atmosphere strength. spec: glint.
     moons: r in planet radii, flat = how edge-on the orbit looks, rot = orbit roll (deg), per = seconds, size = fraction of the diameter. */
  const WORLDS = [
    { tex: 'saturn.jpg', tilt: 20, lean: 17.5, period: 30, atm: .55, spec: 0, ring: true,
      moons: [{ r: 2.3, flat: .3, rot: 20, per: 26, size: .1, ph: .6, tint: '#e3c9a0' }, { r: 2.62, flat: .3, rot: 20, per: 43, size: .06, ph: 3.4, tint: '#c9d6ff' }] },
    { tex: 'venus.jpg', tilt: -8, lean: 8, period: -64, atm: 1.25, spec: 0,
      moons: [{ r: 1.42, flat: .3, rot: 30, per: 21, size: .085, ph: 2.2, tint: '#ffc9dd' }] },
    { tex: 'earth.jpg', night: 'earth-night.jpg', tilt: 23, lean: 12, period: 34, atm: 1.1, spec: .55, sun: [-.84, -.4, .3],
      moons: [{ r: 1.5, flat: .28, rot: 24, per: 24, size: .15, ph: 1.1, tint: '' }] },
    { tex: 'enceladus.jpg', tilt: 12, lean: 6, period: 42, atm: .7, spec: .3,
      moons: [{ r: 1.36, flat: .26, rot: 34, per: 17, size: .07, ph: 0, tint: '#bff5dd' }, { r: 1.7, flat: .26, rot: 34, per: 31, size: .105, ph: 2.6, tint: '#e9fff6' }] },
    { tex: 'jupiter.jpg', tilt: 6, lean: 5, period: 22, atm: .6, spec: 0,
      moons: [{ r: 1.34, flat: .2, rot: 14, per: 15, size: .085, ph: 4, tint: '#f1dc7c' }, { r: 1.68, flat: .2, rot: 14, per: 27, size: .1, ph: 1.4, tint: '#e8e2d6' }] },
    { tex: 'mars.jpg', tilt: 25, lean: 8, period: 38, atm: .5, spec: .06,
      moons: [{ r: 1.3, flat: .24, rot: 28, per: 12, size: .06, ph: 1, tint: '#b79c8a' }, { r: 1.62, flat: .24, rot: 28, per: 25, size: .048, ph: 3.9, tint: '#a8a29a' }] }
  ];

  const orbs = Array.from(document.querySelectorAll('#projects .orb[data-planet]'));
  if (!orbs.length) return;

  const el = (tag, cls) => { const n = document.createElement(tag); n.className = cls; return n; };
  const hexRGB = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
    const v = m ? parseInt(m[1], 16) : 0x8B6CFF;
    return [v >> 16 & 255, v >> 8 & 255, v & 255];
  };

  /* ---- build the DOM for each world ---- */
  const items = orbs.map((orb) => {
    const def = WORLDS[+orb.dataset.planet % WORLDS.length];
    const card = orb.closest('article');
    const sys = el('span', 'w-sys');
    const globe = el('span', 'w-globe');
    const canvas = document.createElement('canvas');
    globe.append(canvas, el('span', 'w-shade'));
    sys.append(el('span', 'w-halo'));
    if (def.ring) {
      const back = el('span', 'w-ring w-ring-back'); back.append(document.createElement('i'));
      const front = el('span', 'w-front'); front.append(el('span', 'w-ring w-ring-shadow'), el('span', 'w-ring w-ring-front'));
      sys.append(back, globe, front);
      orb.style.setProperty('--ring-tilt', def.tilt + 'deg');
      orb.style.setProperty('--ring-open', Math.sin(def.lean * Math.PI / 180).toFixed(3));
    } else sys.append(globe);
    const moons = def.moons.map((m) => {
      const node = el('span', 'w-moon');
      node.style.setProperty('--m', (m.size * 100).toFixed(1) + '%');
      if (m.tint) node.style.setProperty('--mc', m.tint);
      sys.append(node);
      return { m, node };
    });
    orb.setAttribute('aria-hidden', 'true');
    orb.classList.add('world');
    orb.append(sys);
    const w = {
      orb, card, def, canvas, moons, ctx: null, tex: null, night: null, tab: null, img: null,
      rgb: hexRGB(card ? getComputedStyle(card).getPropertyValue('--c') : ''),
      size: 0, shift: Math.random() * TW, speed: 1, boost: 1, visible: false, loading: false, t: Math.random() * 40
    };
    if (card) {
      const on = () => { w.boost = 6; kick(); }, off = () => { w.boost = 1; };
      card.addEventListener('pointerenter', on); card.addEventListener('pointerleave', off);
      card.addEventListener('focusin', on); card.addEventListener('focusout', off);
    }
    return w;
  });

  /* ---- textures: loaded when a card comes near the viewport ---- */
  const pixels = (src) => new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = TW; c.height = TH;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(im, 0, 0, TW, TH);
        resolve(x.getImageData(0, 0, TW, TH).data);   // throws on file:// (tainted) -> CSS globe stays
      } catch (e) { reject(e); }
    };
    im.onerror = reject;
    im.src = DIR + src;
  });

  function load(w) {
    if (w.loading) return;
    w.loading = true;
    w.orb.classList.add('w-on');               // lets the CSS stand-in fetch its background
    Promise.all([pixels(w.def.tex), w.def.night ? pixels(w.def.night) : null]).then(([tex, night]) => {
      w.tex = tex; w.night = night;
      w.ctx = w.canvas.getContext('2d');
      build(w);
      render(w);
      w.orb.classList.add('w-live');
      kick();
    }).catch(() => { /* keep the CSS globe */ });
  }

  /* ---- per-pixel lookup tables: where on the map each screen pixel lands, and how it is lit ---- */
  function build(w) {
    const css = w.orb.offsetWidth || 150;
    const N = Math.min(400, Math.round(css * Math.min(2, window.devicePixelRatio || 1)));
    w.size = css;
    w.canvas.width = w.canvas.height = N;
    const img = w.ctx.createImageData(N, N), R = N / 2 - 1, c = N / 2 - .5;
    const tilt = w.def.tilt * Math.PI / 180, lean = w.def.lean * Math.PI / 180;
    const ct = Math.cos(tilt), st = Math.sin(tilt), cl = Math.cos(lean), sl = Math.sin(lean);
    // sun: up, left and towards the viewer. H is the half vector for the glint.
    let L = w.def.sun || [-.6, -.5, .62]; const ll = Math.hypot(...L); L = L.map((v) => v / ll);
    let H = [L[0], L[1], L[2] + 1]; const hl = Math.hypot(...H); H = H.map((v) => v / hl);
    const [cr, cg, cb] = w.rgb, atm = w.def.atm, spec = w.def.spec;

    let n = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (Math.hypot(x - c, y - c) < R + .5) n++;
    const off = new Int32Array(n), row = new Int32Array(n), lon = new Int32Array(n);
    const sh = new Float32Array(n), add = new Float32Array(n * 3), nsh = w.night ? new Float32Array(n) : null;
    let p = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d >= R + .5) continue;
      const o = (y * N + x) * 4;
      // unit sphere normal under this pixel (clamped just inside the limb)
      const k = d > R * .999 ? R * .999 / d : 1;
      const nx = (x - c) / R * k, ny = (y - c) / R * k, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      // screen -> planet frame: undo the axis roll, then the lean
      const xr = nx * ct + ny * st, yr = -nx * st + ny * ct;
      const yp = yr * cl - nz * sl, zp = yr * sl + nz * cl;
      const lat = Math.asin(Math.max(-1, Math.min(1, yp)));
      row[p] = Math.max(0, Math.min(TH - 1, Math.round((lat / Math.PI + .5) * TH - .5))) * TW;
      lon[p] = Math.round(Math.atan2(xr, zp) / TAU * TW);
      off[p] = o;
      // light
      const ndl = nx * L[0] + ny * L[1] + nz * L[2];
      const day = Math.max(0, Math.min(1, (ndl + .1) / .55));                 // soft terminator
      const lit = day * day * (3 - 2 * day) * (.42 + .58 * Math.max(0, ndl)) * (.72 + .28 * nz);
      sh[p] = .035 + 1.18 * lit;
      // atmosphere: accent-coloured fresnel rim, strongest on the day side, a whisper at night
      const fres = Math.pow(1 - nz, 2.6) * atm;
      const rim = fres * (.16 + 1.25 * lit) * .85;
      const gl = spec ? Math.pow(Math.max(0, nx * H[0] + ny * H[1] + nz * H[2]), 48) * spec * 255 : 0;
      add[p * 3] = cr * rim + gl; add[p * 3 + 1] = cg * rim + gl; add[p * 3 + 2] = cb * rim + gl;
      if (nsh) { const dk = Math.max(0, Math.min(1, (.12 - ndl) / .3)); nsh[p] = dk * dk * 1.9 * (.5 + .5 * nz); }
      img.data[o + 3] = Math.round(255 * Math.max(0, Math.min(1, R + .5 - d)));   // antialiased edge
      p++;
    }
    w.tab = { n, off, row, lon, sh, add, nsh };
    w.img = img;
  }

  /* ---- one frame: look every pixel up in the map, shifted by the rotation ---- */
  function render(w) {
    const { n, off, row, lon, sh, add, nsh } = w.tab, tex = w.tex, night = w.night, out = w.img.data;
    const s = ((w.shift % TW) + TW) % TW, u0 = Math.floor(s), f = s - u0, g = 1 - f;   // blend two texels: smooth sub-texel spin
    for (let p = 0, q = 0; p < n; p++, q += 3) {
      const l = lon[p] - u0, r0 = row[p];
      const a = (r0 + (l & 1023)) << 2, b = (r0 + ((l - 1) & 1023)) << 2, o = off[p], k = sh[p];
      let r = (tex[a] * g + tex[b] * f) * k + add[q];
      let gr = (tex[a + 1] * g + tex[b + 1] * f) * k + add[q + 1];
      let bl = (tex[a + 2] * g + tex[b + 2] * f) * k + add[q + 2];
      if (nsh) { const m = nsh[p]; if (m > 0) { r += night[a] * m; gr += night[a + 1] * m * .86; bl += night[a + 2] * m * .6; } }
      out[o] = r; out[o + 1] = gr; out[o + 2] = bl;
    }
    w.ctx.putImageData(w.img, 0, 0);
  }

  /* ---- moons: an ellipse around the globe, behind it for half of each orbit ---- */
  function placeMoons(w) {
    const R = (w.size || w.orb.offsetWidth) / 2;
    for (const { m, node } of w.moons) {
      const a = m.ph + w.t * TAU / m.per, rot = m.rot * Math.PI / 180;
      const lx = Math.cos(a) * m.r * R, ly = Math.sin(a) * m.r * R * m.flat, depth = Math.sin(a);
      const x = lx * Math.cos(rot) - ly * Math.sin(rot), y = lx * Math.sin(rot) + ly * Math.cos(rot);
      node.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${(1 + .14 * depth).toFixed(3)})`;
      const z = depth > 0 ? 4 : 1;
      if (node._z !== z) { node._z = z; node.style.zIndex = z; }
    }
  }

  /* ---- loop: only visible worlds, canvases at ~30 fps on alternating frames ---- */
  let raf = 0, last = 0, tick = 0;
  function frame(now) {
    raf = 0;
    const dt = Math.min(.05, (now - last) / 1000 || 0); last = now; tick++;
    let live = false;
    items.forEach((w, i) => {
      if (!w.visible) return;
      live = true;
      w.speed += (w.boost - w.speed) * Math.min(1, dt * 3.5);
      w.t += dt * (.6 + .4 * w.speed);
      w.shift += dt * w.speed * TW / w.def.period;
      placeMoons(w);
      if (w.tab && (tick + i) % 2 === 0) render(w);
    });
    if (live && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && !STILL && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  items.forEach(placeMoons);

  if ('IntersectionObserver' in window) {
    const near = new IntersectionObserver((es) => es.forEach((e) => {
      const w = items.find((it) => it.orb === e.target);
      if (!w) return;
      w.visible = e.isIntersecting;
      if (e.isIntersecting) { load(w); kick(); }
    }), { rootMargin: '240px 0px 240px 0px' });
    orbs.forEach((o) => near.observe(o));
  } else items.forEach((w) => { w.visible = true; load(w); });

  document.addEventListener('visibilitychange', kick);

  // breakpoints change the planet size: rebuild tables at the new resolution
  let rz = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => items.forEach((w) => {
      const css = w.orb.offsetWidth;
      if (css && css !== w.size) { w.size = css; if (w.tex) { build(w); render(w); } placeMoons(w); }
    }), 180);
  });
})();

/* ------------------------------------------------------------------ */
/* B. skills constellation                                             */
/* ------------------------------------------------------------------ */
(function constellation() {
  const root = document.getElementById('constellation');
  if (!root) return;
  const STILL = !!(window.SPACE && window.SPACE.STILL);
  const TAU = Math.PI * 2;

  /* Stars are placed in a unit box per constellation ([x, y, magnitude]); `edges` are the lines, in drawing order. */
  const GROUPS = [
    { name: 'Languages', color: '#FFB347',
      stars: [['TypeScript', .1, .3, 1], ['JavaScript', .6, .02, .7], ['Go', .95, .62, 1], ['Python', .38, .98, .9]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 0]] },
    { name: 'Frontend', color: '#FF7AB6',
      stars: [['React', .5, .46, 1], ['Next.js', .12, .08, 1], ['Redux Toolkit', .92, .16, .6], ['Tailwind CSS', .8, .96, .75], ['Framer Motion', .1, .88, .6]],
      edges: [[1, 0], [0, 2], [0, 3], [3, 4], [4, 0]] },
    { name: 'Backend', color: '#A990FF',
      stars: [['Node.js', .02, .34, 1], ['Express', .2, .04, .75], ['Hono', .4, .3, .7], ['Prisma', .54, .62, .7], ['PostgreSQL', .8, .42, 1], ['MySQL', .99, .74, .6], ['MongoDB', .76, .98, .7], ['Redis', .44, .96, .7]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 3]] },
    { name: 'Cloud native', color: '#5FD8FF',
      stars: [['Docker', .04, .56, 1], ['Kubernetes', .26, .1, 1], ['OCI', .5, .5, .9], ['ORAS', .42, .98, .7], ['Cloudflare Workers', .72, .04, .7], ['AWS', .97, .42, .7], ['GitHub Actions', .78, .9, .75]],
      edges: [[0, 1], [1, 4], [4, 5], [5, 6], [6, 2], [2, 1], [2, 3]] },
    { name: 'Data and ML', color: '#5BE3A1',
      stars: [['Pandas', .1, .2, .8], ['NumPy', .66, .02, .75], ['scikit-learn', .9, .6, .7], ['TensorFlow', .26, .98, .9]],
      edges: [[0, 1], [1, 2], [2, 3]] }
  ];

  /* where each constellation's box sits, as fractions of the map (wide) or stacked rows (narrow) */
  function layout(W) {
    if (W >= 900) return { H: 540, boxes: [
      [.05, .12, .17, .26], [.05, .57, .23, .27], [.33, .09, .30, .40], [.43, .64, .34, .22], [.79, .13, .15, .30]
    ].map(([x, y, w, h]) => ({ x: x * W, y: y * 540, w: w * W, h: h * 540 })) };
    if (W >= 640) {
      const padX = 56, rows = [[0, 1], [2], [3, 4]], hs = [190, 220, 200], gap = 96, split = [[.4, .6], [1], [.6, .4]];
      const boxes = []; let y = 46;
      rows.forEach((r, ri) => {
        let x = 0;
        r.forEach((gi, ci) => { const fw = split[ri][ci] * W; boxes[gi] = { x: x + padX, y, w: fw - padX * 2, h: hs[ri] }; x += fw; });
        y += hs[ri] + gap;
      });
      return { H: y - 22, boxes };
    }
    const hs = [150, 180, 250, 240, 150], gap = 92, padX = Math.max(30, W * .11);
    const boxes = []; let y = 40;
    hs.forEach((h, i) => { boxes.push({ x: padX, y, w: W - padX * 2, h }); y += h + gap; });
    return { H: y - 24, boxes };
  }

  /* ---- DOM: real, readable text (names are list items, constellation names are buttons) ---- */
  root.classList.add('cs');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Skills, drawn as five constellations');
  const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  const map = document.createElement('ul'); map.className = 'cs-map';
  const hint = document.createElement('span'); hint.className = 'cs-hint'; hint.setAttribute('aria-hidden', 'true'); hint.textContent = 'Hover a star';
  let seed = 11;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };   // repeatable sky

  const stars = [];
  GROUPS.forEach((g, gi) => {
    const li = document.createElement('li'); li.className = 'cs-g'; li.style.setProperty('--gc', g.color);
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'cs-title';
    btn.append(g.name); const cnt = document.createElement('b'); cnt.textContent = String(g.stars.length).padStart(2, '0'); cnt.setAttribute('aria-hidden', 'true'); btn.append(cnt);
    btn.setAttribute('aria-label', `${g.name}: ${g.stars.length} skills`);
    const ul = document.createElement('ul');
    g.li = li; g.btn = btn; g.gi = gi; g.alpha = 1; g.glow = 0;
    g.s = g.stars.map(([name, u, v, mag], i) => {
      const label = document.createElement('li'); label.className = 'cs-s'; label.textContent = name; label.style.setProperty('--i', stars.length);
      ul.append(label);
      const s = { name, u, v, mag, g, gi, i, label, x: 0, y: 0, ph: rand() * TAU, tw: .7 + rand() * 1.6, n: stars.length };
      label._star = s; stars.push(s);
      return s;
    });
    btn._group = g;
    li.append(btn, ul); map.append(li);
  });
  root.append(canvas, map, hint);

  /* ---- sprites: one soft glow per colour ---- */
  const sprite = (color, spikes) => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, spikes ? 40 : 64);
    gr.addColorStop(0, '#fff'); gr.addColorStop(.08, '#fff'); gr.addColorStop(.2, color + 'cc'); gr.addColorStop(.5, color + '30'); gr.addColorStop(1, color + '00');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    if (spikes) {                              // diffraction spikes that fade to nothing at the tips
      for (const [x1, y1, x2, y2] of [[0, 64, 128, 64], [64, 0, 64, 128]]) {
        const lg = x.createLinearGradient(x1, y1, x2, y2);
        lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.5, 'rgba(255,255,255,.85)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
        x.strokeStyle = lg; x.lineWidth = 1.4; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke();
      }
    }
    return c;
  };
  GROUPS.forEach((g) => { g.sprite = sprite(g.color, false); g.flare = sprite(g.color, true); });

  /* ---- layout + label placement ---- */
  let W = 0, H = 0, dpr = 1, dust = [], edges = [];
  const hits = (r, q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y;
  const segHits = (e, r) => {               // does a line cross a label box? sampled every ~4px
    const n = Math.max(2, Math.ceil(e.len / 4));
    for (let k = 0; k <= n; k++) { const x = e.a.x + (e.b.x - e.a.x) * k / n, y = e.a.y + (e.b.y - e.a.y) * k / n; if (x > r.x - 2 && x < r.x + r.w + 2 && y > r.y - 2 && y < r.y + r.h + 2) return true; }
    return false;
  };

  function relayout() {
    const w = root.clientWidth;
    if (!w) return;
    const L = layout(w);
    W = w; H = L.H; root.style.height = H + 'px';
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);

    edges = [];
    GROUPS.forEach((g, gi) => {
      const b = L.boxes[gi];
      g.s.forEach((s) => { s.x = b.x + s.u * b.w; s.y = b.y + s.v * b.h; });
      g.cx = b.x + b.w / 2; g.cy = b.y + b.h / 2; g.rad = Math.hypot(b.w, b.h) * .62;
      g.e = g.edges.map(([a, c]) => { const e = { a: g.s[a], b: g.s[c], g }; e.len = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y); edges.push(e); return e; });
      g.len = g.e.reduce((t, e) => t + e.len, 0);
    });

    // greedy label placement: try eight spots round each star, keep the cheapest
    const placed = [], pad = 8;
    const starBoxes = stars.map((s) => ({ x: s.x - 8, y: s.y - 8, w: 16, h: 16, s }));
    const cost = (r, self) => {
      let c = 0;
      if (r.x < pad) c += 400 + (pad - r.x) * 20; if (r.x + r.w > W - pad) c += 400 + (r.x + r.w - W + pad) * 20;
      if (r.y < pad) c += 400; if (r.y + r.h > H - pad) c += 400;
      for (const q of placed) if (hits(r, { x: q.x - 5, y: q.y - 3, w: q.w + 10, h: q.h + 6 })) c += 1000;
      for (const q of starBoxes) if (q.s !== self && hits(r, q)) c += 600;
      for (const e of edges) if (segHits(e, r)) c += e.a === self || e.b === self ? 260 : 420;
      return c;
    };
    // constellation names first: centred under their stars
    GROUPS.forEach((g) => {
      const bw = g.btn.offsetWidth, bh = g.btn.offsetHeight;
      const lo = Math.max(...g.s.map((s) => s.y));
      const r = { x: Math.max(pad, Math.min(W - pad - bw, g.cx - bw / 2)), y: lo + 40, w: bw, h: bh };
      g.btn.style.transform = `translate(${Math.round(r.x)}px,${Math.round(r.y)}px)`;
      placed.push(r);
    });
    stars.forEach((s) => {
      const lw = s.label.offsetWidth, lh = s.label.offsetHeight, gap = s.mag >= .9 ? 15 : 11;
      const mid = Math.max(pad, Math.min(W - pad - lw, s.x - lw / 2));
      const spots = [
        [s.x + gap, s.y - lh / 2, 0], [s.x - gap - lw, s.y - lh / 2, 1],
        [mid, s.y + gap, 3], [mid, s.y - gap - lh, 3],
        [s.x + gap - 2, s.y - lh - 3, 5], [s.x + gap - 2, s.y + 4, 5],
        [s.x - gap + 2 - lw, s.y - lh - 3, 6], [s.x - gap + 2 - lw, s.y + 4, 6],
        [mid, s.y + gap + 10, 20], [mid, s.y - gap - lh - 10, 20]
      ];
      let best = null, bc = Infinity;
      for (const [x, y, pref] of spots) { const r = { x, y, w: lw, h: lh }; const c = cost(r, s) + pref; if (c < bc) { bc = c; best = r; } }
      placed.push(best); s.box = best;
      s.label.style.transform = `translate(${Math.round(best.x)}px,${Math.round(best.y)}px)`;
    });

    // background star dust
    seed = 97; dust = [];
    const count = Math.round(W * H / 2400);
    for (let i = 0; i < count; i++) dust.push({ x: rand() * W, y: rand() * H, r: .35 + rand() * rand() * 1.3, a: .15 + rand() * .55, ph: rand() * TAU, tw: .4 + rand() * 1.8, hue: rand() });
    draw(performance.now());
  }

  /* ---- interaction: a star, its name, or the constellation's name lights the group ---- */
  let active = null, hot = null, sticky = null, px = 0, py = 0, tx = 0, ty = 0;
  function setActive(g, s) {
    if (g === active && s === hot) return;
    if (hot) hot.label.classList.remove('is-hot');
    if (active) active.li.classList.remove('is-active');
    active = g || null; hot = s || null;
    if (active) active.li.classList.add('is-active');
    if (hot) hot.label.classList.add('is-hot');
    root.classList.toggle('has-active', !!active);
    if (STILL) draw(performance.now()); else kick();
  }
  function pick(e) {
    const t = e.target, b = root.getBoundingClientRect(), x = e.clientX - b.left - ox, y = e.clientY - b.top - oy;
    if (t.closest) {
      const lab = t.closest('.cs-s'); if (lab && lab._star) return [lab._star.g, lab._star];
      const btn = t.closest('.cs-title'); if (btn && btn._group) return [btn._group, null];
    }
    let best = null, bd = 34 * 34;
    for (const s of stars) { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; best = s; } }
    return best ? [best.g, best] : [null, null];
  }
  root.addEventListener('pointermove', (e) => {
    const b = root.getBoundingClientRect();
    tx = ((e.clientX - b.left) / b.width - .5) * 2; ty = ((e.clientY - b.top) / b.height - .5) * 2;
    if (e.pointerType === 'touch') return;
    const [g, s] = pick(e);
    setActive(g || sticky, s);
  });
  root.addEventListener('pointerleave', () => { tx = ty = 0; setActive(sticky, null); });
  root.addEventListener('click', (e) => {     // tap / click pins a constellation, tap again (or empty sky) releases it
    const [g, s] = pick(e);
    sticky = g && g !== sticky ? g : null;
    setActive(sticky, sticky ? s : null);
  });
  GROUPS.forEach((g) => {
    g.btn.addEventListener('focus', () => setActive(g, null));
    g.btn.addEventListener('blur', () => setActive(sticky, null));
  });

  /* ---- drawing ---- */
  let t0 = -1, ox = 0, oy = 0, shoot = null, nextShoot = 0;
  const ease = (v) => { v = Math.max(0, Math.min(1, v)); return 1 - Math.pow(1 - v, 3); };

  function draw(now) {
    const t = now / 1000, since = t0 < 0 ? (STILL ? 99 : -1) : (now - t0) / 1000;
    // slow drift of the whole chart plus a little pointer parallax
    if (!STILL) {
      px += (tx - px) * .05; py += (ty - py) * .05;
      const amp = W < 640 ? 5 : 11;
      ox = Math.sin(t / 9) * amp + Math.sin(t / 3.7) * 2 - px * 9; oy = Math.cos(t / 7) * amp * .6 - py * 7;
      map.style.transform = `translate3d(${ox.toFixed(2)}px,${oy.toFixed(2)}px,0)`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // dust (drifts less than the chart: depth)
    for (const d of dust) {
      const a = d.a * (STILL ? 1 : .6 + .4 * Math.sin(t * d.tw + d.ph));
      ctx.globalAlpha = a * (active ? .6 : 1);
      ctx.fillStyle = d.hue > .86 ? '#FFD9A0' : d.hue > .7 ? '#BFE9FF' : '#DCD8FF';
      ctx.beginPath(); ctx.arc(d.x + ox * .35, d.y + oy * .35, d.r, 0, TAU); ctx.fill();
    }

    ctx.save(); ctx.translate(ox, oy);
    for (const g of GROUPS) {
      const target = active ? (g === active ? 1 : .2) : .86, gt = g === active ? 1 : 0;
      if (STILL) { g.alpha = target; g.glow = gt; } else { g.alpha += (target - g.alpha) * .12; g.glow += (gt - g.glow) * .1; }
      const start = since - g.gi * .28;                       // constellations draw in one after another
      const p = since < 0 ? 0 : ease(start / 1.9);

      // faint nebula behind the group
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (.05 + .1 * g.glow) * g.alpha * Math.min(1, Math.max(0, start + .4));
      if (ctx.globalAlpha > .002) ctx.drawImage(g.sprite, g.cx - g.rad, g.cy - g.rad, g.rad * 2, g.rad * 2);

      // lines, drawn along their length as p grows
      let budget = g.len * p;
      ctx.lineCap = 'round'; ctx.strokeStyle = g.color;
      for (const e of g.e) {
        if (budget <= 0) break;
        const k = Math.min(1, budget / e.len); budget -= e.len;
        // stop the stroke short of each star so the star reads as a point
        const ux = (e.b.x - e.a.x) / e.len, uy = (e.b.y - e.a.y) / e.len, m = Math.min(9, e.len * .2);
        const x1 = e.a.x + ux * m, y1 = e.a.y + uy * m, d = Math.max(0, e.len * k - m * (k === 1 ? 2 : 1));
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + ux * d, y1 + uy * d);
        if (g.glow > .02) { ctx.globalAlpha = .16 * g.glow * g.alpha; ctx.lineWidth = 5; ctx.stroke(); }
        ctx.globalAlpha = (.34 + .5 * g.glow) * g.alpha; ctx.lineWidth = 1; ctx.stroke();
        if (k < 1) { ctx.globalAlpha = g.alpha; ctx.drawImage(g.sprite, x1 + ux * d - 9, y1 + uy * d - 9, 18, 18); }   // the pen tip
      }
      // a pulse of light running round the lit constellation
      if (g.glow > .05 && !STILL && g.len) {
        let at = (t * 150) % g.len;
        for (const e of g.e) { if (at <= e.len) { ctx.globalAlpha = g.glow; ctx.drawImage(g.sprite, e.a.x + (e.b.x - e.a.x) * at / e.len - 11, e.a.y + (e.b.y - e.a.y) * at / e.len - 11, 22, 22); break; } at -= e.len; }
      }

      // stars
      for (const s of g.s) {
        const born = since < 0 ? 0 : ease((since - s.n * .045) / .7);
        if (born <= 0) continue;
        const tw = STILL ? 1 : .78 + .22 * Math.sin(t * s.tw + s.ph);
        const isHot = s === hot, size = (15 + 17 * s.mag) * (.6 + .4 * born) * (isHot ? 1.6 : 1 + .25 * g.glow);
        ctx.globalAlpha = Math.min(1, born * tw * (.3 + .7 * g.alpha));
        if (s.mag >= .9 || isHot) { const f = size * 1.6 * (.9 + .1 * tw); ctx.drawImage(g.flare, s.x - f, s.y - f, f * 2, f * 2); }   // bright ones get spikes
        else ctx.drawImage(g.sprite, s.x - size, s.y - size, size * 2, size * 2);
        if (isHot) { ctx.globalAlpha = .8; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(s.x, s.y, 13 + 2 * Math.sin(t * 4), 0, TAU); ctx.stroke(); }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // an occasional shooting star
    if (!STILL && since > 2) {
      if (!shoot && t > nextShoot) {
        const dir = rand() > .5 ? 1 : -1, ang = (.18 + rand() * .3);
        shoot = { x: W * (.5 - dir * (.15 + rand() * .3)), y: H * rand() * .45, vx: Math.cos(ang) * dir * 620, vy: Math.sin(ang) * 620, t: t, life: .75 + rand() * .5 };
        nextShoot = t + 4.5 + rand() * 6;
      }
      if (shoot) {
        const k = (t - shoot.t) / shoot.life;
        if (k >= 1) shoot = null;
        else {
          const hx = shoot.x + shoot.vx * (t - shoot.t), hy = shoot.y + shoot.vy * (t - shoot.t), tail = 150 * Math.sin(Math.PI * k);
          const v = Math.hypot(shoot.vx, shoot.vy), bx = hx - shoot.vx / v * tail, by = hy - shoot.vy / v * tail;
          const gr = ctx.createLinearGradient(hx, hy, bx, by);
          gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.3, 'rgba(160,220,255,.4)'); gr.addColorStop(1, 'rgba(160,220,255,0)');
          ctx.globalAlpha = Math.sin(Math.PI * k); ctx.strokeStyle = gr; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(bx, by); ctx.stroke();
          ctx.drawImage(GROUPS[3].sprite, hx - 8, hy - 8, 16, 16);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---- loop: runs only while the map is on screen and the tab is visible ---- */
  let raf = 0, onScreen = false;
  function frame(now) { raf = 0; draw(now); if (onScreen && !document.hidden) raf = requestAnimationFrame(frame); }
  function kick() { if (!raf && !STILL && onScreen && !document.hidden) raf = requestAnimationFrame(frame); }
  function reveal() { if (t0 < 0) { t0 = performance.now(); root.classList.add('is-in'); nextShoot = t0 / 1000 + 3; } }

  relayout();
  if (STILL) { root.classList.add('is-in'); draw(performance.now()); }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => es.forEach((e) => { onScreen = e.isIntersecting; if (onScreen) kick(); })).observe(root);
    // the draw-in starts once a good slice of the map is actually visible
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { reveal(); io.disconnect(); } }), { threshold: .22 });
    io.observe(root);
  } else { onScreen = true; reveal(); kick(); }
  document.addEventListener('visibilitychange', kick);

  let rz = 0;
  const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { if (root.clientWidth !== W) relayout(); }, 150); };
  window.addEventListener('resize', onResize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);   // label widths change once the webfont lands
})();
