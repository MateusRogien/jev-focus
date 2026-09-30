import type { Answer, JevRequest, JevResponse } from '../types';

export interface ProviderAdapter {
  id: string;
  label: string;
  /** Default API root. The user may edit it, but it must stay on `origin`. */
  defaultBaseUrl: string;
  /** Origin listed in manifest host_permissions. Requests to any other origin are refused. */
  origin: string;
  defaultModel: string;
  signupUrl: string;
  keyHint: string;
  /** USD per million input tokens. Output is free. */
  inputPricePerMTok: number;
  endpoint(baseUrl: string): string;
  headers(key: string): Record<string, string>;
  body(req: JevRequest, model: string): unknown;
  parse(json: unknown): JevResponse;
}

export const trimSlash = (s: string): string => s.replace(/\/+$/, '');

export function bearer(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

export function systemOneBody(req: JevRequest, model: string): unknown {
  return { model, state: req.state, questions: req.questions };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

function parseAnswer(raw: unknown): Answer | undefined {
  if (!isObj(raw)) return undefined;
  const probs = raw.probabilities;
  if (isObj(probs)) {
    const probabilities: Record<string, number> = {};
    for (const [k, v] of Object.entries(probs)) {
      const n = num(v);
      if (n !== undefined) probabilities[k] = n;
    }
    return {
      type: 'choice',
      choice: typeof raw.choice === 'string' ? raw.choice : '',
      probabilities,
      confidence: num(raw.confidence),
    };
  }
  // noul: jev-1.13.0 returns `{ type: 'noul', noul: 0.96 }`. Some docs call it `probability`.
  const p = num(raw.noul) ?? num(raw.probability) ?? num(raw.value);
  if (p !== undefined) return { type: 'noul', probability: p };
  return undefined;
}

/**
 * Parses the System One response shape. Tolerates a gateway wrapping it in `data`, `result`
 * or a JSON string under `output_text`, which is how some OpenAI-compatible routes return it.
 */
export function parseSystemOne(json: unknown): JevResponse {
  let root: unknown = json;
  for (let i = 0; i < 3 && isObj(root) && !isObj(root.answers); i++) {
    if (isObj(root.data)) root = root.data;
    else if (isObj(root.result)) root = root.result;
    else if (typeof root.output_text === 'string') root = JSON.parse(root.output_text);
    else break;
  }
  if (!isObj(root)) throw new Error('Response is not an object');
  const answersRaw = isObj(root.answers)
    ? root.answers
    : isObj(root.decisions)
      ? root.decisions
      : undefined;
  if (!answersRaw) throw new Error('Response has no answers');

  const answers: Record<string, Answer> = {};
  for (const [id, raw] of Object.entries(answersRaw)) {
    const a = parseAnswer(raw);
    if (a) answers[id] = a;
  }
  const usage = isObj(root.usage) ? root.usage : undefined;
  return {
    answers,
    model: typeof root.model === 'string' ? root.model : undefined,
    inputTokens: usage ? (num(usage.input_tokens) ?? num(usage.prompt_tokens)) : undefined,
  };
}
