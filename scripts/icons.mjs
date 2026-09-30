// Rasterises src/icons/logo.svg to the PNG sizes Chrome needs.
// Usage: npm run icons
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync('src/icons/logo.svg', 'utf8');
for (const size of [16, 32, 48, 128]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(`src/icons/icon-${size}.png`, png);
  console.log(`src/icons/icon-${size}.png  ${png.length} B`);
}
