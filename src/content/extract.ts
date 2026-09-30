import type { SurfaceId, VideoMeta } from '../shared/types';
import * as S from './selectors';

const text = (el: Element | null | undefined): string =>
  (el?.getAttribute('title') || el?.textContent || '').replace(/\s+/g, ' ').trim();

function first(root: Element, selectors: readonly string[]): string {
  for (const sel of selectors) {
    let el: Element | null;
    try {
      el = root.querySelector(sel);
    } catch {
      continue; // selector unsupported in this browser; try the next one
    }
    const t = text(el);
    if (t) return t;
  }
  return '';
}

/** Video id (or `pl:<id>` for a playlist) from a card, or '' if it has no link yet. */
export function itemId(card: Element): string {
  const href =
    card instanceof HTMLAnchorElement && card.href ? card.getAttribute('href') : linkOf(card);
  if (!href) return '';
  return idFromHref(href);
}

function linkOf(card: Element): string {
  for (const sel of S.LINK) {
    const a = card.querySelector(sel);
    const h = a?.getAttribute('href');
    if (h) return h;
  }
  return '';
}

export function idFromHref(href: string): string {
  let u: URL;
  try {
    u = new URL(href, 'https://www.youtube.com');
  } catch {
    return '';
  }
  const v = u.searchParams.get('v');
  if (v) return v;
  const shorts = u.pathname.match(/^\/shorts\/([\w-]{6,})/);
  if (shorts) return shorts[1]!;
  const list = u.searchParams.get('list');
  if (list) return `pl:${list}`;
  // Shows and courses: /show/VL<playlist id>
  const show = u.pathname.match(/^\/show\/(?:VL)?([\w-]{6,})/);
  if (show) return `pl:${show[1]}`;
  return '';
}

const DURATION_RE = /^\d{1,2}(:\d{2}){1,2}$/;
const BADGE_WORDS: Array<[RegExp, string]> = [
  [/^live$|^live now$|^en direct$|^en vivo$|^ao vivo$/i, 'LIVE'],
  [/premiere/i, 'Premiere'],
  [/^upcoming$/i, 'Upcoming'],
];

export function isShort(card: Element): boolean {
  if (
    card.matches(
      'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, ytd-reel-item-renderer, [is-slim-media]',
    )
  )
    return true;
  if (
    card.querySelector(
      'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, [overlay-style="SHORTS"]',
    )
  )
    return true;
  return /^\/shorts\//.test(linkOf(card));
}

export function isAd(card: Element): boolean {
  return card.matches(S.AD_MARKERS) || card.querySelector(S.AD_MARKERS) !== null;
}

export function isNonVideo(card: Element): boolean {
  return card.querySelector(S.NON_VIDEO_MARKERS) !== null;
}

/**
 * Title, channel, duration, badges. Nothing else is read from the card: no view counts,
 * upload dates, thumbnails, or anything about the viewer.
 */
export function extract(card: Element): VideoMeta | undefined {
  const id = itemId(card);
  const title = first(card, S.TITLE);
  if (!id || !title) return undefined;

  let channel = first(card, S.CHANNEL);
  // End-screen author text is "Channel • 1.2M views"; keep only the channel.
  channel = channel.split(' • ')[0]!.trim();

  let duration = first(card, S.DURATION);
  const badges = new Set<string>();
  if (!DURATION_RE.test(duration)) {
    for (const [re, label] of BADGE_WORDS) if (re.test(duration)) badges.add(label);
    duration = '';
  }
  for (const sel of S.BADGES) {
    card.querySelectorAll(sel).forEach((el) => {
      const style = el.getAttribute('overlay-style');
      if (style === 'LIVE') badges.add('LIVE');
      if (style === 'UPCOMING') badges.add('Upcoming');
      const t = text(el);
      for (const [re, label] of BADGE_WORDS) if (re.test(t)) badges.add(label);
    });
  }
  if (isShort(card)) badges.add('Shorts');
  if (id.startsWith('pl:')) badges.add('Playlist');
  // Not list=RD in the link: search results for music now open as a radio too.
  if (card.querySelector('yt-collection-thumbnail-view-model')) {
    badges.add(/\bmix\b/i.test(first(card, S.DURATION)) ? 'Mix' : 'Playlist');
  }

  const meta: VideoMeta = { id, title, channel, duration, badges: [...badges] };
  if (badges.has('Mix') || badges.has('Playlist')) {
    const seen = new Set<string>();
    for (const sel of S.COLLECTION_ITEMS) {
      card.querySelectorAll(sel).forEach((a) => {
        // "Video title · 1:19:02" → "Video title"
        const t = text(a).replace(/\s+·\s+[\d:]+$/, '');
        if (t && t !== title && seen.size < 2) seen.add(t);
      });
    }
    if (seen.size) meta.includes = [...seen];
  }
  return meta;
}

export function surfaceOf(card: Element): SurfaceId | undefined {
  if (card.matches(S.PLAYER_CARDS.join(','))) return 'endscreen';
  const base: SurfaceId | undefined = card.closest(S.SURFACE_ROOTS.watch)
    ? 'watch'
    : card.closest(S.SURFACE_ROOTS.home)
      ? 'home'
      : card.closest(S.SURFACE_ROOTS.search)
        ? 'search'
        : card.closest(S.SURFACE_ROOTS.subscriptions)
          ? 'subscriptions'
          : undefined;
  // Shorts in recommendation surfaces follow the Shorts toggle. Shorts in search results
  // or Subscriptions follow that surface: the user asked for those.
  if ((base === 'home' || base === 'watch') && isShort(card)) return 'shorts';
  return base;
}
