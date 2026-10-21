// Finding a place on the map from text: coordinates, the built-in list, then OpenStreetMap.
import { app } from './state.js';
import { h, icon, toast, formDialog } from './util.js';
import { locate, geocodeOnline } from './places.js';

const COORD = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

export async function resolvePlace(text) {
  const t = (text || '').trim();
  if (!t) return null;
  const m = t.match(COORD);
  if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) return { name: `${(+m[1]).toFixed(6)}, ${(+m[2]).toFixed(6)}`, lat: +m[1], lng: +m[2], how: 'coordinates' };
  const p = locate(t);
  if (p) return { name: p.name, lat: p.lat, lng: p.lng, how: 'list' };
  const g = await geocodeOnline(t);
  return g ? { ...g, how: 'online' } : null;
}

// A dialog to put lived items on the map, one line each.
export async function locateDialog(items, onDone) {
  const rows = items.map((it) => {
    const input = h('input', { class: 'line-in', type: 'text', value: it.place || '', placeholder: 'City, country or lat, lng', 'aria-label': `Where: ${it.title}` });
    const note = h('small', { class: 'field-hint' });
    const btn = h(
      'button',
      {
        class: 'btn btn-small',
        type: 'button',
        onclick: async () => {
          btn.disabled = true;
          note.textContent = 'Looking…';
          const r = await resolvePlace(input.value);
          if (!r) {
            note.textContent = 'Not found. Try a bigger place or "lat, lng".';
            btn.disabled = false;
            return;
          }
          await app.db.items.update(it.id, { place: input.value.trim() || r.name, lat: r.lat, lng: r.lng });
          note.textContent = `Pinned at ${r.name}`;
          btn.replaceWith(h('span', {}, icon('check', 18)));
          onDone && onDone();
        }
      },
      'Pin'
    );
    input.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), btn.click()));
    return h('div', { class: 'field' }, h('span', { class: 'field-label' }, it.title), h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, input, btn), note);
  });
  const { openDialog } = await import('./util.js');
  openDialog({ title: 'Put your lived items on the globe', wide: true, body: h('div', { class: 'form' }, h('p', { class: 'dialog-text' }, 'Type where each one happened. Known places are found instantly; others are looked up online.'), rows), actions: [{ label: 'Done', kind: 'primary', value: 'ok' }] });
}
