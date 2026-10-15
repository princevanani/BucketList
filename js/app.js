// Bootstrap: pick the database, draw the top bar, route between screens.
import { getDb, backendNote } from './db.js';
import { app, refreshCats, go } from './state.js';
import { $, h, icon, toast, formDialog, debounce } from './util.js';
import * as home from './views/home.js';
import * as category from './views/category.js';
import * as item from './views/item.js';

const views = { home, cat: category, item };
let cleanup = null;
let lastKey = null;
let lastHash = null;
let main;
let topbarEls = {};

function parseRoute() {
  const hash = location.hash || '#/';
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'c' && parts[1]) return { name: 'cat', slug: decodeURIComponent(parts[1]), key: hash };
  if (parts[0] === 'i' && parts[1]) return { name: 'item', id: decodeURIComponent(parts[1]), key: hash };
  return { name: 'home', key: '#/' };
}

async function render() {
  const route = parseRoute();
  app.route = route;
  const same = route.key === lastKey;
  const scrollY = window.scrollY;
  if (cleanup) {
    try {
      cleanup();
    } catch (e) {
      console.error(e);
    }
    cleanup = null;
  }
  lastKey = route.key;
  main.innerHTML = '';
  main.className = 'page';
  try {
    cleanup = (await views[route.name].render(main, route)) || null;
  } catch (err) {
    console.error(err);
    main.append(
      h('div', { class: 'dark-empty' }, h('h2', {}, 'That page would not open'), h('p', {}, err.message || 'Something went wrong.'), h('a', { class: 'btn', href: '#/' }, 'Back to the cover'))
    );
  }
  window.scrollTo(0, same ? scrollY : 0);
  const t = route.name === 'home' ? 'Before I die' : document.title;
  if (route.name === 'home') document.title = t;
  lastHash = location.hash;
  updateTopbar();
}

function updateTopbar() {
  const { who, signin, signout } = topbarEls;
  const local = app.db.mode === 'local';
  const owner = app.db.auth.isOwner();
  app.owner = owner;
  who.textContent = !local && owner ? app.db.auth.user() : '';
  signin.hidden = local || owner;
  signout.hidden = local || !owner;
}

function buildTopbar() {
  topbarEls.who = h('span', { class: 'who' });
  topbarEls.signin = h('button', { class: 'btn btn-small btn-quiet', type: 'button', onclick: login }, icon('lock', 16), h('span', { class: 'label-hide' }, ' Owner sign in'));
  topbarEls.signout = h(
    'button',
    {
      class: 'btn btn-small btn-quiet',
      type: 'button',
      onclick: async () => {
        await app.db.auth.signOut();
        await refreshCats();
        toast('Signed out');
        render();
      }
    },
    icon('unlock', 16),
    h('span', { class: 'label-hide' }, ' Sign out')
  );
  return h(
    'header',
    { class: 'topbar' },
    h(
      'div',
      { class: 'topbar-in' },
      h('a', { class: 'wordmark', href: '#/' }, 'Before I die'),
      topbarEls.who,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Search (press /)', title: 'Search (/)', onclick: openSearch }, icon('search', 22)),
      topbarEls.signin,
      topbarEls.signout
    )
  );
}

async function login() {
  const v = await formDialog({
    title: 'Owner sign in',
    submitLabel: 'Sign in',
    fields: [
      { name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'username' },
      { name: 'password', label: 'Password', type: 'password', required: true, autocomplete: 'current-password' }
    ]
  });
  if (!v) return;
  try {
    await app.db.auth.signIn(v.email, v.password);
    await refreshCats();
    toast('Welcome back');
    render();
  } catch (e) {
    toast(e.message, 'error', 6000);
    login();
  }
}

function openSearch() {
  if ($('.search-panel')) return;
  const results = h('ul', { class: 'search-results' });
  const input = h('input', { class: 'search-big', type: 'search', placeholder: 'Search every idea', 'aria-label': 'Search', autocomplete: 'off' });
  const hint = h('div', { class: 'search-hint' }, 'Type a word: sunrise, biryani, Ladakh, piano…');
  const panel = h('div', { class: 'search-panel' }, input, results, hint);
  const back = h('div', { class: 'modal-back in', onmousedown: (e) => e.target === back && close() }, panel);
  const close = () => {
    document.removeEventListener('keydown', onKey);
    back.remove();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  $('#modal-root').append(back);
  input.focus();
  const run = debounce(async () => {
    const q = input.value.trim();
    results.innerHTML = '';
    if (q.length < 2) {
      hint.hidden = false;
      hint.textContent = 'Type a word: sunrise, biryani, Ladakh, piano…';
      return;
    }
    const rows = await app.db.items.search(q, 40);
    hint.hidden = rows.length > 0;
    hint.textContent = `Nothing matches "${q}".`;
    for (const r of rows) {
      results.append(
        h(
          'li',
          {},
          h('a', { href: `#/i/${r.id}`, onclick: close }, h('span', {}, (r.done ? '✓ ' : '') + r.title), h('small', {}, r.categories?.title || ''))
        )
      );
    }
  }, 200);
  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') results.querySelector('a')?.focus();
  });
  results.addEventListener('keydown', (e) => {
    const a = document.activeElement;
    if (e.key === 'ArrowDown') (a.closest('li')?.nextElementSibling?.querySelector('a'))?.focus();
    if (e.key === 'ArrowUp') (a.closest('li')?.previousElementSibling?.querySelector('a') || input).focus();
  });
}

function previewBanner() {
  let dismissed = false;
  try {
    dismissed = sessionStorage.getItem('bid-preview-dismissed') === '1';
  } catch {}
  if (dismissed) return;
  const b = h(
    'div',
    { class: 'preview-banner', role: 'note' },
    backendNote || 'Preview mode: everything you add is saved only in this browser. Add your Supabase keys in config.js to publish it for everyone.',
    h(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        'aria-label': 'Dismiss',
        onclick: () => {
          b.remove();
          try {
            sessionStorage.setItem('bid-preview-dismissed', '1');
          } catch {}
        }
      },
      icon('close', 16)
    )
  );
  document.body.append(b);
}

async function boot() {
  const fill = $('#splash-fill');
  try {
    app.db = await getDb();
    fill.style.width = '60%';
    await refreshCats();
  } catch (err) {
    console.error(err);
    $('#splash').innerHTML = '';
    $('#splash').append(h('div', {}, h('h1', {}, 'Before I die'), h('p', {}, 'The notebook could not be opened: ' + err.message), h('button', { class: 'btn', onclick: () => location.reload() }, 'Try again')));
    return;
  }
  app.owner = app.db.auth.isOwner();
  app.rerender = render;
  app.db.auth.onChange(async () => {
    await refreshCats();
    render();
  });
  const root = $('#app');
  main = h('main', { class: 'page', id: 'view' });
  root.append(buildTopbar(), main);
  if (app.db.mode === 'local' || backendNote) previewBanner();
  window.addEventListener('hashchange', render);
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !$('.story')) {
      e.preventDefault();
      openSearch();
    }
  });
  await render();
  fill.style.width = '100%';
  const sp = $('#splash');
  setTimeout(() => {
    sp.classList.add('out');
    setTimeout(() => sp.remove(), 450);
  }, 250);
}

boot();
