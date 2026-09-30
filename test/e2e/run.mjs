/*
 * End-to-end check in a real Chromium with the built extension loaded.
 *
 *   npm run build && JEV_API_KEY=... npm run e2e
 *
 * www.youtube.com is served from test/e2e/fixtures (a Polymer-like page that renders empty
 * cards first, fills them a frame later, appends more, and recycles one), so results don't
 * depend on YouTube's live markup. Jev calls are real.
 *
 * Asserts: no blocked card's title is visible in any animation frame ("no flash"), the
 * current video is untouched, ads and Shorts are removed, nested lockups aren't cards.
 *
 * Env: CHROMIUM_PATH, SCHEME=dark|light, REDUCED=1, SHOTS=dir,
 *      E2E_RELAY=1 to fetch Jev from Node (for sandboxes whose Chromium can't reach it).
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const root = new URL('../..', import.meta.url).pathname;
const DIST = join(root, 'dist');
const FIX = join(root, 'test/e2e/fixtures');
const SHOTS = process.env.SHOTS;
const KEY = process.env.JEV_API_KEY ?? '';
const scheme = process.env.SCHEME ?? 'dark';
const reduced = process.env.REDUCED === '1';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const ctx = await chromium.launchPersistentContext(join(tmpdir(), `jev-focus-e2e-${Date.now()}`), {
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    '--headless=new',
    ...(process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : []),
  ],
  viewport: { width: 1280, height: 900 },
  colorScheme: scheme,
  reducedMotion: reduced ? 'reduce' : 'no-preference',
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const extId = new URL(sw.url()).host;

await ctx.route('https://www.youtube.com/**', (route) => {
  const u = new URL(route.request().url());
  let body = readFileSync(join(FIX, u.pathname === '/watch' ? 'watch.html' : 'home.html'), 'utf8');
  if (scheme === 'light') body = body.replace('<html dark="true"', '<html');
  return route.fulfill({ status: 200, contentType: 'text/html', body });
});

if (process.env.E2E_RELAY === '1') {
  // Needs PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 so worker requests are routable.
  await ctx.route('https://api.typesafe.ai/**', async (route) => {
    const req = route.request();
    const res = await fetch(req.url(), {
      method: req.method(),
      headers: req.headers(),
      body: req.postData() ?? undefined,
    });
    return route.fulfill({
      status: res.status,
      headers: Object.fromEntries(res.headers),
      body: await res.text(),
    });
  });
}

await new Promise((r) => setTimeout(r, 500));
for (const p of ctx.pages()) if (p.url().includes('options')) await p.close();

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failures.push(msg);
};

const opt = await ctx.newPage();
await opt.goto(`chrome-extension://${extId}/options/options.html`);
if (KEY) {
  await opt.fill('#key-input', KEY);
  await opt.click('#key-save');
  await opt.waitForFunction(
    () =>
      /Connected|rejected|error|reach|Timed/i.test(
        document.querySelector('#key-status').textContent,
      ),
    null,
    { timeout: 15000 },
  );
  const status = await opt.textContent('#key-status');
  check(status.startsWith('Connected'), `test connection: ${status}`);
}
if (SHOTS) await opt.screenshot({ path: `${SHOTS}/options-${scheme}.png`, fullPage: true });

const detector = () => {
  window.__visible = {};
  window.__frames = 0;
  const tick = () => {
    window.__frames++;
    for (const h of document.querySelectorAll('h3')) {
      const href = h
        .closest('ytd-rich-item-renderer, yt-lockup-view-model')
        ?.querySelector('a')
        ?.getAttribute('href');
      if (href && getComputedStyle(h).visibility === 'visible' && h.checkVisibility()) {
        window.__visible[href] = (window.__visible[href] ?? 0) + 1;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

async function visit(url, name, settleMs) {
  const page = await ctx.newPage();
  await page.addInitScript(detector);
  await page.goto(url);
  await page.waitForTimeout(250);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-pending-${scheme}.png` });
  await page.waitForTimeout(settleMs);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png`, fullPage: true });
  const r = await page.evaluate(() => ({
    frames: window.__frames,
    visible: window.__visible,
    cards: [
      ...document.querySelectorAll('ytd-rich-item-renderer, #secondary yt-lockup-view-model'),
    ].map((c) => ({
      href: c.querySelector('a')?.getAttribute('href') ?? '',
      ad: !!c.querySelector('ytd-ad-slot-renderer'),
      state: c.getAttribute('data-jf'),
    })),
    nestedTagged: document.querySelectorAll('ytd-rich-item-renderer yt-lockup-view-model[data-jf]')
      .length,
  }));
  const hidden = (s) => s === 'gone' || s === 'blocked' || s === 'held';
  const flashed = r.cards.filter((c) => hidden(c.state) && r.visible[c.href]);
  check(
    flashed.length === 0,
    `${name}: no blocked card painted (${r.frames} frames, ${r.cards.filter((c) => hidden(c.state)).length} hidden)`,
  );
  check(
    r.cards.every((c) => c.state && c.state !== 'pending'),
    `${name}: every card decided`,
  );
  check(r.nestedTagged === 0, `${name}: nested lockups are not separate cards`);
  return { page, r };
}

const home = await visit('https://www.youtube.com/', 'home', 3500);
check(
  home.r.cards.filter((c) => c.ad).every((c) => c.state === 'gone'),
  'home: ads removed',
);
check(
  home.r.cards.filter((c) => c.href.startsWith('/shorts/')).every((c) => c.state === 'gone'),
  'home: Shorts removed',
);
if (KEY) {
  const s = Object.fromEntries(home.r.cards.map((c) => [c.href, c.state]));
  check(
    s['/watch?v=v0'] === 'allowed' && s['/watch?v=v1'] === 'gone',
    'home: lofi allowed, MrBeast hidden (Deep Work)',
  );
  check(s['/watch?v=v16'] === 'gone', 'home: recycled card re-classified');
}
const watch = await visit('https://www.youtube.com/watch?v=v0', 'watch', 1500);
check(
  watch.r.cards.find((c) => c.href === '/watch?v=v0')?.state === 'pass',
  'watch: current video untouched',
);

const pop = await ctx.newPage();
await pop.setViewportSize({ width: 360, height: 480 });
await pop.goto(`chrome-extension://${extId}/popup/popup.html`);
await pop.waitForTimeout(400);
console.log(
  `popup: ${await pop.textContent('#status')} · hidden today ${await pop.textContent('#s-today')} · calls ${await pop.textContent('#s-calls')} · ${await pop.textContent('#s-cost')}`,
);
if (SHOTS) await pop.screenshot({ path: `${SHOTS}/popup-${scheme}.png` });

await ctx.close();
process.exit(failures.length ? 1 : 0);
