// Published-mode database: Supabase (Postgres + Auth + Storage). Same interface as db-local.js.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { slugify } from './util.js';

const ITEM_LIST_COLS_GEO = 'id,category_id,section,title,position,done,done_at,description,place,lat,lng,rating,mood,media_count,cover_url,cover_kind';
const ITEM_LITE_COLS_GEO = 'id,category_id,section,title,done,done_at,place,lat,lng,rating,mood,media_count,cover_url,cover_kind,description';
const ITEM_CARD_COLS_GEO = 'id,title,category_id,section,done,done_at,place,lat,lng,rating,mood,description,media_count,cover_url,cover_kind,categories(slug,title,emoji,sort_order)';

const noGeo = (c) => c.replace(',lat,lng', '');
let GEO = true; // switched off if the database has not had migration-002-globe.sql run yet
const ITEM_LIST_COLS = () => (GEO ? ITEM_LIST_COLS_GEO : noGeo(ITEM_LIST_COLS_GEO));
const ITEM_LITE_COLS = () => (GEO ? ITEM_LITE_COLS_GEO : noGeo(ITEM_LITE_COLS_GEO));
const ITEM_CARD_COLS = () => (GEO ? ITEM_CARD_COLS_GEO : noGeo(ITEM_CARD_COLS_GEO));

