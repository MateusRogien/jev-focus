import type { ProfileIcon } from '../shared/types';

/* Profile glyphs: 16 px grid, 1.5 px stroke, currentColor. No emoji. */
const PATHS: Record<ProfileIcon, string> = {
  lamp: '<circle cx="8" cy="6.5" r="3" fill="currentColor" stroke="none"/><path d="M2.5 11.75h11"/>',
  book: '<path d="M2.5 3.5h4a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 0-1.5-1.5h-4zM13.5 3.5h-4A1.5 1.5 0 0 0 8 5v8a1.5 1.5 0 0 1 1.5-1.5h4z"/>',
  note: '<path d="M6 12V3.5l7-1.5V10.5"/><circle cx="4.5" cy="12" r="1.75"/><circle cx="11.5" cy="10.5" r="1.75"/>',
  wrench:
    '<path d="M10.5 2.5a3 3 0 0 0-2.8 4.1L2.8 11.5a1.2 1.2 0 0 0 1.7 1.7l4.9-4.9a3 3 0 0 0 4.1-2.8l-1.8 1.8-1.9-.4-.4-1.9z"/>',
  moon: '<path d="M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z"/>',
  leaf: '<path d="M3 13c0-6 4-9.5 10-10 0 6-3.5 10-10 10zM3 13l5-5"/>',
  circle: '<circle cx="8" cy="8" r="5"/>',
};

export const PROFILE_ICONS = Object.keys(PATHS) as ProfileIcon[];

export function icon(
  name: ProfileIcon | 'chevron' | 'check' | 'eye' | 'eye-off' | 'plus' | 'trash' | 'copy',
): SVGSVGElement {
  const extra: Record<string, string> = {
    chevron: '<path d="M6 4l4 4-4 4"/>',
    check: '<path d="M3.5 8.5l3 3 6-7"/>',
    eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
    'eye-off':
      '<path d="M2 2l12 12M6.6 3.7A6.7 6.7 0 0 1 8 3.5C12 3.5 14.5 8 14.5 8a11 11 0 0 1-1.8 2.3M4.3 4.9A11 11 0 0 0 1.5 8S4 12.5 8 12.5a6 6 0 0 0 2.7-.6"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5"/>',
    copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon-svg');
  // Static, trusted markup defined above; never user input.
  svg.innerHTML = PATHS[name as ProfileIcon] ?? extra[name] ?? '';
  return svg;
}

/** Tiny DOM helper: h('div', { class: 'x' }, child, 'text'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Array<Node | string | null | undefined | false>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function bars(
  entries: Array<{ label: string; p: number; blocked: boolean }>,
): HTMLDivElement {
  const wrap = h('div', { class: 'bars' });
  for (const e of entries) {
    const fill = h('div', { class: 'fill' });
    fill.style.transform = `scaleX(${Math.max(0, Math.min(1, e.p))})`;
    wrap.append(
      h(
        'div',
        { class: `bar${e.blocked ? ' blocked' : ''}` },
        h('span', {}, e.label),
        h('span', { class: 'pct' }, `${Math.round(e.p * 100)}%`),
        h('div', { class: 'track' }, fill),
      ),
    );
  }
  return wrap;
}
