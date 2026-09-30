/*
 * Every YouTube DOM selector Jev Focus depends on. YouTube renames these often; when
 * filtering breaks after a YouTube update, this is the only file that should need changing.
 * content.css is generated from these lists at build time (see scripts/build.mjs).
 *
 * Last checked: 2026-09-30 against live www.youtube.com (desktop, logged out, en-US):
 * search results, Shorts shelves, mixes/playlists and watch cards. View-model components
 * now use camelCase classes (ytLockupMetadataViewModelTitle); the kebab-case variants are
 * kept for older rollouts. Localised strings (e.g. title="Shorts") only
 * match English UIs; the Shorts shelf and card selectors do not depend on language.
 */

/**
 * Feed cards: one root element per video in the page's lists. Order does not matter. A
 * nested match is excluded with :not(... *) so each video has exactly one root.
 */
export const FEED_CARDS: readonly string[] = [
  // Home, Subscriptions and channel grids. Also wraps each Short in a home Shorts shelf.
  'ytd-rich-item-renderer',
  // Search results (classic renderer).
  'ytd-video-renderer',
  // Legacy Subscriptions grid.
  'ytd-grid-video-renderer',
  // Legacy watch-page sidebar: videos, mixes, playlists.
  'ytd-compact-video-renderer',
  'ytd-compact-radio-renderer',
  'ytd-compact-playlist-renderer',
  // Current view-model card used on the watch sidebar and in search. Inside a rich item it
  // is the card's content, not a separate card.
  'yt-lockup-view-model:not(ytd-rich-item-renderer *)',
  // Shorts cards in grid shelves (search, watch sidebar), outside rich items.
  // v2 wraps the v1 element; only the outermost one is the card.
  'ytm-shorts-lockup-view-model:not(ytd-rich-item-renderer *, ytm-shorts-lockup-view-model-v2 *)',
  'ytm-shorts-lockup-view-model-v2:not(ytd-rich-item-renderer *)',
  // Legacy Shorts shelf item.
  'ytd-reel-item-renderer',
  // Search "watch card" panel (games, topics, artists): its hero video and video list.
  'ytd-watch-card-hero-video-renderer',
  'ytd-watch-card-compact-video-renderer',
];

/** Cards drawn by the player (end screen). Absolutely positioned; no layout reflow. */
export const PLAYER_CARDS: readonly string[] = [
  // End-screen video wall shown after a video ends.
  '.ytp-videowall-still',
  // "Up next" autoplay card.
  '.ytp-autonav-endscreen-upnext-container',
  // Creator end cards overlaid in the last seconds of a video.
  '.ytp-ce-video',
  '.ytp-ce-playlist',
];

export const ALL_CARDS: readonly string[] = [...FEED_CARDS, ...PLAYER_CARDS];

/** Cards laid out thumbnail-left (sidebar, search). Used only to shape the skeleton. */
export const HORIZONTAL_CARDS: readonly string[] = [
  'ytd-watch-card-compact-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-compact-radio-renderer',
  'ytd-compact-playlist-renderer',
  'ytd-video-renderer',
  '#secondary yt-lockup-view-model',
  'ytd-watch-next-secondary-results-renderer yt-lockup-view-model',
  'ytd-search yt-lockup-view-model',
];

/** Tall 9:16 Shorts cards. Used only to shape the skeleton. */
export const SHORTS_CARDS: readonly string[] = [
  'ytd-rich-item-renderer[is-slim-media]',
  'ytd-rich-shelf-renderer[is-shorts] ytd-rich-item-renderer',
  'ytm-shorts-lockup-view-model',
  'ytm-shorts-lockup-view-model-v2',
  'ytd-reel-item-renderer',
];

/** Containers that hold only Shorts. Hidden outright when Shorts are hidden. */
export const SHORTS_CONTAINERS: readonly string[] = [
  'ytd-rich-section-renderer:has([is-shorts])',
  'ytd-rich-shelf-renderer[is-shorts]',
  'ytd-reel-shelf-renderer',
  'grid-shelf-view-model:has(ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2)',
];

/** Shorts entry points in the navigation. English UI only (title/aria-label text). */
export const SHORTS_ENTRY_POINTS: readonly string[] = [
  'ytd-guide-entry-renderer:has(> a[title="Shorts"])',
  'ytd-guide-entry-renderer:has(a#endpoint[title="Shorts"])',
  'ytd-mini-guide-entry-renderer[aria-label="Shorts"]',
  'ytd-guide-entry-renderer:has(a[href^="/shorts"])',
  'ytd-mini-guide-entry-renderer:has(a[href^="/shorts"])',
];

/**
 * Shelves that should disappear once every card inside them is hidden, so a row of
 * collapsed cards doesn't leave an orphaned "Shorts" or "Trending" heading.
 */
