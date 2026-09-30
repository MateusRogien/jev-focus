import { describe, expect, it } from 'vitest';
import { CACHE_STORAGE_KEY, ClassificationCache, cacheKey, type KV } from '../src/background/cache';

function memKV(initial: Record<string, unknown> = {}): KV & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    get: async (k) => data[k],
    set: async (k, v) => {
      data[k] = v;
    },
  };
}

const c = (p: number) => ({ probabilities: { a: p, b: 1 - p } });

describe('ClassificationCache', () => {
  it('round-trips a classification', async () => {
    const cache = new ClassificationCache(memKV());
    await cache.set('k', { probabilities: { a: 1 }, clickbait: 0.2 });
    expect(await cache.get('k')).toEqual({ probabilities: { a: 1 }, clickbait: 0.2 });
  });

  it('keys include the profile', () => {
    expect(cacheKey('deep-work.abc', 'vid')).not.toBe(cacheKey('learning.def', 'vid'));
  });

  it('expires entries after the TTL', async () => {
    let now = 1_000;
    const cache = new ClassificationCache(memKV(), { ttlMs: 100, now: () => now });
    await cache.set('k', c(0.5));
    now = 1_099;
    expect(await cache.get('k')).toBeDefined();
    now = 1_101;
    expect(await cache.get('k')).toBeUndefined();
  });

  it('evicts the least recently used entry at the cap', async () => {
    const cache = new ClassificationCache(memKV(), { maxEntries: 2 });
    await cache.set('a', c(0.1));
    await cache.set('b', c(0.2));
    await cache.get('a'); // a is now most recent
    await cache.set('c', c(0.3));
    expect(await cache.get('b')).toBeUndefined();
    expect(await cache.get('a')).toBeDefined();
    expect(await cache.get('c')).toBeDefined();
  });

  it('persists and reloads, dropping expired entries', async () => {
    let now = 10_000;
    const kv = memKV();
    const a = new ClassificationCache(kv, { ttlMs: 1000, now: () => now });
    await a.set('old', c(0.1));
    now = 10_800;
    await a.set('new', c(0.2));
    await a.flush();
    expect(Object.keys(kv.data[CACHE_STORAGE_KEY] as object)).toEqual(['old', 'new']);

    now = 11_500;
    const b = new ClassificationCache(kv, { ttlMs: 1000, now: () => now });
    expect(await b.get('old')).toBeUndefined();
    expect(await b.get('new')).toBeDefined();
    expect(await b.size()).toBe(1);
  });

  it('honours the cap when loading an oversized store', async () => {
    const stored: Record<string, unknown> = {};
    for (let i = 0; i < 10; i++) stored[`k${i}`] = [Date.now() + i, { a: 1 }];
    const cache = new ClassificationCache(memKV({ [CACHE_STORAGE_KEY]: stored }), {
      maxEntries: 3,
    });
    expect(await cache.size()).toBe(3);
    expect(await cache.get('k9')).toBeDefined();
    expect(await cache.get('k0')).toBeUndefined();
  });

  it('clear empties memory and storage', async () => {
    const kv = memKV();
    const cache = new ClassificationCache(kv);
    await cache.set('k', c(0.5));
    await cache.clear();
    expect(await cache.size()).toBe(0);
    expect(kv.data[CACHE_STORAGE_KEY]).toEqual({});
  });
});
