import { app, refreshCats, catBySlug, go } from '../state.js';
import { h, icon, num, pct, toast, today, fmtDate, formDialog, confirmDialog, stars, debounce } from '../util.js';
import { editCategory, deleteCategory } from '../actions.js';
import { openStory } from './story.js';
import { tickSvg } from './shared.js';

const PAGE = 25;

export async function render(main, route) {
  const cat = catBySlug(route.slug);
  if (!cat) {
    document.title = 'Not found · Before I die';
    main.append(h('div', { class: 'dark-empty' }, h('h2', { style: { fontSize: '2rem' } }, 'No such chapter'), h('p', {}, 'It may be private, renamed or deleted.'), h('a', { class: 'btn', href: '#/notebook' }, 'Back to contents')));
    return;
  }
  document.title = `${cat.title} · Before I die`;
  const owner = app.db.auth.isOwner();
  let items = await app.db.items.listByCategory(cat.id);
  const state = { filter: 'all', q: '', section: '', open: new Map() };

  // ---- header
  const stat = h('p', { class: 'chapter-stat' });
  const fill = h('div', { class: 'stitch-fill' });
  const drawStat = () => {
    const d = items.filter((i) => i.done).length;
    cat.done_count = d;
    cat.total = items.length;
    stat.textContent = items.length ? `${num(d)} lived, ${num(items.length - d)} still waiting` : 'No items yet';
    fill.style.width = pct(d, items.length) + '%';
  };
  drawStat();
  main.append(
    h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, h('a', { href: '#/notebook' }, 'Notebook'), ' / ', cat.title),
    h(
      'header',
      { class: 'chapter-head' },
      h('h1', {}, `${cat.emoji ? cat.emoji + ' ' : ''}${cat.title}`),
      cat.tagline ? h('p', { class: 'chapter-tagline' }, cat.tagline) : null,
      stat,
      h('div', { class: 'stitch' }, fill),
      h(
        'div',
        { class: 'chapter-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openStory({ scope: 'category', catId: cat.id }) }, icon('book', 18), 'View Bucket'),
        owner ? h('button', { class: 'btn', type: 'button', onclick: addItemDialog }, icon('plus', 16), 'Add item') : null,
        owner ? h('button', { class: 'btn', type: 'button', onclick: async () => { if (await editCategory(cat)) app.rerender(); } }, icon('pencil', 16), 'Edit chapter') : null,
        owner ? h('button', { class: 'btn', type: 'button', onclick: async () => { if (await deleteCategory(cat)) go('#/notebook'); } }, icon('trash', 16), 'Delete chapter') : null,
        cat.is_private ? h('span', { class: 'private-note' }, icon('lock', 16), 'Private: only you can see this chapter') : null
      )
    )
  );

  // ---- sheet + toolbar
  const sectionNames = () => [...new Set(items.map((i) => i.section))];
  const segBtns = [['all', 'All'], ['todo', 'To do'], ['done', 'Done']].map(([k, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(k === 'all'), onclick: (e) => { state.filter = k; segBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); draw(); } }, label)
  );
  const search = h('input', { class: 'search-in', type: 'search', placeholder: 'Find in this chapter', 'aria-label': 'Find in this chapter' });
  search.addEventListener('input', debounce(() => { state.q = search.value.trim().toLowerCase(); draw(); }, 150));
  const jump = h('select', { 'aria-label': 'Show one section', onchange: () => { state.section = jump.value; draw(); } });
  const drawJump = () => {
    jump.innerHTML = '';
    jump.append(h('option', { value: '' }, 'All sections'));
    sectionNames().forEach((s) => jump.append(h('option', { value: s, selected: s === state.section }, s)));
    jump.hidden = sectionNames().length < 2;
  };
  const toolbar = h('div', { class: 'toolbar' }, h('div', { class: 'seg', role: 'group', 'aria-label': 'Show' }, segBtns), search, jump);
  const body = h('div', { class: 'sheet-body' });
  const sheet = h('section', { class: 'sheet' }, toolbar, body);
  main.append(sheet);

  async function toggleDone(it, rowEl) {
    const nowDone = !it.done;
    it.done = nowDone;
    it.done_at = nowDone ? it.done_at || today() : it.done_at;
    rowEl.classList.toggle('done', nowDone);
    drawStat();
    try {
      await app.db.items.update(it.id, { done: nowDone, done_at: nowDone ? it.done_at : null });
      if (!nowDone) it.done_at = null;
      if (nowDone) toast('Ticked off. One more lived.', 'ok', 4500, { label: 'Add a photo and a few words?', onClick: () => go(`#/i/${it.id}`) });
      if (state.filter !== 'all') setTimeout(draw, 600);
    } catch (e) {
      it.done = !nowDone;
      rowEl.classList.toggle('done', it.done);
      drawStat();
      toast(e.message, 'error');
    }
  }

  function row(it) {
    const rowEl = h('div', { class: 'row' + (it.done ? ' done' : '') });
    const tick = h('button', { class: 'tick', type: 'button', disabled: !owner, 'aria-label': `${it.done ? 'Untick' : 'Tick'}: ${it.title}`, 'aria-pressed': String(!!it.done), onclick: () => { toggleDone(it, rowEl); tick.setAttribute('aria-pressed', String(it.done)); } }, tickSvg());
    rowEl.append(
      tick,
      h('a', { class: 'row-title', href: `#/i/${it.id}` }, it.title),
      h(
        'div',
        { class: 'row-meta' },
        it.rating ? stars(it.rating) : null,
        it.media_count ? h('span', {}, icon('image', 15), it.media_count) : null,
        it.done && it.done_at ? h('span', { class: 'when' }, fmtDate(it.done_at, { month: 'short', year: 'numeric' })) : null
      )
    );
    return rowEl;
  }

  function matches(it) {
    if (state.filter === 'todo' && it.done) return false;
    if (state.filter === 'done' && !it.done) return false;
    if (state.q && !it.title.toLowerCase().includes(state.q)) return false;
    return true;
  }

  function draw() {
    body.innerHTML = '';
    drawJump();
    const names = sectionNames();
    let shown = 0;
    for (const name of names) {
      if (state.section && name !== state.section) continue;
      const all = items.filter((i) => i.section === name);
      const list = all.filter(matches);
      const filtering = state.filter !== 'all' || state.q;
      if (!list.length && (filtering || !owner)) continue;
      shown += list.length;
      const limit = state.open.get(name) || PAGE;
      const dn = all.filter((i) => i.done).length;
      body.append(
        h(
          'div',
          { class: 'section-head' },
          h('h3', {}, name),
          h('span', { class: 'count' }, filtering ? `${list.length} of ${all.length}` : `${dn} / ${all.length}`),
          owner
            ? [
                h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Rename section ${name}`, onclick: () => renameSection(name) }, icon('pencil', 17)),
                h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Delete section ${name}`, onclick: () => removeSection(name, all.length) }, icon('trash', 17))
              ]
            : null
        )
      );
      list.slice(0, limit).forEach((it) => body.append(row(it)));
      if (list.length > limit) {
        body.append(
          h('div', { class: 'more-row' }, h('button', { class: 'btn btn-small', type: 'button', onclick: () => { state.open.set(name, limit + 100); draw(); } }, `Show ${Math.min(100, list.length - limit)} more of ${list.length - limit}`))
        );
      }
      if (owner && !filtering) body.append(addRow(name));
    }
    if (!shown && !(owner && !state.q && state.filter === 'all')) {
      body.append(h('div', { class: 'empty' }, h('h3', {}, items.length ? 'Nothing matches' : 'This chapter is empty'), h('p', {}, items.length ? 'Try another filter or word.' : 'Nobody has written a line here yet.')));
    }
    if (owner && !items.length) {
      body.append(h('div', { class: 'empty' }, h('h3', {}, 'Write the first line'), h('p', {}, 'Add an item and it appears here, ready to tick off.'), h('button', { class: 'btn btn-primary', type: 'button', onclick: addItemDialog }, 'Add item')));
    }
  }

  function addRow(section) {
    const input = h('input', { type: 'text', placeholder: 'Add a line to this section', 'aria-label': `Add item to ${section}` });
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' || !input.value.trim()) return;
      const title = input.value.trim();
      input.disabled = true;
      try {
        const it = await app.db.items.create(cat.id, { title, section });
        items.push(it);
        // keep new item at the end of its section
        items.sort((a, b) => a.position - b.position);
        drawStat();
        draw();
        const next = [...body.querySelectorAll('.add-row input')].find((i) => i.getAttribute('aria-label') === `Add item to ${section}`);
        next?.focus();
      } catch (err) {
        toast(err.message, 'error');
        input.disabled = false;
      }
    });
    return h('div', { class: 'add-row' }, h('span', { class: 'plus' }, icon('plus', 18)), input);
  }

  async function addItemDialog() {
    const names = sectionNames();
    const v = await formDialog({
      title: 'Add an item',
      submitLabel: 'Add item',
      fields: [
        { name: 'title', label: 'What do you want to do?', required: true, placeholder: 'Watch the sunrise from Mount Girnar' },
        names.length ? { name: 'pick', label: 'Section', type: 'select', value: state.section || names[0], options: names.map((n) => ({ value: n, label: n })) } : null,
        { name: 'fresh', label: names.length ? 'Or start a new section' : 'Section name', placeholder: 'Optional: e.g. Monsoon', hint: names.length ? 'Leave empty to use the section above' : 'Defaults to General' }
      ].filter(Boolean)
    });
    if (!v) return;
    const section = v.fresh || v.pick || 'General';
    const it = await app.db.items.create(cat.id, { title: v.title, section });
    items.push(it);
    drawStat();
    toast('Added', 'ok', 4000, { label: 'Open it', onClick: () => go(`#/i/${it.id}`) });
    state.section = '';
    draw();
  }

  async function renameSection(name) {
    const v = await formDialog({ title: 'Rename section', fields: [{ name: 'to', label: 'Section name', value: name, required: true }] });
    if (!v || v.to === name) return;
    await app.db.items.renameSection(cat.id, name, v.to);
    items.forEach((i) => i.section === name && (i.section = v.to));
    if (state.section === name) state.section = v.to;
    draw();
  }

  async function removeSection(name, count) {
    const ok = await confirmDialog(`Delete the section "${name}" with its ${count} items and their photos and videos?`, { confirmLabel: 'Delete section' });
    if (!ok) return;
    await app.db.items.removeSection(cat.id, name);
    items = items.filter((i) => i.section !== name);
    state.section = '';
    drawStat();
    draw();
    await refreshCats();
  }

  draw();
}
