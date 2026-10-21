// Small helpers: DOM builder, icons, toasts, dialogs, formatting.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ICONS = {
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pencil: '<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  up: '<path d="m5 15 7-7 7 7"/>',
  down: '<path d="m5 9 7 7 7-7"/>',
  shuffle: '<path d="M4 7h3c6 0 4 10 10 10h3M4 17h3c2 0 3-1 4-2.5M13 8.5C14 7.5 15 7 17 7h3"/><path d="m18 4 3 3-3 3M18 14l3 3-3 3"/>',
  book: '<path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 1 2-2h12"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  star: '<path d="m12 3.5 2.6 5.5 6 .8-4.4 4.1 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8z"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  volume: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="m17 9 5 6M22 9l-5 6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  gate: '<path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6"/>'
};
export function icon(name, size = 20) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || '';
  return s;
}

export function debounce(fn, ms = 400) {
  let t;
  const d = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.flush = (...a) => {
    clearTimeout(t);
    return fn(...a);
  };
  d.cancel = () => clearTimeout(t);
  return d;
}

export function slugify(s) {
  return (
    String(s)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'chapter'
  );
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function fmtDate(iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  return isNaN(d) ? '' : d.toLocaleDateString('en-IN', opts);
}

export const num = (n) => Number(n || 0).toLocaleString('en-IN');

export function pct(done, total) {
  return total ? Math.round((done / total) * 100) : 0;
}

export function el$(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// --- toasts -----------------------------------------------------------------
export function toast(message, kind = 'ok', ms = 3200, action = null) {
  const root = $('#toasts');
  const t = h(
    'div',
    { class: `toast toast-${kind}`, role: 'status' },
    message,
    action ? h('button', { type: 'button', onclick: () => { action.onClick(); t.remove(); } }, action.label) : null
  );
  if (action) ms = Math.max(ms, 6500);
  root.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => {
    t.classList.remove('in');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

// --- dialogs ----------------------------------------------------------------
export function openDialog({ title, body, actions = [], wide = false, onClose }) {
  const root = $('#modal-root');
  const prevFocus = document.activeElement;
  const close = (result) => {
    document.removeEventListener('keydown', onKey);
    back.classList.remove('in');
    setTimeout(() => back.remove(), 200);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    onClose && onClose(result);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close(null);
  };
  const box = h(
    'div',
    { class: 'dialog' + (wide ? ' dialog-wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('h2', { class: 'dialog-title' }, title),
    h('div', { class: 'dialog-body' }, body),
    actions.length
      ? h(
          'div',
          { class: 'dialog-actions' },
          actions.map((a) =>
            h(
              'button',
              {
                class: 'btn ' + (a.kind ? 'btn-' + a.kind : ''),
                type: 'button',
                onclick: async () => {
                  if (a.onClick) {
                    const keep = await a.onClick(box);
                    if (keep === false) return;
                  }
                  close(a.value);
                }
              },
              a.label
            )
          )
        )
      : null
  );
  const back = h('div', { class: 'modal-back', onmousedown: (e) => e.target === back && close(null) }, box);
  root.append(back);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => back.classList.add('in'));
  const first = box.querySelector('input,textarea,select');
  if (first) first.focus();
  return { close, box };
}

export function confirmDialog(message, { confirmLabel = 'Delete', kind = 'danger', title = 'Are you sure?' } = {}) {
  return new Promise((resolve) => {
    openDialog({
      title,
      body: h('p', { class: 'dialog-text' }, message),
      actions: [
        { label: 'Cancel', value: false },
        { label: confirmLabel, kind, value: true }
      ],
      onClose: (r) => resolve(!!r)
    });
  });
}

// A form dialog: fields = [{name,label,type,value,placeholder,options,hint}]
export function formDialog({ title, fields, submitLabel = 'Save', wide = false }) {
  return new Promise((resolve) => {
    const inputs = {};
    const body = h(
      'div',
      { class: 'form' },
      fields.map((f) => {
        let input;
        if (f.type === 'textarea') input = h('textarea', { rows: f.rows || 3, placeholder: f.placeholder || '' }, f.value || '');
        else if (f.type === 'select')
          input = h(
            'select',
            {},
            f.options.map((o) => h('option', { value: o.value, selected: o.value === f.value }, o.label))
          );
        else if (f.type === 'checkbox') input = h('input', { type: 'checkbox', checked: !!f.value });
        else input = h('input', { type: f.type || 'text', value: f.value ?? '', placeholder: f.placeholder || '', list: f.list || null, autocomplete: f.autocomplete || 'off' });
        inputs[f.name] = input;
        return h(
          'label',
          { class: 'field' + (f.type === 'checkbox' ? ' field-check' : '') },
          f.type === 'checkbox' ? [input, h('span', {}, f.label)] : [h('span', { class: 'field-label' }, f.label), input],
          f.hint ? h('small', { class: 'field-hint' }, f.hint) : null
        );
      })
    );
    openDialog({
      title,
      body,
      wide,
      actions: [
        { label: 'Cancel', value: null },
        {
          label: submitLabel,
          kind: 'primary',
          value: 'ok',
          onClick: () => {
            const required = fields.find((f) => f.required && !String(inputs[f.name].value).trim());
            if (required) {
              inputs[required.name].focus();
              toast(`${required.label} is needed`, 'warn');
              return false;
            }
          }
        }
      ],
      onClose: (r) => {
        if (r !== 'ok') return resolve(null);
        const out = {};
        for (const f of fields) out[f.name] = f.type === 'checkbox' ? inputs[f.name].checked : inputs[f.name].value.trim();
        resolve(out);
      }
    });
    body.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        e.preventDefault();
        $('.dialog-actions .btn-primary')?.click();
      }
    });
  });
}

export function stars(value, { onPick } = {}) {
  const wrap = h('div', { class: 'stars' + (onPick ? ' stars-edit' : ''), role: onPick ? 'radiogroup' : 'img', 'aria-label': `${value || 0} out of 5` });
  for (let i = 1; i <= 5; i++) {
    const s = h(onPick ? 'button' : 'span', { class: 'star' + (i <= (value || 0) ? ' on' : ''), type: onPick ? 'button' : null, 'aria-label': onPick ? `${i} star${i > 1 ? 's' : ''}` : null }, icon('star', 22));
    if (onPick) s.addEventListener('click', () => onPick(i === value ? 0 : i));
    wrap.append(s);
  }
  return wrap;
}

// Replace an element's children, ignoring null/false entries (replaceChildren would print them as text).
export function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  return el;
}
