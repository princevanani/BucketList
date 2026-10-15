import { app, refreshCats, go } from '../state.js';
import { h, icon, num, pct, toast, confirmDialog, fmtDate } from '../util.js';
import { addCategory, editCategory, deleteCategory, moveCategory } from '../actions.js';
import { importSeed } from '../seed.js';
import { openStory } from './story.js';
import { coverPic } from './shared.js';

export async function render(main) {
  document.title = 'Before I die';
  const cats = app.cats;
  const total = cats.reduce((n, c) => n + c.total, 0);
  const done = cats.reduce((n, c) => n + c.done_count, 0);
  const p = pct(done, total);
  const owner = app.db.auth.isOwner();

  // ---- cover
  const fill = h('div', { class: 'stitch-fill' });
  const cover = h(
    'section',
    { class: 'cover' },
    total
      ? h('div', { class: 'cover-stamp', 'aria-label': `${p} percent lived` }, h('div', {}, h('b', {}, `${p}%`), h('span', {}, 'lived')))
      : null,
    h(
      'div',
      { class: 'cover-inner' },
      h('h1', {}, 'Before I die'),
      total
        ? [
            h('p', { class: 'lede' }, `${num(done)} lived, ${num(total - done)} still waiting.`),
            h('p', { class: 'sublede' }, 'Every line here is something I want to do. The ticked ones come with photos, videos and the story of how it felt.'),
            h('div', { class: 'stitch', role: 'progressbar', 'aria-valuenow': p, 'aria-valuemin': 0, 'aria-valuemax': 100 }, fill)
          ]
        : h('p', { class: 'lede' }, 'An empty notebook, ready for the first line.'),
      total
        ? h(
            'div',
            { class: 'cover-actions' },
            h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openStory({ scope: 'all' }) }, icon('book', 18), 'View Bucket'),
            h(
              'button',
              {
                class: 'btn',
                type: 'button',
                onclick: async () => {
                  const [r] = await app.db.items.random(1, null, true);
                  if (r) go(`#/i/${r.id}`);
                  else toast('Everything is ticked. Add something new.');
                }
              },
              icon('shuffle', 18),
              'Surprise me'
            )
          )
        : null
    )
  );
  requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = p + '%')));
  main.append(cover);

  // ---- empty states
  if (!cats.length) {
    if (owner) main.append(await starterPanel(main));
    else main.append(h('div', { class: 'dark-empty' }, h('p', {}, 'Nothing has been written here yet. Come back soon.')));
    return;
  }

  // ---- contents
  let editing = false;
  const toc = h('ol', { class: 'toc' });
  const sheet = h('section', { class: 'sheet', 'aria-labelledby': 'toc-h' });
  const drawToc = () => {
    toc.innerHTML = '';
    app.cats.forEach((c, i) => {
      const cp = pct(c.done_count, c.total);
      toc.append(
        h(
          'li',
          { class: 'toc-row', style: { '--p': cp + '%' } },
          h('span', { class: 'toc-fill' }),
          h(
            'a',
            { class: 'toc-link', href: `#/c/${c.slug}` },
            h('span', { class: 'toc-num' }, String(i + 1).padStart(2, '0')),
            h(
              'span',
              { class: 'toc-main' },
              h('span', { class: 'toc-title' }, `${c.emoji ? c.emoji + ' ' : ''}${c.title}`),
              c.tagline ? h('span', { class: 'toc-tag' }, c.tagline) : null,
              c.is_private ? h('span', { class: 'toc-lock' }, 'Private') : null,
              h('span', { class: 'toc-leader' })
            ),
            h('span', { class: 'toc-count' }, `${num(c.done_count)}`, h('small', {}, ` / ${num(c.total)}`))
          ),
          owner
            ? h(
                'span',
                { class: 'toc-tools' },
                h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Move ${c.title} up`, disabled: i === 0, onclick: async () => { await moveCategory(c, -1); drawToc(); } }, icon('up', 18)),
                h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Move ${c.title} down`, disabled: i === app.cats.length - 1, onclick: async () => { await moveCategory(c, 1); drawToc(); } }, icon('down', 18)),
                h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Edit ${c.title}`, onclick: async () => { if (await editCategory(c)) drawToc(); } }, icon('pencil', 18)),
                h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Delete ${c.title}`, onclick: async () => { if (await deleteCategory(c)) app.rerender(); } }, icon('trash', 18))
              )
            : null
        )
      );
    });
  };
  drawToc();
  const editBtn = owner
    ? h('button', { class: 'btn btn-small', type: 'button', 'aria-pressed': 'false', onclick: (e) => {
        editing = !editing;
        sheet.classList.toggle('editing', editing);
        e.currentTarget.setAttribute('aria-pressed', String(editing));
        e.currentTarget.textContent = editing ? 'Done rearranging' : 'Rearrange chapters';
      } }, 'Rearrange chapters')
    : null;
  sheet.append(
    h('div', { class: 'sheet-head' }, h('h2', { id: 'toc-h' }, 'Contents'), h('span', { class: 'grow' }), editBtn),
    toc,
    owner
      ? h('div', { class: 'toc-foot' }, h('button', { class: 'btn', type: 'button', onclick: async () => { const c = await addCategory(); if (c) go(`#/c/${c.slug}`); } }, icon('plus', 16), 'Add a chapter'))
      : null
  );
  main.append(sheet);

  // ---- lately
  const recent = (await app.db.items.recentDone(6)).filter(Boolean);
  if (recent.length) {
    main.append(
      h('h2', { class: 'section-title' }, 'Lately, I did'),
      h(
        'div',
        { class: 'polaroids' },
        recent.map((it, i) =>
          h(
            'a',
            { class: 'polaroid', href: `#/i/${it.id}`, style: { '--r': `${[-3, 2, -1.5, 3, -2.5, 1.5][i % 6]}deg`, '--tape': `${[-4, 3, -2, 4, -3, 2][i % 6]}deg` } },
            coverPic(it),
            h('div', { class: 'polaroid-cap' }, h('b', {}, it.title), h('small', {}, [it.done_at ? fmtDate(it.done_at, { month: 'short', year: 'numeric' }) : '', it.place].filter(Boolean).join(' · ')))
          )
        )
      )
    );
  }
}

async function starterPanel() {
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
          await importSeed(app.db, (f, title) => {
            bar.firstChild.style.width = Math.round(f * 100) + '%';
            status.textContent = `Writing: ${title}`;
          });
          await refreshCats();
          toast('Starter list loaded');
          app.rerender();
        } catch (e) {
          console.error(e);
          toast(e.message, 'error', 6000);
          btn.disabled = false;
        }
      }
    },
    'Load the starter list'
  );
  return h(
    'section',
    { class: 'dark-empty' },
    h('h2', { style: { fontSize: '2rem', marginBottom: '.4em' } }, 'Start with a full notebook?'),
    h('p', {}, 'I can fill it with about 7,400 ideas in 15 chapters: travel, food, sport, creativity, love and more. Everything stays editable: rename, move, delete, or add your own.'),
    h('div', { class: 'cover-actions' }, btn, h('button', { class: 'btn', type: 'button', onclick: async () => { const c = await addCategory(); if (c) go(`#/c/${c.slug}`); } }, 'Start from blank')),
    status,
    bar
  );
}
