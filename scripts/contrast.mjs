// Prints WCAG contrast ratios for every text/background pair in the design system.
// Usage: node scripts/contrast.mjs
const themes = {
  dark: {
    bg: { ink: '#0E0F13', surface: '#16181F', raised: '#1E212A' },
    fg: { text: '#ECEDEF', muted: '#8A8F9C', lamp: '#E8B86D', sage: '#8FB9A8', ember: '#E07A6B' },
    onLamp: { bg: '#E8B86D', fg: '#0E0F13' },
  },
  light: {
    bg: { ink: '#F5F2EC', surface: '#FFFDF9', raised: '#ECE8E0' },
    fg: { text: '#1A1B1F', muted: '#5C606B', lamp: '#8A5A14', sage: '#2F6B55', ember: '#A93E30' },
    onLamp: { bg: '#8A5A14', fg: '#FFFDF9' },
  },
};

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const l = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

let failed = false;
for (const [name, t] of Object.entries(themes)) {
  console.log(`\n${name}`);
  for (const [bn, b] of Object.entries(t.bg)) {
    for (const [fn, f] of Object.entries(t.fg)) {
      const r = ratio(f, b);
      const ok = r >= 4.5;
      if (!ok) failed = true;
      console.log(
        `  ${fn.padEnd(6)} on ${bn.padEnd(7)} ${r.toFixed(2).padStart(5)}  ${ok ? 'AA' : 'FAIL'}`,
      );
    }
  }
  const r = ratio(t.onLamp.fg, t.onLamp.bg);
  if (r < 4.5) failed = true;
  console.log(`  button text on lamp  ${r.toFixed(2)}  ${r >= 4.5 ? 'AA' : 'FAIL'}`);
}
process.exit(failed ? 1 : 0);
