import { describe, expect, it } from 'vitest';
import { blockedMass, channelVerdict, decide } from '../src/shared/decision';
import { PRESETS } from '../src/shared/profiles';
import type { Profile } from '../src/shared/types';

const deepWork = PRESETS.find((p) => p.id === 'deep-work')!;
const at = (strictness: Profile['strictness']): Profile => ({ ...deepWork, strictness });

describe('blockedMass', () => {
  it('sums blocked categories', () => {
    expect(blockedMass(deepWork, { lofi: 0.3, talk: 0.5, entertainment: 0.2 })).toBeCloseTo(0.7);
  });
  it('renormalises when probabilities do not sum to 1', () => {
    expect(blockedMass(deepWork, { lofi: 0.2, talk: 0.2 })).toBeCloseTo(0.5);
  });
  it('ignores options the profile does not have', () => {
    expect(blockedMass(deepWork, { lofi: 1, unknown: 5 })).toBe(0);
  });
  it('is 0 for an empty distribution', () => {
    expect(blockedMass(deepWork, {})).toBe(0);
  });
});

describe('decide', () => {
  const probs = { lofi: 0.4, talk: 0.6 }; // 60 % blocked
  it('respects strictness thresholds', () => {
    expect(decide(at('relaxed'), { probabilities: probs })).toBe('allow');
    expect(decide(at('balanced'), { probabilities: probs })).toBe('block');
    expect(decide(at('strict'), { probabilities: probs })).toBe('block');
    expect(decide(at('strict'), { probabilities: { lofi: 0.75, talk: 0.25 } })).toBe('allow');
  });
  it('blocks at exactly the threshold', () => {
    expect(decide(at('balanced'), { probabilities: { lofi: 0.5, talk: 0.5 } })).toBe('block');
  });
  it('blocks clickbait even when the category is allowed', () => {
    expect(decide(at('balanced'), { probabilities: { lofi: 1 }, clickbait: 0.9 })).toBe('block');
    expect(decide(at('balanced'), { probabilities: { lofi: 1 }, clickbait: 0.5 })).toBe('allow');
  });
  it('ignores clickbait when the profile turns it off', () => {
    const p = { ...at('strict'), clickbait: false };
    expect(decide(p, { probabilities: { lofi: 1 }, clickbait: 0.99 })).toBe('allow');
  });
});

describe('channelVerdict', () => {
  it('matches case-insensitively and ignores a leading @', () => {
    expect(channelVerdict('Lofi Girl', ['@lofi girl'], [])).toBe('allow');
    expect(channelVerdict('MrBeast', [], ['mrbeast'])).toBe('block');
  });
  it('block wins over allow', () => {
    expect(channelVerdict('x', ['x'], ['x'])).toBe('block');
  });
  it('returns undefined when unlisted or empty', () => {
    expect(channelVerdict('y', ['x'], [])).toBeUndefined();
    expect(channelVerdict('', ['x'], [])).toBeUndefined();
  });
});
