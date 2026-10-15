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
