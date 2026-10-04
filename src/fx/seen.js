/* Visitor counter. Counts with the free Abacus counter API (abacus.jasoncameron.dev):
   "visitors" goes up once per browser, "views" on every page load. Only the live site counts;
   anywhere else it just reads. If the service cannot be reached the window stays hidden. */
(function () {
  const footer = document.querySelector('footer'); if (!footer) return;
  const API = 'https://abacus.jasoncameron.dev', NS = 'rishiraj38-github-io';
  const live = location.hostname === 'rishiraj38.github.io';
  let seenBefore = true;
  try { seenBefore = !!localStorage.getItem('seen-visit'); } catch (e) { /* storage blocked: treat as a returning visitor */ }

  const read = (action, key) => fetch(`${API}/${action}/${NS}/${key}`).then((r) => r.ok ? r.json() : { value: 0 }).then((j) => Math.max(0, j.value || 0));
  Promise.all([
    read(live && !seenBefore ? 'hit' : 'get', 'visitors'),
    read(live ? 'hit' : 'get', 'views'),
  ]).then(([visitors, views]) => {
    if (live && !seenBefore) { try { localStorage.setItem('seen-visit', '1'); } catch (e) { /* ignore */ } }
    const wrap = document.createElement('div'); wrap.className = 'seen';
    const box = document.createElement('div'); box.className = 'seen-box';
    const cell = (value, label, cls) => {
      const d = document.createElement('div'), b = document.createElement('b'), s = document.createElement('span');
      s.textContent = label; if (cls) s.className = cls; d.append(b, s); box.append(d);
      // count up
      const t0 = performance.now(), still = window.SPACE && window.SPACE.STILL;
      (function step(now) { const k = still ? 1 : Math.min(1, (now - t0) / 1600), e = 1 - Math.pow(1 - k, 4); b.textContent = Math.round(value * e).toLocaleString('en-US'); if (k < 1) requestAnimationFrame(step); })(t0);
    };
    cell(visitors, 'visitors', 'live');
    cell(views, 'page views');
    wrap.append(box);
    const buddy = footer.querySelector('.buddy');
    if (buddy) buddy.after(wrap); else footer.prepend(wrap);
  }).catch(() => { /* offline or blocked: show nothing */ });
})();
