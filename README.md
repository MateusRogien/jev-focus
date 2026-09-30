# Jev Focus

A Chrome extension that keeps YouTube usable for focus music. It hides every video that
doesn't fit your current focus profile, before its thumbnail or title is drawn.

![Jev Focus on the YouTube home feed](docs/hero.gif)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Jev Focus is an independent community project. It is not affiliated with or endorsed by
TypeSafe AI.

## Why

Site blockers like Opal, Freedom and Cold Turkey are all-or-nothing: YouTube is either
allowed or blocked. I can't block it while I work, because that's where my background
audio comes from: lofi, classical, ambient study streams.

But opening YouTube to start a playlist means walking past the home feed and the sidebar,
and that is where the hour goes. Jev Focus leaves YouTube working and removes the part that
pulls you away.

## How it works

The content script hides every video card as the page loads. It sends the title, channel,
duration and badges of each card to the extension's service worker. The worker asks
[Jev](https://typesafe.ai) (TypeSafe's decision model) which of your profile's categories
each video belongs to, one batched request per screenful. Cards in allowed categories fade
in, and the rest collapse. Answers are cached per video for 7 days.

```
content script ──metadata──▶ service worker ──one batch──▶ Jev ──probabilities──▶ decision
      ▲                           │  ▲                                              │
      └────── show / hide ────────┘  └──────────── cache (7 days, per profile) ◀────┘
```

A video is hidden when Jev puts enough probability on the profile's blocked categories
(Relaxed 75%, Balanced 50%, Strict 30%), or when it judges the title to be clickbait.

## Install (from source)

Requires Node 20 or newer and Git.

1. Clone and build:
   ```sh
   git clone https://github.com/mateusrogien/jev-focus.git
   cd jev-focus
   npm install
   npm run build
   ```
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `dist/` folder.
5. Pin Jev Focus from the puzzle-piece menu so the popup is one click away.

The options page opens on first install. The same steps work in Edge (`edge://extensions`),
Brave (`brave://extensions`) and Arc (`arc://extensions`).

To produce a Chrome Web Store zip: `npm run package`.

## Get a Jev key

Jev Focus has no backend and no shared key, so you use your own. Any of these works:

| Provider          | Where to get a key                                 | Endpoint used                       |
| ----------------- | -------------------------------------------------- | ----------------------------------- |
| TypeSafe (direct) | [console.typesafe.ai](https://console.typesafe.ai) | `api.typesafe.ai/v1/systemone`      |
| OpenRouter        | [openrouter.ai/keys](https://openrouter.ai/keys)   | `openrouter.ai/api/alpha/decisions` |
| NanoGPT           | [nano-gpt.com/api](https://nano-gpt.com/api)       | `nano-gpt.com/api/v1/decisions`     |

In **Options → API key & provider**, pick the provider, paste the key, then click **Save key**.
Saving runs **Test connection**, which should show `Connected · <latency> ms`. The model is
pinned to `jev-1.13.0` (TypeSafe) or `typesafe/jev-1.13` (gateways), and you can change it
under **Advanced**.

## Profiles

Switch profiles from the popup with one click. Presets are read-only, but you can
**duplicate** one to edit it or build your own. Each category has a one-line description,
and Jev reads it word for word, so write it to separate that category from its neighbours.

| Profile    | Allowed                                                                         | Blocked                                            |
| ---------- | ------------------------------------------------------------------------------- | -------------------------------------------------- |
| Deep Work  | lofi, classical, ambient/drone, study-with-me, nature sounds, instrumental jazz | everything else                                    |
| Learning   | tutorials, lectures, documentaries, technical talks, explainers, languages      | entertainment, reaction, gaming, drama, pranks     |
| Music Only | any music, live performances, albums                                            | non-music                                          |
| Builder    | programming, engineering, product, business, conference talks                   | entertainment, lifestyle vlogs, reaction, gaming   |
| Wind Down  | calm music, slow nature/travel, meditation, long-form interviews                | rage bait, news, drama, high-energy gaming, Shorts |
| Kid Safe   | educational kids content, young-audience animation, science for kids            | mature themes, pranks, horror, drama, toy ads      |

Every profile also runs a clickbait check ("Is this title written primarily to provoke
curiosity or outrage rather than describe the content?"). You can turn it off per profile.

You can also filter by channel. Channel allow/block lists are checked locally before Jev is
asked, so listed channels never cost an API call.

## Privacy

What leaves the browser, for each card on a surface you've turned on:

- the video **title**, **channel name**, **duration**, and visible **badges** (LIVE, Premiere,
  Shorts, Playlist)
- your profile's category names and descriptions

It is sent only to the provider you selected, over HTTPS, from the service worker, with no
cookies and no referrer. The manifest grants host access to YouTube and the three provider
hosts, and nothing else.

What never leaves: your watch history, account, cookies, the page URL, search terms, the
video you're watching, view counts and thumbnails.

The API key is stored in `chrome.storage.local` (not `sync`), and only the service worker
reads it. The content script gets a key-free config through `storage.session`. There are
no analytics and no server of ours.

## Cost

Jev charges only for input tokens, at $0.042 per million, and output is free. I measured a
real 24-card home feed batch on `jev-1.13.0` with the Deep Work profile. It came to 12,680
input tokens in one 601 ms request, about 530 tokens per video. Most of that is the nine
category descriptions, which are repeated in each video's question.

Normal browsing of about 300 new cards a day (cached cards are free):

```
300 videos × 530 tokens × $0.042 / 1M ≈ $0.0067 per day  (≈ $0.20 per month)
```

The popup shows API calls and estimated cost for today. `npm run smoke` reproduces the
measurement against your own key (see [Contributing](#contributing)).

## Troubleshooting

**Nothing gets hidden.** Check that the master switch in the popup is on and that the
surface is enabled in **Options → Surfaces**. Search results and Subscriptions are off by
default. If the failure mode is **Show everything** and the popup's status line shows an
error, Jev is unreachable and nothing is being filtered until that's fixed.

**Everything is hidden.** This is fail-closed doing its job. The popup's status line says
why: no key, a rejected key, a rate limit, or no connection. Held cards retry every 20 s,
and immediately after you save a key. If you'd rather see everything while Jev is
unreachable, set **Options → Strictness & failure → When Jev is unavailable → Show
everything**.

**Cards stay as grey skeletons, or YouTube's layout looks wrong.** YouTube probably renamed
its elements. All selectors live in
[`src/content/selectors.ts`](src/content/selectors.ts): find the new tag name in DevTools,
update the list, then run `npm run build` and reload the extension.

**"Key rejected (401)" or 403.** The key is wrong, revoked, or belongs to a different
provider than the one selected. Paste it again and click **Test connection**.

**"Rate limited (429)".** Jev Focus backs off exponentially (2 s up to 2 min) and follows
`Retry-After`. Cards on screen are held or shown according to your failure mode. It clears
on its own. If it persists, check your provider's limits.

**"Jev Focus was updated — reload this page".** The extension was reloaded while the tab was
open. Reload the tab.

## Contributing

```sh
npm run watch      # rebuild dist/ on change; reload the extension in chrome://extensions
npm run check      # typecheck, lint, format check, unit tests
npm run e2e        # Chromium run against fixture pages (needs JEV_API_KEY; see test/e2e/run.mjs)
JEV_API_KEY=... npm run smoke   # one real 24-video batch: verdicts, latency, tokens per video
```

Never commit a key. `.env` is git-ignored.

**Add a preset profile.** Add it to `PRESETS` in
[`src/shared/profiles.ts`](src/shared/profiles.ts). End the category list with a broad
blocked catch-all, so "everything else" has an option to land on. Then check the
descriptions with `JEV_PROFILE=<id> npm run smoke`.

**Update selectors.** Edit [`src/content/selectors.ts`](src/content/selectors.ts). It is
the only place YouTube markup is referenced, and `content.css` is generated from it at build
time. Add a case to `test/extract.test.ts` for any new card shape.

**Add a provider.** Write one adapter file in `src/api/providers/`, register it in `index.ts`,
and add its origin to `host_permissions` in `src/manifest.json`.

## License

[MIT](LICENSE)
