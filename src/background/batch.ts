import type { JevRequest, JevResponse, Question } from '../api/types';
import { CLICKBAIT_CRITERIA, CLICKBAIT_QUESTION } from '../shared/profiles';
import type { Classification, Profile, VideoMeta } from '../shared/types';

/*
 * Batching. Each video becomes one `choice` question (plus one `noul` when the profile checks
 * clickbait). The video's metadata goes into the question itself, not into a shared state
 * list. That costs a few repeated criteria tokens, but it means every question is
 * self-contained. With a numbered list in state, Jev would first have to pick the right row
 * out of 20 near-identical ones, and neighbouring rows would bleed into each other.
 */

/** Hard API limit: state + the longest question. Well above anything we build. */
export const MAX_STATE_PLUS_QUESTION_TOKENS = 32_000;
/**
 * Soft per-request budget. A 46-question, 12K-token request measured 406 ms on jev-1.13.0,
 * so 20K keeps a full screen (24 cards) in one call and still far inside the 3 s timeout.
 */
export const MAX_REQUEST_TOKENS = 20_000;
/** Measured fixed input overhead the API adds to every request. */
export const REQUEST_OVERHEAD_TOKENS = 260;
export const MAX_QUESTIONS_PER_REQUEST = 48;

const TITLE_MAX = 200;
const CHANNEL_MAX = 80;

/** Conservative estimate (~3.5 chars/token for English plus JSON punctuation). */
export const estimateTokens = (s: string): number => Math.ceil(s.length / 3.5);

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function stateFor(profile: Profile): string {
  return (
    `A person has YouTube open in a focus mode called "${profile.name}". ` +
    'Each question describes one video card shown on the page using only its title, channel, ' +
    'duration and visible badges. Judge each video from those fields alone.'
  );
}

export function describeVideo(v: VideoMeta): string {
  const lines = [`Title: ${clip(v.title, TITLE_MAX)}`];
  if (v.channel) lines.push(`Channel: ${clip(v.channel, CHANNEL_MAX)}`);
  if (v.duration) lines.push(`Duration: ${v.duration}`);
  if (v.badges.length) lines.push(`Badges: ${v.badges.join(', ')}`);
  return lines.join('\n');
}

export function questionsFor(v: VideoMeta, profile: Profile): Question[] {
  const criteria: Record<string, string> = {};
  for (const cat of profile.categories) criteria[cat.id] = cat.description;
  const desc = describeVideo(v);
  const qs: Question[] = [
    {
      type: 'choice',
      instructions: `${desc}\n\nWhich category best describes this YouTube video?`,
      criteria,
    },
  ];
  if (profile.clickbait) {
    qs.push({
      type: 'noul',
      instructions: `Title: ${clip(v.title, TITLE_MAX)}\n\n${CLICKBAIT_QUESTION}`,
      criteria: CLICKBAIT_CRITERIA,
    });
  }
  return qs;
}

export interface QuestionRef {
  videoId: string;
  kind: 'category' | 'clickbait';
}

export interface Batch {
  request: JevRequest;
  refs: Record<string, QuestionRef>;
  videoIds: string[];
  estimatedTokens: number;
}

const questionTokens = (q: Question): number =>
  estimateTokens(JSON.stringify(q)) + 4; /* key + separators */

/**
 * Splits videos into as few requests as fit the question and token budgets. Question keys are
 * short positional ids (`q0`, `q1`…) because video ids contain characters some gateways may
 * normalise.
 */
export function buildBatches(videos: readonly VideoMeta[], profile: Profile): Batch[] {
  const state = stateFor(profile);
  const stateTokens = estimateTokens(state) + REQUEST_OVERHEAD_TOKENS;
  const batches: Batch[] = [];
  let cur: Batch | undefined;
  let qn = 0;

  for (const v of videos) {
    const qs = questionsFor(v, profile);
    const cost = qs.reduce((n, q) => n + questionTokens(q), 0);
    const longest = Math.max(...qs.map(questionTokens));
    if (stateTokens + longest > MAX_STATE_PLUS_QUESTION_TOKENS) continue; // cannot happen with clipped fields

    const full =
      cur &&
      (Object.keys(cur.refs).length + qs.length > MAX_QUESTIONS_PER_REQUEST ||
        cur.estimatedTokens + cost > MAX_REQUEST_TOKENS);
    if (!cur || full) {
      cur = {
        request: { state, questions: {} },
        refs: {},
        videoIds: [],
        estimatedTokens: stateTokens,
      };
      batches.push(cur);
      qn = 0;
    }
    qs.forEach((q, i) => {
      const key = `q${qn++}`;
      cur!.request.questions[key] = q;
      cur!.refs[key] = { videoId: v.id, kind: i === 0 ? 'category' : 'clickbait' };
    });
    cur.videoIds.push(v.id);
    cur.estimatedTokens += cost;
  }
  return batches;
}

/**
 * Maps answers back to videos. A video is only classified if its category answer came back;
 * a missing clickbait answer just leaves that check out.
 */
export function readBatch(batch: Batch, res: JevResponse): Map<string, Classification> {
  const out = new Map<string, Classification>();
  for (const [key, ref] of Object.entries(batch.refs)) {
    const a = res.answers[key];
    if (!a) continue;
    if (ref.kind === 'category' && a.type === 'choice') {
      const prev = out.get(ref.videoId);
      out.set(ref.videoId, { ...prev, probabilities: a.probabilities });
    } else if (ref.kind === 'clickbait' && a.type === 'noul') {
      const prev = out.get(ref.videoId);
      out.set(ref.videoId, { probabilities: prev?.probabilities ?? {}, clickbait: a.probability });
    }
  }
  for (const [id, c] of out) {
    if (Object.keys(c.probabilities).length === 0) out.delete(id);
  }
  return out;
}