export const SHELVES: ReadonlyArray<[shelf: string, card: string]> = [
  ['ytd-rich-section-renderer', 'ytd-rich-item-renderer'],
  [
    'ytd-reel-shelf-renderer',
    'ytd-reel-item-renderer, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2',
  ],
  [
    'grid-shelf-view-model',
    'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, yt-lockup-view-model',
  ],
  ['ytd-shelf-renderer', 'ytd-video-renderer, yt-lockup-view-model'],
  ['ytd-horizontal-card-list-renderer', 'yt-lockup-view-model, ytd-video-renderer'],
  [
    'ytd-universal-watch-card-renderer',
    'ytd-watch-card-hero-video-renderer, ytd-watch-card-compact-video-renderer',
  ],
];

/** Ancestors that identify which surface a card is on. */
export const SURFACE_ROOTS = {
  home: 'ytd-browse[page-subtype="home"]',
  subscriptions: 'ytd-browse[page-subtype="subscriptions"]',
  search: 'ytd-search',
  watch:
    'ytd-watch-next-secondary-results-renderer, ytd-watch-flexy #secondary, ytd-watch-flexy #related',
  endscreen: '.html5-video-player',
} as const;

/** Ads that occupy a feed slot. Always hidden without classification. */
export const AD_MARKERS =
  'ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-display-ad-renderer, ytd-promoted-video-renderer, [class*="ad-slot"]';

/** Rich-grid items that hold something other than a video (posts, playables). */
export const NON_VIDEO_MARKERS =
  'ytd-post-renderer, ytd-mini-game-card-view-model, ytd-backstage-post-thread-renderer';

/* ---- Field extraction, most specific first. Each list is tried in order. ---- */

export const LINK = [
  'a#thumbnail[href]',
  'a#video-title-link[href]',
  'a#video-title[href]',
  'a[href*="/watch?v="]',
  'a[href^="/shorts/"]',
  'a[href*="/playlist?list="]',
  'a[href]',
];

export const TITLE = [
  '#video-title',
  // View-model classes: camelCase since 2026 (ytLockupMetadataViewModelTitle), kebab before.
  '.ytLockupMetadataViewModelTitle',
  'h3.ytLockupMetadataViewModelHeadingReset[title]',
  '[class*="lockup-metadata-view-model"][class*="__title"]',
  'h3[title]',
  'h3 a[title]',
  '[class*="shortsLockupViewModelHostMetadataTitle"]',
  '[class*="shortsLockupViewModelHostOutsideMetadataTitle"]',
  'h3',
  // Search watch cards.
  '#watch-card-title',
  'yt-formatted-string.title',
  // Player end screen.
  '.ytp-videowall-still-info-title',
  '.ytp-autonav-endscreen-upnext-title',
  '.ytp-ce-video-title',
  '.ytp-ce-playlist-title',
  // Last resort: the link's own tooltip.
  'a[title]',
];

export const CHANNEL = [
  'ytd-channel-name #text',
  '#channel-name #text',
  '.ytContentMetadataViewModelMetadataRow a[href^="/@"]',
  '.ytContentMetadataViewModelMetadataRow:first-child .ytContentMetadataViewModelMetadataText',
  '[class*="content-metadata-view-model"] a[href^="/@"]',
  '[class*="content-metadata-view-model"][class*="__metadata-text"]',
  '.ytp-videowall-still-info-author',
  '.ytp-autonav-endscreen-upnext-author',
];

export const DURATION = [
  'ytd-thumbnail-overlay-time-status-renderer #text',
  'ytd-thumbnail-overlay-time-status-renderer',
  'yt-thumbnail-badge-view-model .ytBadgeShapeText',
  '.ytBadgeShapeText',
  'yt-thumbnail-badge-view-model [class*="badge-shape"][class*="__text"]',
  'badge-shape [class*="__text"]',
  '.ytp-videowall-still-info-duration',
  '.ytp-ce-video-duration',
];

/**
 * Mixes and playlists: the video titles listed on the card. A mix is often titled just
 * "YouTube Mix", so these lines are the only description of what's in it.
 */
export const COLLECTION_ITEMS = [
  '.ytContentMetadataViewModelMetadataRow a[href*="list="]',
  'yt-collection-thumbnail-view-model ~ * a[href*="list="]',
];

/** Elements whose text may be a LIVE / PREMIERE / UPCOMING badge. */
export const BADGES = [
  'ytd-thumbnail-overlay-time-status-renderer[overlay-style]',
  'ytd-badge-supported-renderer',
  'badge-shape',
  '.ytp-videowall-still-info-live',
];

/** "Cancel" on the autoplay countdown, clicked when the up-next video is blocked. */
export const AUTONAV_CANCEL = '.ytp-autonav-endscreen-upnext-cancel-button';

/** YouTube's SPA navigation event, fired on document after each page change. */
export const NAVIGATE_EVENT = 'yt-navigate-finish';
