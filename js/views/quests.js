// Quest map: chapters are regions on a fantasy map, lived items earn XP, XP raises your level.
import { app, go } from '../state.js';
import { h, icon, num, toast, today, fmtDate, openDialog, stars, fill } from '../util.js';
import { getAllItems, computeStats, xpFor, regionRank, titleFor, levelInfo } from '../data.js';
import { openStory } from './story.js';

const SVG = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  kids.flat().forEach((c) => c && e.append(c.nodeType ? c : document.createTextNode(c)));
  return e;
};
const RANKS = [1, 5, 15, 40, 100];

function layout(n, narrow) {
  const pts = [];
  if (narrow) {
    for (let i = 0; i < n; i++) pts.push([i % 2 ? 290 : 110, 110 + i * 150 + (i % 2 ? 20 : -10)]);
    return { w: 400, h: 110 + n * 150, pts };
  }
  const perRow = 5;
  const rows = Math.ceil(n / perRow);
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / perRow);
    const c = i % perRow;
    const x = 110 + (r % 2 ? perRow - 1 - c : c) * 195;
    const y = 120 + r * 215 + Math.sin(i * 1.3) * 26;
    pts.push([x, y]);
  }
  return { w: 1000, h: 120 + rows * 215, pts };
}
function smoothPath(pts) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export async function render(main) {
  document.title = 'Quest map · Before I die';
  main.className = 'page page-full';
  if (!app.cats.length) {
    main.append(h('div', { class: 'dark-empty', style: { padding: '60px 20px', margin: '0 auto' } }, h('h2', { style: { fontSize: '2rem' } }, 'The map is blank'), h('p', {}, 'Load the starter list from the globe page to draw the regions.'), h('a', { class: 'btn', href: '#/' }, 'Go to the globe')));
    return;
  }
  const owner = app.db.auth.isOwner();
  let items = await getAllItems();
  let stats = computeStats(items);
  let selected = null;
  let narrow = window.innerWidth < 760;

  const hero = h('header', { class: 'q-hero' });
  const mapBox = h('section', { class: 'q-map', 'aria-label': 'Quest map. Each circle is a region; choose one to see its quests.' });
  const side = h('aside', { class: 'q-panel', hidden: true, 'aria-live': 'polite' });
  const badgesBox = h('section', { class: 'q-badges' });
  const layoutEl = h('div', { class: 'q-layout' }, h('div', { class: 'q-main' }, mapBox), side);
  main.append(hero, layoutEl, badgesBox);

  const groups = () => {
    const m = new Map(app.cats.map((c) => [c.id, { cat: c, done: [], dreams: [], xp: 0 }]));
    for (const it of items) {
      const g = m.get(it.category_id);
      if (!g) continue;
      if (it.done) {
        g.done.push(it);
        g.xp += xpFor(it);
      } else g.dreams.push(it);
    }
    return [...m.values()];
  };

  function drawHero() {
    const li = levelInfo(stats.xp);
    fill(hero, 
      h('div', { class: 'q-player' },
        h('div', { class: 'q-avatar', 'aria-hidden': 'true' }, h('span', {}, '🧭'), h('b', {}, li.level)),
        h('div', { class: 'q-who' },
          h('h1', {}, titleFor(li.level)),
          h('p', {}, `Level ${li.level} · ${num(stats.xp)} XP`),
          h('div', { class: 'xp-bar', role: 'progressbar', 'aria-valuenow': Math.round(li.frac * 100), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Progress to next level' }, h('i', { style: { width: Math.round(li.frac * 100) + '%' } })),
          h('small', {}, `${num(li.next - stats.xp)} XP to level ${li.level + 1}`))
      ),
      h('div', { class: 'q-stats' },
        qStat(num(stats.done), 'quests done'),
        qStat(num(stats.places), 'places'),
        qStat(num(stats.photos), 'photos and videos'),
        qStat(num(stats.streak), stats.streak === 1 ? 'month streak' : 'month streak'),
        qStat(`${stats.badges.filter((b) => b.got).length}/${stats.badges.length}`, 'badges')
      ),
      h('div', { class: 'q-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openStory({ scope: 'all', theme: 'quest' }) }, icon('book', 18), 'View Bucket'),
        h('button', { class: 'btn', type: 'button', onclick: sideQuest }, icon('shuffle', 18), 'Random side quest'),
        h('a', { class: 'btn btn-quiet', href: '#/notebook' }, icon('note', 18), 'Notebook'))
    );
  }
  const qStat = (n, label) => h('div', { class: 'q-stat' }, h('b', {}, n), h('span', {}, label));

  function drawMap() {
    const gs = groups();
    const { w, h: ht, pts } = layout(gs.length, narrow);
    const lastReached = gs.reduce((a, g, i) => (g.done.length ? i : a), -1);
    const svg = sv('svg', { viewBox: `0 0 ${w} ${ht}`, class: 'qsvg', role: 'group' });
    svg.append(
      sv('defs', {},
        sv('radialGradient', { id: 'qg' }, sv('stop', { offset: '0', 'stop-color': '#2a3f86' }), sv('stop', { offset: '1', 'stop-color': '#18255c' })),
        sv('radialGradient', { id: 'qglow' }, sv('stop', { offset: '0', 'stop-color': '#e8ae2f', 'stop-opacity': '.55' }), sv('stop', { offset: '1', 'stop-color': '#e8ae2f', 'stop-opacity': '0' })))
    );
    // scenery: mountains, waves and a compass rose
    const rnd = mulberry(11);
    for (let i = 0; i < (narrow ? 14 : 30); i++) {
      const x = rnd() * w;
      const y = rnd() * ht;
      if (pts.some((p) => Math.hypot(p[0] - x, p[1] - y) < 90)) continue;
      const k = rnd();
      if (k < 0.45) svg.append(sv('path', { d: `M${x} ${y} l12 -20 l8 12 l10 -16 l12 24z`, fill: 'rgba(120,145,230,.16)', stroke: 'rgba(160,185,255,.25)' }));
      else if (k < 0.8) svg.append(sv('path', { d: `M${x} ${y} q10 -10 20 0 t20 0 t20 0`, fill: 'none', stroke: 'rgba(160,185,255,.2)', 'stroke-width': 2, 'stroke-linecap': 'round' }));
      else svg.append(sv('path', { d: `M${x} ${y} l0 -14 M${x - 8} ${y - 6} l8 -10 l8 10`, fill: 'none', stroke: 'rgba(130,200,160,.28)', 'stroke-width': 2, 'stroke-linecap': 'round' }));
    }
    const cx = narrow ? w - 52 : w - 70;
    const cy = narrow ? 52 : 70;
    svg.append(sv('g', { transform: `translate(${cx} ${cy})`, opacity: '.55' }, sv('circle', { r: 28, fill: 'none', stroke: '#9fb2ff', 'stroke-width': 1.5 }), sv('path', { d: 'M0 -34 L6 0 L0 34 L-6 0Z M-34 0 L0 -6 L34 0 L0 6Z', fill: '#9fb2ff', opacity: '.7' }), sv('text', { y: -40, 'text-anchor': 'middle', fill: '#cfd6e6', 'font-size': 13 }, 'N')));
    // the road
    svg.append(sv('path', { d: smoothPath(pts), fill: 'none', stroke: 'rgba(236,239,244,.22)', 'stroke-width': 5, 'stroke-dasharray': '2 12', 'stroke-linecap': 'round' }));
    if (lastReached > 0) svg.append(sv('path', { d: smoothPath(pts.slice(0, lastReached + 1)), fill: 'none', stroke: '#e8ae2f', 'stroke-width': 5, 'stroke-linecap': 'round', opacity: '.9' }));
    // regions
    gs.forEach((g, i) => {
      const [x, y] = pts[i];
      const rank = regionRank(g.done.length);
      const nextAt = RANKS[Math.min(rank.n, RANKS.length - 1)];
      const prevAt = rank.n ? RANKS[rank.n - 1] : 0;
      const frac = rank.n >= RANKS.length ? 1 : (g.done.length - prevAt) / (nextAt - prevAt);
      const R = narrow ? 40 : 46;
      const circ = 2 * Math.PI * (R + 6);
      const node = sv('g', { class: 'qnode' + (g.done.length ? ' lit' : '') + (selected === g.cat.id ? ' sel' : ''), transform: `translate(${x} ${y})`, tabindex: 0, role: 'button', 'aria-label': `${g.cat.title}, ${rank.name}, ${g.done.length} quests done of ${g.done.length + g.dreams.length}` });
      if (g.done.length) node.append(sv('circle', { r: R * 2.1, fill: 'url(#qglow)' }));
      node.append(
        sv('circle', { r: R + 6, fill: 'none', stroke: 'rgba(236,239,244,.18)', 'stroke-width': 5 }),
        sv('circle', { r: R + 6, fill: 'none', stroke: '#e8ae2f', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-dasharray': `${(circ * Math.max(0.02, frac)).toFixed(1)} ${circ.toFixed(1)}`, transform: 'rotate(-90)', opacity: g.done.length ? 1 : 0.35 }),
        sv('circle', { r: R, fill: g.done.length ? 'url(#qg)' : '#101a44', stroke: g.done.length ? '#e8ae2f' : 'rgba(236,239,244,.3)', 'stroke-width': 2.5 }),
        sv('text', { 'text-anchor': 'middle', y: R * 0.2, 'font-size': R * 0.78, opacity: g.done.length ? 1 : 0.55 }, g.cat.emoji || '✦'),
        sv('text', { class: 'qn-title', 'text-anchor': 'middle', y: R + 34, 'font-size': narrow ? 17 : 19 }, g.cat.title),
        sv('text', { class: 'qn-rank', 'text-anchor': 'middle', y: R + 54, 'font-size': 13 }, `${rank.name} · ${g.done.length}/${g.done.length + g.dreams.length}`)
      );
      if (i === lastReached) node.append(sv('g', { class: 'flag', transform: `translate(${R * 0.55} ${-R - 8})` }, sv('path', { d: 'M0 0V-34', stroke: '#fff', 'stroke-width': 3 }), sv('path', { d: 'M0 -34 L26 -26 L0 -18Z', fill: '#d9433f' })));
      node.addEventListener('click', () => choose(g.cat.id));
      node.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), choose(g.cat.id)));
      svg.append(node);
    });
    mapBox.replaceChildren(svg);
  }

  function choose(id) {
    selected = id;
    drawMap();
    drawPanel();
    if (narrow) side.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function drawPanel(flashId) {
    if (!selected) {
      side.hidden = true;
      layoutEl.classList.remove('open');
      return;
    }
    const g = groups().find((x) => x.cat.id === selected);
    if (!g) return;
    side.hidden = false;
    layoutEl.classList.add('open');
    const rank = regionRank(g.done.length);
    const nextAt = RANKS[rank.n] ?? null;
    const sideQ = [...g.dreams].sort(() => Math.random() - 0.5).slice(0, 8);
    if (flashId && !sideQ.some((x) => x.id === flashId)) {
      const f = g.dreams.find((x) => x.id === flashId);
      if (f) sideQ.unshift(f);
    }
    fill(side, 
      h('div', { class: 'gp-head' }, h('h2', {}, `${g.cat.emoji ? g.cat.emoji + ' ' : ''}${g.cat.title}`), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => { selected = null; drawMap(); drawPanel(); } }, icon('close', 20))),
      h('p', { class: 'gp-sub' }, `${rank.name} · ${num(g.xp)} XP earned`, nextAt ? ` · ${nextAt - g.done.length} more quest${nextAt - g.done.length > 1 ? 's' : ''} to rank up` : ' · top rank reached'),
      h('div', { class: 'qp-actions' }, h('a', { class: 'btn btn-small', href: `#/c/${g.cat.slug}` }, 'Open chapter'), h('button', { class: 'btn btn-small', type: 'button', onclick: () => openStory({ scope: 'category', catId: g.cat.id, theme: 'quest' }) }, icon('book', 15), 'View Bucket')),
      h('section', {}, h('h3', {}, `Side quests`), sideQ.length ? h('ul', { class: 'gp-list' }, sideQ.map((it) => h('li', { class: it.id === flashId ? 'hl' : '' }, h('a', { href: `#/i/${it.id}` }, it.title), owner ? h('button', { class: 'btn btn-small', type: 'button', onclick: () => complete(it) }, '+100 XP') : null))) : h('p', { class: 'gp-sub' }, 'Every quest here is done.'), g.dreams.length > 8 ? h('button', { class: 'btn btn-small btn-quiet', type: 'button', onclick: () => drawPanel() }, icon('shuffle', 15), 'Draw new quests') : null),
      g.done.length
        ? h('section', {}, h('h3', {}, `Completed (${g.done.length})`), h('div', { class: 'gp-cards' }, [...g.done].sort((a, b) => (b.done_at || '').localeCompare(a.done_at || '')).slice(0, 30).map((it) => h('a', { class: 'gp-card', href: `#/i/${it.id}` }, h('div', { class: 'gp-pic' }, it.cover_url && it.cover_kind !== 'video' ? h('img', { src: it.cover_url, alt: '', loading: 'lazy' }) : h('span', {}, it.mood || g.cat.emoji || '✦')), h('div', {}, h('b', {}, it.title), h('small', {}, [it.done_at ? fmtDate(it.done_at, { month: 'short', year: 'numeric' }) : '', `+${xpFor(it)} XP`].filter(Boolean).join(' · ')), it.rating ? stars(it.rating) : null)))))
        : null
    );
  }

  async function complete(it) {
    const before = levelInfo(stats.xp).level;
    try {
      await app.db.items.update(it.id, { done: true, done_at: today() });
      items = await getAllItems();
      stats = computeStats(items);
      toast(`Quest complete! +${xpFor({ ...it, done: true })} XP`, 'ok', 6000, { label: 'Add photos for bonus XP', onClick: () => go(`#/i/${it.id}`) });
      redraw();
      if (stats.level > before) levelUp(stats.level);
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  function levelUp(level) {
    openDialog({ title: `Level ${level}!`, body: h('div', { class: 'lvl-up' }, h('div', { class: 'lvl-badge' }, level), h('p', { class: 'dialog-text' }, `You are now a ${titleFor(level)}. Keep going.`)), actions: [{ label: 'Onward', kind: 'primary', value: 'ok' }] });
  }

  function drawBadges() {
    badgesBox.replaceChildren(
      h('h2', {}, 'Badges'),
      h('div', { class: 'badge-grid' }, stats.badges.map((b) => h('div', { class: 'badge' + (b.got ? ' got' : ''), title: b.hint }, h('span', { class: 'bd-emoji' }, b.got ? b.emoji : '🔒'), h('b', {}, b.name), h('small', {}, b.hint))))
    );
  }

  function sideQuest() {
    const pool = items.filter((i) => !i.done);
    if (!pool.length) return toast('Every quest is done. Write new ones in the notebook.');
    const it = pool[Math.floor(Math.random() * pool.length)];
    selected = it.category_id;
    drawMap();
    drawPanel(it.id);
    side.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function redraw() {
    drawHero();
    drawMap();
    drawPanel();
    drawBadges();
  }
  const onResize = () => {
    const n = window.innerWidth < 760;
    if (n !== narrow) {
      narrow = n;
      drawMap();
    }
  };
  window.addEventListener('resize', onResize);
  redraw();
  return () => window.removeEventListener('resize', onResize);
}

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