function ok({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Every request gets a deadline (a stalled connection used to leave the page blank or "Saving…" for ever).
// Reads are retried once; uploads get minutes; other writes get 30 s and are retried by the caller.
function timedFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  const method = String(init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
  const storage = url.includes('/storage/v1/');
  const ms = storage ? 300000 : method === 'GET' ? 15000 : 30000;
  const attempt = async () => {
    const ctl = new AbortController();
    let timedOut = false;
    const t = setTimeout(() => {
      timedOut = true;
      ctl.abort();
    }, ms);
    const outer = init.signal;
    if (outer) outer.aborted ? ctl.abort() : outer.addEventListener('abort', () => ctl.abort(), { once: true });
    try {
      return await fetch(input, { ...init, signal: ctl.signal });
    } catch (e) {
      if (timedOut) throw new Error('The network is slow or offline. Please try again.');
      throw e;
    } finally {
      clearTimeout(t);
    }
  };
  if (method !== 'GET' || storage) return attempt();
  return attempt().catch(async (e) => {
    if (init.signal && init.signal.aborted) throw e;
    await sleep(400);
    return attempt();
  });
}

export async function createSupabaseDb(cfg) {
  const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      // The default cross-tab lock can wait forever when another tab of this site is open or a refresh stalls,
      // which froze every request. Without it each tab simply refreshes its own session.
      lock: async (_name, _timeout, fn) => await fn()
    },
    global: { fetch: timedFetch }
  });
  const bucket = cfg.MEDIA_BUCKET || 'bucket-media';
  let owner = false;
  let email = null;
  const listeners = new Set();

  async function refreshOwner() {
    const {
      data: { session }
    } = await sb.auth.getSession();
    email = session?.user?.email || null;
    if (!session) {
      owner = false;
      return;
    }
    const { data, error } = await sb.rpc('is_owner');
    owner = !error && data === true;
  }
  await refreshOwner();
  {
    const probe = await sb.from('items').select('lat').limit(1);
    GEO = !probe.error;
  }
  sb.auth.onAuthStateChange(async () => {
    const before = owner;
    await refreshOwner();
    listeners.forEach((cb) => cb({ owner, email, changed: before !== owner }));
  });

  // Pages of 1000 rows, six at a time in parallel (the notebook has thousands of items).
  async function fetchAll(make) {
    const out = [];
    const PAR = 6;
    for (let from = 0; ; from += PAR * 1000) {
      const pages = await Promise.all(Array.from({ length: PAR }, (_, i) => make().range(from + i * 1000, from + i * 1000 + 999)));
      let short = false;
      for (const pg of pages) {
        const rows = ok(pg);
        out.push(...rows);
        if (rows.length < 1000) short = true;
      }
      if (short) break;
    }
    return out;
  }

  async function purgeStorage(itemIds) {
    for (let i = 0; i < itemIds.length; i += 100) {
      const chunk = itemIds.slice(i, i + 100);
      const rows = ok(await sb.from('media').select('path').in('item_id', chunk));
      const paths = rows.map((r) => r.path);
      for (let j = 0; j < paths.length; j += 100) await sb.storage.from(bucket).remove(paths.slice(j, j + 100));
    }
  }

  async function refreshCover(itemId) {
    const { data, count, error } = await sb
      .from('media')
      .select('kind,url', { count: 'exact' })
      .eq('item_id', itemId)
      .order('position', { ascending: true })
      .limit(1);
    if (error) throw new Error(error.message);
    const first = data[0];
    ok(
      await sb
        .from('items')
        .update({ media_count: count || 0, cover_url: first ? first.url : null, cover_kind: first ? first.kind : null, updated_at: new Date().toISOString() })
        .eq('id', itemId)
    );
  }

  function uploadWithProgress(path, blob, type, onProgress) {
    return new Promise(async (resolve, reject) => {
      const {
        data: { session }
      } = await sb.auth.getSession();
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${cfg.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`);
      xhr.setRequestHeader('Authorization', `Bearer ${session?.access_token || cfg.SUPABASE_ANON_KEY}`);
      xhr.setRequestHeader('apikey', cfg.SUPABASE_ANON_KEY);
      xhr.setRequestHeader('Content-Type', type);
      xhr.setRequestHeader('Cache-Control', 'max-age=31536000');
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}). ${xhr.responseText.slice(0, 200)}`)));
      xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
      xhr.send(blob);
    });
  }

  return {
    mode: 'supabase',
    hasGeo: () => GEO,
    auth: {
      isOwner: () => owner,
      user: () => email,
      async signIn(e, p) {
        const { error } = await sb.auth.signInWithPassword({ email: e, password: p });
        if (error) throw new Error(error.message);
        await refreshOwner();
        if (!owner) throw new Error('You are signed in, but this email is not in the owners table (see schema.sql).');
      },
      async signOut() {
        await sb.auth.signOut();
        await refreshOwner();
      },
      onChange: (cb) => listeners.add(cb)
    },

    async isEmpty() {
      const { count, error } = await sb.from('categories').select('id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      return (count || 0) === 0;
    },
    async stats() {
      const rows = ok(await sb.from('category_stats').select('total,done_count'));
      return rows.reduce((a, r) => ({ total: a.total + r.total, done: a.done + r.done_count }), { total: 0, done: 0 });
    },

    categories: {
      async list() {
        const [cats, stats] = await Promise.all([sb.from('categories').select('*').order('sort_order'), sb.from('category_stats').select('*')]);
        const byId = new Map(ok(stats).map((s) => [s.category_id, s]));
        return ok(cats).map((c) => ({ ...c, total: byId.get(c.id)?.total || 0, done_count: byId.get(c.id)?.done_count || 0 }));
      },
      async create(data) {
        const existing = ok(await sb.from('categories').select('slug,sort_order'));
        const base = data.slug || slugify(data.title);
        let slug = base;
        let n = 2;
        const taken = new Set(existing.map((c) => c.slug));
        while (taken.has(slug)) slug = `${base}-${n++}`;
        const sort_order = data.sort_order ?? (existing.length ? Math.max(...existing.map((c) => c.sort_order)) + 1 : 0);
        const row = ok(
          await sb
            .from('categories')
            .insert({ slug, title: data.title, tagline: data.tagline || '', emoji: data.emoji || '', is_private: !!data.is_private, sort_order })
            .select()
            .single()
        );
        return { ...row, total: 0, done_count: 0 };
      },
      async update(id, patch) {
        return ok(await sb.from('categories').update(patch).eq('id', id).select().single());
      },
      async remove(id) {
        const ids = (await fetchAll(() => sb.from('items').select('id').eq('category_id', id).order('position'))).map((r) => r.id);
        await purgeStorage(ids);
        ok(await sb.from('categories').delete().eq('id', id));
      },
      async reorder(ids) {
        await Promise.all(ids.map((id, i) => sb.from('categories').update({ sort_order: i }).eq('id', id)));
      }
    },

    items: {
      // Every item in the notebook, light columns only (used by the globe, train and quest views).
      listAll() {
        return fetchAll(() => sb.from('items').select(ITEM_LITE_COLS()).order('category_id').order('position'));
      },
      listByCategory(catId) {
        return fetchAll(() => sb.from('items').select(ITEM_LIST_COLS()).eq('category_id', catId).order('position'));
      },
      async get(id) {
        const { data, error } = await sb.from('items').select('*, categories(slug,title,emoji,sort_order)').eq('id', id).maybeSingle();
        if (error) throw new Error(error.message);
        return data;
      },
      async create(catId, { title, section = 'General' }) {
        const top = ok(await sb.from('items').select('position').eq('category_id', catId).order('position', { ascending: false }).limit(1));
        const position = top.length ? top[0].position + 1 : 0;
        return ok(await sb.from('items').insert({ category_id: catId, title, section, position }).select().single());
      },
      async bulkCreate(rows) {
        for (let i = 0; i < rows.length; i += 500) ok(await sb.from('items').insert(rows.slice(i, i + 500)));
      },
      async update(id, patch) {
        if (!GEO) {
          patch = { ...patch };
          delete patch.lat;
          delete patch.lng;
        }
        return ok(await sb.from('items').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single());
      },
      async remove(id) {
        await purgeStorage([id]);
        ok(await sb.from('items').delete().eq('id', id));
      },
      async renameSection(catId, from, to) {
        ok(await sb.from('items').update({ section: to }).eq('category_id', catId).eq('section', from));
      },
      async removeSection(catId, name) {
        const ids = (await fetchAll(() => sb.from('items').select('id').eq('category_id', catId).eq('section', name).order('position'))).map((r) => r.id);
        await purgeStorage(ids);
        ok(await sb.from('items').delete().eq('category_id', catId).eq('section', name));
      },
      async search(q, limit = 40) {
        const safe = q.replace(/[%_\\]/g, (c) => '\\' + c);
        return ok(await sb.from('items').select(ITEM_CARD_COLS()).ilike('title', `%${safe}%`).limit(limit));
      },
      async random(n = 1, catId = null, undone = true) {
        const rows = ok(await sb.rpc('random_items', { n, cat: catId, undone }));
        return rows;
      },
      async recentDone(n = 6) {
        return ok(await sb.from('items').select(ITEM_CARD_COLS()).eq('done', true).order('done_at', { ascending: false, nullsFirst: false }).limit(n));
      },
      async doneList(catId = null) {
        const rows = await fetchAll(() => {
          let q = sb.from('items').select(ITEM_CARD_COLS()).eq('done', true).order('done_at', { ascending: true, nullsFirst: true }).order('id');
          if (catId) q = q.eq('category_id', catId);
          return q;
        });
        return rows.sort((a, b) => (a.categories?.sort_order ?? 0) - (b.categories?.sort_order ?? 0));
      }
    },

    media: {
      async list(itemId) {
        return ok(await sb.from('media').select('*').eq('item_id', itemId).order('position'));
      },
      async add(itemId, prepared, onProgress) {
        const path = `${itemId}/${crypto.randomUUID()}.${prepared.ext}`;
        await uploadWithProgress(path, prepared.blob, prepared.type, onProgress);
        const { data: pub } = sb.storage.from(bucket).getPublicUrl(path);
        const top = ok(await sb.from('media').select('position').eq('item_id', itemId).order('position', { ascending: false }).limit(1));
        const row = ok(
          await sb
            .from('media')
            .insert({
              item_id: itemId,
              kind: prepared.kind,
              path,
              url: pub.publicUrl,
              position: top.length ? top[0].position + 1 : 0,
              width: prepared.width || null,
              height: prepared.height || null,
              size_bytes: prepared.size
            })
            .select()
            .single()
        );
        await refreshCover(itemId);
        return row;
      },
      async update(id, patch) {
        return ok(await sb.from('media').update(patch).eq('id', id).select().single());
      },
      async remove(m) {
        await sb.storage.from(bucket).remove([m.path]);
        ok(await sb.from('media').delete().eq('id', m.id));
        await refreshCover(m.item_id);
      },
      async makeCover(itemId, mediaId) {
        const low = ok(await sb.from('media').select('position').eq('item_id', itemId).order('position', { ascending: true }).limit(1));
        ok(await sb.from('media').update({ position: (low[0]?.position ?? 0) - 1 }).eq('id', mediaId));
        await refreshCover(itemId);
      }
    }
  };
}
