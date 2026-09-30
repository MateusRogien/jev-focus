import type { ClassifyResponse, ContentConfig, PageStats } from '../shared/messages';
import type { Decision, VideoMeta } from '../shared/types';
import { extract, idFromHref, isAd, isNonVideo, isShort, itemId, surfaceOf } from './extract';
import { Pill } from './pill';
import * as S from './selectors';

/*
 * Runs at document_start. content.css already hides every card; this script decides
 * which to reveal. MutationObserver callbacks run as microtasks before the next paint,
 * so cards that need no API call (unfiltered surfaces, known videos) are tagged before
 * they are ever drawn.
 */

const CARD = S.ALL_CARDS.join(',');
const DEBOUNCE_MS = 150;
const MAX_WAIT_MS = 400;
const RETRY_HELD_MS = 20_000;
/** Re-check cards whose data hasn't rendered yet, in case no further mutation arrives. */
const INCOMPLETE_RECHECK_MS = 400;
/** After this long without a title and link, stop waiting and apply the failure mode. */
const INCOMPLETE_GIVE_UP_MS = 5000;
const CONFIG_KEY = 'contentConfig';

type State = 'pending' | 'allowed' | 'pass' | 'blocked' | 'gone' | 'held';

const root = document.documentElement;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let config: ContentConfig | undefined;
/** Video id each card was last decided for. YouTube recycles card elements. */
const decidedFor = new WeakMap<Element, string>();
/** Cards seen but not yet sent: missing id/title, or waiting for the debounce. */
const queue = new Set<Element>();
/** Cards hidden because the API failed (fail closed); retried later. */
const held = new Set<Element>();
/** Verdicts for this page's profile, so re-rendered cards resolve without a round trip. */
let memo = new Map<string, 'allow' | 'block'>();
const hiddenOnPage = new Set<string>();
const queuedAt = new WeakMap<Element, number>();

let flushTimer: ReturnType<typeof setTimeout> | undefined;
let firstQueuedAt = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let orphaned = false;

const pill = new Pill(() => void send({ type: 'openPopup' }));

const setState = (card: Element, s: State) => {
  if (card.getAttribute('data-jf') !== s) card.setAttribute('data-jf', s);
};

function currentVideoId(): string {
  return location.pathname === '/watch' ? idFromHref(location.href) : '';
}

/* ------------------------------------------------------------------ messaging */

async function send<T>(msg: unknown): Promise<T | undefined> {
  if (orphaned) return undefined;
  try {
    return (await chrome.runtime.sendMessage(msg)) as T;
  } catch {
    // Extension reloaded or updated: this script is orphaned. Stay closed and say so.
    if (!chrome.runtime?.id) {
      orphaned = true;
      pill.show('Jev Focus was updated — reload this page', 'error');
    }
    return undefined;
  }
}

/* ------------------------------------------------------------------ decisions */

function hide(card: Element, id: string) {
  if (!hiddenOnPage.has(id)) {
    hiddenOnPage.add(id);
    updatePill();
  }
  if (reducedMotion.matches || !card.isConnected) setState(card, 'gone');
  else setState(card, 'blocked'); // animationend → gone
  if (card.matches('.ytp-autonav-endscreen-upnext-container')) {
    // Don't let autoplay start a video we just hid.
    (document.querySelector(S.AUTONAV_CANCEL) as HTMLElement | null)?.click();
  }
}

function apply(card: Element, id: string, d: Pick<Decision, 'verdict' | 'source'>) {
  if (itemId(card) !== id) return; // recycled while we waited
  decidedFor.set(card, id);
  held.delete(card);
  if (d.source === 'fail-closed') {
    setState(card, 'held');
    held.add(card);
    scheduleRetry();
    return;
  }
  if (d.verdict === 'allow') setState(card, 'allowed');
  else hide(card, id);
}

