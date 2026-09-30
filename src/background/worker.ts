import { callJev, JevError } from '../api/jev';
import { PROVIDERS } from '../api/providers';
import { decide } from '../shared/decision';
import type {
  ClassifyResponse,
  ContentConfig,
  Request,
  TestConnectionResponse,
  TestProfileResponse,
} from '../shared/messages';
import { profileFingerprint } from '../shared/profiles';
import { activeProfile, KEYS, loadKey, loadSettings, loadStats } from '../shared/settings';
import type { ApiErrorKind, ApiStatus, Settings, VideoMeta } from '../shared/types';
import { buildBatches, readBatch } from './batch';
import { ClassificationCache, type KV } from './cache';
import { Classifier } from './classifier';

function setAccess(area: chrome.storage.StorageArea, accessLevel: string) {
  try {
    const p = area.setAccessLevel?.({ accessLevel } as never) as Promise<void> | undefined;
    p?.catch(() => undefined);
  } catch {
    // Not supported for this area in this browser.
  }
}

// Keep the key (and everything else in local) out of content scripts where supported.
setAccess(chrome.storage.local, 'TRUSTED_CONTEXTS');

const kv: KV = {
  get: async (k) => (await chrome.storage.local.get(k))[k],
  set: (k, v) => chrome.storage.local.set({ [k]: v }),
};

const cache = new ClassificationCache(kv);

let callSettings: Settings | undefined;
let callKey = '';

const classifier = new Classifier({
  cache,
  call: (req) => {
    const s = callSettings!;
    const cfg = s.providers[s.provider];
    return callJev(req, {
      adapter: PROVIDERS[s.provider],
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      key: callKey,
    });
  },
  onSuccess: (latencyMs) => void setStatus({ state: 'ok', latencyMs, at: Date.now() }),
  onError: (error, httpStatus, backoffUntil) =>
    void setStatus({ state: 'error', error, httpStatus, backoffUntil, at: Date.now() }),
});

async function setStatus(next: ApiStatus) {
  await chrome.storage.local.set({ [KEYS.apiStatus]: next });
}

/** Cache namespace: changes when what Jev is asked changes (not on strictness). */
const cacheNamespace = (s: Settings) => {
  const p = activeProfile(s);
  return `${p.id}.${profileFingerprint(p)}`;
};

/** What content scripts key their decisions on: also changes with strictness. */
const profileKeyOf = (s: Settings) => `${cacheNamespace(s)}.${activeProfile(s).strictness}`;

function contentConfig(s: Settings, hasKey: boolean): ContentConfig {
  const p = activeProfile(s);
  return {
    enabled: s.enabled,
    profileKey: profileKeyOf(s),
    profileName: p.name,
    surfaces: s.surfaces,
    hideShorts: s.hideShortsEverywhere || p.hideShorts,
    showPill: s.showPill,
    hasKey,
    failOpen: s.failMode === 'open',
  };
}

// Stats are tiny; accumulate and write once per classify call.
async function addStats(hidden: number, apiCalls: number, inputTokens: number) {
  if (!hidden && !apiCalls) return;
  const s = await loadStats();
  s.hidden += hidden;
  s.apiCalls += apiCalls;
  s.inputTokens += inputTokens;
  await chrome.storage.local.set({ [KEYS.stats]: s });
}

// The content script reads its (non-secret) config from storage.session, which is opened
// to content scripts; storage.local, which holds the key, is not.
const CONFIG_KEY = 'contentConfig';
setAccess(chrome.storage.session, 'TRUSTED_AND_UNTRUSTED_CONTEXTS');

async function publishConfig(): Promise<ContentConfig> {
  const s = await loadSettings();
  const config = contentConfig(s, (await loadKey(s.provider)).length > 0);
  await chrome.storage.session.set({ [CONFIG_KEY]: config });
  return config;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[KEYS.settings] || changes[KEYS.apiKeys])) void publishConfig();
});

chrome.runtime.onStartup.addListener(() => void publishConfig());

chrome.runtime.onInstalled.addListener((d) => {
  void publishConfig();
  if (d.reason === 'install') void chrome.runtime.openOptionsPage();
});

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

function sanitise(videos: unknown): VideoMeta[] {
  if (!Array.isArray(videos)) return [];
  return videos.slice(0, 200).flatMap((v: Partial<VideoMeta>) => {
    const id = str(v?.id, 64);
    const title = str(v?.title, 300);
    if (!id || !title) return [];
    const badges = Array.isArray(v.badges) ? v.badges.map((b) => str(b, 20)).slice(0, 4) : [];
    const includes = Array.isArray(v.includes)
      ? v.includes
          .map((t) => str(t, 160))
          .filter(Boolean)
          .slice(0, 2)
      : [];
    return [
      {
        id,
        title,
        channel: str(v.channel, 120),
        duration: str(v.duration, 16),
        badges,
        ...(includes.length ? { includes } : {}),
      },
    ];
  });
}

