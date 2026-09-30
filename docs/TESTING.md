# Manual test checklist

Run this before a release, on live YouTube, in a fresh Chrome profile with the unpacked
`dist/` build. Automated coverage is in `npm test` (unit tests) and `npm run e2e`, which runs
Chromium against fixture pages and asserts that no blocked title is visible in any frame.
This list covers what fixtures can't: YouTube's real markup, timing, and SPA behaviour.

Setup: `npm run build`, load `dist/`, set a key, keep the **Deep Work** profile, and leave the
default surfaces. Keep DevTools closed unless a step says otherwise, because it changes timing.

## Home feed

- [ ] Hard-reload `youtube.com`. The grid shows skeletons first. At no point does a non-music
      thumbnail or title appear, even for one frame. To check frame by frame, record at 0.25×
      in DevTools → Performance → Screenshots.
- [ ] Allowed videos (lofi, classical, ambient…) fade in within about half a second.
- [ ] Blocked cards shrink slightly, fade, and the grid closes the gap. No leftover holes.
- [ ] The Shorts shelf is gone entirely, including its heading (Deep Work hides Shorts).
- [ ] Ads and community posts in the grid are gone.
- [ ] Scroll down to load more. New cards follow the same skeleton → fade/collapse sequence,
      and scrolling stays smooth with 50+ cards on the page.
- [ ] The pill in the bottom left reads "N hidden · Deep Work", fades after a few seconds,
      and reappears when N grows. Clicking it opens the popup (or Options on older Chrome).

## Watch page

- [ ] Open a lofi stream. The video, title, description and comments are untouched.
- [ ] Sidebar recommendations follow the same rules. The current video, if listed, is shown.
- [ ] Narrow the window so recommendations move below the player. They're still filtered.
- [ ] Let a video end. End-screen suggestions are filtered.
- [ ] With autoplay on, if the "Up next" video is blocked, the countdown is cancelled and the
      card disappears. If it's allowed, autoplay proceeds.
- [ ] End cards during the last seconds of a video are filtered.

## SPA navigation

- [ ] Home → a video → back → Subscriptions → Home, all without reloading. Every page
      is filtered correctly and nothing from the previous page leaks through.
- [ ] Go back and forward quickly. Cards YouTube reuses for different videos are
      re-evaluated (a card's thumbnail never shows a video that should be hidden).
- [ ] The pill's count resets on each navigation.

## Shorts

- [ ] Deep Work: the Shorts shelf on Home, and Shorts in the sidebar, are gone.
- [ ] Options → Hide Shorts everywhere: the Shorts entry in the left guide and mini-guide
      disappears.
- [ ] A profile with Hide Shorts off (e.g. a duplicated Music Only with the toggle off):
      Shorts are classified like any other video.
- [ ] Opening a `/shorts/...` URL directly still plays. Filtering doesn't block navigation.

## Search and Subscriptions

- [ ] By default, search results are untouched and appear instantly (no skeleton delay).
- [ ] Turn on Search results in Options, then search "minecraft". Results are filtered.
- [ ] By default, the Subscriptions feed is untouched. Turn it on and it's filtered.

## Profile switch

- [ ] In the popup, switch Deep Work → Learning. Open YouTube tabs re-evaluate in place:
      cards go to skeleton, then the new verdicts apply, without a reload. Music now hides
      and tutorials show.
- [ ] Switch back. Deep Work verdicts come from cache (API calls today doesn't increase).
- [ ] Change strictness (Options → Strictness). Visible cards update without new API calls.
- [ ] Edit a custom profile's categories and save. Its videos are re-asked (cache key
      includes the category fingerprint).
- [ ] Master switch off: everything appears at once. Back on: filtering resumes.

## Bad key

- [ ] Options → paste `nonsense` → Save. The status reads "Key rejected (401)" in ember.
- [ ] Reload YouTube with fail closed: cards collapse, the pill reads "Jev unavailable —
      videos held", and the popup reads "Key rejected (401) — check Options".
- [ ] Paste the real key → Save. Held cards on open tabs are re-evaluated without a reload.
- [ ] Remove key: the popup reads "No API key — videos stay hidden".

## Offline and slow

- [ ] DevTools → Network → Offline (on the service worker: `chrome://extensions` → Inspect
      views → service worker), then reload YouTube. Fail closed: cards stay hidden and the
      popup reads "Can't reach provider — videos held".
- [ ] Switch to **Show everything**. The same condition shows every card.
- [ ] Throttle to a custom 4 s latency. Requests time out at 3 s and follow the failure mode.
- [ ] Go back online. Within 20 s, held cards are retried and resolve.

## Rate limit

- [ ] (If a low-quota key is available) trigger a 429. The popup shows "Rate limited —
      retrying in N s" with a countdown, and no requests are sent until it expires.

## Reduced motion

- [ ] OS setting "Reduce motion" on (or DevTools → Rendering → prefers-reduced-motion:
      reduce). Allowed cards appear without a fade, and blocked cards vanish instantly with
      no shrink.
- [ ] The skeleton still shows while pending, but doesn't pulse.

## Light theme

- [ ] YouTube → Appearance → Light. The skeletons are light grey (matching YouTube's own
      placeholders), not dark.
- [ ] OS light mode: the popup and Options use the light palette. Text is readable
      everywhere, and the focus ring is visible (Tab through the popup).

## Privacy spot-check

- [ ] Service worker DevTools → Network: requests go only to the selected provider host.
      Request bodies contain titles, channels, durations and badges, and nothing else. There
      is no `Cookie` or `Referer` header.
- [ ] YouTube tab DevTools → Console: `chrome.storage` is not reachable from the page, and
      the content script context (select it in the console's context dropdown) cannot read
      the key: `chrome.storage.local.get('apiKeys')` rejects or returns nothing.
