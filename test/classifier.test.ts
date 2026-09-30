import { describe, expect, it, vi } from 'vitest';
import { JevError, type CallResult } from '../src/api/jev';
import type { JevRequest } from '../src/api/types';
import { ClassificationCache, type KV } from '../src/background/cache';
import { Classifier, type ClassifyInput } from '../src/background/classifier';
import { PRESETS } from '../src/shared/profiles';
import type { VideoMeta } from '../src/shared/types';

const profile = PRESETS.find((p) => p.id === 'music-only')!; // no clickbait question

const kv = (): KV => {
  const d: Record<string, unknown> = {};
  return { get: async (k) => d[k], set: async (k, v) => void (d[k] = v) };
};

const v = (id: string, title = id, channel = 'ch'): VideoMeta => ({
  id,
  title,
  channel,
  duration: '',
  badges: [],
});

/** Fake Jev: titles containing "song" are music, everything else non-music. */
const fakeJev = async (req: JevRequest): Promise<CallResult> => {
  const answers: CallResult['response']['answers'] = {};
  for (const [k, q] of Object.entries(req.questions)) {
    const music = q.instructions.includes('song');
    answers[k] = {
      type: 'choice',
      choice: music ? 'music' : 'non_music',
      probabilities: music ? { music: 0.95, non_music: 0.05 } : { music: 0.05, non_music: 0.95 },
    };
  }
  return { response: { answers, inputTokens: 10 }, latencyMs: 100 };
};

const input = (videos: VideoMeta[], extra: Partial<ClassifyInput> = {}): ClassifyInput => ({
  videos,
  profile,
  profileKey: 'music-only.x',
  failMode: 'closed',
  channelAllow: [],
  channelBlock: [],
  hasKey: true,
  ...extra,
});

describe('Classifier', () => {
  it('classifies, caches, and answers repeats from cache', async () => {
    const call = vi.fn(fakeJev);
    const cl = new Classifier({ cache: new ClassificationCache(kv()), call });
    const a = await cl.classify(input([v('1', 'a song'), v('2', 'a vlog')]));
    expect(a.decisions).toEqual([
      { id: '1', verdict: 'allow', source: 'jev' },
      { id: '2', verdict: 'block', source: 'jev' },
    ]);
    expect(a.apiCalls).toBe(1);
    const b = await cl.classify(input([v('1', 'a song')]));
    expect(b.decisions[0]!.source).toBe('cache');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('re-asks under a different profile key', async () => {
    const call = vi.fn(fakeJev);
    const cl = new Classifier({ cache: new ClassificationCache(kv()), call });
    await cl.classify(input([v('1', 'a song')]));
    await cl.classify(input([v('1', 'a song')], { profileKey: 'other.y' }));
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('channel lists skip the API', async () => {
    const call = vi.fn(fakeJev);
    const cl = new Classifier({ cache: new ClassificationCache(kv()), call });
    const r = await cl.classify(
      input([v('1', 'x', 'Good'), v('2', 'y', 'Bad')], {
        channelAllow: ['good'],
        channelBlock: ['bad'],
      }),
    );
    expect(r.decisions.map((d) => [d.verdict, d.source])).toEqual([
      ['allow', 'channel-list'],
      ['block', 'channel-list'],
    ]);
    expect(call).not.toHaveBeenCalled();
  });

  it('fails closed or open when there is no key', async () => {
    const call = vi.fn(fakeJev);
    const onError = vi.fn();
    const cl = new Classifier({ cache: new ClassificationCache(kv()), call, onError });
    const closed = await cl.classify(input([v('1')], { hasKey: false }));
    expect(closed.decisions[0]).toMatchObject({ verdict: 'block', source: 'fail-closed' });
    expect(closed.degraded).toBe(true);
    const open = await cl.classify(input([v('1')], { hasKey: false, failMode: 'open' }));
    expect(open.decisions[0]).toMatchObject({ verdict: 'allow', source: 'fail-open' });
    expect(call).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('no-key');
  });

  it('backs off after 429 and does not cache failures', async () => {
    let now = 0;
    const call = vi.fn(async () => {
      throw new JevError('rate-limit', 429, 5);
    });
    const cl = new Classifier({ cache: new ClassificationCache(kv()), call, now: () => now });
    await cl.classify(input([v('1')]));
    expect(cl.pausedUntil).toBe(5000);
    await cl.classify(input([v('1')]));
    expect(call).toHaveBeenCalledTimes(1); // paused
    now = 6000;
    call.mockImplementation(fakeJev as never);
    const r = await cl.classify(input([v('1', 'a song')]));
    expect(r.decisions[0]).toMatchObject({ verdict: 'allow', source: 'jev' });
  });

  it('de-duplicates a video already in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const call = vi.fn(async (req: JevRequest) => {
      await gate;
      return fakeJev(req);
    });
    const cl = new Classifier({ cache: new ClassificationCache(kv()), call });
    const p1 = cl.classify(input([v('1', 'a song')]));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    const p2 = cl.classify(input([v('1', 'a song')]));
    release();
    const [a, b] = await Promise.all([p1, p2]);
    expect(call).toHaveBeenCalledTimes(1);
    expect(a.decisions[0]!.verdict).toBe('allow');
    expect(b.decisions[0]!.verdict).toBe('allow');
  });

  it('a partial response fails only the missing videos', async () => {
    const call = vi.fn(async (req: JevRequest) => {
      const r = await fakeJev(req);
      delete r.response.answers.q1;
      return r;
    });
    const cl = new Classifier({ cache: new ClassificationCache(kv()), call });
    const r = await cl.classify(input([v('1', 'a song'), v('2', 'b song')]));
    expect(r.decisions.map((d) => d.source)).toEqual(['jev', 'fail-closed']);
  });
});
