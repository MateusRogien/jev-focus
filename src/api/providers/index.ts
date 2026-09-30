import type { ProviderId } from '../../shared/types';
import type { ProviderAdapter } from './common';
import { nanogpt } from './nanogpt';
import { openrouter } from './openrouter';
import { typesafe } from './typesafe';

/*
 * To add a gateway: create one adapter file next to these, register it here, add its id to
 * ProviderId in shared/types.ts and its origin to host_permissions in manifest.json.
 */
export const PROVIDERS: Record<ProviderId, ProviderAdapter> = { typesafe, openrouter, nanogpt };

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

/** Base URLs are editable, but only within the provider's permitted origin. */
export function isAllowedBaseUrl(adapter: ProviderAdapter, baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl);
    return u.protocol === 'https:' && u.origin === adapter.origin;
  } catch {
    return false;
  }
}

export type { ProviderAdapter };
