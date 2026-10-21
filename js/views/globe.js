// The landing page: an interactive 3D globe. Gold = places lived, pulsing coral = places still waiting.
import { app, go as navigate } from '../state.js';
import { h, icon, num, toast, today, fmtDate, stars, openDialog, fill } from '../util.js';
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
  const stage = h('div', { class: 'globe-stage' }, canvas);
  const stats = h('div', { class: 'globe-stats' });
  const panel = h('aside', { class: 'gpanel', hidden: true, 'aria-live': 'polite' });
  const legend = h('div', { class: 'globe-legend' });
  const tools = h('div', { class: 'globe-tools' });
  wrap.append(stage, stats, tools, legend, panel);
  main.append(wrap);

  const globe = new Globe(canvas, world, { lon: 72.6, lat: 22, zoom: 1.0 });
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
  legend.append(
    h('span', { class: 'lg lg-lived' }, 'Lived'),
    h('span', { class: 'lg lg-dream' }, 'Dream'),
    toggle('My path', 'showArcs'),
    toggle('Dreams', 'showDreams'),
    toggle('Spin', 'autoRotate', globe.autoRotate),
    h('button', { class: 'tog', type: 'button', onclick: placesDialog }, 'All places')
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


  // ---- selection panel
  function pick(id) {
    globe.select(id, { fly: true, zoom: Math.max(2.4, globe.zoom) });
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

  globe.on('click', (m) => (m ? pick(m.id) : closePanel()));
  rebuild();
  globe.start();
  main.append(h('p', { class: 'sr-only' }, 'The globe is a visual map. The same places are searchable above, and every item is in the notebook.'));

  return () => globe.destroy();
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
