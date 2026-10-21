// Preview-mode database. Everything lives in this browser (IndexedDB). Same interface as db-supabase.js.
import { uid, today, slugify, debounce } from './util.js';

let _db;
function openIdb() {
  if (_db) return _db;
  _db = new Promise((resolve, reject) => {
    const r = indexedDB.open('before-i-die-local', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('kv');
      r.result.createObjectStore('blobs');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return _db;
}
async function idbOp(store, mode, fn) {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const kvGet = (k) => idbOp('kv', 'readonly', (s) => s.get(k));
const kvSet = (k, v) => idbOp('kv', 'readwrite', (s) => s.put(v, k));
const blobGet = (k) => idbOp('blobs', 'readonly', (s) => s.get(k));
const blobSet = (k, v) => idbOp('blobs', 'readwrite', (s) => s.put(v, k));
const blobDel = (k) => idbOp('blobs', 'readwrite', (s) => s.delete(k));

export async function createLocalDb() {
  let state = (await kvGet('state')) || { categories: [], items: [], media: [] };
  const urlCache = new Map();
  const save = debounce(() => kvSet('state', state), 250);
  window.addEventListener('pagehide', () => save.flush());

  const clone = (o) => (o ? { ...o } : o);
  const catById = (id) => state.categories.find((c) => c.id === id);
  const itemById = (id) => state.items.find((i) => i.id === id);

  async function blobUrl(mediaId) {
    if (urlCache.has(mediaId)) return urlCache.get(mediaId);
    const b = await blobGet(mediaId);
    if (!b) return null;
    const u = URL.createObjectURL(b);
    urlCache.set(mediaId, u);
    return u;
  }
  async function hydrate(item) {
    const out = clone(item);
    if (out && out.cover_kind === 'video' && out.cover_media_id) out.cover_url = await blobUrl(out.cover_media_id);
    const c = catById(out.category_id);
    if (c) out.categories = { slug: c.slug, title: c.title, emoji: c.emoji, sort_order: c.sort_order };
    return out;
  }
  const hydrateAll = (arr) => Promise.all(arr.map(hydrate));

  function refreshCover(itemId) {
    const it = itemById(itemId);
    if (!it) return;
    const list = state.media.filter((m) => m.item_id === itemId).sort((a, b) => a.position - b.position);
    it.media_count = list.length;
    const first = list[0];
    it.cover_media_id = first ? first.id : null;
    it.cover_kind = first ? first.kind : null;
    it.cover_url = first && first.kind === 'image' ? first.thumb : null;
    it.updated_at = new Date().toISOString();
  }
  async function dropMedia(predicate) {
    const gone = state.media.filter(predicate);
    state.media = state.media.filter((m) => !predicate(m));
    for (const m of gone) {
      await blobDel(m.id);
      if (urlCache.has(m.id)) {
        URL.revokeObjectURL(urlCache.get(m.id));
        urlCache.delete(m.id);
      }
    }
  }

  const listeners = new Set();
  return {
    mode: 'local',
    auth: {
      isOwner: () => true,
      user: () => 'preview',
      signIn: async () => {
        throw new Error('Preview mode has no sign-in. Connect Supabase in config.js to publish.');
      },
      signOut: async () => {},
      onChange: (cb) => listeners.add(cb)
    },

    async isEmpty() {
      return state.categories.length === 0;
    },
    async stats() {
      return { total: state.items.length, done: state.items.filter((i) => i.done).length };
    },

    categories: {
      async list() {
        const tot = new Map();
        const dn = new Map();
        for (const i of state.items) {
          tot.set(i.category_id, (tot.get(i.category_id) || 0) + 1);
          if (i.done) dn.set(i.category_id, (dn.get(i.category_id) || 0) + 1);
        }
        return [...state.categories]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((c) => ({ ...c, total: tot.get(c.id) || 0, done_count: dn.get(c.id) || 0 }));
      },
      async create(data) {
        const base = data.slug || slugify(data.title);
        let slug = base;
        let n = 2;
        while (state.categories.some((c) => c.slug === slug)) slug = `${base}-${n++}`;
        const row = {
          id: uid(),
          slug,
          title: data.title,
          tagline: data.tagline || '',
          emoji: data.emoji || '',
          is_private: !!data.is_private,
          sort_order: data.sort_order ?? (state.categories.length ? Math.max(...state.categories.map((c) => c.sort_order)) + 1 : 0),
          created_at: new Date().toISOString()
        };
        state.categories.push(row);
        save();
        return { ...row, total: 0, done_count: 0 };
      },
      async update(id, patch) {
        const c = catById(id);
        Object.assign(c, patch);
        save();
        return clone(c);
      },
      async remove(id) {
        const ids = new Set(state.items.filter((i) => i.category_id === id).map((i) => i.id));
        await dropMedia((m) => ids.has(m.item_id));
        state.items = state.items.filter((i) => i.category_id !== id);
        state.categories = state.categories.filter((c) => c.id !== id);
        save();
      },
      async reorder(ids) {
        ids.forEach((id, i) => {
          const c = catById(id);
          if (c) c.sort_order = i;
        });
        save();
      }
    },

    items: {
      async listAll() {
        return hydrateAll([...state.items].sort((a, b) => (a.category_id < b.category_id ? -1 : a.category_id > b.category_id ? 1 : a.position - b.position)));
      },
      async listByCategory(catId) {
        const rows = state.items.filter((i) => i.category_id === catId).sort((a, b) => a.position - b.position);
        return hydrateAll(rows);
      },
      async get(id) {
        const it = itemById(id);
        return it ? hydrate(it) : null;
      },
      async create(catId, { title, section = 'General' }) {
        const inCat = state.items.filter((i) => i.category_id === catId);
        const row = {
          id: uid(),
          category_id: catId,
          section,
          title,
          position: inCat.length ? Math.max(...inCat.map((i) => i.position)) + 1 : 0,
          done: false,
          done_at: null,
          description: '',
          place: '',
          lat: null,
          lng: null,
          rating: null,
          mood: '',
          fields: [],
          tags: [],
          media_count: 0,
          cover_url: null,
          cover_kind: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        state.items.push(row);
        save();
        return hydrate(row);
      },
      async bulkCreate(rows) {
        const now = new Date().toISOString();
        for (const r of rows) {
          state.items.push({
            id: uid(),
            category_id: r.category_id,
            section: r.section,
            title: r.title,
            position: r.position,
            done: false,
            done_at: null,
            description: '',
            place: '',
            lat: null,
            lng: null,
            rating: null,
            mood: '',
            fields: [],
            tags: [],
            media_count: 0,
            cover_url: null,
            cover_kind: null,
            created_at: now,
            updated_at: now
          });
        }
        save();
      },
      async update(id, patch) {
        const it = itemById(id);
        Object.assign(it, patch, { updated_at: new Date().toISOString() });
        save();
        return hydrate(it);
      },
      async remove(id) {
        await dropMedia((m) => m.item_id === id);
        state.items = state.items.filter((i) => i.id !== id);
        save();
      },
      async renameSection(catId, from, to) {
        state.items.forEach((i) => {
          if (i.category_id === catId && i.section === from) i.section = to;
        });
        save();
      },
      async removeSection(catId, name) {
        const ids = new Set(state.items.filter((i) => i.category_id === catId && i.section === name).map((i) => i.id));
        await dropMedia((m) => ids.has(m.item_id));
        state.items = state.items.filter((i) => !ids.has(i.id));
        save();
      },
      async search(q, limit = 40) {
        const needle = q.toLowerCase();
        const rows = [];
        for (const i of state.items) {
          if (i.title.toLowerCase().includes(needle)) {
            rows.push(i);
            if (rows.length >= limit) break;
          }
        }
        return hydrateAll(rows);
      },
      async random(n = 1, catId = null, undone = true) {
        const pool = state.items.filter((i) => (!catId || i.category_id === catId) && (!undone || !i.done));
        const out = [];
        const copy = [...pool];
        while (out.length < n && copy.length) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
        return hydrateAll(out);
      },
      async recentDone(n = 6) {
        const rows = state.items
          .filter((i) => i.done)
          .sort((a, b) => (b.done_at || '').localeCompare(a.done_at || '') || (b.updated_at || '').localeCompare(a.updated_at || ''))
          .slice(0, n);
        return hydrateAll(rows);
      },
      async doneList(catId = null) {
        const order = new Map(state.categories.map((c) => [c.id, c.sort_order]));
        const rows = state.items
          .filter((i) => i.done && (!catId || i.category_id === catId))
          .sort((a, b) => order.get(a.category_id) - order.get(b.category_id) || (a.done_at || '').localeCompare(b.done_at || ''));
        return hydrateAll(rows);
      }
    },

    media: {
      async list(itemId) {
        const rows = state.media.filter((m) => m.item_id === itemId).sort((a, b) => a.position - b.position);
        return Promise.all(rows.map(async (m) => ({ ...m, url: await blobUrl(m.id) })));
      },
      async add(itemId, prepared, onProgress) {
        const id = uid();
        await blobSet(id, prepared.blob);
        const mine = state.media.filter((m) => m.item_id === itemId);
        const row = {
          id,
          item_id: itemId,
          kind: prepared.kind,
          path: id,
          caption: '',
          position: mine.length ? Math.max(...mine.map((m) => m.position)) + 1 : 0,
          width: prepared.width,
          height: prepared.height,
          size_bytes: prepared.size,
          thumb: prepared.thumb,
          created_at: new Date().toISOString()
        };
        state.media.push(row);
        refreshCover(itemId);
        save();
        onProgress && onProgress(1);
        return { ...row, url: await blobUrl(id) };
      },
      async update(id, patch) {
        const m = state.media.find((x) => x.id === id);
        Object.assign(m, patch);
        save();
        return { ...m, url: await blobUrl(id) };
      },
      async remove(m) {
        const itemId = m.item_id;
        await dropMedia((x) => x.id === m.id);
        refreshCover(itemId);
        save();
      },
      async makeCover(itemId, mediaId) {
        const mine = state.media.filter((m) => m.item_id === itemId);
        const min = Math.min(...mine.map((m) => m.position));
        state.media.find((m) => m.id === mediaId).position = min - 1;
        refreshCover(itemId);
        save();
      }
    }
  };
}
