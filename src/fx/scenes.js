/* scenes.js — three decorative, full-bleed space scenes between the content sections.

     #scene-1  BLACK HOLE     raw WebGL: every pixel is a light ray bent around the hole (ray-marched),
                              so the accretion disk arches over the shadow and the Milky Way photo behind
                              it is genuinely lensed. Reacts to pointer (orbit) and scroll (inclination).
     #scene-2  ORBIT          real NASA photos: Bruce McCandless on the MMU, the ISS and Hubble as
                              cut-outs over an ISS photo of the Earth limb. Multi-layer parallax + dust.
     #scene-3  LAUNCH         a canvas rocket that climbs as you scroll, with a particle exhaust plume,
                              smoke, sparks, camera shake, and Earth / Moon / Saturn sliding past.

   One shared rAF loop drives all three; a scene only updates while it is on screen and the tab is
   visible. With reduced motion (window.SPACE.STILL) each scene renders a single composed frame.
   Images load lazily when a scene comes within ~1 viewport. Nothing here takes pointer input away
   from the page (the scenes are pointer-events:none; we only listen on window). */
(function () {
  'use strict';
  const STILL = !!(window.SPACE && window.SPACE.STILL) ||
    (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const DIR = 'assets/scenes/';
  const TAU = Math.PI * 2;
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  // debug/QA hook: index.html?scenep=0.6 pins every scene's scroll progress (used for screenshots)
  const FORCE_P = (function () { const m = /[?&#]scenep=([\d.]+)/.exec(location.href); return m ? clamp(parseFloat(m[1]), 0, 1) : null; })();

  /* ---------------------------------------------------------------- full-bleed width */
  const root = document.documentElement;
  function bleed() { root.style.setProperty('--scene-w', root.clientWidth + 'px'); root.classList.add('sc-bleed'); }
  bleed();

  /* ---------------------------------------------------------------- shared pointer (−1..1, smoothed) */
  const ptr = { x: 0, y: 0, sx: 0, sy: 0 };
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    ptr.x = (e.clientX / innerWidth) * 2 - 1; ptr.y = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  /* ---------------------------------------------------------------- scene registry + one loop */
  const scenes = [];
  /* def: { el, init(), resize(w,h), frame(t,dt,p), still(p) }  — p is scroll progress through the viewport, 0..1 */
  function register(def) {
    def.on = false; def.ready = false; def.w = 0; def.h = 0;
    scenes.push(def);
  }
  function progressOf(s) {
    if (FORCE_P !== null) return FORCE_P;
    const r = s.el.getBoundingClientRect();
    return clamp((innerHeight - r.top) / (innerHeight + r.height), 0, 1);
  }
  function measure(s) {
    const w = s.el.clientWidth, h = s.el.clientHeight;
    if (w !== s.w || h !== s.h) { s.w = w; s.h = h; if (s.ready && w && h) s.resize(w, h); }
  }
  let raf = 0, last = 0;
  function tick(now) {
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
    const k = 1 - Math.exp(-dt * 4);
    ptr.sx += (ptr.x - ptr.sx) * k; ptr.sy += (ptr.y - ptr.sy) * k;
    let any = false;
    for (const s of scenes) if (s.on && s.ready) { any = true; s.frame(now / 1000, dt, progressOf(s)); }
    if (any && !document.hidden) raf = requestAnimationFrame(tick);
  }
  function wake() { if (!raf && !STILL && !document.hidden) { last = 0; raf = requestAnimationFrame(tick); } }
  function drawStill(s) { if (s.ready && s.w && s.h) s.still(FORCE_P !== null ? FORCE_P : 0.5); }

  function start() {
    // build a scene the first time it gets near the viewport, animate it only while it intersects
    const near = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) {
        const s = scenes.find((x) => x.el === e.target);
        near.unobserve(e.target);
        if (s && !s.ready) {
          try { s.init(); s.ready = true; s.w = s.h = 0; measure(s); if (STILL) drawStill(s); else wake(); }
          catch (err) { console.warn('scene skipped', s.el.id, err); }
        }
      }
    }, { rootMargin: '900px 0px' });
    const vis = new IntersectionObserver((entries) => {
      for (const e of entries) { const s = scenes.find((x) => x.el === e.target); if (s) s.on = e.isIntersecting; }
      wake();
    }, { rootMargin: '40px 0px' });
    for (const s of scenes) { near.observe(s.el); vis.observe(s.el); }

    let rz = 0;
    addEventListener('resize', () => {
      clearTimeout(rz);
      rz = setTimeout(() => { bleed(); for (const s of scenes) { measure(s); if (STILL) drawStill(s); } }, 120);
    }, { passive: true });
    document.addEventListener('visibilitychange', wake);
  }

  /* ════════════════════════════════════════════════════════════════════════════
     1 · BLACK HOLE
     ════════════════════════════════════════════════════════════════════════════ */
  (function () {
    const host = document.getElementById('scene-1');
    if (!host) return;

    const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
    /* Units: Schwarzschild radius = 1. Rays are integrated with the classic
       a = −1.5·h²·r̂/r⁴ acceleration, which reproduces photon paths around a
       non-rotating black hole (photon sphere at 1.5, shadow at ≈2.6). Each time a
       ray crosses the equatorial plane inside the disk we composite the disk
       front-to-back, so the far side shows up bent over and under the shadow. */
    const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes; uniform float uTime; uniform vec2 uPtr; uniform float uScroll;
uniform sampler2D uSky; uniform float uHasSky;
const float PI = 3.14159265;
const float RIN = 2.0, ROUT = 9.0;

float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
// value noise, periodic in y so it can wrap around the disk
float vnoise(vec2 x, float per){
  vec2 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  float y0 = mod(i.y,per), y1 = mod(i.y+1.,per);
  return mix(mix(hash(vec2(i.x,y0)),hash(vec2(i.x+1.,y0)),f.x),
             mix(hash(vec2(i.x,y1)),hash(vec2(i.x+1.,y1)),f.x), f.y);
}
// gas streaks: long along the orbit, thin across it
float streaks(float r, float a){
  return vnoise(vec2(r*2.1, a*10.),10.)*.46 + vnoise(vec2(r*5.3+3.7, a*26.),26.)*.32 + vnoise(vec2(r*12.+9.1, a*64.),64.)*.22;
}
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

vec4 disk(vec3 hp, vec3 v){
  float r = length(hp.xz);
  if (r < RIN || r > ROUT) return vec4(0.);
  float x = (r-RIN)/(ROUT-RIN);
  float a = atan(hp.z,hp.x)/(2.*PI);
  // Keplerian shear with a two-phase crossfade so the swirl never winds itself into rings
  float w = 1.25*pow(r,-1.5);
  float tt = uTime*.055, f1 = fract(tt), f2 = fract(tt+.5);
  float base = a - uTime*.010;
  float s = streaks(r, base - w*f1)*(1.-abs(2.*f1-1.))
          + streaks(r+11.3, base - w*f2 + .37)*(1.-abs(2.*f2-1.));
  float dens = smoothstep(0.,.04,x)*pow(1.-x,1.15)*(.16+2.1*s*s);
  // temperature: white-hot inner edge → amber → ember red → violet rim (page palette)
  vec3 c = mix(vec3(1.,.97,.90), vec3(1.,.66,.26), smoothstep(0.,.28,x));
  c = mix(c, vec3(.86,.24,.12), smoothstep(.25,.68,x));
  c = mix(c, vec3(.46,.30,.95), smoothstep(.62,1.,x)*.75);
  float I = (3.4*pow(1.-x,2.6)+.42)*(.30+2.3*s*s*s);
  // relativistic beaming: the side rotating toward the camera is brighter and bluer
  vec3 tg = normalize(vec3(-hp.z,0.,hp.x));
  float g = 1./(1.+.42*dot(tg,normalize(v)));
  I *= pow(g,2.6);
  c = mix(c, c*vec3(.86,1.,1.28), clamp(g-1.,0.,1.)*.55);
  return vec4(c*I, clamp(dens*1.25,0.,.96));
}

vec3 sky(vec3 d){
  d.xy = rot(.42)*d.xy;                      // tilt the galactic plane against the disk
  float u = atan(d.z,d.x)/(2.*PI)+.75, vv = acos(clamp(d.y,-1.,1.))/PI;
  vec3 c = vec3(0.);
  if (uHasSky > .5) {
    vec3 t = texture2D(uSky, vec2(u,vv)).rgb;
    c = t*t*2.4 + t*.55;                     // lift the Milky Way out of the photo's blacks
  } else {
    float band = exp(-d.y*d.y*14.)*(.35+.65*vnoise(vec2(u*40.,vv*40.),40.));
    c = vec3(.30,.26,.42)*band*.5;
  }
  // a sprinkle of crisp procedural stars on top
  vec2 g = vec2(u*520., vv*260.), id = floor(g), f = fract(g)-.5;
  float h = hash(id);
  if (h > .972) {
    vec2 o = (vec2(hash(id+7.1),hash(id+3.3))-.5)*.6;
    float tw = .7+.3*sin(uTime*(1.+h*3.)+h*40.);
    c += mix(vec3(.75,.85,1.),vec3(1.,.86,.7),hash(id+1.7))*smoothstep(.22,0.,length(f-o))*(h-.972)*42.*tw;
  }
  return c;
}

void main(){
  float sc = min(uRes.y, uRes.x*.62);
  vec2 uv = (gl_FragCoord.xy-.5*uRes)/sc;
  uv = rot(-.20+(uScroll-.5)*.16)*uv;

  // camera: slow orbit, pointer nudges azimuth/elevation, scroll changes inclination
  float az = uTime*.012 + uPtr.x*.24;
  float elv = mix(.05,.27,uScroll) - uPtr.y*.07;
  vec3 ro = 15.*vec3(cos(elv)*sin(az), sin(elv), cos(elv)*cos(az));
  vec3 fw = normalize(-ro), rt = normalize(cross(fw,vec3(0.,1.,0.))), up = cross(rt,fw);
  vec3 rd = normalize(fw*1.18 + rt*uv.x + up*uv.y);

  vec3 p = ro, v = rd;
  vec3 cr = cross(p,v); float h2 = dot(cr,cr);
  vec3 col = vec3(0.); float T = 1., cap = 0.;
  for (int i=0;i<120;i++){
    float r2 = dot(p,p), r = sqrt(r2);
    if (r < 1.) { cap = 1.; break; }
    if (r > 19. && dot(p,v) > 0.) break;
    float dt = r*mix(.042,.13,smoothstep(1.5,7.,r));
    v += -1.5*h2*p/(r2*r2*r)*dt;
    vec3 q = p + v*dt;
    if (p.y*q.y < 0.) {
      vec4 d = disk(mix(p,q,p.y/(p.y-q.y)), v);
      col += T*d.rgb*d.a; T *= 1.-d.a;
    }
    p = q;
    if (T < .02) break;
  }
  if (cap < .5) col += T*sky(normalize(v));

  // soft bloom around the hole and a vignette into deep space
  float rr = length(uv);
  col += vec3(1.,.60,.28)*exp(-rr*3.4)*.16*(1.-cap*.9);
  col = 1.-exp(-col*1.15);
  col = mix(vec3(.016,.020,.051), col, smoothstep(1.7,.75,length(uv*vec2(.72,1.2))));
  gl_FragColor = vec4(col,1.);
}`;

    // QA hook: ?sceneq=0.4 starts the shader at a lower render scale (software-GL screenshots)
    const Q = /[?&#]sceneq=([\d.]+)/.exec(location.href);
    let cv, gl, prog, U = {}, scale = Q ? clamp(parseFloat(Q[1]), .2, 1) : 1, hasSky = 0, slow = 0, frames = 0, acc = 0, lost = false;

    function compile(type, src) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    }
    function setup() {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
      gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one big triangle
      const a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      for (const n of ['uRes', 'uTime', 'uPtr', 'uScroll', 'uSky', 'uHasSky']) U[n] = gl.getUniformLocation(prog, n);
      // 1×1 black placeholder until (or unless) the Milky Way photo is usable as a texture
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      gl.uniform1i(U.uSky, 0);
      hasSky = 0;
      const img = new Image();
      img.onload = () => {
        if (lost) return;
        try {   // throws on file:// (tainted) — the shader then keeps its procedural sky
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          hasSky = 1;
        } catch (e) { hasSky = 0; }
        if (STILL) def.still(0.5);
      };
      img.src = DIR + 'milkyway.jpg';
    }
    function size(w, h) {
      const s = Math.min(DPR(), 1.5) * scale;
      cv.width = Math.max(2, Math.round(w * s)); cv.height = Math.max(2, Math.round(h * s));
      gl.viewport(0, 0, cv.width, cv.height);
    }
    function draw(t, p) {
      if (lost) return;
      gl.uniform2f(U.uRes, cv.width, cv.height);
      gl.uniform1f(U.uTime, t);
      gl.uniform2f(U.uPtr, ptr.sx, ptr.sy);
      gl.uniform1f(U.uScroll, p);
      gl.uniform1f(U.uHasSky, hasSky);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    const def = {
      el: host,
      init() {
        cv = el('canvas'); host.appendChild(cv);
        gl = cv.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
        if (!gl) { cv.remove(); host.classList.add('sc-nogl'); def.frame = def.still = def.resize = () => {}; return; }
        try { setup(); } catch (e) { cv.remove(); host.classList.add('sc-nogl'); def.frame = def.still = def.resize = () => {}; console.warn('black hole shader unavailable', e); return; }
        cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
        cv.addEventListener('webglcontextrestored', () => { try { U = {}; setup(); lost = false; size(def.w, def.h); if (STILL) def.still(0.5); } catch (e) { host.classList.add('sc-nogl'); } });
        requestAnimationFrame(() => host.classList.add('sc-ready'));
      },
      resize(w, h) { size(w, h); },
      frame(t, dt, p) {
        draw(t + 40, p);
        // adaptive resolution: if the GPU can't hold ~30fps, render fewer pixels (CSS upscales)
        acc += dt; frames++;
        if (frames >= 45) {
          const avg = acc / frames; frames = 0; acc = 0;
          if (avg > 0.036 && scale > 0.45) { if (++slow >= 2) { scale *= 0.75; slow = 0; size(def.w, def.h); } } else slow = 0;
        }
      },
      still(p) { draw(63, p); }
    };
    register(def);
  })();

  /* ════════════════════════════════════════════════════════════════════════════
     2 · ASTRONAUT + ISS + HUBBLE OVER THE EARTH LIMB
     ════════════════════════════════════════════════════════════════════════════ */
  (function () {
    const host = document.getElementById('scene-2');
    if (!host) return;
    let back, iss, hub, astro, cv, ctx, W = 0, H = 0, dpr = 1, sprite;
    let dust = [], streak = null, nextStreak = 3;

    function photo(cls, file) {
      const wrap = el('div', 's2-layer ' + cls), img = new Image();
      img.alt = ''; img.decoding = 'async'; img.draggable = false; img.src = DIR + file;
      wrap.appendChild(img); host.appendChild(wrap); return wrap;
    }
    function makeSprite() {   // one soft glow dot, reused for every dust mote
      const c = el('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(210,230,255,.55)'); gr.addColorStop(1, 'rgba(160,190,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
    }
    function seed() {
      const n = Math.round(clamp(W * H / 14000, 26, 80));
      dust = [];
      for (let i = 0; i < n; i++) dust.push({ x: Math.random(), y: Math.random(), z: rnd(.15, 1), vx: rnd(.004, .016), vy: rnd(-.004, .004), ph: rnd(0, TAU), warm: Math.random() < .25 });
    }
    function place(t, p) {
      const s = H / 800, q = p - 0.5, mx = ptr.sx, my = ptr.sy;
      // deeper layers move less; everything drifts slowly even without input
      back.style.transform = `translate3d(${(-mx * 14).toFixed(2)}px,${(q * -70 * s - my * 8).toFixed(2)}px,0) scale(1.06)`;
      iss.style.transform = `translate3d(${(-mx * 26 + q * 90 * s + Math.sin(t * .05) * 24 * s).toFixed(2)}px,${(q * -170 * s - my * 14 + Math.sin(t * .11) * 8 * s).toFixed(2)}px,0) rotate(${(-9 + Math.sin(t * .06) * 4 + q * 6).toFixed(3)}deg)`;
      hub.style.transform = `translate3d(${(-mx * 40 - q * 120 * s).toFixed(2)}px,${(q * -260 * s - my * 22 + Math.sin(t * .2 + 2) * 10 * s).toFixed(2)}px,0) rotate(${(t * 2.6 + q * 40).toFixed(3)}deg)`;
      astro.style.transform = `translate3d(${(-mx * 64 - q * 60 * s + Math.sin(t * .23) * 16 * s).toFixed(2)}px,${(q * -380 * s - my * 36 + Math.sin(t * .41) * 18 * s).toFixed(2)}px,0) rotate(${(6 + Math.sin(t * .17) * 15 + q * 22).toFixed(3)}deg)`;
    }
    function paint(t, dt, p) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      const q = p - 0.5;
      for (const d of dust) {
        d.x += d.vx * d.z * dt; d.y += d.vy * dt;
        if (d.x > 1.05) d.x = -.05; if (d.y > 1.05) d.y = -.05; if (d.y < -.05) d.y = 1.05;
        const r = (1.2 + d.z * 5) * (W < 700 ? .8 : 1);
        const x = d.x * W - ptr.sx * 70 * d.z, y = d.y * H - q * 420 * d.z * (H / 800) - ptr.sy * 40 * d.z;
        const yy = ((y % H) + H) % H;
        ctx.globalAlpha = (.18 + .5 * d.z) * (.6 + .4 * Math.sin(t * 1.3 + d.ph));
        ctx.drawImage(sprite, x - r, yy - r, r * 2, r * 2);
        if (d.warm) { ctx.globalAlpha *= .5; ctx.fillStyle = '#FFB347'; ctx.beginPath(); ctx.arc(x, yy, r * .22, 0, TAU); ctx.fill(); }
      }
      // an occasional meteor burning up along the limb
      if (!STILL) {
        nextStreak -= dt;
        if (!streak && nextStreak <= 0) { streak = { x: rnd(.1, .7) * W, y: rnd(.12, .5) * H, a: rnd(.25, .5), v: rnd(700, 1100), life: 0, max: rnd(.5, .9) }; nextStreak = rnd(3.5, 8); }
        if (streak) {
          streak.life += dt;
          const k = streak.life / streak.max, len = 160 * Math.sin(Math.min(1, k) * Math.PI) + 20;
          const hx = streak.x + Math.cos(streak.a) * streak.v * streak.life, hy = streak.y + Math.sin(streak.a) * streak.v * streak.life;
          const g = ctx.createLinearGradient(hx, hy, hx - Math.cos(streak.a) * len, hy - Math.sin(streak.a) * len);
          g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.2, 'rgba(160,220,255,.5)'); g.addColorStop(1, 'rgba(95,216,255,0)');
          ctx.globalAlpha = Math.sin(Math.min(1, k) * Math.PI); ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - Math.cos(streak.a) * len, hy - Math.sin(streak.a) * len); ctx.stroke();
          if (k >= 1) streak = null;
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    register({
      el: host,
      init() {
        back = el('div', 's2-layer s2-back'); back.appendChild(el('div', 's2-grade')); host.appendChild(back);
        iss = photo('s2-iss', 'iss.webp');
        hub = photo('s2-hubble', 'hubble.webp');
        cv = el('canvas'); host.appendChild(cv); ctx = cv.getContext('2d');
        astro = photo('s2-astro', 'astronaut.webp');
        sprite = makeSprite();
      },
      resize(w, h) {
        W = w; H = h; dpr = DPR();
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
        seed();
      },
      frame(t, dt, p) { place(t, p); paint(t, dt, p); },
      still(p) { place(8, p); paint(8, 0, p); }
    });
  })();

  /* ════════════════════════════════════════════════════════════════════════════
     3 · ROCKET LAUNCH (scroll-driven)
     ════════════════════════════════════════════════════════════════════════════ */
  (function () {
    const host = document.getElementById('scene-3');
    if (!host) return;
    let cv, ctx, W = 0, H = 0, dpr = 1, L = 200, small = false;
    let q = 0, qs = -1, vel = 0, thrust = .4, prevNoz = null, simT = 0;
    const img = {};                          // earth, moon, saturn
    const sprites = {};                      // pre-rendered soft blobs
    const parts = [];                        // exhaust particles (flame / smoke / spark)
    let stars = [];
    const emitAcc = { f: 0, s: 0, k: 0 };

    function load(name, file) { const i = new Image(); i.onload = () => { img[name] = i; if (STILL) still(); }; i.src = DIR + file; }
    function blob(stops, size) {
      const c = el('canvas'); c.width = c.height = size; const g = c.getContext('2d'), h = size / 2;
      const gr = g.createRadialGradient(h, h, 0, h, h, h);
      for (const [o, col] of stops) gr.addColorStop(o, col);
      g.fillStyle = gr; g.fillRect(0, 0, size, size); return c;
    }

    /* flight path: straight up off the pad, then a gravity turn toward the top-right */
    function pos(u) {
      const x0 = small ? .20 : .17, span = small ? .58 : .64;
      return [W * (x0 + span * Math.pow(u, 1.7)), H * (1.10 - 1.24 * u)];
    }
    function pose(u) {
      const a = pos(u), b = pos(u + .01);
      return { x: a[0], y: a[1], ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };   // heading, canvas radians
    }

    /* ---- background bodies -------------------------------------------------- */
    function body(im, cx, cy, r, glow, shadeAng, shadeAmt) {
      // atmosphere / halo
      if (glow) {
        const g = ctx.createRadialGradient(cx, cy, r * .96, cx, cy, r * 1.16);
        g.addColorStop(0, glow.replace('A', '.42')); g.addColorStop(.3, glow.replace('A', '.12')); g.addColorStop(1, glow.replace('A', '0'));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 1.16, 0, TAU); ctx.fill();
      }
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
      if (im) ctx.drawImage(im, cx - r, cy - r, r * 2, r * 2); else { ctx.fillStyle = '#1b2244'; ctx.fill(); }
      // night side: darkness creeping in from the direction opposite the light
      const ox = Math.cos(shadeAng) * r * .5, oy = Math.sin(shadeAng) * r * .5;
      const s = ctx.createRadialGradient(cx - ox, cy - oy, r * .35, cx + ox * .3, cy + oy * .3, r * 1.25);
      s.addColorStop(0, 'rgba(4,5,13,0)'); s.addColorStop(.55, `rgba(4,5,13,${shadeAmt * .45})`); s.addColorStop(1, `rgba(4,5,13,${shadeAmt})`);
      ctx.fillStyle = s; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
    }
    function backdrop(u, sx, sy) {
      const px = ptr.sx, py = ptr.sy;
      // star streaks: dots at rest, lines when the camera is moving
      const p0 = pose(clamp(u, 0, .98)), dx = Math.cos(p0.ang), dy = Math.sin(p0.ang);
      ctx.lineCap = 'round';
      for (const s of stars) {
        const x = ((s.x * W - dx * s.o * W) % W + W) % W, y = ((s.y * H - dy * s.o * H) % H + H) % H;
        const len = Math.min(90, vel * 520 * s.z) + .01;
        ctx.strokeStyle = `rgba(${s.c},${(.25 + .55 * s.z).toFixed(2)})`; ctx.lineWidth = .6 + s.z * 1.3;
        ctx.beginPath(); ctx.moveTo(x + sx * .3, y + sy * .3); ctx.lineTo(x + sx * .3 - dx * len, y + sy * .3 - dy * len); ctx.stroke();
      }
      // Saturn, far and small, sliding in from the top-left
      if (img.saturn) {
        const w = clamp(W * .26, 150, 400), h = w * img.saturn.height / img.saturn.width;
        ctx.save(); ctx.translate(W * (small ? .25 : .19) - px * 10 + sx * .25, H * (-.06 + .42 * u) - py * 6 + sy * .25); ctx.rotate(-.34);
        ctx.globalAlpha = .92; ctx.drawImage(img.saturn, -w / 2, -h / 2, w, h); ctx.restore(); ctx.globalAlpha = 1;
      }
      // the Moon, upper right, drifting down as we climb
      const mr = clamp(Math.min(W, H) * .12, 46, 112);
      body(img.moon, W * (small ? .80 : .845) - px * 18 + sx * .4, H * (.13 + .44 * u) - py * 10 + sy * .4, mr, 'rgba(190,200,255,A)', -2.4, .86);
      // Earth: the launch site falling away below
      const er = Math.min(H * .56, Math.max(W * .30, 190));
      body(img.earth, W * (small ? .30 : .24) - px * 30 + sx * .6, H * (.60 + .52 * u) + er * .62 - py * 16 + sy * .6, er, 'rgba(95,216,255,A)', -2.2, .7);
    }

    /* ---- the rocket (local space: nose at y=−.5L, nozzle at y=+.5L, pointing up) */
    function bodyPath(w) {
      ctx.beginPath();
      ctx.moveTo(0, -.5 * L);
      ctx.bezierCurveTo(w * .55, -.43 * L, w, -.33 * L, w, -.2 * L);
      ctx.lineTo(w, .34 * L);
      ctx.quadraticCurveTo(w, .40 * L, w * .62, .43 * L);
      ctx.lineTo(-w * .62, .43 * L);
      ctx.quadraticCurveTo(-w, .40 * L, -w, .34 * L);
      ctx.lineTo(-w, -.2 * L);
      ctx.bezierCurveTo(-w, -.33 * L, -w * .55, -.43 * L, 0, -.5 * L);
      ctx.closePath();
    }
    function fin(side, w) {
      ctx.beginPath();
      ctx.moveTo(side * w * .96, .12 * L);
      ctx.bezierCurveTo(side * w * 1.5, .2 * L, side * w * 2.5, .32 * L, side * w * 2.7, .5 * L);
      ctx.lineTo(side * w * 2.25, .5 * L);
      ctx.quadraticCurveTo(side * w * 1.7, .4 * L, side * w * .96, .385 * L);
      ctx.closePath();
      const g = ctx.createLinearGradient(side * w, 0, side * w * 2.7, 0);
      g.addColorStop(0, side < 0 ? '#B7A2FF' : '#5B45C8'); g.addColorStop(1, side < 0 ? '#6D52E6' : '#2A1F6B');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = side < 0 ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.12)'; ctx.lineWidth = Math.max(.6, L * .004); ctx.stroke();
    }
    function flame(t, th) {
      const w = L * .058, fl = L * (.55 + .5 * th) * (1 + .07 * Math.sin(t * 61) + .05 * Math.sin(t * 37 + 1));
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      // wide soft glow
      ctx.globalAlpha = .55 + .25 * th;
      ctx.drawImage(sprites.glow, -L * .42, .5 * L - L * .28, L * .84, L * .84);
      ctx.globalAlpha = 1;
      // outer plume and hot core
      for (const [k, c0, c1, c2] of [[1.9, 'rgba(255,150,60,.55)', 'rgba(255,90,40,.28)', 'rgba(255,60,90,0)'], [1, 'rgba(255,255,255,1)', 'rgba(150,225,255,.85)', 'rgba(255,179,71,0)']]) {
        const g = ctx.createLinearGradient(0, .49 * L, 0, .49 * L + fl * (k > 1 ? 1 : .72));
        g.addColorStop(0, c0); g.addColorStop(.3, c1); g.addColorStop(1, c2);
        ctx.fillStyle = g; ctx.beginPath();
        ctx.moveTo(-w * k * .8, .49 * L);
        ctx.bezierCurveTo(-w * k * 1.9, .49 * L + fl * .22, -w * k * .7, .49 * L + fl * .6, 0, .49 * L + fl * (k > 1 ? 1 : .72));
        ctx.bezierCurveTo(w * k * .7, .49 * L + fl * .6, w * k * 1.9, .49 * L + fl * .22, w * k * .8, .49 * L);
        ctx.closePath(); ctx.fill();
      }
      // shock diamonds
      for (let i = 0; i < 4; i++) {
        const y = .5 * L + fl * (.09 + i * .105), r = w * (1.05 - i * .2);
        ctx.globalAlpha = (.75 - i * .16) * (.8 + .2 * Math.sin(t * 43 + i));
        ctx.drawImage(sprites.hot, -r * 1.6, y - r, r * 3.2, r * 2);
      }
      ctx.restore();
    }
    function rocket(t, th) {
      const w = L * .088;
      flame(t, th);
      fin(1, w); fin(-1, w);
      // engine bell
      ctx.beginPath(); ctx.moveTo(-w * .5, .42 * L); ctx.lineTo(w * .5, .42 * L); ctx.lineTo(w * .78, .5 * L); ctx.lineTo(-w * .78, .5 * L); ctx.closePath();
      let g = ctx.createLinearGradient(-w, 0, w, 0);
      g.addColorStop(0, '#8E93B8'); g.addColorStop(.35, '#3A3D5E'); g.addColorStop(1, '#0D0E1F');
      ctx.fillStyle = g; ctx.fill();
      g = ctx.createLinearGradient(0, .44 * L, 0, .5 * L); g.addColorStop(0, 'rgba(255,179,71,0)'); g.addColorStop(1, 'rgba(255,214,150,.9)');
      ctx.fillStyle = g; ctx.fill();
      // hull: cylinder shading, lit from the left
      bodyPath(w);
      g = ctx.createLinearGradient(-w, 0, w, 0);
      g.addColorStop(0, '#C9D2F2'); g.addColorStop(.22, '#FFFFFF'); g.addColorStop(.55, '#C3C8E6'); g.addColorStop(.86, '#6A6F9C'); g.addColorStop(1, '#34365E');
      ctx.fillStyle = g; ctx.fill();
      ctx.save(); bodyPath(w); ctx.clip();
      // nose cone
      g = ctx.createLinearGradient(-w, 0, w, 0);
      g.addColorStop(0, '#FFC978'); g.addColorStop(.25, '#FFB347'); g.addColorStop(.75, '#E0623A'); g.addColorStop(1, '#8A2F3E');
      ctx.fillStyle = g; ctx.fillRect(-w, -.5 * L, w * 2, .215 * L);
      ctx.fillStyle = 'rgba(10,11,28,.55)'; ctx.fillRect(-w, -.288 * L, w * 2, .008 * L);
      // colour bands
      g = ctx.createLinearGradient(-w, 0, w, 0); g.addColorStop(0, '#A993FF'); g.addColorStop(.3, '#8B6CFF'); g.addColorStop(1, '#3A2A8F');
      ctx.fillStyle = g; ctx.fillRect(-w, .2 * L, w * 2, .035 * L);
      g = ctx.createLinearGradient(-w, 0, w, 0); g.addColorStop(0, '#9BE8FF'); g.addColorStop(.3, '#5FD8FF'); g.addColorStop(1, '#1C6F92');
      ctx.fillStyle = g; ctx.fillRect(-w, .245 * L, w * 2, .01 * L);
      // panel seams
      ctx.strokeStyle = 'rgba(20,22,50,.22)'; ctx.lineWidth = Math.max(.5, L * .0035);
      for (const y of [-.02, .12, .3, .36]) { ctx.beginPath(); ctx.moveTo(-w, y * L); ctx.lineTo(w, y * L); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(w * .42, -.28 * L); ctx.lineTo(w * .42, .2 * L); ctx.stroke();
      // base scorch + engine light spilling up the skirt
      g = ctx.createLinearGradient(0, .3 * L, 0, .43 * L); g.addColorStop(0, 'rgba(255,170,80,0)'); g.addColorStop(1, `rgba(255,170,80,${(.3 + .3 * th).toFixed(2)})`);
      ctx.fillStyle = g; ctx.fillRect(-w, .3 * L, w * 2, .13 * L);
      // specular streak
      g = ctx.createLinearGradient(-w * .75, 0, -w * .3, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(-w, -.46 * L, w * 2, .88 * L);
      ctx.restore();
      // porthole
      const py = -.13 * L, pr = w * .44;
      ctx.beginPath(); ctx.arc(0, py, pr * 1.28, 0, TAU);
      g = ctx.createLinearGradient(-pr, py - pr, pr, py + pr); g.addColorStop(0, '#F4F6FF'); g.addColorStop(1, '#5A5F8A'); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.arc(0, py, pr, 0, TAU);
      g = ctx.createRadialGradient(-pr * .35, py - pr * .35, pr * .1, 0, py, pr); g.addColorStop(0, '#D6F6FF'); g.addColorStop(.45, '#3FA9D6'); g.addColorStop(1, '#0B1E44');
      ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.arc(-pr * .3, py - pr * .32, pr * .28, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
      // centre fin (edge-on) and hull rim light
      ctx.fillStyle = '#6D52E6'; ctx.fillRect(-w * .1, .2 * L, w * .2, .26 * L);
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-w * .1, .2 * L, w * .06, .26 * L);
      bodyPath(w); ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = Math.max(.6, L * .004); ctx.stroke();
    }

    /* ---- exhaust particles -------------------------------------------------- */
    function emit(dt, ps, th) {
      // nozzle in scene space, and the direction the exhaust leaves in
      const bx = -Math.cos(ps.ang), by = -Math.sin(ps.ang);
      const nx = ps.x + bx * L * .5, ny = ps.y + by * L * .5;
      const from = prevNoz || [nx, ny]; prevNoz = [nx, ny];
      const spawn = (kind) => {
        const k = Math.random(), x = lerp(from[0], nx, k), y = lerp(from[1], ny, k);   // fill the gap covered this frame
        const sp = rnd(-1, 1), tx = -by, ty = bx;
        if (kind === 0) parts.push({ k: 0, x: x + bx * L * .16, y: y + by * L * .16, vx: bx * L * rnd(1.4, 2.6) + tx * sp * L * .22, vy: by * L * rnd(1.4, 2.6) + ty * sp * L * .22, life: 0, max: rnd(.28, .6), r: L * rnd(.05, .09), rot: 0 });
        else if (kind === 1) parts.push({ k: 1, x: x + bx * L * .5, y: y + by * L * .5, vx: bx * L * rnd(.9, 1.7) + tx * sp * L * .2, vy: by * L * rnd(.9, 1.7) + ty * sp * L * .2, life: 0, max: rnd(1.8, 3.6), r: L * rnd(.05, .10), rot: rnd(0, TAU) });
        else parts.push({ k: 2, x, y, vx: bx * L * rnd(1.6, 3.4) + tx * sp * L * .9, vy: by * L * rnd(1.6, 3.4) + ty * sp * L * .9, life: 0, max: rnd(.5, 1.3), r: rnd(.8, 1.9), rot: 0 });
      };
      emitAcc.f += dt * 70 * th; emitAcc.s += dt * (12 + 22 * th); emitAcc.k += dt * 16 * th;
      while (emitAcc.f >= 1) { emitAcc.f--; spawn(0); }
      while (emitAcc.s >= 1) { emitAcc.s--; spawn(1); }
      while (emitAcc.k >= 1) { emitAcc.k--; spawn(2); }
      if (parts.length > 620) parts.splice(0, parts.length - 620);
    }
    function step(dt) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.life += dt;
        if (p.life >= p.max) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
        const drag = p.k === 1 ? Math.exp(-dt * 1.15) : p.k === 0 ? Math.exp(-dt * 2.2) : Math.exp(-dt * .9);
        p.vx *= drag; p.vy *= drag;
        if (p.k === 2) p.vy += L * 1.1 * dt;            // sparks fall
        if (p.k === 1) { p.vy -= L * .05 * dt; p.rot += dt * .3; }
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
    }
    function drawParts(kind) {
      for (const p of parts) {
        if (p.k !== kind) continue;
        const u = p.life / p.max;
        if (kind === 1) {            // smoke: lit warm by the flame when young, cooling to violet-grey
          const r = p.r * (1 + u * 3.6);
          ctx.globalAlpha = .62 * Math.pow(1 - u, 1.6) * Math.min(1, u * 7);
          ctx.drawImage(u < .14 ? sprites.smokeWarm : sprites.smoke, p.x - r, p.y - r, r * 2, r * 2);
        } else if (kind === 0) {     // flame: white → amber → red
          const r = p.r * (1 + u * 2.2);
          ctx.globalAlpha = (1 - u) * .8;
          ctx.drawImage(u < .25 ? sprites.hot : u < .6 ? sprites.fire : sprites.ember, p.x - r, p.y - r, r * 2, r * 2);
        } else {                     // sparks: short bright streaks
          ctx.globalAlpha = (1 - u);
          ctx.strokeStyle = u < .4 ? '#FFF1CF' : '#FFB347'; ctx.lineWidth = p.r;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .03, p.y - p.vy * .03); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    /* ---- compose a frame ---------------------------------------------------- */
    function render(t, u, th) {
      // camera shake grows with thrust; the far background gets a fraction of it
      const amp = STILL ? 0 : Math.min(7, (.6 + th * 2.4)) * (small ? .6 : 1);
      const sx = (Math.sin(t * 71.3) + Math.sin(t * 113.7 + 1.3)) * .5 * amp, sy = (Math.sin(t * 89.1 + .7) + Math.sin(t * 131.9)) * .5 * amp;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      backdrop(u, sx, sy);
      const ps = pose(u);
      ctx.save(); ctx.translate(sx, sy);
      drawParts(1);
      ctx.globalCompositeOperation = 'lighter'; drawParts(0); drawParts(2); ctx.globalCompositeOperation = 'source-over';
      ctx.translate(ps.x, ps.y); ctx.rotate(ps.ang + Math.PI / 2);
      rocket(t, th);
      ctx.restore();
    }
    function still() {
      // reduced motion: one composed frame with a pre-grown plume
      if (!W) return;
      parts.length = 0; prevNoz = null; vel = 0;
      const u = .52;
      for (let i = 0; i < 150; i++) { emit(1 / 30, pose(u - .1 * (1 - i / 149)), .8); step(1 / 30); }   // climb a little so the smoke trails
      render(1.7, u, .8);
    }

    register({
      el: host,
      init() {
        cv = el('canvas'); host.appendChild(cv); ctx = cv.getContext('2d');
        load('earth', 'earth.webp'); load('moon', 'moon.webp'); load('saturn', 'saturn.webp');
        sprites.glow = blob([[0, 'rgba(255,214,150,.9)'], [.2, 'rgba(255,150,60,.42)'], [.55, 'rgba(255,90,60,.1)'], [1, 'rgba(255,80,80,0)']], 256);
        sprites.hot = blob([[0, 'rgba(255,255,255,1)'], [.3, 'rgba(190,235,255,.8)'], [.65, 'rgba(255,200,120,.25)'], [1, 'rgba(255,179,71,0)']], 96);
        sprites.fire = blob([[0, 'rgba(255,226,160,.95)'], [.4, 'rgba(255,150,60,.55)'], [1, 'rgba(255,90,40,0)']], 96);
        sprites.ember = blob([[0, 'rgba(255,120,70,.7)'], [.5, 'rgba(220,60,70,.3)'], [1, 'rgba(160,40,90,0)']], 96);
        sprites.smoke = blob([[0, 'rgba(206,204,226,.50)'], [.55, 'rgba(160,157,190,.36)'], [.82, 'rgba(104,100,142,.12)'], [1, 'rgba(70,66,110,0)']], 128);
        sprites.smokeWarm = blob([[0, 'rgba(255,214,170,.55)'], [.55, 'rgba(226,160,130,.36)'], [.82, 'rgba(130,96,130,.12)'], [1, 'rgba(70,66,110,0)']], 128);
      },
      resize(w, h) {
        W = w; H = h; dpr = DPR(); small = w < 700;
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
        L = clamp(Math.min(h * .40, w * .36), 130, 360);
        const n = Math.round(clamp(w * h / 22000, 18, 60));
        stars = [];
        for (let i = 0; i < n; i++) stars.push({ x: Math.random(), y: Math.random(), z: rnd(.2, 1), o: 0, c: Math.random() < .3 ? '255,220,180' : '205,225,255' });
        parts.length = 0; prevNoz = null;
      },
      frame(t, dt, p) {
        q = clamp((p - .1) / .8, 0, 1);
        if (qs < 0) qs = q;
        const before = qs;
        qs += (q - qs) * (1 - Math.exp(-dt * 3.2));          // the rocket glides after the scroll position
        const v = Math.abs(qs - before) / Math.max(dt, .001);  // progress per second
        vel += (v - vel) * (1 - Math.exp(-dt * 6));
        thrust += (clamp(.5 + vel * 2.4, .5, 1.25) - thrust) * (1 - Math.exp(-dt * 5));
        for (const s of stars) s.o += (qs - before) * (.25 + s.z * .9);   // parallax scroll of the star streaks
        const ps = pose(qs);
        emit(dt, ps, thrust); step(dt);
        simT += dt;
        render(simT, qs, thrust);
      },
      still
    });
  })();

  start();
})();
