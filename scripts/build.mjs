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
    content: 'src/content/content.css',
    'popup/popup': 'src/popup/popup.css',
    'options/options': 'src/options/options.css',
  },
  outdir: 'dist',
};

if (args.has('--watch')) {
  const plugins = [{ name: 'static', setup: (b) => b.onEnd(copyStatic) }];
  await (await context({ ...jsOptions, plugins })).watch();
  await (await context(cssOptions)).watch();
} else {
  await build(jsOptions);
  await build(cssOptions);
  copyStatic();
}
