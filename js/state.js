// Shared app state: the database, the chapter list and who is looking.
export const app = { db: null, cats: [], owner: false, rerender: () => {}, route: null };

export async function refreshCats() {
  app.cats = await app.db.categories.list();
  return app.cats;
}
export const catBySlug = (slug) => app.cats.find((c) => c.slug === slug);
export const catById = (id) => app.cats.find((c) => c.id === id);

export function go(hash) {
  if (location.hash === hash) app.rerender();
  else location.hash = hash;
}
