import { describe, expect, it, vi } from 'vitest';
import { callJev, JevError } from '../src/api/jev';
import { isAllowedBaseUrl, PROVIDERS, PROVIDER_IDS } from '../src/api/providers';
import { parseSystemOne } from '../src/api/providers/common';
import type { JevRequest } from '../src/api/types';

const req: JevRequest = {
  state: 's',
  questions: {
    q0: { type: 'choice', instructions: 'i', criteria: { a: 'A', b: 'B' } },
    q1: { type: 'noul', instructions: 'n' },
  },
};

// Shape captured from api.typesafe.ai/v1/systemone (jev-1.13.0), numbers changed.
const okBody = {
  model: 'jev-1.13.0',
  answers: {
    q0: { type: 'choice', choice: 'a', confidence: 0.7, probabilities: { a: 0.8, b: 0.2 } },
    q1: { type: 'noul', noul: 0.3 },
  },
  usage: { input_tokens: 123, output_tokens: 9 },
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const expected = {
  typesafe: 'https://api.typesafe.ai/v1/systemone',
  openrouter: 'https://openrouter.ai/api/alpha/decisions',
  nanogpt: 'https://nano-gpt.com/api/v1/decisions',
};

describe.each(PROVIDER_IDS)('%s adapter', (id) => {
  const adapter = PROVIDERS[id];
  const opts = (fetchImpl: typeof fetch) => ({
    adapter,
    baseUrl: adapter.defaultBaseUrl,
    model: adapter.defaultModel,
    key: 'secret-key',
    fetchImpl,
  });

  it('posts the System One body with a bearer key to the right endpoint', async () => {
    const f = vi.fn(async () => json(okBody));
    const { response } = await callJev(req, opts(f as unknown as typeof fetch));
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(expected[id]);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-key');
    expect(init.credentials).toBe('omit');
    expect(JSON.parse(init.body as string)).toEqual({ model: adapter.defaultModel, ...req });
    expect(response.inputTokens).toBe(123);
    expect(response.answers.q0).toMatchObject({ type: 'choice', probabilities: { a: 0.8 } });
    expect(response.answers.q1).toEqual({ type: 'noul', probability: 0.3 });
  });

  it('only allows https base URLs on its own origin', () => {
    expect(isAllowedBaseUrl(adapter, adapter.defaultBaseUrl)).toBe(true);
    expect(isAllowedBaseUrl(adapter, 'https://evil.example/api')).toBe(false);
    expect(isAllowedBaseUrl(adapter, adapter.defaultBaseUrl.replace('https', 'http'))).toBe(false);
  });

  it('refuses to send the key to another host', async () => {
    const f = vi.fn();
    await expect(
      callJev(req, { ...opts(f as unknown as typeof fetch), baseUrl: 'https://evil.example' }),
    ).rejects.toMatchObject({ kind: 'bad-request' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('callJev errors', () => {
  const adapter = PROVIDERS.typesafe;
  const run = (f: unknown, key = 'k', timeoutMs?: number) =>
    callJev(req, {
      adapter,
      baseUrl: adapter.defaultBaseUrl,
      model: 'm',
      key,
      fetchImpl: f as typeof fetch,
      timeoutMs,
    });

  it('no key → no-key without a request', async () => {
    const f = vi.fn();
    await expect(run(f, '')).rejects.toMatchObject({ kind: 'no-key' });
    expect(f).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [422, 'bad-request'],
    [500, 'server'],
    [503, 'server'],
  ])('%i → %s', async (status, kind) => {
    await expect(run(async () => json({ error: 'x' }, status))).rejects.toMatchObject({
      kind,
      httpStatus: status,
    });
  });

  it('429 carries Retry-After', async () => {
    const err = await run(async () => json({}, 429, { 'Retry-After': '7' })).catch((e) => e);
    expect(err).toBeInstanceOf(JevError);
    expect(err).toMatchObject({ kind: 'rate-limit', retryAfter: 7 });
  });

  it('network failure → network', async () => {
    await expect(
      run(async () => {
        throw new TypeError('Failed to fetch');
      }),
    ).rejects.toMatchObject({ kind: 'network' });
  });

  it('times out', async () => {
    const hang = (_u: string, init: RequestInit) =>
      new Promise((_, reject) =>
        init.signal!.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        ),
      );
    await expect(run(hang, 'k', 20)).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('non-JSON body → bad-response', async () => {
    await expect(run(async () => new Response('<html>', { status: 200 }))).rejects.toMatchObject({
      kind: 'bad-response',
    });
  });

  it('never puts the key in the error message', async () => {
    const err = await run(async () => json({}, 401), 'super-secret').catch((e) => e);
    expect(String(err.message)).not.toContain('super-secret');
  });
});

describe('parseSystemOne', () => {
  it('unwraps gateway envelopes', () => {
    expect(parseSystemOne({ data: okBody }).answers.q1).toEqual({ type: 'noul', probability: 0.3 });
    expect(parseSystemOne({ output_text: JSON.stringify(okBody) }).inputTokens).toBe(123);
  });
  it('accepts the `probability` spelling for noul', () => {
    expect(
      parseSystemOne({ answers: { a: { type: 'noul', probability: 0.4 } } }).answers.a,
    ).toEqual({
      type: 'noul',
      probability: 0.4,
    });
  });
  it('accepts prompt_tokens usage', () => {
    expect(parseSystemOne({ answers: {}, usage: { prompt_tokens: 5 } }).inputTokens).toBe(5);
  });
  it('throws without answers', () => {
    expect(() => parseSystemOne({ error: 'nope' })).toThrow();
  });
  it('skips malformed answers', () => {
    const r = parseSystemOne({
      answers: { a: 'x', b: { probability: 'high' }, c: { probability: 0.4 } },
    });
    expect(Object.keys(r.answers)).toEqual(['c']);
  });
});
