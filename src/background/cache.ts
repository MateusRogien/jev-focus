import type { Classification } from '../shared/types';

export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CACHE_MAX_ENTRIES = 5000;
export const CACHE_STORAGE_KEY = 'decisionCache';

/** [storedAt, probabilities, clickbait?] — compact to keep storage writes small. */
type Entry = [number, Record<string, number>, number?];

export interface KV {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export const cacheKey = (profileKey: string, videoId: string): string => `${profileKey}|${videoId}`;

/**
 * LRU + TTL cache of raw Jev classifications, keyed by profile fingerprint and video id.
 * The whole map lives in memory (a Map keeps insertion order, which doubles as recency)
 * and is written back to storage in one debounced write.
 */
export class ClassificationCache {
  private map = new Map<string, Entry>();
  private loaded: Promise<void> | undefined;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly kv: KV,
    private readonly opts: {
      ttlMs?: number;
      maxEntries?: number;
      now?: () => number;
      flushDelayMs?: number;
    } = {},
  ) {}

  private get ttl() {
    return this.opts.ttlMs ?? CACHE_TTL_MS;
  }
  private get max() {
    return this.opts.maxEntries ?? CACHE_MAX_ENTRIES;
  }
  private now() {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  load(): Promise<void> {
    this.loaded ??= (async () => {
      const raw = await this.kv.get(CACHE_STORAGE_KEY);
      if (!raw || typeof raw !== 'object') return;
      const cutoff = this.now() - this.ttl;
      const entries = Object.entries(raw as Record<string, Entry>)
        .filter(([, e]) => Array.isArray(e) && e[0] >= cutoff)
        .sort((a, b) => a[1][0] - b[1][0]);
      for (const [k, e] of entries.slice(-this.max)) this.map.set(k, e);
    })();
    return this.loaded;
  }

  async get(key: string): Promise<Classification | undefined> {
    await this.load();
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e[0] < this.now() - this.ttl) {
      this.map.delete(key);
      this.scheduleFlush();
      return undefined;
    }
    // Touch: move to the most-recent end.
    this.map.delete(key);
    this.map.set(key, e);
    return e[2] === undefined ? { probabilities: e[1] } : { probabilities: e[1], clickbait: e[2] };
  }

  async set(key: string, c: Classification): Promise<void> {
    await this.load();
    this.map.delete(key);
    const e: Entry =
      c.clickbait === undefined
        ? [this.now(), c.probabilities]
        : [this.now(), c.probabilities, c.clickbait];
    this.map.set(key, e);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
    this.scheduleFlush();
  }

  async size(): Promise<number> {
    await this.load();
    return this.map.size;
  }

  async clear(): Promise<void> {
    await this.load();
    this.map.clear();
    await this.flush();
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => void this.flush(), this.opts.flushDelayMs ?? 1000);
  }

  async flush(): Promise<void> {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    await this.kv.set(CACHE_STORAGE_KEY, Object.fromEntries(this.map));
  }
}
