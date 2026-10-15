// Loads data/seed.json (15 chapters, about 7,400 ideas) into an empty database.

export async function importSeed(db, onProgress = () => {}) {
  const res = await fetch('data/seed.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not load data/seed.json');
  const seed = await res.json();
  const existing = await db.categories.list();
  const bySlug = new Map(existing.map((c) => [c.slug, c]));
  const totalItems = seed.categories.reduce((n, c) => n + c.sections.reduce((m, s) => m + s.items.length, 0), 0);
  let done = 0;

  for (let i = 0; i < seed.categories.length; i++) {
    const c = seed.categories[i];
    let cat = bySlug.get(c.slug);
    if (cat && cat.total > 0) {
      // Already has items: leave it alone so nothing gets duplicated.
      done += c.sections.reduce((m, s) => m + s.items.length, 0);
      onProgress(done / totalItems, c.title);
      continue;
    }
    if (!cat) cat = await db.categories.create({ slug: c.slug, title: c.title, tagline: c.tagline, emoji: c.emoji, is_private: c.is_private, sort_order: i });
    const rows = [];
    let position = 0;
    for (const s of c.sections) for (const title of s.items) rows.push({ category_id: cat.id, section: s.name, title, position: position++ });
    for (let k = 0; k < rows.length; k += 400) {
      await db.items.bulkCreate(rows.slice(k, k + 400));
      done += Math.min(400, rows.length - k);
      onProgress(done / totalItems, c.title);
    }
  }
  return totalItems;
}
