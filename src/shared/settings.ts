import { PROVIDERS, PROVIDER_IDS } from '../api/providers';
import { DEFAULT_PROFILE_ID, findProfile } from './profiles';
import type { ApiStatus, DailyStats, Profile, ProviderConfig, ProviderId, Settings } from './types';

/*
 * Everything is in chrome.storage.local. The worker restricts that area to trusted
 * extension contexts on startup, so the content script cannot read the API key. It gets
 * its config from the worker by message instead.
 */

export const KEYS = {
  settings: 'settings',
  apiKeys: 'apiKeys',
  apiStatus: 'apiStatus',
  stats: 'stats',
} as const;

export function defaultSettings(): Settings {
  const providers = {} as Record<ProviderId, ProviderConfig>;
  for (const id of PROVIDER_IDS) {
    providers[id] = { baseUrl: PROVIDERS[id].defaultBaseUrl, model: PROVIDERS[id].defaultModel };
  }
  return {
    enabled: true,
    provider: 'typesafe',
    providers,
    activeProfileId: DEFAULT_PROFILE_ID,
    customProfiles: [],
    strictnessOverrides: {},
    surfaces: {
      home: true,
      watch: true,
      endscreen: true,
      shorts: true,
      search: false,
      subscriptions: false,
    },
    hideShortsEverywhere: false,
    failMode: 'closed',
    channelAllow: [],
    channelBlock: [],
    showPill: true,
  };
}

/** Deep-enough merge so settings saved by an older version gain new fields. */
export function withDefaults(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const s = raw as Partial<Settings>;
  const providers = { ...d.providers };
  for (const id of PROVIDER_IDS) providers[id] = { ...d.providers[id], ...s.providers?.[id] };
  return {
    ...d,
    ...s,
    providers,
    surfaces: { ...d.surfaces, ...s.surfaces },
    strictnessOverrides: { ...s.strictnessOverrides },
    provider: s.provider && s.provider in PROVIDERS ? s.provider : d.provider,
  };
}

export async function loadSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(KEYS.settings);
  return withDefaults(r[KEYS.settings]);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await chrome.storage.local.set({ [KEYS.settings]: next });
  return next;
}

export function profileById(s: Settings, id: string): Profile {
  const p = findProfile(s.customProfiles, id);
  const override = p.builtin ? s.strictnessOverrides[p.id] : undefined;
  return override ? { ...p, strictness: override } : p;
}

export function activeProfile(s: Settings): Profile {
  return profileById(s, s.activeProfileId);
}

export async function loadKey(provider: ProviderId): Promise<string> {
  const r = await chrome.storage.local.get(KEYS.apiKeys);
  const keys = (r[KEYS.apiKeys] ?? {}) as Partial<Record<ProviderId, string>>;
  return keys[provider] ?? '';
}

export async function saveKey(provider: ProviderId, key: string): Promise<void> {
  const r = await chrome.storage.local.get(KEYS.apiKeys);
  const keys = { ...((r[KEYS.apiKeys] ?? {}) as Partial<Record<ProviderId, string>>) };
  const trimmed = key.trim();
  if (trimmed) keys[provider] = trimmed;
  else delete keys[provider];
  await chrome.storage.local.set({ [KEYS.apiKeys]: keys });
}

export async function hasKey(provider: ProviderId): Promise<boolean> {
  return (await loadKey(provider)).length > 0;
}

export const today = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function loadStats(): Promise<DailyStats> {
  const r = await chrome.storage.local.get(KEYS.stats);
  const s = r[KEYS.stats] as DailyStats | undefined;
  return s && s.day === today() ? s : { day: today(), hidden: 0, apiCalls: 0, inputTokens: 0 };
}

export async function loadStatus(): Promise<ApiStatus> {
  const r = await chrome.storage.local.get(KEYS.apiStatus);
  return (r[KEYS.apiStatus] as ApiStatus | undefined) ?? { state: 'idle', at: 0 };
}
