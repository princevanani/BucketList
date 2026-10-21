// Shared data for the Globe, Train and Quest views: all items, where they are on the map, and XP.
import { app } from './state.js';
import { locate } from './places.js';

let cache = null;
let cacheVer = -1;
let worldPromise = null;
app.version = 0;
export const bump = () => {
  app.version++;
};

// Any change to the notebook invalidates the cache.
export function instrumentDb(db) {
  const wrap = (obj, names) =>
    names.forEach((n) => {
      const fn = obj[n];
      if (typeof fn !== 'function') return;
      obj[n] = async (...a) => {
        const r = await fn.apply(obj, a);
        bump();
        return r;
      };
    });
  wrap(db.items, ['update', 'create', 'bulkCreate', 'remove', 'renameSection', 'removeSection']);
  wrap(db.media, ['add', 'remove', 'makeCover']);
  wrap(db.categories, ['create', 'update', 'remove', 'reorder']);
}

export function loadWorld() {
  if (!worldPromise) {
    worldPromise = fetch('data/world.json')
      .then((r) => {
        if (!r.ok) throw new Error('Could not load data/world.json');
        return r.json();
      })
      .catch((e) => {
        worldPromise = null;
        throw e;
      });
  }
  return worldPromise;
}

const key = (lat, lng) => `${lat.toFixed(2)},${lng.toFixed(2)}`;

function resolveLoc(it) {
  if (typeof it.lat === 'number' && typeof it.lng === 'number') return { lat: it.lat, lng: it.lng, name: it.place || '', exact: true };
  const p = locate(it.place) || locate(it.title);
  return p ? { lat: p.lat, lng: p.lng, name: p.name, exact: false } : null;
}

export async function getAllItems() {
  if (cache && cacheVer === app.version) return cache;
  const items = await app.db.items.listAll();
  const catMap = new Map(app.cats.map((c) => [c.id, c]));
  for (const it of items) {
    it._cat = catMap.get(it.category_id) || null;
    it._loc = resolveLoc(it);
  }
  cache = items;
  cacheVer = app.version;
  return items;
}

// Group items by map location: [{key,lat,lng,name,done:[],dreams:[]}]
export function groupPlaces(items) {
  const map = new Map();
  for (const it of items) {
    if (!it._loc) continue;
    // Items without exact coordinates snap to the named place; exact ones keep their own spot.
    const k = key(it._loc.lat, it._loc.lng);
    let g = map.get(k);
    if (!g) {
      g = { key: k, lat: it._loc.lat, lng: it._loc.lng, name: it._loc.name || it.place || it.title, done: [], dreams: [] };
      map.set(k, g);
    }
    if (!g.name && it.place) g.name = it.place;
    (it.done ? g.done : g.dreams).push(it);
  }
  return [...map.values()];
}

// ---- XP, levels and badges ------------------------------------------------
export function xpFor(it) {
  if (!it.done) return 0;
  return 100 + 25 * Math.min(4, it.media_count || 0) + ((it.description || '').trim().length > 40 ? 40 : 0) + (it.rating ? 10 : 0);
}
const startOf = (L) => 75 * L * (L - 1);
export function levelInfo(xp) {
  let L = 1;
  while (xp >= startOf(L + 1)) L++;
  const a = startOf(L);
  const b = startOf(L + 1);
  return { level: L, xp, into: xp - a, span: b - a, next: b, frac: (xp - a) / (b - a) };
}
const TITLES = ['Dreamer', 'Wanderer', 'Explorer', 'Trailblazer', 'Adventurer', 'Voyager', 'Pathfinder', 'Wayfarer', 'Legend', 'Mythic'];
export const titleFor = (level) => TITLES[Math.min(TITLES.length - 1, Math.floor((level - 1) / 1.5))];

export function regionRank(done) {
  if (done >= 100) return { name: 'Legend', n: 5 };
  if (done >= 40) return { name: 'Master', n: 4 };
  if (done >= 15) return { name: 'Adept', n: 3 };
  if (done >= 5) return { name: 'Apprentice', n: 2 };
  if (done >= 1) return { name: 'Novice', n: 1 };
  return { name: 'Unexplored', n: 0 };
}

export function computeStats(items) {
  const done = items.filter((i) => i.done);
  const xp = done.reduce((n, i) => n + xpFor(i), 0);
  const photos = done.reduce((n, i) => n + (i.media_count || 0), 0);
  const stories = done.filter((i) => (i.description || '').trim().length > 40).length;
  const places = groupPlaces(items).filter((g) => g.done.length).length;
  const catsTouched = new Set(done.map((i) => i.category_id)).size;
  // streak: consecutive calendar months, counting back from the latest month with a done item
  const months = new Set(done.filter((i) => i.done_at).map((i) => i.done_at.slice(0, 7)));
  let streak = 0;
  if (months.size) {
    const sorted = [...months].sort();
    let [y, m] = sorted[sorted.length - 1].split('-').map(Number);
    while (months.has(`${y}-${String(m).padStart(2, '0')}`)) {
      streak++;
      m--;
      if (m === 0) {
        m = 12;
        y--;
      }
    }
  }
  const badges = [
    ['First step', 'Tick off your first item', done.length >= 1, '👣'],
    ['Getting going', 'Live 10 items', done.length >= 10, '🔥'],
    ['Quarter century', 'Live 25 items', done.length >= 25, '🏅'],
    ['Half a hundred', 'Live 50 items', done.length >= 50, '🏆'],
    ['Century', 'Live 100 items', done.length >= 100, '💯'],
    ['Photographer', 'Attach 10 photos or videos', photos >= 10, '📸'],
    ['Storyteller', 'Write the story of 10 items', stories >= 10, '✍️'],
    ['Globetrotter', 'Live things in 5 different places', places >= 5, '🌍'],
    ['Well rounded', 'Live something in 5 chapters', catsTouched >= 5, '🧭'],
    ['Streak', 'Live something 3 months in a row', streak >= 3, '⚡']
  ].map(([name, hint, got, emoji]) => ({ name, hint, got, emoji }));
  return { total: items.length, done: done.length, xp, photos, stories, places, catsTouched, streak, badges, ...levelInfo(xp) };
}
