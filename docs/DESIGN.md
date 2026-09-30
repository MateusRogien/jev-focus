# Jev Focus design system

A desk lamp in a dark room at 11 pm. The UI stays calm and warm, keeps contrast low where
nothing needs attention, and is precise where a decision is being made. No neon, no decorative
gradients, no glassmorphism, no emoji.

Tokens live in [`src/ui/tokens.css`](../src/ui/tokens.css). Components use tokens only — no raw
hex values outside that file and the YouTube skeleton block in `src/content/filter.css`.

## Colour

Dark is the default. Light mode follows `prefers-color-scheme` and can be forced with
`data-theme="light" | "dark"` on `<html>`.

| Token       | Dark      | Light     | Use                                                |
| ----------- | --------- | --------- | -------------------------------------------------- |
| `--ink`     | `#0E0F13` | `#F5F2EC` | App background                                     |
| `--surface` | `#16181F` | `#FFFDF9` | Cards, panels                                      |
| `--raised`  | `#1E212A` | `#ECE8E0` | Inputs, hover                                      |
| `--line`    | `#2A2E39` | `#DDD7CC` | Hairline borders (decorative, not text)            |
| `--text`    | `#ECEDEF` | `#1A1B1F` | Primary text                                       |
| `--muted`   | `#8A8F9C` | `#5C606B` | Secondary text                                     |
| `--lamp`    | `#E8B86D` | `#8A5A14` | Active profile, primary buttons, focus ring        |
| `--on-lamp` | `#0E0F13` | `#FFFDF9` | Text on a lamp-filled button                       |
| `--sage`    | `#8FB9A8` | `#2F6B55` | Allowed, healthy, connected                        |
| `--ember`   | `#E07A6B` | `#A93E30` | Blocked counts, errors                             |
| `--*-wash`  | 10–12 %   | 10 %      | Tinted backgrounds behind lamp / sage / ember text |

Light mode is not an inversion. The background is warm paper rather than white. The accents
are darkened until they pass AA as text: amber turns bronze, sage turns forest, ember turns brick.

### Contrast (WCAG 2.1, measured by `node scripts/contrast.mjs`)

Every text colour passes AA (≥ 4.5:1) on every background it can sit on, including
`--raised`, where contrast is lowest.

| Pair                    | Dark  | Light |
| ----------------------- | ----- | ----- |
| text / ink              | 16.35 | 15.40 |
| muted / ink             | 5.92  | 5.63  |
| muted / raised (worst)  | 4.97  | 5.14  |
| lamp / raised (worst)   | 8.81  | 4.84  |
| sage / raised           | 7.41  | 5.12  |
| ember / raised          | 5.49  | 5.03  |
| on-lamp / lamp (button) | 10.50 | 5.82  |

`--line` is decorative, so it is exempt from text contrast. Controls whose boundary
matters (inputs, switches) use `--muted` for the border when unfocused, which meets 3:1
against `--surface` for non-text UI.

### YouTube skeleton

The shimmer on YouTube has to match YouTube's own surfaces, not ours:

| Theme                   | Base      | Highlight |
| ----------------------- | --------- | --------- |
| Dark (`html[dark]`)     | `#1A1C23` | `#22252E` |
| Light (YouTube default) | `#ECECEC` | `#F4F4F4` |

## Type

System stack only, no web font downloads:
`ui-sans-serif, -apple-system, "Segoe UI", Inter, system-ui, sans-serif`.

| Token     | Size | Use                                     |
| --------- | ---- | --------------------------------------- |
| `--fs-xs` | 12   | Captions, pill, bar labels              |
| `--fs-sm` | 13   | Secondary text, form help               |
| `--fs-md` | 15   | Body, controls                          |
| `--fs-lg` | 20   | Section headings, profile name in popup |
| `--fs-xl` | 28   | Page title, large stat numbers          |

Every count uses `font-variant-numeric: tabular-nums` so digits don't jitter as they change.
Weights: 400 body, 520 labels, 640 headings. Nothing heavier.

## Space, radius, elevation

- 4-pt grid: `--s1` (4) through `--s12` (48). Popup padding 16, section gap 12.
- Radius: 8 for controls, 12 for cards, 999 for pills.
- Elevation comes from surface steps (`ink → surface → raised`), not shadows. A single
  hairline `--line` border separates panels. The one shadow is on the YouTube pill, because it
  floats over content we don't control.

## Motion

One curve everywhere: `cubic-bezier(.2,.8,.2,1)` (`--ease`).

| Token          | Duration | Use                                            |
| -------------- | -------- | ---------------------------------------------- |
| `--t-ui`       | 150 ms   | Hover, toggles, fade-in of allowed cards, pill |
| `--t-collapse` | 220 ms   | Blocked card "exhale"                          |

Only `transform` and `opacity` are animated. Blocked cards scale to 0.96 and fade out, then
collapse with a single `display: none`, so the grid reflows once per batch rather than once
per frame. `prefers-reduced-motion: reduce` sets both durations to 0: allowed cards
appear instantly and blocked cards are removed instantly.

## Components

- **Switch** — 36×20 track, lamp when on, `--raised` with a muted border when off. The thumb
  moves via `transform`.
- **Button** — primary: lamp fill with `--on-lamp` text. Secondary: `--raised` fill with a
  hairline border. Danger: ember text on `--ember-wash`. Height 32, radius 8.
- **Segmented control** — used for strictness (Relaxed / Balanced / Strict) and failure mode.
  The selected segment is lamp-outlined on `--lamp-wash`.
- **Profile card** — surface fill with a 12 radius. The active card has a 1 px lamp border and
  a lamp icon. The whole card is the tap target.
- **Status line** — a 6 px dot plus one sentence. Sage means connected, ember means an error,
  muted means idle.
- **Probability bar** — 6 px track in `--raised`. The fill is sage for allowed categories and
  ember for blocked ones, and the percentage is shown in tabular numerals.
- **Focus** — every interactive element shows `--ring` on `:focus-visible`.

## Logo

A small filled circle above a single horizontal line: a sun settling behind a still horizon,
or a lamp over a desk. At 16 px it is a 6 px disc over an 11 × 1.5 px bar on an ink tile. The
ink tile keeps it legible on both light and dark browser toolbars.

- Source: `src/icons/logo.svg` (tile) and `src/icons/mark.svg` (bare mark, `currentColor`).
- PNGs: `npm run icons` renders 16 / 32 / 48 / 128.

## Profile icons

Profiles use a small set of geometric line glyphs (lamp, book, note, wrench, moon, leaf,
circle) drawn on a 16 px grid with a 1.5 px stroke. No emoji.

## Voice

Short, literal, and lowercase-friendly. "12 hidden · Deep Work", not "12 distractions
crushed". Errors say what happened and what to do next: "Key rejected (401) — check it in
Options."
