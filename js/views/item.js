import { app, catById, go, refreshCats } from '../state.js';
import { h, icon, toast, today, fmtDate, stars, debounce, confirmDialog } from '../util.js';
import { prepareFile } from '../media.js';
import { deleteItem } from '../actions.js';
import { resolvePlace } from '../locate-ui.js';
import { openStory } from './story.js';

const MOODS = ['😍', '🤩', '😊', '😌', '🥹', '😅', '😴', '😬', '😢', '🙏'];
const PRESETS = ['How it tasted', 'How I felt', 'Who was with me', 'What it cost', 'Best moment', 'What I would do differently', 'Would I do it again'];

export async function render(main, route) {
  const it = await app.db.items.get(route.id);
  if (!it) {
    document.title = 'Not found · Before I die';
    main.append(h('div', { class: 'dark-empty' }, h('h2', { style: { fontSize: '2rem' } }, 'No such item'), h('p', {}, 'It may be private or deleted.'), h('a', { class: 'btn', href: '#/notebook' }, 'Back to contents')));
    return;
  }
  document.title = `${it.title} · Before I die`;
  const cat = catById(it.category_id) || { id: it.category_id, slug: it.categories?.slug, title: it.categories?.title, emoji: it.categories?.emoji };
  const owner = app.db.auth.isOwner();
  it.fields = Array.isArray(it.fields) ? it.fields : [];
  it.tags = Array.isArray(it.tags) ? it.tags : [];

  const siblings = await app.db.items.listByCategory(it.category_id);
  const idx = siblings.findIndex((s) => s.id === it.id);
  const prev = siblings[idx - 1];
  const next = siblings[idx + 1];

  // ---- autosave
  const saveState = h('span', { class: 'save-state', 'aria-live': 'polite' });
  let dirty = {};
  const persist = async () => {
    const patch = dirty;
    dirty = {};
    if (!Object.keys(patch).length) return;
    saveState.textContent = 'Saving…';
    try {
      await app.db.items.update(it.id, patch);
      saveState.textContent = 'Saved';
    } catch (e) {
      dirty = { ...patch, ...dirty };
      saveState.textContent = 'Not saved';
      toast(e.message, 'error', 5000);
    }
  };
  const queue = debounce(persist, 700);
  const set = (k, v) => {
    it[k] = v;
    dirty[k] = v;
    saveState.textContent = '…';
    queue();
  };

  main.append(
    h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, h('a', { href: '#/notebook' }, 'Notebook'), ' / ', h('a', { href: `#/c/${cat.slug}` }, cat.title), ' / ', it.section)
  );

  // ---- journal
  const journal = h('article', { class: 'sheet journal' });
  const title = h('textarea', { class: 'item-title', rows: 1, 'aria-label': 'Title', readonly: !owner, maxlength: 300 }, it.title);
  const fit = () => {
    title.style.height = 'auto';
    title.style.height = title.scrollHeight + 'px';
  };
  title.addEventListener('input', () => {
    fit();
    if (title.value.trim()) set('title', title.value.trim().replace(/\n/g, ' '));
  });
  title.addEventListener('keydown', (e) => e.key === 'Enter' && e.preventDefault());
  journal.append(h('div', { class: 'journal-top' }, title, owner ? saveState : null), h('p', { class: 'item-where' }, `${cat.emoji ? cat.emoji + ' ' : ''}`, h('a', { href: `#/c/${cat.slug}` }, cat.title), ` · ${it.section}`));

  // status stamp
  const stamp = h('button', { class: 'status-stamp', type: 'button', disabled: !owner });
  const dateIn = h('input', { class: 'line-in', type: 'date', value: it.done_at || '', 'aria-label': 'Date done', style: { width: 'auto' } });
  const drawStamp = (land) => {
    stamp.className = 'status-stamp' + (it.done ? ' is-done' : '') + (land ? ' land' : '');
    stamp.innerHTML = '';
    stamp.append(it.done ? 'Done' : 'Not yet', h('small', {}, it.done ? (it.done_at ? fmtDate(it.done_at) : 'date unknown') : 'still a dream'));
    stamp.setAttribute('aria-pressed', String(!!it.done));
    dateIn.hidden = !it.done || !owner;
    dateIn.value = it.done_at || '';
  };
  stamp.addEventListener('click', () => {
    const now = !it.done;
    it.done = now;
    dirty.done = now;
    if (now && !it.done_at) it.done_at = today();
    dirty.done_at = now ? it.done_at : null;
    if (!now) it.done_at = null;
    drawStamp(now);
    queue();
    if (now) toast('Ticked off. Tell the story below.');
  });
  dateIn.addEventListener('change', () => {
    set('done_at', dateIn.value || null);
    drawStamp(false);
  });
  drawStamp(false);
  journal.append(h('div', { class: 'status-row' }, stamp, dateIn));

  if (owner) {
    // place + rating
    const place = h('input', { class: 'line-in', type: 'text', value: it.place || '', placeholder: 'Where did it happen?', id: 'f-place' });
    const pin = h('small', { class: 'field-hint pin-note' });
    const showPin = () => {
      pin.replaceChildren();
      if (typeof it.lat === 'number' && typeof it.lng === 'number') pin.append(icon('gate', 13), ` On the globe at ${it.lat.toFixed(2)}, ${it.lng.toFixed(2)} `, h('a', { href: '#/' }, 'See it'));
      else if (place.value.trim()) pin.textContent = 'Not on the globe yet. Try a city or country, or "lat, lng".';
    };
    let pinGen = 0;
    const locatePlace = debounce(async () => {
      const my = ++pinGen;
      const text = place.value.trim();
      if (!text) {
        set('lat', null);
        set('lng', null);
        return showPin();
      }
      pin.textContent = 'Looking for it on the map…';
      const r = await resolvePlace(text);
      if (my !== pinGen) return;
      if (r) {
        set('lat', r.lat);
        set('lng', r.lng);
      } else {
        set('lat', null);
        set('lng', null);
      }
      showPin();
    }, 900);
    place.addEventListener('input', () => {
      set('place', place.value);
      locatePlace();
    });
    showPin();
    const ratingBox = h('div');
    const drawRating = () => {
      ratingBox.innerHTML = '';
      ratingBox.append(stars(it.rating || 0, { onPick: (n) => { set('rating', n || null); drawRating(); } }));
    };
    drawRating();
    journal.append(h('div', { class: 'two' }, h('div', { class: 'fld' }, h('label', { for: 'f-place' }, 'Where'), place, pin), h('div', { class: 'fld' }, h('span', { class: 'lab' }, 'How good was it'), ratingBox)));

    // mood
    const moodBox = h('div', { class: 'moods', role: 'group', 'aria-label': 'Mood' });
    const drawMood = () => {
      moodBox.innerHTML = '';
      MOODS.forEach((m) =>
        moodBox.append(h('button', { class: 'mood', type: 'button', 'aria-pressed': String(it.mood === m), 'aria-label': `Mood ${m}`, onclick: () => { set('mood', it.mood === m ? '' : m); drawMood(); } }, m))
      );
    };
    drawMood();
    journal.append(h('div', { class: 'fld' }, h('span', { class: 'lab' }, 'How I felt'), moodBox));

    // story
    const story = h('textarea', { class: 'lines', id: 'f-story', rows: 6, placeholder: 'How was it? What do you remember: the smell, the noise, the light, the people.' }, it.description || '');
    story.addEventListener('input', () => set('description', story.value));
    journal.append(h('div', { class: 'fld' }, h('label', { for: 'f-story' }, 'How it was'), story));

    // custom fields
    const customBox = h('div');
    const chipsBox = h('div', { class: 'chips' });
    const drawCustom = () => {
      customBox.innerHTML = '';
      it.fields.forEach((f, i) => {
        const label = h('input', { class: 'label-in', type: 'text', value: f.label, 'aria-label': 'Field name', placeholder: 'Name this note' });
        const value = h('textarea', { class: 'lines', rows: 2, 'aria-label': f.label || 'Note' }, f.value || '');
        label.addEventListener('input', () => { f.label = label.value; set('fields', it.fields); });
        value.addEventListener('input', () => { f.value = value.value; set('fields', it.fields); });
        customBox.append(
          h('div', { class: 'custom' }, label, value, h('button', { class: 'icon-btn x', type: 'button', 'aria-label': `Remove ${f.label || 'note'}`, onclick: () => { it.fields.splice(i, 1); set('fields', it.fields); drawCustom(); } }, icon('close', 16)))
        );
      });
      chipsBox.innerHTML = '';
      PRESETS.filter((p) => !it.fields.some((f) => f.label === p)).forEach((p) =>
        chipsBox.append(h('button', { class: 'chip', type: 'button', onclick: () => addField(p) }, `+ ${p}`))
      );
      chipsBox.append(h('button', { class: 'chip', type: 'button', onclick: () => addField('') }, '+ Your own note'));
    };
    const addField = (label) => {
      it.fields.push({ label, value: '' });
      set('fields', it.fields);
      drawCustom();
      const inputs = customBox.querySelectorAll(label ? 'textarea' : '.label-in');
      inputs[inputs.length - 1]?.focus();
    };
    drawCustom();
    journal.append(customBox, chipsBox);

    // tags
    const tags = h('input', { class: 'line-in', type: 'text', id: 'f-tags', value: it.tags.join(', '), placeholder: 'monsoon, with family, solo…' });
    tags.addEventListener('input', () => set('tags', tags.value.split(',').map((t) => t.trim()).filter(Boolean)));
    journal.append(h('div', { class: 'fld' }, h('label', { for: 'f-tags' }, 'Tags'), tags));
  } else {
    // read-only
    if (it.done && (it.place || it.rating || it.mood)) {
      journal.append(h('div', { class: 'status-row' }, it.place ? h('span', {}, icon('gate', 16), ' ', it.place) : null, it.rating ? stars(it.rating) : null, it.mood ? h('span', { style: { fontSize: '1.6rem' } }, it.mood) : null));
    }
    if (it.description) journal.append(h('div', { class: 'fld' }, h('span', { class: 'lab' }, 'How it was'), h('p', { class: 'prose' }, it.description)));
    const filled = it.fields.filter((f) => f.label && f.value);
    if (filled.length) journal.append(h('dl', { class: 'facts' }, filled.map((f) => [h('dt', {}, f.label), h('dd', {}, f.value)])));
    if (it.tags.length) journal.append(h('div', { class: 'tags' }, it.tags.map((t) => h('span', { class: 'tag' }, t))));
    if (!it.done) journal.append(h('p', { class: 'item-where', style: { marginTop: '18px' } }, 'Still on the list. No story yet.'));
  }

  // actions
  journal.append(
    h(
      'div',
      { class: 'danger-zone' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openStory({ scope: 'item', catId: it.category_id, itemId: it.id }) }, icon('book', 18), 'View Bucket'),
      prev ? h('a', { class: 'btn', href: `#/i/${prev.id}` }, icon('left', 16), 'Previous') : null,
      next ? h('a', { class: 'btn', href: `#/i/${next.id}` }, 'Next', icon('right', 16)) : null,
      owner ? h('button', { class: 'btn', type: 'button', onclick: () => deleteItem(it, cat) }, icon('trash', 16), 'Delete item') : null
    )
  );

  // ---- media table
  const grid = h('div', { class: 'media-grid' });
  const table = h('aside', { class: 'table' }, h('h2', {}, 'Photos and videos'));
  let media = await app.db.media.list(it.id);

  const drawMedia = () => {
    grid.innerHTML = '';
    if (!media.length) {
      grid.append(h('p', { class: 'no-media' }, owner ? 'Nothing here yet. Drop photos and videos below: as many as you like.' : 'No photos or videos yet.'));
      return;
    }
    media.forEach((m, i) => {
      const pic = h('div', { class: 'polaroid-pic' });
      if (m.kind === 'video') pic.append(h('video', { src: m.url + '#t=0.1', muted: true, preload: 'metadata', playsinline: true }), h('span', { class: 'play-badge' }, icon('play', 14)));
      else pic.append(h('img', { src: m.thumb || m.url, alt: m.caption || it.title, loading: 'lazy' }));
      const cap = owner
        ? h('input', { class: 'cap-in', type: 'text', value: m.caption || '', placeholder: 'Add a caption', 'aria-label': 'Caption' })
        : h('p', { class: 'cap-text' }, m.caption || '');
      if (owner) {
        const saveCap = debounce(() => app.db.media.update(m.id, { caption: cap.value }).catch((e) => toast(e.message, 'error')), 600);
        cap.addEventListener('input', () => { m.caption = cap.value; saveCap(); });
      }
      const tools = owner
        ? h(
            'div',
            { class: 'media-tools' },
            i !== 0 ? h('button', { type: 'button', title: 'Make cover', 'aria-label': 'Make cover', onclick: async () => { await app.db.media.makeCover(it.id, m.id); media = await app.db.media.list(it.id); drawMedia(); } }, icon('star', 16)) : null,
            h('button', { type: 'button', title: 'Delete', 'aria-label': 'Delete this file', onclick: async () => { if (!(await confirmDialog('Delete this file for good?', { confirmLabel: 'Delete' }))) return; await app.db.media.remove(m); media = await app.db.media.list(it.id); drawMedia(); } }, icon('trash', 16))
          )
        : null;
      grid.append(
        h(
          'figure',
          { class: 'polaroid', style: { margin: 0, '--r': `${[-2.5, 1.8, -1, 2.6, -2, 1][i % 6]}deg`, '--tape': `${[-4, 3, -2, 4, -3, 2][i % 6]}deg` } },
          i === 0 && media.length > 1 ? h('span', { class: 'cover-flag' }, 'Cover') : null,
          tools,
          h('button', { class: 'polaroid-open', type: 'button', 'aria-label': `Open ${m.kind}`, onclick: () => openLightbox(i) }, pic),
          cap
        )
      );
    });
  };
  table.append(grid);

  if (owner) {
    const input = h('input', { type: 'file', accept: 'image/*,video/*', multiple: true, class: 'sr-only', id: 'f-files' });
    const uploads = h('ul', { class: 'uploads' });
    const zone = h(
      'div',
      { class: 'dropzone' },
      h('p', {}, 'Drop photos and videos here'),
      h('label', { class: 'btn btn-primary', for: 'f-files' }, icon('upload', 16), 'Choose files'),
      input,
      uploads
    );
    const maxMb = (window.BUCKET_CONFIG || {}).MAX_VIDEO_MB || 50;
    const handle = async (files) => {
      for (const file of files) {
        if (!/^(image|video)\//.test(file.type)) {
          toast(`${file.name} is not a photo or video`, 'warn');
          continue;
        }
        const bar = h('i');
        const li = h('li', {}, file.name, h('div', { class: 'bar' }, bar));
        uploads.append(li);
        try {
          const prepared = await prepareFile(file);
          bar.style.width = '8%';
          const row = await app.db.media.add(it.id, prepared, (f) => (bar.style.width = Math.max(8, Math.round(f * 100)) + '%'));
          media.push(row);
          li.remove();
          drawMedia();
        } catch (e) {
          li.textContent = `${file.name}: ${e.message}`;
          setTimeout(() => li.remove(), 7000);
          toast(e.message, 'error', 6000);
        }
      }
      const fresh = await app.db.items.get(it.id);
      if (fresh) Object.assign(it, { media_count: fresh.media_count, cover_url: fresh.cover_url, cover_kind: fresh.cover_kind });
      media = await app.db.media.list(it.id);
      drawMedia();
    };
    input.addEventListener('change', () => { handle([...input.files]); input.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('over'); }));
    zone.addEventListener('drop', (e) => handle([...e.dataTransfer.files]));
    zone.append(h('p', { style: { margin: '12px 0 0', fontSize: '.85rem' } }, `Photos are shrunk to fit. Videos up to ${maxMb} MB.`));
    table.append(zone);
  }
  drawMedia();

  main.append(h('div', { class: 'item-grid' }, journal, table));
  fit();
  requestAnimationFrame(fit);

  // ---- lightbox
  let lb = null;
  function openLightbox(start) {
    let i = start;
    const stage = h('div', { class: 'lightbox-stage' });
    const cap = h('div', { class: 'lightbox-cap' });
    const show = () => {
      const m = media[i];
      stage.innerHTML = '';
      stage.append(m.kind === 'video' ? h('video', { src: m.url, controls: true, autoplay: true, playsinline: true }) : h('img', { src: m.url, alt: m.caption || it.title }));
      cap.textContent = [m.caption, `${i + 1} / ${media.length}`].filter(Boolean).join('  ·  ');
    };
    const close = () => {
      document.removeEventListener('keydown', onKey);
      lb?.remove();
      lb = null;
    };
    const step = (d) => { i = (i + d + media.length) % media.length; show(); };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    };
    lb = h(
      'div',
      { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Photo viewer', onmousedown: (e) => (e.target === lb || e.target === stage) && close() },
      stage,
      cap,
      h('button', { class: 'icon-btn close', type: 'button', 'aria-label': 'Close', onclick: close }, icon('close', 26)),
      media.length > 1 ? [h('button', { class: 'icon-btn nav prev', type: 'button', 'aria-label': 'Previous', onclick: () => step(-1) }, icon('left', 30)), h('button', { class: 'icon-btn nav next', type: 'button', 'aria-label': 'Next', onclick: () => step(1) }, icon('right', 30))] : null
    );
    document.body.append(lb);
    document.addEventListener('keydown', onKey);
    show();
  }

  return async () => {
    queue.cancel();
    await persist();
    lb?.remove();
    refreshCats().catch(() => {});
  };
}
