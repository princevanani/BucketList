import { h, icon } from '../util.js';

export const SVG_NS = 'http://www.w3.org/2000/svg';

// The hand-drawn tick used in checkboxes.
export function tickSvg() {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.innerHTML = '<path d="M4 13.5 9.5 19 20.5 5"/>';
  return s;
}

// Little picture for a polaroid: the cover photo or video frame, or the chapter emoji.
export function coverPic(item) {
  const pic = h('div', { class: 'polaroid-pic' });
  if (item.cover_url && item.cover_kind === 'video') {
    pic.append(h('video', { src: item.cover_url + '#t=0.1', muted: true, preload: 'metadata', playsinline: true }), h('span', { class: 'play-badge' }, icon('play', 14)));
  } else if (item.cover_url) {
    pic.append(h('img', { src: item.cover_url, alt: '', loading: 'lazy' }));
  } else {
    pic.append(h('span', { 'aria-hidden': 'true' }, item.categories?.emoji || '✦'));
  }
  return pic;
}

// The little steam-train picture used by the train view and the train story.
export function trainSvg() {
  const car = (x, c) => `<g transform="translate(${x} 0)"><rect x="0" y="14" width="150" height="46" rx="6" fill="${c}"/><rect x="0" y="46" width="150" height="6" fill="#e8ae2f"/>${[14, 50, 86, 122].map((w) => `<rect x="${w}" y="22" width="22" height="18" rx="3" fill="#ffe9a8" opacity=".92"/>`).join('')}<rect x="0" y="60" width="150" height="6" fill="#0a1029"/><circle cx="26" cy="68" r="8" fill="#0a1029" stroke="#8d97b8" stroke-width="2"/><circle cx="124" cy="68" r="8" fill="#0a1029" stroke="#8d97b8" stroke-width="2"/></g>`;
  return `<svg viewBox="0 0 560 84" width="560" height="84"><g class="smoke"><circle cx="472" cy="6" r="6"/><circle cx="480" cy="-4" r="8"/><circle cx="490" cy="-16" r="10"/></g>${car(0, '#a32a2f')}${car(156, '#a32a2f')}${car(312, '#22337a')}<g transform="translate(468 0)"><rect x="0" y="22" width="90" height="38" rx="6" fill="#18255c"/><rect x="58" y="6" width="32" height="30" rx="4" fill="#18255c"/><rect x="64" y="12" width="20" height="14" rx="2" fill="#ffe9a8"/><rect x="2" y="12" width="26" height="14" rx="3" fill="#e8ae2f"/><rect x="0" y="46" width="90" height="5" fill="#e8ae2f"/><rect x="0" y="60" width="90" height="6" fill="#0a1029"/><circle cx="82" cy="40" r="3.5" fill="#fff6c9"/><circle cx="20" cy="68" r="8" fill="#0a1029" stroke="#8d97b8" stroke-width="2"/><circle cx="56" cy="68" r="8" fill="#0a1029" stroke="#8d97b8" stroke-width="2"/></g></svg>`;
}
