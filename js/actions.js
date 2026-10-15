// Chapter and item actions shared by several screens.
import { app, refreshCats, go } from './state.js';
import { formDialog, confirmDialog, toast } from './util.js';

const EMOJI_HINT = 'One emoji, or leave empty';

export async function addCategory() {
  const v = await formDialog({
    title: 'Add a chapter',
    submitLabel: 'Add chapter',
    fields: [
      { name: 'title', label: 'Chapter name', required: true, placeholder: 'Rainy day rituals' },
      { name: 'tagline', label: 'One line about it', placeholder: 'Small things for grey afternoons' },
      { name: 'emoji', label: 'Emoji', hint: EMOJI_HINT },
      { name: 'is_private', label: 'Private: only I can see this chapter', type: 'checkbox' }
    ]
  });
  if (!v) return null;
  const c = await app.db.categories.create(v);
  await refreshCats();
  toast('Chapter added');
  return c;
}

export async function editCategory(cat) {
  const v = await formDialog({
    title: 'Edit chapter',
    fields: [
      { name: 'title', label: 'Chapter name', required: true, value: cat.title },
      { name: 'tagline', label: 'One line about it', value: cat.tagline },
      { name: 'emoji', label: 'Emoji', value: cat.emoji, hint: EMOJI_HINT },
      { name: 'is_private', label: 'Private: only I can see this chapter', type: 'checkbox', value: cat.is_private }
    ]
  });
  if (!v) return false;
  await app.db.categories.update(cat.id, v);
  await refreshCats();
  toast('Chapter saved');
  return true;
}

export async function deleteCategory(cat) {
  const ok = await confirmDialog(
    `Delete "${cat.title}" with its ${cat.total} items and every photo and video in them? This cannot be undone.`,
    { confirmLabel: 'Delete chapter' }
  );
  if (!ok) return false;
  await app.db.categories.remove(cat.id);
  await refreshCats();
  toast('Chapter deleted');
  return true;
}

export async function moveCategory(cat, dir) {
  const ids = app.cats.map((c) => c.id);
  const i = ids.indexOf(cat.id);
  const j = i + dir;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await app.db.categories.reorder(ids);
  await refreshCats();
}

export async function deleteItem(item, cat) {
  const extra = item.media_count ? ` and its ${item.media_count} photo${item.media_count > 1 ? 's/videos' : ''}` : '';
  const ok = await confirmDialog(`Delete "${item.title}"${extra}?`, { confirmLabel: 'Delete item' });
  if (!ok) return false;
  await app.db.items.remove(item.id);
  await refreshCats();
  toast('Item deleted');
  go(`#/c/${cat.slug}`);
  return true;
}

export function openItem(id) {
  go(`#/i/${id}`);
}
