// The landing page: an interactive 3D globe. Gold = places lived, pulsing coral = places still waiting.
import { app, go as navigate } from '../state.js';
import { h, icon, num, toast, today, fmtDate, stars, openDialog, fill } from '../util.js';
import { RealGlobe } from '../globe-real.js';
import { getAllItems, groupPlaces, loadWorld } from '../data.js';
import { Globe } from '../globe-engine.js';
import { openGlobeFlight } from './globe-story.js';
import { locateDialog } from '../locate-ui.js';
import { importSeed } from '../seed.js';
import { refreshCats } from '../state.js';

export async function render(main) {
  document.title = 'Before I die';
  main.className = 'page page-full';
  const owner = app.db.auth.isOwner();

  // empty notebook: offer the starter list
  if (!app.cats.length) {
    main.append(emptyState(owner));
    return;
  }

  if (owner && app.db.hasGeo && !app.db.hasGeo()) toast('Run supabase/migration-002-globe.sql in Supabase to save exact map pins. Places in the built-in list still show up.', 'warn', 9000);
  const world = await loadWorld();
  let items = await getAllItems();

  const wrap = h('div', { class: 'globe-view' });
  const canvas = h('canvas', { class: 'globe-canvas', 'aria-label': 'Interactive globe. Drag to turn, scroll to zoom. Use the places list for a keyboard-friendly view.' });
  const stage = h('div', { class: 'globe-stage' });
  const stats = h('div', { class: 'globe-stats' });
  const panel = h('aside', { class: 'gpanel', hidden: true, 'aria-live': 'polite' });
  const legend = h('div', { class: 'globe-legend' });
  const tools = h('div', { class: 'globe-tools' });
  wrap.append(stage, stats, tools, legend, panel);
  main.append(wrap);

  // The simple drawn globe appears instantly. The realistic one (satellite imagery, 3D buildings) loads quietly in
  // the background and fades in over it when ready, so the page never waits for map tiles.
  const prefKey = 'bucketlist.globeMode';
  let pref = null;
  try { pref = localStorage.getItem(prefKey); } catch (e) { /* storage blocked */ }
  const lowEnd = !!(navigator.connection && navigator.connection.saveData) || (navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory || 8) <= 2;
  const wantReal = pref ? pref === 'real' : !lowEnd;
  let realMode = false;
  let alive = true;
  stage.append(canvas);
  let globe = new Globe(canvas, world, { lon: 72.6, lat: 22, zoom: 1.0 });
  canvas.__globe = globe;
    const actions = h(
    'div',
    { class: 'globe-actions' },
    h('button', { class: 'btn btn-primary', type: 'button', onclick: startFlight }, icon('book', 18), 'View Bucket'),
    h('button', { class: 'btn', type: 'button', onclick: surprise }, icon('shuffle', 18), 'Surprise me'),
    h('a', { class: 'btn btn-quiet', href: '#/notebook' }, icon('note', 18), 'Open notebook')
  );
  let places = [];
  let markerMap = new Map();

  function rebuild() {
    places = groupPlaces(items);
    markerMap = new Map(places.map((p) => [p.key, p]));
    globe.setMarkers(places.map((p) => ({ id: p.key, lat: p.lat, lng: p.lng, name: p.name, lived: p.done.length, dreams: p.dreams.length })));
    globe.setArcs(pathPoints());
    drawStats();
  }
  function pathPoints() {
    const done = places.flatMap((p) => p.done.map((it) => ({ it, p })));
    done.sort((a, b) => (a.it.done_at || '9999').localeCompare(b.it.done_at || '9999'));
    const pts = [];
    for (const { p } of done) if (!pts.length || pts[pts.length - 1].key !== p.key) pts.push(p);
    return pts;
  }
  function stops() {
    const all = places.flatMap((p) => p.done.map((it) => ({ item: it, place: p })));
    all.sort((a, b) => (a.item.done_at || '9999').localeCompare(b.item.done_at || '9999'));
    return all;
  }

  const lived = () => places.filter((p) => p.done.length);
  function drawStats() {
    const doneItems = items.filter((i) => i.done);
    const unplaced = doneItems.filter((i) => !i._loc);
    const dreams = places.filter((p) => p.dreams.length).length;
    stats.replaceChildren(...[
      h('h1', {}, 'Where I have been,', h('br'), 'and where I am going'),
      h(
        'p',
        { class: 'globe-line' },
        h('b', {}, num(lived().length)),
        ' places lived · ',
        h('b', {}, num(globe.visitedCountries.size)),
        ' countries · ',
        h('b', {}, num(dreams)),
        ' dreams pulsing'
      ),
      owner && unplaced.length
        ? h('button', { class: 'chip-btn', type: 'button', onclick: () => locateDialog(unplaced, refresh) }, icon('plus', 14), `${unplaced.length} lived ${unplaced.length === 1 ? 'item has' : 'items have'} no place yet`)
        : null,
      actions
    ].filter(Boolean));
  }

  async function refresh() {
    items = await getAllItems();
    const sel = globe.selected;
    rebuild();
    if (sel && markerMap.has(sel)) openPanel(sel, false);
    else closePanel();
  }

  // ---- search + controls
  const results = h('ul', { class: 'gsearch-results', hidden: true });
  const search = h('input', { class: 'gsearch', type: 'search', placeholder: 'Find a place', 'aria-label': 'Find a place on the globe', autocomplete: 'off' });
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    results.replaceChildren();
    if (q.length < 2) return (results.hidden = true);
    const hits = places.filter((p) => p.name.toLowerCase().includes(q)).sort((a, b) => b.done.length - a.done.length).slice(0, 7);
    hits.forEach((p) => results.append(h('li', {}, h('button', { type: 'button', onclick: () => { pick(p.key); search.value = ''; results.hidden = true; } }, p.name, h('small', {}, `${p.done.length} lived · ${p.dreams.length} waiting`)))));
    results.hidden = !hits.length;
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') results.querySelector('button')?.click();
    if (e.key === 'Escape') {
      results.hidden = true;
      search.blur();
    }
  });
  const toggle = (label, key, on = true) => {
    const b = h('button', { class: 'tog', type: 'button', 'aria-pressed': String(on), onclick: () => { on = !on; b.setAttribute('aria-pressed', String(on)); globe[key] = on; } }, label);
    globe[key] = on;
    return b;
  };
  tools.append(
    h('div', { class: 'gsearch-box' }, icon('search', 18), search, results),
    h('div', { class: 'tool-row' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Zoom in', onclick: () => globe.zoomBy(1.35) }, icon('plus', 20)),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Zoom out', onclick: () => globe.zoomBy(0.74) }, h('span', { style: { fontSize: '1.4rem', lineHeight: 1 } }, '−')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Reset view', title: 'Reset view', onclick: () => { closePanel(); globe.reset(); } }, icon('gate', 20))
    )
  );
  const modeBtn = h('button', { class: 'tog', type: 'button' }, 'Realistic view');
  legend.append(
    h('span', { class: 'lg lg-lived' }, 'Lived'),
    h('span', { class: 'lg lg-dream' }, 'Dream'),
    toggle('My path', 'showArcs'),
    toggle('Dreams', 'showDreams'),
    toggle('Spin', 'autoRotate', globe.autoRotate),
    h('button', { class: 'tog', type: 'button', onclick: placesDialog }, 'All places'),
    modeBtn
  );

  // a plain list of every place: handy on a phone and with a keyboard
  function placesDialog() {
    const q = h('input', { class: 'line-in', type: 'search', placeholder: 'Filter places', 'aria-label': 'Filter places' });
    const list = h('ul', { class: 'gp-list', style: { maxHeight: '50vh', overflow: 'auto' } });
    let dlg;
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      list.replaceChildren();
      [...places]
        .filter((p) => !t || p.name.toLowerCase().includes(t))
        .sort((a, b) => b.done.length - a.done.length || a.name.localeCompare(b.name))
        .slice(0, 120)
        .forEach((p) =>
          list.append(h('li', {}, h('button', { class: 'btn btn-small btn-quiet', type: 'button', style: { flex: 1, justifyContent: 'space-between', textAlign: 'left' }, onclick: () => { dlg.close(); pick(p.key); } }, p.name, h('small', {}, `${p.done.length} lived · ${p.dreams.length} waiting`))))
        );
    };
    q.addEventListener('input', draw);
    draw();
    dlg = openDialog({ title: 'All places', body: h('div', {}, q, list), actions: [{ label: 'Close', value: null }] });
  }


  // A real street map of the exact pin (OpenStreetMap embed), since the globe's coastlines are too coarse at street level.
  function streetMap(p) {
    const d = 0.004;
    const src = `https://www.openstreetmap.org/export/embed.html?bbox=${(p.lng - d).toFixed(6)},${(p.lat - d).toFixed(6)},${(p.lng + d).toFixed(6)},${(p.lat + d).toFixed(6)}&layer=mapnik&marker=${p.lat},${p.lng}`;
    openDialog({
      title: p.name,
      wide: true,
      body: h('div', {}, h('iframe', { src, title: `Street map of ${p.name}`, style: { width: '100%', height: '55vh', border: '0', borderRadius: '8px' } }), h('p', { class: 'field-hint' }, `${(+p.lat).toFixed(6)}, ${(+p.lng).toFixed(6)} · `, h('a', { href: `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=18/${p.lat}/${p.lng}`, target: '_blank', rel: 'noopener' }, 'Open full map'))),
      actions: [{ label: 'Close', kind: 'primary', value: 'ok' }]
    });
  }

  // ---- selection panel
  function pick(id) {
    globe.select(id, { fly: true, zoom: Math.max(globe.PICK_ZOOM, globe.zoom) });
    openPanel(id, true);
  }
  // The stage padding animates when the panel opens; keep the globe centred in the free area meanwhile.
  function followInsets() {
    const t0 = performance.now();
    const step = () => {
      globe.refreshInsets();
      if (performance.now() - t0 < 350) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function closePanel() {
    globe.selected = null;
    panel.hidden = true;
    fill(panel, );
    wrap.classList.remove('has-panel');
    followInsets();
  }
  async function openPanel(id, focus) {
    const p = markerMap.get(id);
    if (!p) return closePanel();
    wrap.classList.add('has-panel');
    followInsets();
    panel.hidden = false;
    globe.selected = id;
    const doneItems = [...p.done].sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
    const showN = { n: 12 };
    const dreamList = h('ul', { class: 'gp-list' });
    const drawDreams = () => {
      dreamList.replaceChildren();
      p.dreams.slice(0, showN.n).forEach((it) =>
        dreamList.append(
          h(
            'li',
            {},
            h('a', { href: `#/i/${it.id}` }, it.title),
            owner ? h('button', { class: 'btn btn-small', type: 'button', onclick: () => markDone(it, p) }, 'I did this') : null
          )
        )
      );
      if (p.dreams.length > showN.n) dreamList.append(h('li', {}, h('button', { class: 'btn btn-small btn-quiet', type: 'button', onclick: () => { showN.n += 30; drawDreams(); } }, `Show more (${p.dreams.length - showN.n} left)`)));
    };
    drawDreams();
    fill(panel, 
      h('div', { class: 'gp-head' }, h('h2', {}, p.name), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: closePanel }, icon('close', 20))),
      h('p', { class: 'gp-sub' }, `${p.done.length} lived · ${p.dreams.length} waiting`),
      h('p', { class: 'gp-sub' },
        h('button', { class: 'btn btn-small btn-quiet', type: 'button', onclick: () => globe.flyTo(p.lat, p.lng, { zoom: globe.EXACT_ZOOM }) }, 'Zoom closer'), ' ',
        h('button', { class: 'btn btn-small btn-quiet', type: 'button', onclick: () => streetMap(p) }, 'Street map')),
      doneItems.length
        ? h(
            'section',
            {},
            h('h3', {}, 'Lived here'),
            h(
              'div',
              { class: 'gp-cards' },
              doneItems.map((it) =>
                h(
                  'a',
                  { class: 'gp-card', href: `#/i/${it.id}` },
                  h('div', { class: 'gp-pic' }, it.cover_url && it.cover_kind !== 'video' ? h('img', { src: it.cover_url, alt: '', loading: 'lazy' }) : it.cover_url ? h('video', { src: it.cover_url + '#t=0.1', muted: true, preload: 'metadata' }) : h('span', {}, it._cat?.emoji || '✦')),
                  h('div', {}, h('b', {}, it.title), h('small', {}, [it.done_at ? fmtDate(it.done_at, { month: 'short', year: 'numeric' }) : '', it.media_count ? `${it.media_count} photo${it.media_count > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')), it.rating ? stars(it.rating) : null)
                )
              )
            )
          )
        : null,
      p.dreams.length ? h('section', {}, h('h3', {}, 'Still waiting'), dreamList) : null
    );
    if (focus) panel.scrollTop = 0;
  }

  async function markDone(it, p) {
    try {
      await app.db.items.update(it.id, { done: true, done_at: today(), lat: p.lat, lng: p.lng, place: it.place || p.name });
      toast('Ticked off. One more place lived.', 'ok', 5500, { label: 'Add photos and a story', onClick: () => navigate(`#/i/${it.id}`) });
      await refreshCats();
      const keep = globe.selected;
      await refresh();
      if (keep && markerMap.has(keep)) openPanel(keep, false);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function surprise() {
    const dreams = places.filter((p) => p.dreams.length);
    if (!dreams.length) return toast('Every place is lived. Add new dreams in the notebook.');
    pick(dreams[Math.floor(Math.random() * dreams.length)].key);
  }

  function startFlight() {
    const s = stops();
    if (!s.length) {
      toast('Tick off something and give it a place first. Then the globe can tell your story.', 'warn', 5000);
      return;
    }
    closePanel();
    wrap.classList.add('touring');
    followInsets();
    openGlobeFlight({
      globe,
      stops: s,
      onClose: () => {
        wrap.classList.remove('touring');
        followInsets();
        globe.setArcs(pathPoints());
      }
    });
  }

  const onGlobeClick = (m) => (m ? pick(m.id) : closePanel());
  globe.on('click', onGlobeClick);
  rebuild();
  globe.start();

  // ---- the realistic globe prepares quietly in the background; the classic one stays in use meanwhile
  let real = null;
  let preparing = false;
  let offer = null;
  const setPref = (v) => { try { localStorage.setItem(prefKey, v); } catch (e) { /* ignore */ } };
  function setModeBtn() {
    modeBtn.disabled = preparing && !real;
    modeBtn.textContent = realMode ? 'Classic view' : preparing && !real ? 'Preparing realistic…' : 'Realistic view';
    modeBtn.title = realMode ? 'Switch to the simple drawn globe' : 'Switch to the satellite globe';
  }
  async function prepareReal(ask) {
    if (preparing || realMode) return;
    preparing = true;
    setModeBtn();
    try {
      real = await RealGlobe.create(stage, world, { lon: globe.lon0, lat: globe.lat0, zoom: 1.0 });
      await real.whenIdle();
    } catch (e) {
      console.warn('Realistic globe unavailable:', e);
      if (alive) toast('The realistic globe could not start (it needs internet and WebGL). The classic globe stays.', 'warn', 6500);
      real = null;
      preparing = false;
      setModeBtn();
      return;
    }
    if (!alive) {
      real.destroy();
      real = null;
      return;
    }
    setModeBtn();
    if (ask) showOffer();
    else swapToReal();
  }
  function showOffer() {
    offer = h('div', { class: 'real-offer', role: 'dialog', 'aria-label': 'Realistic globe ready' },
      h('b', {}, 'The realistic globe is ready to explore.'),
      h('span', {}, 'View it now?'),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-small btn-primary', type: 'button', onclick: () => { closeOffer(); setPref('real'); swapToReal(); } }, 'Yes'),
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => { closeOffer(); setPref('classic'); discardReal(); } }, 'No')));
    wrap.append(offer);
  }
  function closeOffer() {
    offer && offer.remove();
    offer = null;
  }
  function discardReal() {
    real && real.destroy();
    real = null;
    preparing = false;
    setModeBtn();
  }
  async function swapToReal() {
    if (!real || realMode) return;
    while (alive && wrap.classList.contains('touring')) await new Promise((r) => setTimeout(r, 800));
    if (!alive) return;
    const old = globe;
    const r = real;
    // continue from where the classic globe is looking
    try { r.map.jumpTo({ center: [old.lon0, old.lat0], zoom: r.z0 + Math.log2(Math.max(0.75, Math.min(old.zoom, 150))) }); } catch (e) { /* ignore */ }
    r.showArcs = old.showArcs;
    r.showDreams = old.showDreams;
    r.autoRotate = old.autoRotate;
    r.on('click', onGlobeClick);
    globe = r;
    realMode = true;
    wrap.classList.add('is-real');
    r.el.__globe = r;
    rebuild();
    if (old.selected && markerMap.has(old.selected)) r.selected = old.selected;
    r.refreshInsets();
    r.start();
    r.show();
    setModeBtn();
    setTimeout(() => {
      old.destroy();
      canvas.remove();
    }, 900);
  }
  modeBtn.addEventListener('click', () => {
    if (realMode) {
      setPref('classic');
      app.rerender();
    } else {
      setPref('real');
      closeOffer();
      if (real) swapToReal();
      else prepareReal(false);
    }
  });
  setModeBtn();
  if (wantReal) setTimeout(() => alive && prepareReal(!pref), 800);
  main.append(h('p', { class: 'sr-only' }, 'The globe is a visual map. The same places are searchable above, and every item is in the notebook.'));

  return () => {
    alive = false;
    closeOffer();
    real && real.destroy();
    globe.destroy();
  };
}

function emptyState(owner) {
  const status = h('p', { class: 'sublede' });
  const bar = h('div', { class: 'stitch' }, h('div', { class: 'stitch-fill' }));
  bar.hidden = true;
  const btn = h(
    'button',
    {
      class: 'btn btn-primary',
      type: 'button',
      onclick: async () => {
        btn.disabled = true;
        bar.hidden = false;
        try {
          await importSeed(app.db, (f, t) => {
            bar.firstChild.style.width = Math.round(f * 100) + '%';
            status.textContent = `Writing: ${t}`;
          });
          await refreshCats();
          toast('Starter list loaded');
          app.rerender();
        } catch (e) {
          toast(e.message, 'error', 6000);
          btn.disabled = false;
        }
      }
    },
    'Load the starter list'
  );
  return h(
    'section',
    { class: 'cover' },
    h('div', { class: 'cover-inner' }, h('h1', {}, 'Before I die'), h('p', { class: 'lede' }, 'The globe is waiting for its first place.'), owner ? h('div', { class: 'cover-actions' }, btn, h('a', { class: 'btn', href: '#/notebook' }, 'Open the notebook')) : h('p', { class: 'sublede' }, 'Nothing has been written here yet. Come back soon.'), status, bar)
  );
}