/** Decide locally if possible. Returns false if the card must go to the worker. */
function resolveLocally(card: Element): boolean {
  if (!config) return false;
  const id = itemId(card);
  const local = localState(card, id);
  if (local) {
    setState(card, local);
    if (id) decidedFor.set(card, id);
    return true;
  }
  if (!id) return false;
  const known = memo.get(id);
  if (known) {
    apply(card, id, { verdict: known, source: 'cache' });
    return true;
  }
  return false;
}

function localState(card: Element, id: string): State | undefined {
  if (!config!.enabled) return 'pass';
  if (config!.hideShorts && isShort(card)) return 'gone';
  const surface = surfaceOf(card);
  if (!surface || !config!.surfaces[surface]) return 'pass';
  if (isAd(card) || isNonVideo(card)) return 'gone';
  if (id && id === currentVideoId()) return 'pass'; // never touch what the user is watching
  return undefined;
}

function consider(card: Element) {
  const id = itemId(card);
  const state = card.getAttribute('data-jf');
  if (id && decidedFor.get(card) === id && state && state !== 'pending') return;
  if (id !== decidedFor.get(card) && state && state !== 'pending') setState(card, 'pending');
  if (resolveLocally(card)) return;
  if (!queue.has(card)) queuedAt.set(card, performance.now());
  queue.add(card);
  scheduleFlush();
}

function scheduleFlush() {
  const now = performance.now();
  if (!flushTimer) firstQueuedAt = now;
  clearTimeout(flushTimer);
  const wait = Math.max(0, Math.min(DEBOUNCE_MS, MAX_WAIT_MS - (now - firstQueuedAt)));
  flushTimer = setTimeout(flush, wait);
}

async function flush() {
  flushTimer = undefined;
  if (!config) return; // flushed again once config arrives
  const byId = new Map<string, Element[]>();
  const videos: VideoMeta[] = [];
  for (const card of queue) {
    if (!card.isConnected) {
      queue.delete(card);
      continue;
    }
    if (resolveLocally(card)) {
      queue.delete(card);
      continue;
    }
    const meta = extract(card);
    if (!meta) {
      // Not rendered yet. Keep waiting, but not forever: a card must never stay a skeleton.
      if (performance.now() - (queuedAt.get(card) ?? 0) > INCOMPLETE_GIVE_UP_MS) {
        queue.delete(card);
        if (config.failOpen) setState(card, 'allowed');
        else {
          setState(card, 'held');
          held.add(card);
          scheduleRetry();
        }
      }
      continue;
    }
    queue.delete(card);
    setState(card, 'pending');
    const list = byId.get(meta.id);
    if (list) list.push(card);
    else {
      byId.set(meta.id, [card]);
      videos.push(meta);
    }
  }
  // Some cards fill in via text or attribute changes the observer doesn't watch.
  if (queue.size && !flushTimer) flushTimer = setTimeout(flush, INCOMPLETE_RECHECK_MS);
  if (!videos.length) return;

  const profileKey = config.profileKey;
  const res = await send<ClassifyResponse>({ type: 'classify', profileKey, videos });
  if (!res) {
    // Worker unreachable: same as an API failure.
    for (const cards of byId.values()) {
      for (const c of cards) {
        if (config.failOpen) {
          setState(c, 'allowed');
          continue;
        }
        setState(c, 'held');
        held.add(c);
      }
    }
    if (!config.failOpen) scheduleRetry();
    return;
  }
  if (res.profileKey !== config.profileKey) {
    // Profile switched mid-flight; re-ask under the new one.
    for (const cards of byId.values()) for (const c of cards) queue.add(c);
    scheduleFlush();
    return;
  }
  for (const d of res.decisions) {
    if (d.source !== 'fail-closed' && d.source !== 'fail-open') memo.set(d.id, d.verdict);
    for (const card of byId.get(d.id) ?? []) apply(card, d.id, d);
  }
  pill.setDegraded(res.degraded && config.enabled);
}

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(retryHeld, RETRY_HELD_MS);
}

