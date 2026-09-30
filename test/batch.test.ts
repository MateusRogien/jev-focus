import { describe, expect, it } from 'vitest';
import {
  buildBatches,
  MAX_QUESTIONS_PER_REQUEST,
  MAX_REQUEST_TOKENS,
  questionsFor,
  readBatch,
} from '../src/background/batch';
import { PRESETS } from '../src/shared/profiles';
import type { VideoMeta } from '../src/shared/types';

const deepWork = PRESETS.find((p) => p.id === 'deep-work')!;
const music = PRESETS.find((p) => p.id === 'music-only')!; // clickbait off

const vid = (
  i: number,
  title = `lofi hip hop radio ${i} - beats to relax/study to`,
): VideoMeta => ({
  id: `id${i}`,
  title,
  channel: 'Lofi Girl',
  duration: '3:00:00',
  badges: i % 2 ? ['LIVE'] : [],
});

describe('questionsFor', () => {
  it('builds a choice over the profile categories plus a clickbait noul', () => {
    const qs = questionsFor(vid(1), deepWork);
    expect(qs).toHaveLength(2);
    const choice = qs[0]!;
    const noul = qs[1]!;
    expect(choice.type).toBe('choice');
    if (choice!.type === 'choice') {
      expect(Object.keys(choice.criteria)).toEqual(deepWork.categories.map((c) => c.id));
    }
    expect(choice.instructions).toContain('Channel: Lofi Girl');
    expect(choice.instructions).toContain('Badges: LIVE');
    expect(noul.type).toBe('noul');
  });

  it('skips clickbait when the profile disables it', () => {
    expect(questionsFor(vid(1), music)).toHaveLength(1);
  });

  it('never includes anything but title, channel, duration and badges', () => {
    const q = questionsFor(vid(2), deepWork)[0]!;
    const lines = q.instructions.split('\n').filter(Boolean);
    expect(lines.map((l) => l.split(':')[0])).toEqual([
      'Title',
      'Channel',
      'Duration',
      'Which category best describes this YouTube video?',
    ]);
  });
});

describe('describeVideo with a mix', () => {
  it('lists included videos', () => {
    const q = questionsFor({ ...vid(3), badges: ['Mix'], includes: ['A', 'B'] }, music)[0]!;
    expect(q.instructions).toContain('Includes: A / B');
  });
});

describe('buildBatches', () => {
  it('puts a normal screenful in one request', () => {
    const batches = buildBatches(
      Array.from({ length: 20 }, (_, i) => vid(i)),
      deepWork,
    );
    expect(batches).toHaveLength(1);
    expect(Object.keys(batches[0]!.request.questions)).toHaveLength(40);
    expect(batches[0]!.videoIds).toHaveLength(20);
  });

  it('splits on the question cap without separating a video from its clickbait question', () => {
    const batches = buildBatches(
      Array.from({ length: 60 }, (_, i) => vid(i)),
      deepWork,
    );
    expect(batches.length).toBeGreaterThan(1);
    for (const b of batches) {
      const n = Object.keys(b.request.questions).length;
      expect(n).toBeLessThanOrEqual(MAX_QUESTIONS_PER_REQUEST);
      expect(n % 2).toBe(0);
      for (const id of b.videoIds) {
        expect(Object.values(b.refs).filter((r) => r.videoId === id)).toHaveLength(2);
      }
    }
    expect(batches.flatMap((b) => b.videoIds)).toHaveLength(60);
  });

  it('splits on the token budget', () => {
    const long = 'x'.repeat(190);
    const batches = buildBatches(
      Array.from({ length: 40 }, (_, i) => vid(i, long)),
      music,
    );
    for (const b of batches) expect(b.estimatedTokens).toBeLessThanOrEqual(MAX_REQUEST_TOKENS);
    expect(batches.flatMap((b) => b.videoIds)).toHaveLength(40);
  });

  it('clips very long titles', () => {
    const [b] = buildBatches([vid(1, 'y'.repeat(5000))], music);
    expect(b!.request.questions.q0!.instructions.length).toBeLessThan(400);
  });

  it('returns no batches for no videos', () => {
    expect(buildBatches([], deepWork)).toEqual([]);
  });
});

describe('readBatch', () => {
  it('maps answers back to videos', () => {
    const [b] = buildBatches([vid(1), vid(2)], deepWork);
    const res = {
      answers: {
        q0: { type: 'choice' as const, choice: 'lofi', probabilities: { lofi: 0.9, talk: 0.1 } },
        q1: { type: 'noul' as const, probability: 0.1 },
        q2: { type: 'choice' as const, choice: 'talk', probabilities: { lofi: 0.2, talk: 0.8 } },
      },
    };
    const out = readBatch(b!, res);
    expect(out.get('id1')).toEqual({ probabilities: { lofi: 0.9, talk: 0.1 }, clickbait: 0.1 });
    expect(out.get('id2')).toEqual({ probabilities: { lofi: 0.2, talk: 0.8 } });
  });

  it('drops a video whose category answer is missing', () => {
    const [b] = buildBatches([vid(1)], deepWork);
    const out = readBatch(b!, { answers: { q1: { type: 'noul', probability: 0.9 } } });
    expect(out.size).toBe(0);
  });
});