const errorText = (kind: ApiErrorKind, status?: number): string =>
  ({
    'no-key': 'No API key set',
    auth: `Key rejected (${status ?? 401})`,
    'rate-limit': 'Rate limited (429)',
    network: 'Network error',
    timeout: 'Timed out after 3 s',
    server: `Provider error (${status ?? 500})`,
    'bad-request': `Request rejected (${status ?? 400}) — check model and base URL`,
    'bad-response': 'Unexpected response from provider',
  })[kind];

async function handle(msg: Request): Promise<unknown> {
  switch (msg.type) {
    case 'getConfig':
      return publishConfig();

    case 'classify': {
      const s = await loadSettings();
      const profileKey = profileKeyOf(s);
      // A stale tab asking under an old profile gets an empty answer and will re-ask.
      if (msg.profileKey !== profileKey || !s.enabled) {
        return { profileKey, decisions: [], degraded: false } satisfies ClassifyResponse;
      }
      callSettings = s;
      callKey = await loadKey(s.provider);
      const out = await classifier.classify({
        videos: sanitise(msg.videos),
        profile: activeProfile(s),
        profileKey: cacheNamespace(s),
        failMode: s.failMode,
        channelAllow: s.channelAllow,
        channelBlock: s.channelBlock,
        hasKey: callKey.length > 0,
      });
      const hidden = out.decisions.filter(
        (d) => d.verdict === 'block' && d.source !== 'fail-closed',
      ).length;
      await addStats(hidden, out.apiCalls, out.inputTokens);
      return {
        profileKey,
        decisions: out.decisions,
        degraded: out.degraded,
      } satisfies ClassifyResponse;
    }

    case 'testConnection': {
      const s = await loadSettings();
      const key = await loadKey(s.provider);
      const cfg = s.providers[s.provider];
      try {
        const { response, latencyMs } = await callJev(
          {
            state: 'Connection test from the Jev Focus browser extension.',
            questions: {
              ping: { type: 'noul', instructions: 'Is the sky usually blue on a clear day?' },
            },
          },
          { adapter: PROVIDERS[s.provider], baseUrl: cfg.baseUrl, model: cfg.model, key },
        );
        if (!response.answers.ping) throw new JevError('bad-response');
        await setStatus({ state: 'ok', latencyMs, at: Date.now() });
        await addStats(0, 1, response.inputTokens ?? 30);
        return { ok: true, latencyMs, model: response.model } satisfies TestConnectionResponse;
      } catch (err) {
        const e = err instanceof JevError ? err : new JevError('network');
        await setStatus({
          state: 'error',
          error: e.kind,
          httpStatus: e.httpStatus,
          at: Date.now(),
        });
        return {
          ok: false,
          error: errorText(e.kind, e.httpStatus),
        } satisfies TestConnectionResponse;
      }
    }

    case 'testProfile': {
      const s = await loadSettings();
      const key = await loadKey(s.provider);
      const cfg = s.providers[s.provider];
      const video = {
        id: 'test',
        title: msg.title,
        channel: msg.channel,
        duration: '',
        badges: [],
      };
      const [batch] = buildBatches([video], msg.profile);
      if (!batch) return { ok: false, error: 'Nothing to test' } satisfies TestProfileResponse;
      try {
        const { response, latencyMs } = await callJev(batch.request, {
          adapter: PROVIDERS[s.provider],
          baseUrl: cfg.baseUrl,
          model: cfg.model,
          key,
        });
        await addStats(0, 1, response.inputTokens ?? batch.estimatedTokens);
        const c = readBatch(batch, response).get('test');
        if (!c) throw new JevError('bad-response');
        return {
          ok: true,
          classification: c,
          verdict: decide(msg.profile, c),
          latencyMs,
        } satisfies TestProfileResponse;
      } catch (err) {
        const e = err instanceof JevError ? err : new JevError('network');
        return { ok: false, error: errorText(e.kind, e.httpStatus) } satisfies TestProfileResponse;
      }
    }

    case 'clearCache':
      await cache.clear();
      return { size: 0 };

    case 'cacheSize':
      return { size: await cache.size() };

    case 'openPopup':
      try {
        await chrome.action.openPopup();
      } catch {
        await chrome.runtime.openOptionsPage();
      }
      return {};
  }
}

chrome.runtime.onMessage.addListener((msg: Request, _sender, sendResponse) => {
  // Only our own extension pages and content scripts can reach this listener
  // (no externally_connectable), but reject anything malformed anyway.
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return false;
  handle(msg).then(sendResponse, (err) => {
    console.error('Jev Focus worker:', err instanceof Error ? err.message : 'error');
    sendResponse(undefined);
  });
  return true;
});
