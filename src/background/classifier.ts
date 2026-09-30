import { JevError, type CallResult } from '../api/jev';
import type { JevRequest } from '../api/types';
import { channelVerdict, decide } from '../shared/decision';
import type {
  ApiErrorKind,
  Classification,
  Decision,
  FailMode,
  Profile,
  VideoMeta,
} from '../shared/types';
import { buildBatches, readBatch } from './batch';
import { cacheKey, type ClassificationCache } from './cache';

export const MAX_CONCURRENT_REQUESTS = 3;
const BACKOFF_MIN_MS = 2_000;
const BACKOFF_MAX_MS = 120_000;

export interface ClassifyInput {
  videos: VideoMeta[];
  profile: Profile;
  profileKey: string;
  failMode: FailMode;
  channelAllow: string[];
  channelBlock: string[];
  hasKey: boolean;
}

export interface ClassifyOutcome {
  decisions: Decision[];
  degraded: boolean;
  apiCalls: number;
  inputTokens: number;
}

export interface ClassifierDeps {
  cache: ClassificationCache;
  call: (req: JevRequest) => Promise<CallResult>;
  onSuccess?: (latencyMs: number) => void;
  onError?: (kind: ApiErrorKind, httpStatus?: number, backoffUntil?: number) => void;
  now?: () => number;
}

/**
 * Turns video metadata into verdicts: channel lists, then cache, then Jev for the rest.
 * Holds the 429 backoff and de-duplicates videos already in flight from another tab.
 */
export class Classifier {
  private backoffUntil = 0;
  private backoffMs = BACKOFF_MIN_MS;
  private inflight = new Map<string, Promise<Classification | undefined>>();

  constructor(private readonly deps: ClassifierDeps) {}

  private now() {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  get pausedUntil(): number {
    return this.backoffUntil > this.now() ? this.backoffUntil : 0;
  }

  async classify(input: ClassifyInput): Promise<ClassifyOutcome> {
    const { profile, profileKey } = input;
    const decisions: Decision[] = [];
    const misses: VideoMeta[] = [];
    const waiting: Array<[VideoMeta, Promise<Classification | undefined>]> = [];

    for (const v of dedupe(input.videos)) {
      const byChannel = channelVerdict(v.channel, input.channelAllow, input.channelBlock);
      if (byChannel) {
        decisions.push({ id: v.id, verdict: byChannel, source: 'channel-list' });
        continue;
      }
      const key = cacheKey(profileKey, v.id);
      const cached = await this.deps.cache.get(key);
      if (cached) {
        decisions.push({ id: v.id, verdict: decide(profile, cached), source: 'cache' });
        continue;
      }
      const pending = this.inflight.get(key);
      if (pending) waiting.push([v, pending]);
      else misses.push(v);
    }

    let apiCalls = 0;
    let inputTokens = 0;
    const fresh = new Map<string, Classification>();

    if (misses.length) {
      if (!input.hasKey) {
        this.deps.onError?.('no-key');
      } else if (this.pausedUntil) {
        this.deps.onError?.('rate-limit', 429, this.backoffUntil);
      } else {
        const batches = buildBatches(misses, profile);
        const settle = new Map<string, (c: Classification | undefined) => void>();
        for (const v of misses) {
          const key = cacheKey(profileKey, v.id);
          this.inflight.set(key, new Promise((r) => settle.set(v.id, r)));
        }
        await runLimited(batches, MAX_CONCURRENT_REQUESTS, async (batch) => {
          try {
            const { response, latencyMs } = await this.deps.call(batch.request);
            apiCalls++;
            inputTokens += response.inputTokens ?? batch.estimatedTokens;
            this.backoffMs = BACKOFF_MIN_MS;
            this.deps.onSuccess?.(latencyMs);
            for (const [id, c] of readBatch(batch, response)) fresh.set(id, c);
          } catch (err) {
            const e = err instanceof JevError ? err : new JevError('network');
            if (e.kind === 'rate-limit') {
              const wait = e.retryAfter !== undefined ? e.retryAfter * 1000 : this.backoffMs;
              this.backoffUntil =
                this.now() + Math.min(BACKOFF_MAX_MS, Math.max(wait, BACKOFF_MIN_MS));
              this.backoffMs = Math.min(BACKOFF_MAX_MS, this.backoffMs * 2);
              this.deps.onError?.(e.kind, e.httpStatus, this.backoffUntil);
            } else {
              this.deps.onError?.(e.kind, e.httpStatus);
            }
          }
        });
        for (const v of misses) {
          const key = cacheKey(profileKey, v.id);
          const c = fresh.get(v.id);
          if (c) await this.deps.cache.set(key, c);
          settle.get(v.id)?.(c);
          this.inflight.delete(key);
        }
      }
    }

    let degraded = false;
    const fail = (id: string): Decision => {
      degraded = true;
      return input.failMode === 'open'
        ? { id, verdict: 'allow', source: 'fail-open' }
        : { id, verdict: 'block', source: 'fail-closed' };
    };

    for (const v of misses) {
      const c = fresh.get(v.id);
      decisions.push(c ? { id: v.id, verdict: decide(profile, c), source: 'jev' } : fail(v.id));
    }
    for (const [v, p] of waiting) {
      const c = await p;
      decisions.push(c ? { id: v.id, verdict: decide(profile, c), source: 'jev' } : fail(v.id));
    }

    return { decisions, degraded, apiCalls, inputTokens };
  }
}

function dedupe(videos: VideoMeta[]): VideoMeta[] {
  const seen = new Set<string>();
  return videos.filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)));
}

async function runLimited<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]!);
  });
  await Promise.all(workers);
}
