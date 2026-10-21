// Globe story: the camera flies from place to place in the order things happened, showing photos and words.
import { app } from '../state.js';
import { h, icon, fmtDate, stars, num, $ } from '../util.js';

const MIN_DWELL = 7000;
const PHOTO_MS = 3600;

export async function openGlobeFlight({ globe, stops, onClose }) {
  if ($('.gflight')) return;
  let i = -1;
  let gen = 0;
  let timer = null;
  let paused = false;
  let remain = 0;
  let tStart = 0;
  let slideTimer = null;
  let video = null;

  const segs = h('div', { class: 'gf-progress' }, h('i'));
  const counter = h('span', { class: 'gf-count' });
  const media = h('div', { class: 'gf-media' });
  const title = h('h2', {});
  const meta = h('p', { class: 'gf-meta' });
  const text = h('p', { class: 'gf-text' });
  const pauseBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Pause', onclick: () => setPaused(!paused) }, icon('pause', 22));
  const card = h('div', { class: 'gf-card' }, media, h('div', { class: 'gf-copy' }, h('div', { class: 'gf-top' }, counter, h('span', { class: 'grow' }), pauseBtn, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous stop', onclick: () => go(i - 1) }, icon('left', 22)), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next stop', onclick: () => go(i + 1) }, icon('right', 22)), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close tour', onclick: close }, icon('close', 22))), title, meta, text), segs);
  const root = h('div', { class: 'gflight', role: 'dialog', 'aria-label': 'Journey tour' }, card);
  document.body.append(root);
  const prevAuto = globe.autoRotate;
  globe.autoRotate = false;

  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'ArrowLeft') go(i - 1);
    else if (e.key === ' ' && document.activeElement?.tagName !== 'BUTTON') {
      e.preventDefault();
      setPaused(!paused);
    }
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', close);

  function close() {
    gen++;
    clearTimeout(timer);
    clearTimeout(slideTimer);
    video?.pause();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', close);
    root.remove();
    globe.autoRotate = prevAuto;
    globe.highlight = null;
    onClose && onClose();
  }
  function setPaused(p) {
    paused = p;
    pauseBtn.replaceChildren(icon(p ? 'play' : 'pause', 22));
    pauseBtn.setAttribute('aria-label', p ? 'Play' : 'Pause');
    if (p) {
      clearTimeout(timer);
      clearTimeout(slideTimer);
      remain -= performance.now() - tStart;
      video?.pause();
    } else {
      video?.play().catch(() => {});
      schedule(Math.max(400, remain));
    }
  }
  function schedule(ms) {
    clearTimeout(timer);
    remain = ms;
    tStart = performance.now();
    timer = setTimeout(() => go(i + 1), ms);
  }

  async function go(n) {
    const my = ++gen;
    clearTimeout(timer);
    clearTimeout(slideTimer);
    video?.pause();
    video = null;
    if (n < 0) n = 0;
    if (n >= stops.length) return finish();
    i = n;
    const s = stops[i];
    const it = s.item;
    counter.textContent = `${i + 1} of ${num(stops.length)}`;
    segs.firstChild.style.width = `${((i + 1) / stops.length) * 100}%`;
    title.textContent = it.title;
    meta.replaceChildren(...[s.place.name, it.done_at ? fmtDate(it.done_at, { month: 'long', year: 'numeric' }) : '', it.rating ? stars(it.rating) : null, it.mood].filter(Boolean).map((x) => (x.nodeType ? x : h('span', {}, x))));
    text.textContent = (it.description || '').trim().slice(0, 260);
    media.replaceChildren(h('div', { class: 'gf-empty' }, it._cat?.emoji || '✦'));
    globe.highlight = s.place.key;
    globe.setArcs(stops.slice(0, i + 1).map((x) => x.place));
    const flight = globe.flyTo(s.place.lat, s.place.lng, { zoom: 2.8, duration: i === 0 ? 2600 : 2200 });
    let files = [];
    try {
      files = it.media_count ? await app.db.media.list(it.id) : [];
    } catch {}
    await flight;
    if (my !== gen) return;
    let dwell = MIN_DWELL;
    if (files.length) {
      dwell = Math.max(MIN_DWELL, files.length * PHOTO_MS);
      showMedia(files, 0, my);
    }
    if (!paused) schedule(dwell);
    else remain = dwell;
  }

  function showMedia(files, k, my) {
    if (my !== gen) return;
    const f = files[k % files.length];
    video = null;
    let el;
    if (f.kind === 'video') {
      el = h('video', { src: f.url, playsinline: true, muted: true, autoplay: true, loop: files.length === 1 });
      video = el;
      if (files.length > 1) el.onended = () => showMedia(files, k + 1, my);
      el.play().catch(() => {});
    } else {
      el = h('img', { src: f.url, alt: f.caption || '' });
      if (files.length > 1) {
        clearTimeout(slideTimer);
        slideTimer = setTimeout(() => !paused && showMedia(files, k + 1, my), PHOTO_MS);
      }
    }
    media.replaceChildren(...[el, f.caption ? h('p', { class: 'gf-cap' }, f.caption) : null].filter(Boolean));
  }

  function finish() {
    gen++;
    clearTimeout(timer);
    title.textContent = 'That is the journey so far';
    meta.textContent = `${num(stops.length)} memories`;
    text.textContent = 'More places are waiting. The pulsing ones are next.';
    media.replaceChildren(h('div', { class: 'gf-empty' }, '🌍'));
    counter.textContent = '';
    globe.highlight = null;
    globe.flyTo(22, 72.6, { zoom: 1, duration: 2400 });
    segs.firstChild.style.width = '100%';
    const again = h('button', { class: 'btn btn-primary btn-small', type: 'button', onclick: () => go(0) }, 'Watch again');
    text.append(h('br'), h('br'), again);
  }

  await go(0);
}
