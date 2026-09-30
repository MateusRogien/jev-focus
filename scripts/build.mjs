// Bundles the extension into dist/. Flags: --watch, --smoke (builds scripts/smoke.ts only).
import { build, context } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

if (args.has('--smoke')) {
  await build({
    entryPoints: ['scripts/smoke.ts'],
    outfile: 'dist-smoke/smoke.js',
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'warning',
  });
  process.exit(0);
}

const common = {
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  minify: !args.has('--watch'),
  sourcemap: args.has('--watch') ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
};

const entries = {
  background: 'src/background/worker.ts',
  content: 'src/content/content.ts',
  'popup/popup': 'src/popup/popup.ts',
  'options/options': 'src/options/options.ts',
};

// content.css is a template: fill its placeholders from src/content/selectors.ts so the
// selectors live in exactly one place.
async function renderContentCss() {
  const out = await build({
    entryPoints: ['src/content/selectors.ts'],
    bundle: true,
    format: 'esm',
    write: false,
    logLevel: 'warning',
  });
  const S = await import(
    `data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`
  );
  const list = (xs) => xs.join(',\n  ');
  const shelves = S.SHELVES.map(
    ([shelf, card]) =>
      `html:not([data-jf-off]) ${shelf}:has(:is(${card})):not(:has(:is(${card}):not([data-jf='gone'], [data-jf='held']))) {\n  display: none !important;\n}`,
  ).join('\n');
  const css = readFileSync('src/content/content.css', 'utf8')
    .replaceAll('__ALL__', list(S.ALL_CARDS))
    .replaceAll('__FEED__', list(S.FEED_CARDS))
    .replaceAll('__PLAYER__', list(S.PLAYER_CARDS))
    .replaceAll('__HORIZ__', list(S.HORIZONTAL_CARDS))
    .replaceAll('__SHORTS__', list(S.SHORTS_CARDS))
    .replaceAll('__SHORT_CONTAINERS__', list(S.SHORTS_CONTAINERS))
    .replaceAll('__SHORT_ENTRY__', list(S.SHORTS_ENTRY_POINTS))
    .replace('/*__SHELVES__*/', shelves);
  if (/__[A-Z_]+__/.test(css)) throw new Error('content.css has an unfilled placeholder');
  const min = await build({
    stdin: { contents: css, loader: 'css' },
    write: false,
    minify: !args.has('--watch'),
    logLevel: 'warning',
  });
  writeFileSync('dist/content.css', min.outputFiles[0].text);
}

function copyStatic() {
  mkdirSync('dist/icons', { recursive: true });
  const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'));
  manifest.version = pkg.version;
  writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));
  for (const size of [16, 32, 48, 128])
    cpSync(`src/icons/icon-${size}.png`, `dist/icons/icon-${size}.png`);
  cpSync('src/popup/popup.html', 'dist/popup/popup.html');
  cpSync('src/options/options.html', 'dist/options/options.html');
}

rmSync('dist', { recursive: true, force: true });

const jsOptions = { ...common, entryPoints: entries, outdir: 'dist' };
// CSS: tokens + shared UI base are bundled into each page's stylesheet via @import.
const cssOptions = {
  ...common,
  format: undefined,
  entryPoints: {
    'popup/popup': 'src/popup/popup.css',
    'options/options': 'src/options/options.css',
  },
  outdir: 'dist',
};

if (args.has('--watch')) {
  const plugins = [
    { name: 'static', setup: (b) => b.onEnd(() => (copyStatic(), renderContentCss())) },
  ];
  await (await context({ ...jsOptions, plugins })).watch();
  await (await context(cssOptions)).watch();
} else {
  await build(jsOptions);
  await build(cssOptions);
  copyStatic();
  await renderContentCss();
}
