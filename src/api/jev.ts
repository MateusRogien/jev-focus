import type { ApiErrorKind } from '../shared/types';
import { isAllowedBaseUrl, type ProviderAdapter } from './providers';
import type { JevRequest, JevResponse } from './types';

export const REQUEST_TIMEOUT_MS = 3000;

export class JevError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly httpStatus?: number,
    /** Seconds, from a Retry-After header on 429. */
    readonly retryAfter?: number,
  ) {
    super(httpStatus ? `${kind} (${httpStatus})` : kind);
    this.name = 'JevError';
  }
}

export interface CallOptions {
  adapter: ProviderAdapter;
  baseUrl: string;
  model: string;
  key: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface CallResult {
  response: JevResponse;
  latencyMs: number;
}

function parseRetryAfter(h: string | null): number | undefined {
  if (!h) return undefined;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs);
  const date = Date.parse(h);
  return Number.isNaN(date) ? undefined : Math.max(0, (date - Date.now()) / 1000);
}

/**
 * One System One call. Never logs the key or the request body. Throws JevError on every
 * failure so callers can map it to fail-open / fail-closed.
 */
export async function callJev(req: JevRequest, opts: CallOptions): Promise<CallResult> {
  const { adapter, baseUrl, model, key } = opts;
  if (!key) throw new JevError('no-key');
  if (!isAllowedBaseUrl(adapter, baseUrl)) throw new JevError('bad-request');

  const fetchImpl = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
  const started = performance.now();

  let res: Response;
  try {
    res = await fetchImpl(adapter.endpoint(baseUrl), {
      method: 'POST',
      headers: adapter.headers(key),
      body: JSON.stringify(adapter.body(req, model)),
      signal: ctrl.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
  } catch {
    clearTimeout(timer);
    throw new JevError(ctrl.signal.aborted ? 'timeout' : 'network');
  }

  try {
    if (!res.ok) {
      const s = res.status;
      if (s === 401 || s === 403) throw new JevError('auth', s);
      if (s === 429)
        throw new JevError('rate-limit', s, parseRetryAfter(res.headers.get('Retry-After')));
      if (s === 400 || s === 404 || s === 413 || s === 422) throw new JevError('bad-request', s);
      throw new JevError('server', s);
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new JevError(ctrl.signal.aborted ? 'timeout' : 'bad-response', res.status);
    }
    try {
      return { response: adapter.parse(json), latencyMs: Math.round(performance.now() - started) };
    } catch {
      throw new JevError('bad-response', res.status);
    }
  } finally {
    clearTimeout(timer);
  }
}
