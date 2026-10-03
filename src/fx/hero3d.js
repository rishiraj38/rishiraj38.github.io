/* fx/hero3d.js — the hero as a real 3D solar system (three.js r128, global THREE).
   sun = Rishi, planet = organization, moon = one merged PR.
   Renders into #system3d and retires the 2D canvas; if WebGL or a texture fails,
   nothing is touched and the 2D version keeps running. Textures: assets/hero3d/CREDITS.md */
(function () {
  const S = window.SPACE, T = window.THREE;
  const mount = document.getElementById('system3d'), flat = document.getElementById('system');
  if (!S || !T || !mount || !S.ORGS || !S.ORGS.length) return;

  const TAU = Math.PI * 2, STILL = !!S.STILL, DIR = 'assets/hero3d/';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* one real world per organization, biggest contributor first */
  const WORLDS = [
    { tex: 'earth',    hue: '#5FD8FF', tilt: .41, spin: .50, atmo: 1.5 },
    { tex: 'jupiter',  hue: '#FFC98A', tilt: .06, spin: .85, atmo: .8 },
    { tex: 'saturn',   hue: '#F2D9A0', tilt: .47, spin: .75, atmo: .6, ring: 'saturn' },
    { tex: 'mars',     hue: '#FF8A5B', tilt: .44, spin: .48, atmo: .7 },
    { tex: 'neptune',  hue: '#7FA8FF', tilt: .49, spin: .60, atmo: 1.2 },
    { tex: 'venus',    hue: '#FFD6A5', tilt: .05, spin: -.20, atmo: 1.1 },
    { tex: 'uranus',   hue: '#9BEAF0', tilt: 1.35, spin: .55, atmo: 1.1, ring: 'thin' },
    { tex: 'mercury',  hue: '#D9D6FF', tilt: .01, spin: .25, atmo: .35 },
    { tex: 'moon',     hue: '#EEECFF', tilt: .12, spin: .22, atmo: .35 },
    { tex: 'ceres',    hue: '#B99BFF', tilt: .07, spin: .65, atmo: .7, tint: '#C9B4FF' },
    { tex: 'makemake', hue: '#FF7AB6', tilt: .50, spin: .40, atmo: .8, tint: '#FFB0CF' },
    { tex: 'haumea',   hue: '#5BE3A1', tilt: .30, spin: 1.2, atmo: .8, tint: '#A6F2CC' },
    { tex: 'eris',     hue: '#F6A6FF', tilt: .75, spin: .35, atmo: .8, tint: '#F3C8FF' },
  ];
  const worldOf = (i) => WORLDS[i % WORLDS.length];

  /* 1. WebGL, or leave the 2D canvas alone */
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { return; }
  if (!renderer || !renderer.getContext()) return;
  renderer.setClearColor(0x000000, 0);
  renderer.outputEncoding = T.sRGBEncoding;

  /* 2. textures, all local; any failure keeps the fallback */
  const names = ['sun', 'saturn_ring'].concat(S.ORGS.map((_, i) => worldOf(i).tex)).filter((n, i, a) => a.indexOf(n) === i);
  const loader = new T.TextureLoader();
  const load = (name, tries) => new Promise((ok, fail) => loader.load(
    DIR + name + (name === 'saturn_ring' ? '.png' : '.jpg') + (tries ? '?r=' + tries : ''),
    (t) => { t.encoding = T.sRGBEncoding; t.anisotropy = 4; ok([name, t]); },
    undefined,
    // a dropped connection should not cost the whole scene: try twice more before giving up
    () => ((tries || 0) < 2 ? setTimeout(() => load(name, (tries || 0) + 1).then(ok, fail), 400) : fail(new Error('hero3d: missing texture ' + name)))));

  Promise.all(names.map((n) => load(n, 0))).then((pairs) => {
    const tex = {}; pairs.forEach(([n, t]) => { tex[n] = t; });
    try { build(tex); } catch (e) {
      // back to the 2D canvas, which never stopped
      mount.hidden = true; mount.textContent = ''; flat.style.display = ''; renderer.dispose();
      console.warn('hero3d: falling back to 2D', e);
    }
  }).catch((e) => { renderer.dispose(); console.warn(e.message); });

  /* soft sprites drawn once on a canvas */
  function radialTex(stops, size) {
    const c = document.createElement('canvas'); c.width = c.height = size || 256;
    const g = c.getContext('2d'), h = c.width / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    return new T.CanvasTexture(c);
  }
  function raysTex() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d'); g.translate(256, 256); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * TAU, len = rnd(120, 256), w = rnd(.006, .03);
      const gr = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      gr.addColorStop(0, `rgba(255,214,150,${rnd(.1, .34)})`); gr.addColorStop(1, 'rgba(255,170,90,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0);
      g.lineTo(Math.cos(a - w) * len, Math.sin(a - w) * len); g.lineTo(Math.cos(a + w) * len, Math.sin(a + w) * len); g.fill();
    }
    return new T.CanvasTexture(c);
  }
  function thinRingTex() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 4;
    const g = c.getContext('2d');
    [[40, 10, .35], [78, 5, .55], [110, 16, .3], [160, 6, .7], [205, 14, .45]].forEach(([x, w, a]) => { g.fillStyle = `rgba(190,240,246,${a})`; g.fillRect(x, 0, w, 4); });
    return new T.CanvasTexture(c);
  }
  const sprite = (map, scale, opacity, depthTest) => {
    const s = new T.Sprite(new T.SpriteMaterial({ map, blending: T.AdditiveBlending, transparent: true, depthWrite: false, depthTest: depthTest !== false, opacity }));
    s.scale.set(scale, scale, 1); return s;
  };
  // flat ring whose texture runs from the inner edge (u=0) to the outer edge (u=1)
  function ringMesh(inner, outer, map, opacity, color) {
    const g = new T.RingGeometry(inner, outer, 128, 1), pos = g.attributes.position, uv = g.attributes.uv, v = new T.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); uv.setXY(i, (v.length() - inner) / (outer - inner), .5); }
    const m = new T.Mesh(g, new T.MeshBasicMaterial({ map, color, transparent: true, opacity, side: T.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; return m;
  }

  function build(tex) {
    const SUN_R = 8, FOV = 36;
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(FOV, 1, 1, 6000);
    const canvas = renderer.domElement;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', flat.getAttribute('aria-label') || 'Animated solar system');

    scene.add(new T.PointLight(0xFFF0DC, 1.6, 0, 0));
    scene.add(new T.AmbientLight(0x6F66C8, .09));

    /* ---------- sun: churning surface, corona, rays, anamorphic streak ---------- */
    tex.sun.wrapS = tex.sun.wrapT = T.RepeatWrapping;
    const sphere = new T.SphereGeometry(1, 48, 32);
    const sunMat = new T.ShaderMaterial({
      uniforms: { map: { value: tex.sun }, t: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: [
        'uniform sampler2D map; uniform float t; varying vec2 vUv; varying vec3 vN; varying vec3 vV;',
        'void main(){',
        '  vec2 w = vec2(sin(vUv.y * 38. + t * .9), cos(vUv.x * 46. - t * .7)) * .004;',     // heat shimmer
        '  vec3 a = texture2D(map, vUv + w + vec2(t * .004, 0.)).rgb;',
        '  vec3 b = texture2D(map, vUv * 2. - w * 2. - vec2(t * .009, t * .003)).rgb;',     // second layer drifting the other way
        '  vec3 c = (a * 1.1 + a * b * 1.5) * vec3(1.06, .86, .66);',
        '  float f = 1. - max(dot(vN, vV), 0.);',
        '  c = c * (1.2 - f * .45) + vec3(1., .5, .12) * pow(f, 2.2) * .9;',                 // limb darkening + hot rim
        '  gl_FragColor = vec4(c, 1.);',
        '}'].join('\n'),
    });
    const sun = new T.Mesh(sphere, sunMat); sun.scale.setScalar(SUN_R); scene.add(sun);
    const halo = sprite(radialTex([[0, 'rgba(255,236,190,1)'], [.2, 'rgba(255,190,100,.8)'], [.34, 'rgba(255,150,70,.3)'], [.6, 'rgba(255,110,80,.07)'], [1, 'rgba(255,100,80,0)']]), SUN_R * 7.5, 1);
    const wide = sprite(radialTex([[0, 'rgba(255,170,90,.32)'], [.35, 'rgba(190,120,255,.09)'], [1, 'rgba(139,108,255,0)']]), SUN_R * 20, 1);
    const rays = sprite(raysTex(), SUN_R * 8.5, .5);
    const rays2 = sprite(rays.material.map, SUN_R * 6, .32);
    const core = sprite(radialTex([[0, 'rgba(255,255,240,.55)'], [.35, 'rgba(255,220,150,.2)'], [1, 'rgba(255,200,120,0)']]), SUN_R * 3, 1, false);
    const streak = sprite(radialTex([[0, 'rgba(255,225,170,.55)'], [.25, 'rgba(255,190,120,.16)'], [1, 'rgba(255,170,100,0)']]), 1, 1);
    streak.scale.set(SUN_R * 24, SUN_R * .9, 1);
    [wide, halo, rays, rays2, streak, core].forEach((s) => scene.add(s));

    /* ---------- planets ---------- */
    const atmoVS = 'varying vec3 vN; varying vec3 vP; void main(){ vec4 wp = modelMatrix * vec4(position, 1.); vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }';
    const atmoFS = [
      'uniform vec3 color; uniform float k; varying vec3 vN; varying vec3 vP;',
      'void main(){',
      '  float d = abs(dot(vN, normalize(cameraPosition - vP)));',           // 0 at the halo edge, ~.6 at the planet limb
      '  float lit = smoothstep(-.35, .6, dot(vN, normalize(-vP)));',        // brighter on the side facing the sun
      '  float i = pow(clamp(d / .62, 0., 1.), 2.4) * (.22 + .78 * lit) * k;',
      '  gl_FragColor = vec4(color * i, i);',
      '}'].join('\n');
    const ORBIT_SEG = 200, TRAIL_SEG = 40, TRAIL_ARC = 1.0;
    const baseLine = new T.Color(0xBEB9FF);
    const thinTex = thinRingTex();
    const planets = [];
    let a = SUN_R + 3, prevShell = 0, beltA = 0, beltW = 0;

    S.ORGS.forEach((o, i) => {
      const w = worldOf(i), r = 1.5 + .45 * Math.sqrt(o.n);
      const shell = Math.max(r * (o.n > 12 ? 1.8 : 1.6), w.ring ? r * 2.15 : 0);  // room for moons / rings
      a += prevShell + shell + (i > 4 ? -1.9 : i ? .5 : 0); prevShell = shell;   // the small outer worlds may share a little space
      if (i === 4 || (i === S.ORGS.length - 1 && !beltA && i < 4)) { beltW = 2.2; beltA = a - shell + beltW + .8; a += beltW * 2 + 1.6; }

      const hue = new T.Color(w.hue);
      // each orbit lives in its own slightly inclined plane
      const plane = new T.Object3D(); plane.rotation.set(rnd(-.05, .05), 0, rnd(-.05, .05)); plane.updateMatrix(); scene.add(plane);
      const pts = []; for (let k = 0; k < ORBIT_SEG; k++) { const u = k / ORBIT_SEG * TAU; pts.push(new T.Vector3(Math.cos(u) * a, 0, Math.sin(u) * a)); }
      const line = new T.LineLoop(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: baseLine.clone(), transparent: true, opacity: .13, depthWrite: false }));
      plane.add(line);
      // bright wake behind the planet, fading out along the orbit
      const tp = [], tc = [];
      for (let k = 0; k <= TRAIL_SEG; k++) { const f = k / TRAIL_SEG, u = -f * TRAIL_ARC * Math.min(1, 26 / a + .35); tp.push(Math.cos(u) * a, 0, Math.sin(u) * a); const b = Math.pow(1 - f, 1.8) * .85; tc.push(hue.r * b, hue.g * b, hue.b * b); }
      const tg = new T.BufferGeometry(); tg.setAttribute('position', new T.Float32BufferAttribute(tp, 3)); tg.setAttribute('color', new T.Float32BufferAttribute(tc, 3));
      const trail = new T.Line(tg, new T.LineBasicMaterial({ vertexColors: true, blending: T.AdditiveBlending, transparent: true, depthWrite: false }));
      plane.add(trail);

      const pivot = new T.Object3D(); scene.add(pivot);
      const axis = new T.Object3D(); axis.rotation.z = w.tilt; pivot.add(axis);
      const mat = new T.MeshStandardMaterial({ map: tex[w.tex], roughness: 1, metalness: 0, color: new T.Color(w.tint || '#ffffff'), emissive: new T.Color(0xffffff), emissiveMap: tex[w.tex], emissiveIntensity: .1 });
      const body = new T.Mesh(sphere, mat); body.scale.setScalar(r); body.rotation.y = Math.random() * TAU; axis.add(body);
      if (w.ring === 'saturn') axis.add(ringMesh(r * 1.25, r * 2.1, tex.saturn_ring, .95, 0xE9DDC4));
      if (w.ring === 'thin') axis.add(ringMesh(r * 1.4, r * 1.9, thinTex, .8, 0xffffff));
      const atmoMat = new T.ShaderMaterial({ uniforms: { color: { value: hue.clone() }, k: { value: w.atmo } }, vertexShader: atmoVS, fragmentShader: atmoFS, side: T.BackSide, blending: T.AdditiveBlending, transparent: true, depthWrite: false });
      const atmo = new T.Mesh(sphere, atmoMat); atmo.scale.setScalar(r * 1.28); pivot.add(atmo);

      const el = document.createElement('button');
      el.type = 'button'; el.className = 'h3d-label'; el.style.setProperty('--c', w.hue);
      el.setAttribute('aria-label', `${o.name}: ${o.n} merged pull request${o.n === 1 ? '' : 's'}. Show them.`);
      const b = document.createElement('b'); b.textContent = o.name;
      const sp = document.createElement('span'); sp.textContent = `${o.n} merged`;
      el.append(b, sp);

      planets.push({
        name: o.name, n: o.n, i, w, r, a, hue, plane, line, trail, pivot, body, mat, atmoMat, el,
        th: i * 2.39996, om: 0,
        pos: new T.Vector3(), h: 0, sx: 0, sy: 0, pxr: 0, dist: 1, scale: 1,
      });
    });
    planets.forEach((p) => { p.om = .2 * Math.pow(planets[0].a / p.a, 1.5) + .012; });   // Kepler: outer planets move slower
    const R = a + prevShell;                                  // radius of the whole system

    /* ---------- moons: one instanced sphere per merged PR ---------- */
    const moons = [];
    planets.forEach((p) => {
      for (let k = 0; k < p.n; k++) {
        const e = new T.Euler(p.w.tilt * .5 + rnd(-.28, .28), 0, rnd(-.28, .28));
        moons.push({
          p, d: p.r * (p.n > 12 ? 1.3 + (k % 3) * .17 + rnd(0, .1) : 1.4 + rnd(0, .15)),
          ph: (k / p.n) * TAU + rnd(0, .5), w: rnd(.5, 1.1) * (k % 7 === 0 ? -1 : 1),
          s: rnd(.2, .34),
          u: new T.Vector3(1, 0, 0).applyEuler(e), v: new T.Vector3(0, 0, 1).applyEuler(e),
        });
      }
    });
    const moonMesh = new T.InstancedMesh(new T.SphereGeometry(1, 10, 8), new T.MeshStandardMaterial({ roughness: .9, metalness: 0, emissive: 0x8B86C8, emissiveIntensity: .8 }), Math.max(1, moons.length));
    moonMesh.frustumCulled = false; moonMesh.count = moons.length;
    const mc = new T.Color();
    moons.forEach((m, k) => { mc.set(0xE4E1FF).lerp(m.p.hue, rnd(.05, .45)); moonMesh.setColorAt(k, mc); });
    scene.add(moonMesh);

    /* ---------- asteroid belt ---------- */
    const belt = new T.Object3D(); scene.add(belt);
    function makeBelt(count) {
      while (belt.children.length) belt.remove(belt.children[0]);
      if (!beltA) return;
      const mesh = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), new T.MeshStandardMaterial({ color: 0xA59FC4, roughness: 1, metalness: 0, flatShading: true, emissive: 0x4A4670, emissiveIntensity: .5 }), count);
      const m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), v = new T.Vector3();
      for (let k = 0; k < count; k++) {
        const u = Math.random() * TAU, d = beltA + (Math.random() + Math.random() - 1) * beltW, sc = rnd(.09, .36) * (Math.random() < .04 ? 2 : 1);
        v.set(Math.cos(u) * d, rnd(-.7, .7), Math.sin(u) * d); e.set(rnd(0, TAU), rnd(0, TAU), 0); q.setFromEuler(e); s.set(sc, sc * rnd(.5, 1), sc * rnd(.6, 1));
        mesh.setMatrixAt(k, m.compose(v, q, s));
      }
      mesh.frustumCulled = false; belt.add(mesh);
    }

    /* ---------- comet: bright head, particle tail blown away from the sun ---------- */
    const TAIL = 420, seeds = new Float32Array(TAIL * 4);
    for (let k = 0; k < TAIL; k++) { seeds[k * 4] = rnd(-1, 1); seeds[k * 4 + 1] = rnd(-1, 1); seeds[k * 4 + 2] = rnd(-1, 1); seeds[k * 4 + 3] = Math.random(); }
    const tailGeo = new T.BufferGeometry();
    tailGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(TAIL * 3), 3));
    tailGeo.setAttribute('aSeed', new T.BufferAttribute(seeds, 4));
    const tailMat = new T.ShaderMaterial({
      uniforms: { uHead: { value: new T.Vector3() }, uAway: { value: new T.Vector3(1, 0, 0) }, uBack: { value: new T.Vector3() }, uLen: { value: 20 }, uTime: { value: 0 }, uPx: { value: 800 } },
      vertexShader: [
        'attribute vec4 aSeed; uniform vec3 uHead, uAway, uBack; uniform float uLen, uTime, uPx; varying float vA; varying float vF;',
        'void main(){',
        '  float f = fract(aSeed.w + uTime * .4);',                                       // age of this particle, 0 at the head
        '  vec3 p = uHead + uAway * (f * uLen) + uBack * (f * f * uLen * .5) + aSeed.xyz * (f * uLen * .09 + .1);',
        '  vec4 mv = viewMatrix * vec4(p, 1.);',
        '  gl_PointSize = uPx * (1.25 * (1. - f) + .3) / -mv.z; vA = pow(1. - f, 1.7); vF = f;',
        '  gl_Position = projectionMatrix * mv;',
        '}'].join('\n'),
      fragmentShader: 'varying float vA; varying float vF; void main(){ float d = length(gl_PointCoord - .5); float s = smoothstep(.5, 0., d); vec3 c = mix(vec3(.82, .97, 1.), vec3(.55, .42, 1.), vF); gl_FragColor = vec4(c, s * vA * .5); }',
      blending: T.AdditiveBlending, transparent: true, depthWrite: false,
    });
    const tail = new T.Points(tailGeo, tailMat); tail.frustumCulled = false; scene.add(tail);
    const cometHead = sprite(radialTex([[0, 'rgba(255,255,255,1)'], [.18, 'rgba(170,235,255,.75)'], [.5, 'rgba(95,216,255,.16)'], [1, 'rgba(95,216,255,0)']], 128), 7, 1);
    scene.add(cometHead);
    const cometQ = new T.Quaternion().setFromEuler(new T.Euler(.38, .9, .16));
    const CA = R * .62, CE = .6;
    let cometU = 2.3;
    const cometAt = (u, out) => { const d = CA * (1 - CE * CE) / (1 + CE * Math.cos(u)); return out.set(Math.cos(u) * d, 0, Math.sin(u) * d).applyQuaternion(cometQ); };

    /* ---------- distant dust, for parallax against the page starfield ---------- */
    {
      const n = 520, pos = new Float32Array(n * 3), v = new T.Vector3();
      for (let k = 0; k < n; k++) { v.set(rnd(-1, 1), rnd(-.6, .6), rnd(-1, 1)).normalize().multiplyScalar(rnd(R * 4, R * 9)); pos.set([v.x, v.y, v.z], k * 3); }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      scene.add(new T.Points(g, new T.PointsMaterial({ color: 0xCFD0FF, size: 1.7, sizeAttenuation: false, transparent: true, opacity: .5, depthWrite: false })));
    }

    /* ---------- DOM ---------- */
    mount.textContent = '';
    mount.appendChild(canvas);
    const layer = document.createElement('div'); layer.className = 'h3d-labels'; mount.appendChild(layer);
    planets.forEach((p) => layer.appendChild(p.el));
    const hint = document.createElement('p'); hint.className = 'h3d-hint'; hint.setAttribute('aria-hidden', 'true'); hint.textContent = 'drag to orbit'; mount.appendChild(hint);
    mount.hidden = false;                                     // must be in layout before it can be measured

    /* ---------- state ---------- */
    let W = 1, H = 1, small = false, D = 300, el0 = .44, pscale = 1, beltCount = 0;
    let clock = 38, time = STILL ? 100 : 0, speed = 1, last = 0, born = 0, raf = 0, visible = true, lost = false;
    let hover = null, labelHot = null, ptr = null, drag = null;
    const user = { az: 0, el: 0, vaz: 0 }, cam = { az: 0, el: 0, px: 0, py: 0 }, par = { x: 0, y: 0 };
    const v3 = new T.Vector3(), v3b = new T.Vector3(), m4 = new T.Matrix4(), sunScr = { x: 0, y: 0, r: 0, d: 1 };
    const tanV = Math.tan(FOV * Math.PI / 360);

    function resize() {
      W = Math.max(1, mount.clientWidth); H = Math.max(1, mount.clientHeight); small = W < 640;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
      camera.aspect = W / H; camera.updateProjectionMatrix();
      // frame the whole system on desktop; on phones let the outer orbits run off the sides so planets stay readable
      el0 = small ? .7 : .44; pscale = small ? 1.35 : 1;
      const fit = small ? .6 : .9;
      D = Math.max(R * fit / (tanV * camera.aspect), R * fit * Math.sin(el0) * 1.3 / tanV) * 1.05;
      tailMat.uniforms.uPx.value = H * dpr / (2 * tanV);
      const want = small ? 320 : 760;
      if (want !== beltCount) { beltCount = want; makeBelt(want); }
    }

    // screen position, pixel radius and camera distance of a world-space sphere
    function toScreen(pos, radius, out) {
      v3.copy(pos).project(camera);
      out.d = camera.position.distanceTo(pos);
      out.sx = (v3.x * .5 + .5) * W; out.sy = (-v3.y * .5 + .5) * H;
      out.pxr = radius / out.d * (H / 2) / tanV; out.off = v3.z > 1 || v3.z < -1;
      return out;
    }

    function pick(x, y) {
      let best = null, bd = 1e9;
      for (const p of planets) {
        if (p.off) continue;
        const d = Math.hypot(p.sx - x, p.sy - y) - p.pxr;
        if (d < 14 && d < bd) { best = p; bd = d; }
      }
      return best;
    }

    function frame(now) {
      const dt = last ? Math.min(.05, (now - last) / 1000) : 0; last = now;
      const target = labelHot || (drag && drag.moved ? null : hover);
      if (!STILL) { time += dt; speed += ((target ? .08 : 1) - speed) * .08; clock += dt * speed; }

      /* camera: slow drift + drag + pointer parallax + scroll, with a swoop in at the start */
      if (!born) born = now;                                                       // intro runs on wall-clock time, so slow machines do not stretch it
      const k = STILL ? 1 : 1 - Math.pow(1 - clamp((now - born) / 2800, 0, 1), 4);
      const box = mount.getBoundingClientRect(), vh = window.innerHeight || 1;
      const sc = clamp((vh / 2 - (box.top + box.height / 2)) / vh, -1, 1.4);       // <0 below the fold, >0 scrolled past
      if (!drag) { user.az += user.vaz; user.vaz *= .93; }
      cam.az += (user.az - cam.az) * .14; cam.el += (user.el - cam.el) * .14;
      cam.px += (par.x - cam.px) * .05; cam.py += (par.y - cam.py) * .05;
      const az = .5 + time * .012 + cam.az + cam.px * .16 - (1 - k) * 1.7;
      const el = clamp(el0 + cam.el + cam.py * .09 + sc * .34 + (1 - k) * .8, .07, 1.45);
      const dist = D * (1 + (1 - k) * 2.8) * (sc > 0 ? 1 + sc * .7 : 1 + sc * .12);
      camera.position.set(dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), dist * Math.cos(el) * Math.cos(az));
      camera.lookAt(0, -R * .035, 0); camera.updateMatrixWorld();

      /* sun */
      sunMat.uniforms.t.value = time; sun.rotation.y = time * .03;
      const pulse = 1 + Math.sin(time * 1.5) * .04;
      halo.scale.setScalar(SUN_R * 7.5 * pulse); wide.scale.setScalar(SUN_R * 20 * (2 - pulse));
      rays.material.rotation = time * .04; rays2.material.rotation = -time * .065;
      rays.scale.setScalar(SUN_R * 8.5 * (1 + Math.sin(time * .9) * .06));
      streak.material.opacity = .75 + Math.sin(time * 1.1) * .15;

      /* planets */
      toScreen(sun.position, SUN_R, sunScr);
      for (const p of planets) {
        const ang = p.th + clock * p.om;
        p.pos.set(Math.cos(ang) * p.a, 0, Math.sin(ang) * p.a).applyMatrix4(p.plane.matrix);
        p.pivot.position.copy(p.pos); p.trail.rotation.y = -ang;
        p.h += ((p === target ? 1 : 0) - p.h) * (STILL ? 1 : .14);
        p.scale = pscale * (1 + p.h * .16);
        p.pivot.scale.setScalar(p.scale);
        p.body.rotation.y += dt * speed * p.w.spin;
        p.mat.emissiveIntensity = .1 + p.h * .3;
        p.atmoMat.uniforms.k.value = p.w.atmo * (1 + p.h * 1.3);
        p.line.material.opacity = .13 + p.h * .55; p.line.material.color.copy(baseLine).lerp(p.hue, p.h);
        toScreen(p.pos, p.r * p.scale, p);
      }

      /* moons */
      for (let i = 0; i < moons.length; i++) {
        const m = moons[i], q = m.ph + clock * m.w, d = m.d * m.p.scale, c = Math.cos(q) * d, s = Math.sin(q) * d, sz = m.s * pscale;
        m4.makeScale(sz, sz, sz).setPosition(m.p.pos.x + m.u.x * c + m.v.x * s, m.p.pos.y + m.u.y * c + m.v.y * s, m.p.pos.z + m.u.z * c + m.v.z * s);
        moonMesh.setMatrixAt(i, m4);
      }
      moonMesh.instanceMatrix.needsUpdate = true;
      belt.rotation.y = -clock * .022;

      /* comet: sweeps fast past the sun, slow far out */
      const head = cometAt(cometU, tailMat.uniforms.uHead.value), hr = head.length();
      cometU += dt * speed * 520 / (hr * hr);
      tailMat.uniforms.uAway.value.copy(head).normalize();
      tailMat.uniforms.uBack.value.copy(cometAt(cometU - .02, v3b)).sub(head).normalize();
      tailMat.uniforms.uLen.value = clamp(2200 / hr, 16, 44);
      tailMat.uniforms.uTime.value = time;
      cometHead.position.copy(head);

      renderer.render(scene, camera);

      /* labels + hover */
      if (ptr && !drag) hover = pick(ptr.x, ptr.y);
      mount.classList.toggle('hot', !!(labelHot || hover) && !drag);
      for (const p of planets) {
        const hot = p === target;
        // hidden while behind the sun or outside the frame
        const behind = p.d > sunScr.d && Math.hypot(p.sx - sunScr.sx, p.sy - sunScr.sy) < sunScr.pxr * 1.25 + p.pxr;
        const gone = p.off || behind || p.sx < -20 || p.sx > W + 20 || p.sy < H * .07 || p.sy > H * .93;
        // labels point away from the sun unless that would push them off the edge
        const room = Math.max(p.name.length, 9) * (small ? 6.7 : 7.4) + 40 + p.pxr, flip = p.sx > W - room || (p.sx < sunScr.sx && p.sx > room);
        const x = p.sx + (flip ? -1 : 1) * (p.pxr + 4);
        p.el.style.transform = `translate3d(${x.toFixed(1)}px,${p.sy.toFixed(1)}px,0) translate(${flip ? '-100%' : '0'},-50%)`;
        p.el.className = 'h3d-label' + ((small ? p.i < 3 : p.i < 5 || p.n > 1) ? ' on' : '') + (hot ? ' hot' : '') + (flip ? ' flip' : '') + (gone ? ' gone' : '');
        p.el.style.zIndex = hot ? 3 : 1;
      }
    }

    /* ---------- render loop: only while on screen, in a visible tab ---------- */
    const running = () => !STILL && visible && !document.hidden && !lost;
    function loop(now) { raf = 0; frame(now); if (running()) raf = requestAnimationFrame(loop); }
    function kick() {
      if (raf || lost) return;
      if (STILL) raf = requestAnimationFrame((n) => { raf = 0; last = 0; frame(n); });   // one frame on demand
      else if (running()) { last = 0; raf = requestAnimationFrame(loop); }
    }

    /* ---------- interaction: drag to orbit, hover to highlight, click to filter ---------- */
    const local = (e) => { const b = canvas.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    const choose = (p) => { if (p && typeof S.pickOrg === 'function') S.pickOrg(p.name); };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false, touch: e.pointerType !== 'mouse' };
      ptr = local(e); user.vaz = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    });
    canvas.addEventListener('pointermove', (e) => {
      ptr = local(e);
      if (e.pointerType === 'mouse') { par.x = (ptr.x / W) * 2 - 1; par.y = (ptr.y / H) * 2 - 1; }
      if (drag && drag.id === e.pointerId) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
        if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) { drag.moved = true; mount.classList.add('drag'); hint.style.opacity = 0; }
        if (drag.moved) {
          user.vaz = -dx * .0045; user.az += user.vaz;
          if (!drag.touch) user.el = clamp(user.el + dy * .0035, -.36, .85);       // vertical touch drags belong to page scroll
        }
      }
      kick();
    });
    const release = (e, cancelled) => {
      if (!drag || drag.id !== e.pointerId) return;
      const d = drag; drag = null; mount.classList.remove('drag');
      if (!cancelled && !d.moved) { const q = local(e); choose(pick(q.x, q.y)); }
      if (d.touch) { ptr = null; hover = null; }
      kick();
    };
    canvas.addEventListener('pointerup', (e) => release(e, false));
    canvas.addEventListener('pointercancel', (e) => release(e, true));
    canvas.addEventListener('pointerleave', () => { if (!drag) { ptr = null; hover = null; par.x = par.y = 0; kick(); } });
    planets.forEach((p) => {
      p.el.addEventListener('pointerenter', () => { labelHot = p; kick(); });
      p.el.addEventListener('pointerleave', () => { if (labelHot === p) labelHot = null; kick(); });
      p.el.addEventListener('focus', () => { labelHot = p; kick(); });
      p.el.addEventListener('blur', () => { if (labelHot === p) labelHot = null; kick(); });
      p.el.addEventListener('click', () => choose(p));
    });

    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { lost = false; kick(); });
    if ('ResizeObserver' in window) new ResizeObserver(() => { resize(); if (STILL) kick(); else if (!raf) frame(performance.now()); }).observe(mount);
    else addEventListener('resize', () => { resize(); kick(); });
    if ('IntersectionObserver' in window) new IntersectionObserver((en) => { visible = en[en.length - 1].isIntersecting; kick(); }, { rootMargin: '80px' }).observe(mount);
    document.addEventListener('visibilitychange', kick);
    if (STILL) addEventListener('scroll', kick, { passive: true });

    /* ---------- go: first frame must succeed before the 2D canvas is retired ---------- */
    resize();
    frame(performance.now());
    last = 0;
    S.use3D = true;
    flat.style.display = 'none';
    kick();
  }
})();
