import { bearer, parseSystemOne, systemOneBody, trimSlash, type ProviderAdapter } from './common';

/** NanoGPT native decisions endpoint: POST {base}/v1/decisions, Bearer key. */
export const nanogpt: ProviderAdapter = {
  id: 'nanogpt',
  label: 'NanoGPT',
  defaultBaseUrl: 'https://nano-gpt.com/api',
  origin: 'https://nano-gpt.com',
  defaultModel: 'typesafe/jev-1.13',
  signupUrl: 'https://nano-gpt.com/api',
  keyHint: 'NanoGPT API key (UUID)',
  inputPricePerMTok: 0.042,
  endpoint: (base) => `${trimSlash(base)}/v1/decisions`,
  headers: bearer,
  body: systemOneBody,
  parse: parseSystemOne,
};
