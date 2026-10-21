// Train journey: every chapter is a station, every lived item is a ticket, every dream is on the waiting list.
import { app, go } from '../state.js';
import { h, icon, num, toast, today, fmtDate, pct, stars } from '../util.js';
import { getAllItems, computeStats } from '../data.js';
import { openStory } from './story.js';
import { trainSvg } from './shared.js';

const STATION_W = 330;

const code = (title, i) => {
  const letters = title.replace(/[^A-Za-z]/g, '').toUpperCase();
  return (letters.slice(0, 3) || 'STN').padEnd(3, 'X') + (i + 1);
};
const pnr = (id) => {
  let n = 0;
  for (const ch of String(id)) n = (n * 31 + ch.charCodeAt(0)) % 9000000000;
  return String(1000000000 + n);
};

export function ticketEl(it, opts = {}) {
  const cat = it._cat;
  const stamp = it.cover_url && it.cover_kind !== 'video' ? h('img', { class: 'tk-stamp', src: it.cover_url, alt: '', loading: 'lazy' }) : h('span', { class: 'tk-stamp tk-emoji' }, it.mood || cat?.emoji || '✦');
  return h(
    'a',
    { class: 'ticket' + (opts.compact ? ' compact' : ''), href: `#/i/${it.id}`, style: opts.style || null },
    h('div', { class: 'tk-head' }, h('span', {}, 'Before I Die Railways'), h('span', {}, 'E-ticket')),
    h(
      'div',
      { class: 'tk-body' },
      h('div', { class: 'tk-main' }, h('small', {}, `${it.section}  →  ${it._loc?.name || it.place || cat?.title || ''}`), h('b', {}, it.title)),
      stamp
    ),
    h('div', { class: 'tk-foot' }, h('span', {}, it.done_at ? fmtDate(it.done_at, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date unknown'), it.rating ? stars(it.rating) : h('span', {}), h('span', { class: 'tk-pnr' }, `PNR ${pnr(it.id)}`))
  );
}

export async function render(main) {
  document.title = 'Train journey · Before I die';
  main.className = 'page page-full';
  if (!app.cats.length) {
    main.append(h('div', { class: 'dark-empty', style: { padding: '60px 20px', margin: '0 auto' } }, h('h2', { style: { fontSize: '2rem' } }, 'No stations yet'), h('p', {}, 'Load the starter list from the globe page to lay the tracks.'), h('a', { class: 'btn', href: '#/' }, 'Go to the globe')));
    return;
  }
  const owner = app.db.auth.isOwner();
  let items = await getAllItems();
  let selected = null;
  const stats = computeStats(items);

  const head = h('header', { class: 'train-head' });
  const scene = h('section', { class: 'train-scene', 'aria-label': 'Train route. Scroll sideways or use the arrow buttons.' });
  const detail = h('section', { class: 'train-detail', 'aria-live': 'polite' });
  main.append(head, scene, detail);

  function byCat() {
    const m = new Map(app.cats.map((c) => [c.id, { cat: c, done: [], dreams: [] }]));
    for (const it of items) m.get(it.category_id)?.[it.done ? 'done' : 'dreams'].push(it);
    for (const v of m.values()) v.done.sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
    return [...m.values()];
  }

  function drawHead(groups) {
    const lastDone = items.filter((i) => i.done && i.done_at).sort((a, b) => b.done_at.localeCompare(a.done_at))[0];
    head.replaceChildren(
      h('div', {}, h('h1', {}, 'The long journey'), h('p', { class: 'train-line' }, h('b', {}, num(stats.done)), ' tickets punched · ', h('b', {}, num(groups.filter((g) => g.done.length).length)), ' of ', h('b', {}, num(groups.length)), ' stations visited', lastDone ? ` · last stop: ${lastDone._cat?.title || ''}` : '')),
      h(
        'div',
        { class: 'train-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openStory({ scope: 'all', theme: 'train' }) }, icon('book', 18), 'View Bucket'),
        h('button', { class: 'btn', type: 'button', onclick: surprise }, icon('shuffle', 18), 'Surprise me'),
        h('a', { class: 'btn btn-quiet', href: '#/notebook' }, icon('note', 18), 'Notebook')
      )
    );
  }

  let scroller;
  let layers;
  function drawScene(groups) {
    cleanups.splice(0).forEach((f) => f());
    const width = groups.length * STATION_W + 360;
    const lastIdx = (() => {
      const lastDone = items.filter((i) => i.done && i.done_at).sort((a, b) => b.done_at.localeCompare(a.done_at))[0];
      const i = lastDone ? groups.findIndex((g) => g.cat.id === lastDone.category_id) : groups.findIndex((g) => g.done.length);
      return Math.max(0, i);
    })();
    layers = ['far', 'mid', 'near'].map((n) => h('div', { class: `layer ${n}`, 'aria-hidden': 'true' }));
    const rail = h('div', { class: 'rail', style: { width: width + 'px' } });
    groups.forEach((g, i) => {
      const p = pct(g.done.length, g.done.length + g.dreams.length);
      const shown = g.done.slice(0, 3);
      const st = h(
        'div',
        { class: 'station' + (selected === g.cat.id ? ' is-selected' : '') + (g.done.length ? ' visited' : ''), style: { left: 180 + i * STATION_W + 'px' } },
        h(
          'button',
          { class: 'sign', type: 'button', 'aria-label': `${g.cat.title}: ${g.done.length} lived, ${g.dreams.length} waiting. Open timetable`, onclick: () => choose(g.cat.id) },
          h('span', { class: 'sign-plat' }, `Platform ${i + 1}`),
          h('b', {}, `${g.cat.emoji ? g.cat.emoji + ' ' : ''}${g.cat.title}`),
          h('span', { class: 'sign-code' }, code(g.cat.title, i)),
          h('span', { class: 'sign-bar' }, h('i', { style: { width: p + '%' } })),
          h('small', {}, `${g.done.length} lived · ${g.dreams.length} waiting list`)
        ),
        h('div', { class: 'pole' }),
        h('div', { class: 'tickets' }, shown.map((it, k) => ticketEl(it, { compact: true, style: { '--r': `${[-3, 2, -1.5][k]}deg`, '--k': k } })), g.done.length > 3 ? h('button', { class: 'more-tk', type: 'button', onclick: () => choose(g.cat.id) }, `+${g.done.length - 3} more tickets`) : null, !g.done.length ? h('p', { class: 'no-tk' }, 'No tickets yet. The platform is empty.') : null),
        h('div', { class: 'platform' })
      );
      rail.append(st);
    });
    const track = h('div', { class: 'track', 'aria-hidden': 'true' });
    const trainX = 180 + lastIdx * STATION_W - 40;
    const train = h('div', { class: 'train', style: { '--to': trainX + 'px' }, 'aria-hidden': 'true', html: trainSvg() });
    rail.append(track, train);
    scroller = h('div', { class: 'rail-scroll', tabindex: '0' }, rail);
    scroller.addEventListener('scroll', parallax, { passive: true });
    scroller.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') scroller.scrollBy({ left: STATION_W, behavior: 'smooth' });
      if (e.key === 'ArrowLeft') scroller.scrollBy({ left: -STATION_W, behavior: 'smooth' });
    });
    // drag with the mouse to scroll, like swiping
    let down = null;
    scroller.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && !e.target.closest('a,button')) down = { x: e.clientX, l: scroller.scrollLeft };
    });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    function onMove(e) {
      if (down) scroller.scrollLeft = down.l - (e.clientX - down.x);
    }
    function onUp() {
      down = null;
    }
    cleanups.push(() => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    });
    const arrows = h('div', { class: 'rail-arrows' }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous station', onclick: () => scroller.scrollBy({ left: -STATION_W * 1.5, behavior: 'smooth' }) }, icon('left', 24)), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next station', onclick: () => scroller.scrollBy({ left: STATION_W * 1.5, behavior: 'smooth' }) }, icon('right', 24)));
    scene.replaceChildren(h('div', { class: 'sky' }, h('div', { class: 'sun' })), ...layers, h('div', { class: 'ground' }), scroller, arrows);
    // start with the train in view
    requestAnimationFrame(() => {
      scroller.scrollLeft = Math.max(0, trainX - 220);
      parallax();
    });
  }
  const cleanups = [];
  function parallax() {
    if (!scroller) return;
    const x = scroller.scrollLeft;
    layers[0].style.backgroundPositionX = `${-x * 0.12}px`;
    layers[1].style.backgroundPositionX = `${-x * 0.35}px`;
    layers[2].style.backgroundPositionX = `${-x * 0.7}px`;
  }

  function choose(id) {
    selected = id;
    scene.querySelectorAll('.station').forEach((s, i) => s.classList.toggle('is-selected', app.cats[i]?.id === id));
    const i = app.cats.findIndex((c) => c.id === id);
    scroller.scrollTo({ left: Math.max(0, 180 + i * STATION_W - scroller.clientWidth / 2 + STATION_W / 2), behavior: 'smooth' });
    drawDetail();
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function drawDetail(highlightId) {
    if (!selected) {
      detail.replaceChildren(h('p', { class: 'detail-hint' }, 'Tap a station sign to open its timetable: every ticket you have punched and the stops still waiting.'));
      return;
    }
    const g = byCat().find((x) => x.cat.id === selected);
    if (!g) return;
    const waiting = [...g.dreams].sort(() => Math.random() - 0.5).slice(0, 10);
    detail.replaceChildren(
      h(
        'div',
        { class: 'sheet timetable' },
        h('div', { class: 'sheet-head' }, h('h2', {}, `${g.cat.emoji ? g.cat.emoji + ' ' : ''}${g.cat.title}`), h('span', { class: 'grow' }), h('a', { class: 'btn btn-small', href: `#/c/${g.cat.slug}` }, 'Open chapter'), h('button', { class: 'btn btn-small', type: 'button', onclick: () => { selected = null; drawScene(byCat()); drawDetail(); } }, 'Close')),
        h('div', { class: 'tt-body' },
          h('h3', {}, `Tickets punched (${g.done.length})`),
          g.done.length ? h('div', { class: 'tt-tickets' }, g.done.map((it) => ticketEl(it))) : h('p', { class: 'tt-empty' }, 'Nothing punched here yet.'),
          h('div', { class: 'tt-wl-head' }, h('h3', {}, `Waiting list (${g.dreams.length})`), g.dreams.length > 10 ? h('button', { class: 'btn btn-small', type: 'button', onclick: () => drawDetail() }, icon('shuffle', 15), 'Shuffle') : null),
          h('ul', { class: 'tt-wl' }, waiting.map((it, k) => h('li', { class: it.id === highlightId ? 'hl' : '' }, h('span', { class: 'wl-no' }, `WL ${k + 1}`), h('a', { href: `#/i/${it.id}` }, it.title), owner ? h('button', { class: 'btn btn-small', type: 'button', onclick: () => board(it) }, 'Board') : null)))
        )
      )
    );
  }

  async function board(it) {
    try {
      await app.db.items.update(it.id, { done: true, done_at: today() });
      toast('Ticket punched. Welcome aboard.', 'ok', 5500, { label: 'Add photos and a story', onClick: () => go(`#/i/${it.id}`) });
      await reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function reload() {
    items = await getAllItems();
    Object.assign(stats, computeStats(items));
    const g = byCat();
    drawHead(g);
    drawScene(g);
    drawDetail();
  }

  function surprise() {
    const pool = items.filter((i) => !i.done);
    if (!pool.length) return toast('Every stop is punched. Add new dreams in the notebook.');
    const it = pool[Math.floor(Math.random() * pool.length)];
    selected = it.category_id;
    drawScene(byCat());
    drawDetail(it.id);
    // make sure the chosen dream is in the shuffled list
    const g = byCat().find((x) => x.cat.id === selected);
    detail.querySelector('.tt-wl')?.prepend(h('li', { class: 'hl' }, h('span', { class: 'wl-no' }, 'WL 1'), h('a', { href: `#/i/${it.id}` }, it.title), owner ? h('button', { class: 'btn btn-small', type: 'button', onclick: () => board(it) }, 'Board') : null));
    detail.scrollIntoView({ behavior: 'smooth' });
  }

  const g0 = byCat();
  drawHead(g0);
  drawScene(g0);
  drawDetail();
  return () => cleanups.forEach((f) => f());
}
