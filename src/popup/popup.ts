import { PROVIDERS } from '../api/providers';
import type { PageStats } from '../shared/messages';
import { allProfiles } from '../shared/profiles';
import {
  activeProfile,
  hasKey,
  KEYS,
  loadSettings,
  loadStats,
  loadStatus,
  saveSettings,
} from '../shared/settings';
import type { ApiStatus, Profile, Settings } from '../shared/types';
import { h, icon } from '../ui/icons';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const STRICTNESS_LABEL = { relaxed: 'Relaxed', balanced: 'Balanced', strict: 'Strict' } as const;

let settings: Settings;

export function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function profileMeta(p: Profile): string {
  const allowed = p.categories.filter((c) => !c.blocked).length;
  return `${STRICTNESS_LABEL[p.strictness]} · ${allowed} of ${p.categories.length} categories allowed`;
}

function renderProfile() {
  const p = activeProfile(settings);
  $('profile-icon').replaceChildren(icon(p.icon));
  $('profile-name').textContent = p.name;
  $('profile-meta').textContent = settings.enabled ? profileMeta(p) : 'Filtering is off';
  $('profile-chev').replaceChildren(icon('chevron'));
  document.body.classList.toggle('off', !settings.enabled);
  ($('enabled') as HTMLInputElement).checked = settings.enabled;

  const list = $('plist');
  list.replaceChildren(
    ...allProfiles(settings.customProfiles).map((x) => {
      const current = x.id === p.id;
      const b = h(
        'button',
        { type: 'button', 'aria-current': current ? 'true' : undefined },
        icon(x.icon),
        h('span', { class: 'grow' }, x.name),
        current ? icon('check') : null,
      );
      b.addEventListener('click', async () => {
        settings = await saveSettings({ activeProfileId: x.id, enabled: true });
        toggleList(false);
        renderProfile();
      });
      return h('li', {}, b);
    }),
  );
}

function toggleList(open: boolean) {
  $('plist').hidden = !open;
  $('stats').hidden = open;
  $('profile').setAttribute('aria-expanded', String(open));
  if (open) ($('plist').querySelector('[aria-current]') as HTMLElement | null)?.focus();
}

async function renderStats() {
  const stats = await loadStats();
  $('s-today').textContent = String(stats.hidden);
  $('s-calls').textContent = String(stats.apiCalls);
  const price = PROVIDERS[settings.provider].inputPricePerMTok;
  $('s-cost').textContent = formatCost((stats.inputTokens * price) / 1e6);

  // Hidden on this page: ask the active tab's content script, if it's YouTube.
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) {
      const res = (await chrome.tabs.sendMessage(tab.id, { type: 'pageStats' })) as
        PageStats | undefined;
      if (res) $('s-page').textContent = String(res.hidden);
    }
  } catch {
    // Not a YouTube tab; leave the dash.
  }
}

function statusText(s: ApiStatus, keySet: boolean): [string, 'ok' | 'error' | ''] {
  const closed = settings.failMode === 'closed';
  if (!keySet)
    return [
      closed ? 'No API key — videos stay hidden' : 'No API key — nothing is filtered',
      'error',
    ];
  if (s.state === 'ok') return [`Connected · ${s.latencyMs ?? '—'} ms`, 'ok'];
  if (s.state === 'error') {
    switch (s.error) {
      case 'auth':
        return [`Key rejected (${s.httpStatus ?? 401}) — check Options`, 'error'];
      case 'rate-limit': {
        const secs = s.backoffUntil
          ? Math.max(0, Math.ceil((s.backoffUntil - Date.now()) / 1000))
          : 0;
        return [secs ? `Rate limited — retrying in ${secs} s` : 'Rate limited — retrying', 'error'];
      }
      case 'timeout':
        return ['Jev timed out — ' + (closed ? 'videos held' : 'showing all'), 'error'];
      case 'network':
        return ["Can't reach provider — " + (closed ? 'videos held' : 'showing all'), 'error'];
      case 'bad-request':
        return [`Request rejected (${s.httpStatus}) — check model`, 'error'];
      default:
        return [`Provider error${s.httpStatus ? ` (${s.httpStatus})` : ''}`, 'error'];
    }
  }
  return ['Ready · waiting for YouTube', ''];
}

async function renderStatus() {
  const [s, keySet] = await Promise.all([loadStatus(), hasKey(settings.provider)]);
  const [text, tone] = statusText(s, keySet);
  const el = $('status');
  el.textContent = text;
  el.className = `status ${tone}`;
}

async function init() {
  settings = await loadSettings();
  renderProfile();
  await Promise.all([renderStats(), renderStatus()]);

  $('profile').addEventListener('click', () => toggleList($('plist').hidden));
  $('enabled').addEventListener('change', async (e) => {
    settings = await saveSettings({ enabled: (e.target as HTMLInputElement).checked });
    renderProfile();
  });
  $('open-options').addEventListener('click', (e) => {
    e.preventDefault();
    void chrome.runtime.openOptionsPage();
    window.close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('plist').hidden) {
      e.preventDefault();
      toggleList(false);
      $('profile').focus();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[KEYS.stats]) void renderStats();
    if (changes[KEYS.apiStatus] || changes[KEYS.apiKeys]) void renderStatus();
  });
}

void init();