function retryHeld() {
  retryTimer = undefined;
  for (const card of held) {
    held.delete(card);
    decidedFor.delete(card);
    setState(card, 'pending');
    consider(card);
  }
}

/** Re-evaluate every card on the page, e.g. after a profile switch. */
function reevaluateAll() {
  memo = new Map();
  hiddenOnPage.clear();
  updatePill();
  document.querySelectorAll(CARD).forEach((card) => {
    decidedFor.delete(card);
    held.delete(card);
    // Keep hidden-and-gone cards gone until re-decided, so nothing flashes.
    const s = card.getAttribute('data-jf');
    if (s !== 'gone' && s !== 'held') setState(card, 'pending');
    consider(card);
  });
}

/* ------------------------------------------------------------------ observation */

function scanAdded(node: Node) {
  if (!(node instanceof Element)) return;
  if (node.matches(CARD)) consider(node);
  // Only the new subtree: O(new nodes).
  if (node.firstElementChild) node.querySelectorAll(CARD).forEach(consider);
}

const observer = new MutationObserver((records) => {
  for (const r of records) {
    if (r.type === 'childList') r.addedNodes.forEach(scanAdded);
    else if (r.type === 'attributes' && r.target instanceof Element) {
      // A card's link changed: YouTube reused the element for another video.
      const card = r.target.closest(CARD);
      if (card) consider(card);
    }
  }
  // Cards waiting on data (title not rendered yet) get another look after this burst.
  if (queue.size) scheduleFlush();
});

observer.observe(root, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['href'],
});

document.addEventListener(S.NAVIGATE_EVENT, () => {
  hiddenOnPage.clear();
  updatePill();
  // YouTube keeps cards across navigations; anything it re-bound gets re-checked.
  document.querySelectorAll(CARD).forEach(consider);
  if (held.size) retryHeld();
});

// One listener for every card's collapse; no per-card timers.
document.addEventListener(
  'animationend',
  (e) => {
    if (e.animationName !== 'jf-exhale') return;
    const t = e.target as Element;
    if (t.getAttribute('data-jf') === 'blocked') setState(t, 'gone');
  },
  true,
);

/* ------------------------------------------------------------------ config */

function applyConfig(next: ContentConfig) {
  const prev = config;
  config = next;
  root.toggleAttribute('data-jf-off', !next.enabled);
  root.toggleAttribute('data-jf-noshorts', next.enabled && next.hideShorts);
  pill.configure(next.showPill && next.enabled, next.profileName);
  if (!prev) {
    document.querySelectorAll(CARD).forEach(consider);
    scheduleFlush();
    return;
  }
  const changed =
    prev.profileKey !== next.profileKey ||
    prev.enabled !== next.enabled ||
    prev.hideShorts !== next.hideShorts ||
    JSON.stringify(prev.surfaces) !== JSON.stringify(next.surfaces);
  if (changed) reevaluateAll();
  else if (!prev.hasKey && next.hasKey) retryHeld();
}

// Config is published by the worker into storage.session (non-secret fields only).
chrome.storage.session
  .get(CONFIG_KEY)
  .then(async (r) => {
    const c =
      (r[CONFIG_KEY] as ContentConfig | undefined) ??
      (await send<ContentConfig>({ type: 'getConfig' }));
    if (c) applyConfig(c);
  })
  .catch(async () => {
    const c = await send<ContentConfig>({ type: 'getConfig' });
    if (c) applyConfig(c);
  });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes[CONFIG_KEY]?.newValue) {
    applyConfig(changes[CONFIG_KEY].newValue as ContentConfig);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'pageStats') {
    sendResponse({
      hidden: hiddenOnPage.size,
      profileName: config?.profileName ?? '',
    } satisfies PageStats);
  }
  return false;
});

function updatePill() {
  pill.setCount(hiddenOnPage.size);
}
