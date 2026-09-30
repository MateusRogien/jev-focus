import { bearer, parseSystemOne, systemOneBody, trimSlash, type ProviderAdapter } from './common';

/** TypeSafe direct: POST {base}/v1/systemone, Bearer key. */
export const typesafe: ProviderAdapter = {
  id: 'typesafe',
  label: 'TypeSafe (direct)',
  defaultBaseUrl: 'https://api.typesafe.ai',
  origin: 'https://api.typesafe.ai',
  defaultModel: 'jev-1.13.0',
  signupUrl: 'https://console.typesafe.ai',
  keyHint: 'TypeSafe API key',
  inputPricePerMTok: 0.042,
  endpoint: (base) => `${trimSlash(base)}/v1/systemone`,
  headers: bearer,
  body: systemOneBody,
  parse: parseSystemOne,
};
