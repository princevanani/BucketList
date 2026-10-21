// View Bucket: full-screen story mode. Chapters, then each item as photos, videos and words.
import { app } from '../state.js';
import { h, icon, num, fmtDate, stars, $ } from '../util.js';
import { getAllItems, computeStats, xpFor, titleFor, regionRank } from '../data.js';
import { trainSvg } from './shared.js';

const PHOTO_MS = 6000;
const CHAPTER_MS = 3400;

export async function openStory(opts) {
  if ($('.story')) return;
  const db = app.db;
  const prevFocus = document.activeElement;
  const scope = opts.scope; // 'all' | 'category' | 'item'
  const theme = opts.theme || ''; // '' | 'train' | 'quest'
  let summary = null;
  let mode = scope === 'item' ? 'everything' : 'lived';

  let units = [];
  let ui = 0;
  let si = 0;
  let curSlides = [];
  let curEl = null;
  let gen = 0;
  let paused = false;
  let muted = false;
  let videoEl = null;
  let timerId = null;
  let tStart = 0;
  let tRemain = 0;
  const cache = new Map();

  // ---- chrome
  const stage = h('div', { class: 'story-stage' });
  const segs = h('div', { class: 'segs' });
  const chapterLbl = h('span', { class: 'story-chapter' });
  const modeBtns = [['lived', 'Lived'], ['dreams', 'Dreams'], ['everything', 'Everything']].map(([k, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(k === mode), onclick: () => setMode(k) }, label)
  );
  const muteBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sound', onclick: () => toggleMute() }, icon('volume', 22));
  muteBtn.hidden = true;
  const pauseBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Pause', onclick: () => setPaused(!paused) }, icon('pause', 22));
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close story', onclick: close }, icon('close', 24));
  const openLink = h('a', { href: '#', onclick: close }, '');
  const counter = h('span', {});
  const spinner = h('div', { class: 'spinner', hidden: true });
  const tapL = h('div', { class: 'tap l' });
  const tapR = h('div', { class: 'tap r' });
  const root = h(
    'div',
    { class: 'story' + (theme ? ' theme-' + theme : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Bucket story' },
    theme === 'train' ? sceneryEl() : null,
    stage,
    spinner,
    tapL,
    tapR,
    h('div', { class: 'story-top' }, segs, h('div', { class: 'story-bar' }, chapterLbl, scope === 'item' ? null : h('div', { class: 'story-modes', role: 'group', 'aria-label': 'What to show' }, modeBtns), muteBtn, pauseBtn, closeBtn)),
    h('div', { class: 'story-bottom' }, openLink, counter)
  );
  $('#story-root').append(root);
  document.body.classList.add('no-scroll');
  closeBtn.focus();

  function sceneryEl() {
    return h('div', { class: 'story-scenery', 'aria-hidden': 'true' }, h('div', { class: 'layer far' }), h('div', { class: 'layer mid' }), h('div', { class: 'layer near' }), h('div', { class: 'ground' }));
  }

  // ---- tap / hold
  for (const [el, dir] of [[tapL, -1], [tapR, 1]]) {
    let holdT = null;
    let held = false;
    el.addEventListener('pointerdown', (e) => {
      held = false;
      el.setPointerCapture?.(e.pointerId);
      holdT = setTimeout(() => {
        held = true;
        setPaused(true);
      }, 220);
    });
    const up = () => {
      clearTimeout(holdT);
      if (held) setPaused(false);
      else dir > 0 ? next() : prev();
      held = false;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', () => {
      clearTimeout(holdT);
      if (held) setPaused(false);
      held = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
    else if (e.key === ' ' || e.key === 'k') {
      if (document.activeElement && document.activeElement.tagName === 'BUTTON' && e.key === ' ') return;
      e.preventDefault();
      setPaused(!paused);
    } else if (e.key === 'm' || e.key === 'M') toggleMute();
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', close);

  function close() {
    gen++;
    clearTimeout(timerId);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', close);
    videoEl?.pause();
    root.remove();
    document.body.classList.remove('no-scroll');
    if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus();
  }

  // ---- timer with pause
  function startTimer(ms) {
    clearTimeout(timerId);
    tRemain = ms;
    tStart = performance.now();
    timerId = paused ? null : setTimeout(next, tRemain);
  }
  function setPaused(p) {
    if (p === paused) return;
    paused = p;
    root.classList.toggle('paused', p);
    pauseBtn.replaceChildren(icon(p ? 'play' : 'pause', 22));
    pauseBtn.setAttribute('aria-label', p ? 'Play' : 'Pause');
    if (videoEl) {
      p ? videoEl.pause() : videoEl.play().catch(() => {});
    } else if (curSlides[si] && curSlides[si].timed) {
      if (p) {
        clearTimeout(timerId);
        timerId = null;
        tRemain -= performance.now() - tStart;
      } else {
        tStart = performance.now();
        timerId = setTimeout(next, Math.max(50, tRemain));
      }
    }
  }
  function toggleMute() {
    muted = !muted;
    if (videoEl) videoEl.muted = muted;
    muteBtn.replaceChildren(icon(muted ? 'mute' : 'volume', 22));
  }

  // ---- building the list of units
  const catOf = (id) => app.cats.find((c) => c.id === id);
  const unitOfItem = (item) => ({ kind: 'item', item, cat: catOf(item.category_id) });

  async function buildUnits() {
    if (theme === 'quest' || theme === 'train') summary = computeStats(await getAllItems());
    if (scope === 'item') {
      const list = await db.items.listByCategory(opts.catId);
      const i = Math.max(0, list.findIndex((x) => x.id === opts.itemId));
      return list.slice(i).map(unitOfItem);
    }
    const cats = app.cats.filter((c) => scope === 'all' || c.id === opts.catId);
    const dreamCount = scope === 'category' ? 25 : 8;
    const done = mode === 'dreams' ? [] : await db.items.doneList(scope === 'category' ? opts.catId : null);
    const byCat = new Map();
    done.forEach((it) => byCat.set(it.category_id, [...(byCat.get(it.category_id) || []), it]));
    const out = [];
    if (theme === 'quest' && scope === 'all') out.push({ kind: 'intro' });
    for (const cat of cats) {
      let list = [];
      if (mode === 'everything' && scope === 'category') list = await db.items.listByCategory(cat.id);
      else {
        list = byCat.get(cat.id) || [];
        if (mode === 'dreams' || mode === 'everything') list = [...list, ...(await db.items.random(dreamCount, cat.id, true))];
      }
      if (!list.length) continue;
      out.push({ kind: 'chapter', cat, total: cat.total, done: cat.done_count });
      list.forEach((it) => out.push(unitOfItem(it)));
    }
    return out;
  }

  // ---- slides for one unit (fetches media on demand)
  function trim(s, n) {
    s = (s || '').trim();
    return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s;
  }
  // Story text is kept short: a few lines, then "Read more" (which pauses the story while open).
  function plain(t) {
    return (t || '').replace(/\*\*|__/g, '').replace(/^#+\s*/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  }
  function moreText(text, n = 220, cls = 'slide-text') {
    text = plain(text);
    const p = h('p', { class: cls });
    if (text.length <= n) {
      p.textContent = text;
      return p;
    }
    const short = trim(text, n);
    const node = document.createTextNode(short);
    let open = false;
    const btn = h('button', {
      class: 'more-btn',
      type: 'button',
      onclick: (e) => {
        e.stopPropagation();
        open = !open;
        node.nodeValue = open ? text : short;
        btn.textContent = open ? 'Show less' : 'Read more';
        p.classList.toggle('expanded', open);
        setPaused(open);
      }
    }, 'Read more');
    p.append(node, ' ', btn);
    return p;
  }
  async function slidesFor(idx) {
    if (cache.has(idx)) return cache.get(idx);
    const p = (async () => {
      const u = units[idx];
      if (u.kind === 'intro') return [{ t: 'intro', dur: 5200, timed: true }];
      if (u.kind === 'chapter') return [{ t: 'chapter', u, dur: CHAPTER_MS + (theme ? 800 : 0), timed: true }];
      let item = u.item;
      let media = [];
      try {
        item = (await db.items.get(item.id)) || item;
        media = await db.media.list(item.id);
      } catch (e) {
        console.error(e);
      }
      const facts = (Array.isArray(item.fields) ? item.fields : []).filter((f) => f.label && f.value);
      const out = [];
      media.forEach((m, k) => out.push({ t: m.kind === 'video' ? 'video' : 'photo', m, item, first: k === 0, timed: m.kind !== 'video', dur: PHOTO_MS }));
      const long = (item.description || '').length > 260;
      if (!media.length || facts.length || long) {
        const chars = (item.description || '').length + facts.reduce((n, f) => n + f.value.length + f.label.length, 0);
        out.push({ t: 'type', item, facts, timed: true, dur: Math.min(12000, 5500 + Math.min(chars, 300) * 30) });
      }
      return out;
    })();
    cache.set(idx, p);
    return p;
  }

  // ---- drawing
  function meta(item) {
    const bits = [];
    if (item.place) bits.push(h('span', {}, item.place));
    if (item.done && item.done_at) bits.push(h('span', {}, fmtDate(item.done_at, { month: 'long', year: 'numeric' })));
    if (item.rating) bits.push(stars(item.rating));
    if (item.mood) bits.push(h('span', { style: { fontSize: '1.4rem' } }, item.mood));
    return bits;
  }
  function drawSegs(n, current, dur) {
    segs.innerHTML = '';
    for (let k = 0; k < n; k++) {
      const bar = h('div', { class: 'seg-bar' + (k < current ? ' full' : '') }, h('i'));
      if (k === current) {
        bar.dataset.cur = '1';
        if (dur) {
          bar.style.setProperty('--dur', dur + 'ms');
          bar.classList.add('run');
        }
      }
      segs.append(bar);
    }
  }
  const runBar = (ms) => {
    const bar = segs.querySelector('[data-cur]');
    if (bar) {
      bar.style.setProperty('--dur', ms + 'ms');
      bar.classList.add('run');
    }
  };

  function swapIn(el) {
    stage.append(el);
    void el.offsetWidth;
    el.classList.add('in');
    const old = curEl;
    curEl = el;
    if (old) setTimeout(() => old.remove(), 520);
  }

  async function show(u, s) {
    const my = ++gen;
    clearTimeout(timerId);
    timerId = null;
    videoEl?.pause();
    videoEl = null;
    muteBtn.hidden = true;
    ui = u;
    si = s;
    spinner.hidden = false;
    const unit = units[u];
    const slides = await slidesFor(u);
    if (my !== gen) return;
    curSlides = slides;
    const sl = slides[s];
    const cat = unit.cat || unit.item?.categories;
    chapterLbl.textContent = unit.kind === 'intro' ? '' : unit.kind === 'chapter' ? unit.cat.title : cat ? `${cat.emoji ? cat.emoji + ' ' : ''}${cat.title}` : '';
    const itemUnit = unit.kind === 'item' ? unit.item : null;
    openLink.textContent = itemUnit ? 'Open this item' : '';
    openLink.href = itemUnit ? `#/i/${itemUnit.id}` : '#';
    openLink.hidden = !itemUnit;
    counter.textContent = `${u + 1} of ${num(units.length)}`;
    drawSegs(slides.length, s);
    const el = renderSlide(sl, my);
    swapIn(el);
    if (sl.t !== 'photo' && sl.t !== 'video') {
      spinner.hidden = true;
      runBar(sl.dur);
      startTimer(sl.dur);
    }
    // warm the next unit while this one plays
    if (u + 1 < units.length) slidesFor(u + 1).catch(() => {});
  }

  function renderSlide(sl, my) {
    if (sl.t === 'intro') {
      const st = summary;
      return h('div', { class: 'slide slide-type q-intro' }, h('div', { class: 'big-stamp' }, 'Quest log'), h('h2', {}, `Level ${st.level}: ${titleFor(st.level)}`), h('div', { class: 'xp-bar xp-big' }, h('i', { style: { width: Math.round(st.frac * 100) + '%' } })), h('p', { class: 'slide-text' }, `${num(st.xp)} XP earned · ${num(st.done)} quests done · ${num(st.places)} places · ${st.badges.filter((b) => b.got).length} badges`));
    }
    if (sl.t === 'chapter' && theme === 'train') {
      const i = app.cats.findIndex((c) => c.id === sl.u.cat.id);
      const sign = h('div', { class: 'tr-board' }, h('small', {}, `Now arriving · Platform ${i + 1}`), h('b', {}, `${sl.u.cat.emoji ? sl.u.cat.emoji + ' ' : ''}${sl.u.cat.title}`), h('span', {}, `${num(sl.u.done)} tickets punched · ${num(sl.u.total - sl.u.done)} on the waiting list`));
      const train = h('div', { class: 'tr-train', html: trainSvg() });
      return h('div', { class: 'slide tr-station' }, sign, train);
    }
    if (sl.t === 'chapter' && theme === 'quest') {
      const rank = regionRank(sl.u.done);
      const n = String(app.cats.findIndex((c) => c.id === sl.u.cat.id) + 1).padStart(2, '0');
      return h('div', { class: 'slide slide-type slide-chapter' }, h('div', { class: 'num' }, n), h('h2', {}, `${sl.u.cat.emoji ? sl.u.cat.emoji + ' ' : ''}${sl.u.cat.title}`), h('div', { class: 'big-stamp' + (sl.u.done ? '' : ' dashed') }, rank.name), h('p', {}, `${num(sl.u.done)} quests done of ${num(sl.u.total)}`));
    }
    if (sl.t === 'chapter') {
      const n = String(app.cats.findIndex((c) => c.id === sl.u.cat.id) + 1).padStart(2, '0');
      return h('div', { class: 'slide slide-type slide-chapter' }, h('div', { class: 'num' }, n), h('h2', {}, `${sl.u.cat.emoji ? sl.u.cat.emoji + ' ' : ''}${sl.u.cat.title}`), h('p', {}, sl.u.cat.tagline || ''), h('p', {}, `${num(sl.u.done)} lived of ${num(sl.u.total)}`));
    }
    if (sl.t === 'type' && theme === 'train') {
      const it = sl.item;
      return h('div', { class: 'slide tr-ticket' }, h('div', { class: 'tk-big' }, h('div', { class: 'tk-head' }, h('span', {}, 'Before I Die Railways'), h('span', {}, it.done ? 'Punched' : 'Waiting list')), h('div', { class: 'tk-big-body' }, h('small', {}, `${it.section} → ${it.place || it._cat?.title || ''}`), h('h2', {}, it.title), h('div', { class: 'slide-meta' }, meta(it)), it.description ? moreText(it.description, 220) : null, sl.facts.length ? h('div', { class: 'slide-facts' }, sl.facts.map((f) => h('div', {}, h('b', {}, f.label + ': '), trim(plain(f.value), 140)))) : null)));
    }
    if (sl.t === 'type') {
      const it = sl.item;
      const quest = theme === 'quest';
      return h(
        'div',
        { class: 'slide slide-type' },
        h('div', { class: 'big-stamp' + (it.done ? '' : ' dashed') }, quest ? (it.done ? `Quest complete · +${xpFor(it)} XP` : 'Side quest · +100 XP') : it.done ? 'Done' : 'Still a dream'),
        h('h2', {}, it.title),
        h('div', { class: 'slide-meta' }, meta(it)),
        it.description ? moreText(it.description, 220) : null,
        sl.facts.length ? h('div', { class: 'slide-facts' }, sl.facts.map((f) => h('div', {}, h('b', {}, f.label + ': '), trim(plain(f.value), 140)))) : null
      );
    }
    // photo or video
    const it = sl.item;
    const copy = h(
      'div',
      { class: 'slide-copy' },
      sl.first && theme === 'quest' && it.done ? h('div', { class: 'xp-pop' }, `Quest complete · +${xpFor(it)} XP`) : null,
      sl.first ? [h('h2', {}, it.title), h('div', { class: 'slide-meta' }, meta(it)), it.description ? moreText(it.description, 160) : null] : null,
      sl.m.caption ? h('p', { class: 'slide-cap' }, sl.m.caption) : null
    );
    const slide = h('div', { class: 'slide' + (theme === 'train' ? ' tr-window' : '') });
    const failed = () => {
      if (my !== gen) return;
      spinner.hidden = true;
      slide.append(h('div', { class: 'slide-copy' }, h('p', { class: 'slide-text' }, 'This file could not be loaded.')));
      runBar(2500);
      startTimer(2500);
    };
    if (sl.t === 'photo') {
      const bg = h('img', { class: 'slide-bg', src: sl.m.url, alt: '' });
      const img = h('img', { class: 'slide-media ' + (ui % 2 ? 'kb-b' : 'kb-a'), src: sl.m.url, alt: sl.m.caption || it.title });
      img.style.setProperty('--dur', sl.dur + 'ms');
      slide.append(bg, img, h('div', { class: 'slide-scrim' }), copy);
      const loaded = () => {
        if (my !== gen) return;
        spinner.hidden = true;
        runBar(sl.dur);
        startTimer(sl.dur);
      };
      img.complete && img.naturalWidth ? loaded() : (img.onload = loaded);
      img.onerror = failed;
    } else {
      const v = h('video', { class: 'slide-media', src: sl.m.url, playsinline: true, preload: 'auto' });
      v.muted = muted;
      slide.append(v, h('div', { class: 'slide-scrim' }), copy);
      videoEl = v;
      muteBtn.hidden = false;
      muteBtn.replaceChildren(icon(muted ? 'mute' : 'volume', 22));
      v.onloadedmetadata = () => {
        if (my !== gen) return;
        spinner.hidden = true;
        runBar(Math.round((v.duration || 8) * 1000));
      };
      v.onended = () => my === gen && next();
      v.onerror = failed;
      if (!paused) {
        v.play().catch(() => {
          v.muted = true;
          muted = true;
          muteBtn.replaceChildren(icon('mute', 22));
          v.play().catch(() => {});
        });
      }
    }
    return slide;
  }

  // ---- navigation
  function next() {
    if (si + 1 < curSlides.length) return show(ui, si + 1);
    if (ui + 1 < units.length) return show(ui + 1, 0);
    return end();
  }
  function prev() {
    if (si > 0) return show(ui, si - 1);
    if (ui > 0) return show(ui - 1, 0);
    return show(0, 0);
  }

  function end(empty) {
    gen++;
    clearTimeout(timerId);
    videoEl?.pause();
    videoEl = null;
    spinner.hidden = true;
    segs.innerHTML = '';
    counter.textContent = '';
    openLink.hidden = true;
    const box = h(
      'div',
      { class: 'story-end' },
      empty
        ? [h('h2', {}, mode === 'lived' ? 'Nothing lived here yet' : 'Nothing to show'), h('p', {}, mode === 'lived' ? 'Tick something off and add a photo, and it will show up here.' : 'Add some items first.')]
        : [h('h2', {}, theme === 'train' ? 'End of the line, for now' : theme === 'quest' ? `Level ${summary ? summary.level : ''} and climbing` : scope === 'item' ? 'That is the end of this chapter' : 'That is the whole bucket, for now'), h('p', {}, theme === 'train' ? 'Thank you for travelling with Before I Die Railways. The waiting list is long.' : theme === 'quest' ? `${num(summary ? summary.xp : 0)} XP so far. The next quest is one tick away.` : `${num(units.filter((x) => x.kind === 'item').length)} ideas shown. The rest of the notebook is still waiting.`)],
      h(
        'div',
        { class: 'row-btns' },
        !empty ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { box.remove(); show(0, 0); } }, 'Watch again') : null,
        empty && mode === 'lived' && scope !== 'item' ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => setMode('dreams') }, 'Show the dreams') : null,
        h('button', { class: 'btn', type: 'button', onclick: close }, 'Close')
      )
    );
    root.append(box);
    box.querySelector('.btn')?.focus();
  }

  async function setMode(k) {
    mode = k;
    modeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(['lived', 'dreams', 'everything'][i] === k)));
    root.querySelector('.story-end')?.remove();
    await start();
  }

  async function start() {
    gen++;
    spinner.hidden = false;
    cache.clear();
    clearTimeout(timerId);
    stage.innerHTML = '';
    curEl = null;
    try {
      units = await buildUnits();
    } catch (e) {
      console.error(e);
      units = [];
    }
    spinner.hidden = true;
    if (!units.length) return end(true);
    show(0, 0);
  }

  await start();
}
