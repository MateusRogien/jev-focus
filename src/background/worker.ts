import { callJev, JevError } from '../api/jev';
import { PROVIDERS } from '../api/providers';
import { decide } from '../shared/decision';
import type {
  Broadcast,
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

// Keep the key (and everything else in local) out of content scripts.
chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => undefined);

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

const profileKeyOf = (s: Settings) => {
  const p = activeProfile(s);
  return `${p.id}.${profileFingerprint(p)}`;
};

function contentConfig(s: Settings): ContentConfig {
  const p = activeProfile(s);
  return {
    enabled: s.enabled,
    profileKey: profileKeyOf(s),
    profileName: p.name,
    surfaces: s.surfaces,
    hideShorts: s.hideShortsEverywhere || p.hideShorts,
    showPill: s.showPill,
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

// YouTube tabs that asked for config, so setting changes can be pushed to them.
// tabs.sendMessage needs a tab id, not the `tabs` permission.
const tabs = new Set<number>();
const tabsReady = chrome.storage.session
  .get('tabs')
  .then((r) => (r.tabs as number[] | undefined)?.forEach((t) => tabs.add(t)))
  .catch(() => undefined);

async function rememberTab(id: number | undefined) {
  if (id === undefined || tabs.has(id)) return;
  tabs.add(id);
  await chrome.storage.session.set({ tabs: [...tabs] });
}

async function broadcast(msg: Broadcast) {
  await tabsReady;
  for (const id of [...tabs]) {
    chrome.tabs.sendMessage(id, msg).catch(() => {
      tabs.delete(id);
      void chrome.storage.session.set({ tabs: [...tabs] });
    });
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[KEYS.settings]) {
    void loadSettings().then((s) => broadcast({ type: 'config', config: contentConfig(s) }));
  }
});

chrome.runtime.onInstalled.addListener((d) => {
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
    return [{ id, title, channel: str(v.channel, 120), duration: str(v.duration, 16), badges }];
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

async function handle(msg: Request, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (msg.type) {
    case 'getConfig': {
      await rememberTab(sender.tab?.id);
      return contentConfig(await loadSettings());
    }

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
        profileKey,
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

    case 'configChanged':
      await broadcast({ type: 'config', config: contentConfig(await loadSettings()) });
      return {};
  }
}

chrome.runtime.onMessage.addListener((msg: Request, sender, sendResponse) => {
  // Only our own extension pages and content scripts can reach this listener
  // (no externally_connectable), but reject anything malformed anyway.
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return false;
  handle(msg, sender).then(sendResponse, (err) => {
    console.error('Jev Focus worker:', err instanceof Error ? err.message : 'error');
    sendResponse(undefined);
  });
  return true;
});
