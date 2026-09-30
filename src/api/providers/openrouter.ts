import { bearer, parseSystemOne, systemOneBody, trimSlash, type ProviderAdapter } from './common';

/** OpenRouter native decisions endpoint: POST {base}/alpha/decisions, Bearer key. */
export const openrouter: ProviderAdapter = {
  id: 'openrouter',
  label: 'OpenRouter',
  defaultBaseUrl: 'https://openrouter.ai/api',
  origin: 'https://openrouter.ai',
  defaultModel: 'typesafe/jev-1.13',
  signupUrl: 'https://openrouter.ai/keys',
  keyHint: 'OpenRouter key (sk-or-…)',
  inputPricePerMTok: 0.042,
  endpoint: (base) => `${trimSlash(base)}/alpha/decisions`,
  headers: (key) => ({ ...bearer(key), 'X-Title': 'Jev Focus' }),
  body: systemOneBody,
  parse: parseSystemOne,
};
