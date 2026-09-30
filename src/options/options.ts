import { isAllowedBaseUrl, PROVIDERS, PROVIDER_IDS } from '../api/providers';
import { BLOCK_THRESHOLD, blockedMass } from '../shared/decision';
import type { TestConnectionResponse, TestProfileResponse } from '../shared/messages';
import { allProfiles, duplicateProfile, PRESETS, slugify } from '../shared/profiles';
import {
  activeProfile,
  loadKey,
  loadSettings,
  profileById,
  saveKey,
  saveSettings,
} from '../shared/settings';
import type {
  Category,
  FailMode,
  Profile,
  ProviderId,
  Settings,
  Strictness,
  SurfaceId,
} from '../shared/types';
import { bars, h, icon, PROFILE_ICONS } from '../ui/icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let settings: Settings;
let selectedId = '';
let draft: Profile | undefined; // editable copy of the selected custom profile
let dirty = false;

const STRICTNESS: Array<[Strictness, string]> = [
  ['relaxed', 'Relaxed'],
  ['balanced', 'Balanced'],
  ['strict', 'Strict'],
];

const STRICT_HELP: Record<Strictness, string> = {
  relaxed: `Hide only when Jev is fairly sure (${pct(BLOCK_THRESHOLD.relaxed)}+ on blocked categories).`,
  balanced: `Hide when blocked categories are more likely than not (${pct(BLOCK_THRESHOLD.balanced)}+).`,
  strict: `Hide whenever there's a real chance it's off-topic (${pct(BLOCK_THRESHOLD.strict)}+).`,
};

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

async function send<T>(msg: unknown): Promise<T | undefined> {
  try {
    return (await chrome.runtime.sendMessage(msg)) as T;
  } catch {
    return undefined;
  }
}

function setStatus(el: HTMLElement, text: string, tone: 'ok' | 'error' | '' = '') {
  el.textContent = text;
  el.className = `status ${tone}`;
}

function seg<T extends string>(
  el: HTMLElement,
  options: Array<[T, string]>,
  value: T,
  onPick: (v: T) => void,
  disabled = false,
) {
  el.replaceChildren(
    ...options.map(([v, label]) => {
      const b = h(
        'button',
        { type: 'button', 'aria-pressed': String(v === value), disabled },
        label,
      );
      b.addEventListener('click', () => onPick(v));
      return b;
    }),
  );
}

/* ------------------------------------------------------------------ key & provider */

let keyVisible = false;

async function renderKey() {
  const p = PROVIDERS[settings.provider];
  seg(
    $('provider'),
    PROVIDER_IDS.map((id) => [id, PROVIDERS[id].label]),
    settings.provider,
    async (id) => {
      settings = await saveSettings({ provider: id as ProviderId });
      await renderKey();
      renderPrivacy();
    },
  );
  $('key-label').textContent = p.keyHint;
  const where = $('key-where');
  where.replaceChildren(
    'Get one at ',
    h('a', { href: p.signupUrl, target: '_blank', rel: 'noopener' }, new URL(p.signupUrl).host),
    '. Stored only in this browser and sent only to ',
    h('span', { class: 'mono' }, new URL(p.origin).host),
    '.',
  );
  const input = $<HTMLInputElement>('key-input');
  const key = await loadKey(settings.provider);
  input.value = key;
  input.type = keyVisible ? 'text' : 'password';
  $('key-reveal').replaceChildren(icon(keyVisible ? 'eye-off' : 'eye'));
  $('key-reveal').setAttribute('aria-label', keyVisible ? 'Hide key' : 'Show key');
  $<HTMLButtonElement>('key-remove').disabled = !key;
  $<HTMLButtonElement>('key-test').disabled = !key;
  setStatus($('key-status'), key ? '' : 'No key set', key ? '' : 'error');

  const cfg = settings.providers[settings.provider];
  $<HTMLInputElement>('base-url').value = cfg.baseUrl;
  $<HTMLInputElement>('model').value = cfg.model;
  $('adv-note').textContent =
    `Default: ${p.defaultBaseUrl} · ${p.defaultModel}. The base URL must stay on ${p.origin}; ` +
    'that is the only host this extension has permission to reach for this provider.';
  setStatus($('adv-status'), '');
}

function bindKey() {
  $('key-reveal').addEventListener('click', () => {
    keyVisible = !keyVisible;
    $<HTMLInputElement>('key-input').type = keyVisible ? 'text' : 'password';
    $('key-reveal').replaceChildren(icon(keyVisible ? 'eye-off' : 'eye'));
    $('key-reveal').setAttribute('aria-label', keyVisible ? 'Hide key' : 'Show key');
  });
  $('key-save').addEventListener('click', async () => {
    const v = $<HTMLInputElement>('key-input').value.trim();
    if (!v) return setStatus($('key-status'), 'Paste a key first', 'error');
    await saveKey(settings.provider, v);
    await renderKey();
    await testConnection();
  });
  $('key-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('key-save').click();
  });
  $('key-test').addEventListener('click', testConnection);
  $('key-remove').addEventListener('click', async () => {
    await saveKey(settings.provider, '');
    keyVisible = false;
    await renderKey();
    setStatus($('key-status'), 'Key removed', '');
  });
  $('adv-save').addEventListener('click', async () => {
    const p = PROVIDERS[settings.provider];
    const baseUrl = $<HTMLInputElement>('base-url').value.trim();
    const model = $<HTMLInputElement>('model').value.trim();
    if (!isAllowedBaseUrl(p, baseUrl)) {
      return setStatus($('adv-status'), `Base URL must start with ${p.origin}`, 'error');
    }
    if (!model) return setStatus($('adv-status'), 'Model is required', 'error');
    settings = await saveSettings({
      providers: { ...settings.providers, [settings.provider]: { baseUrl, model } },
    });
    setStatus($('adv-status'), 'Saved', 'ok');
  });
  $('adv-reset').addEventListener('click', async () => {
    const p = PROVIDERS[settings.provider];
    settings = await saveSettings({
      providers: {
        ...settings.providers,
        [settings.provider]: { baseUrl: p.defaultBaseUrl, model: p.defaultModel },
      },
    });
    await renderKey();
    setStatus($('adv-status'), 'Reset', 'ok');
  });
}

async function testConnection() {
  const el = $('key-status');
  setStatus(el, 'Testing…');
  const r = await send<TestConnectionResponse>({ type: 'testConnection' });
  if (r?.ok) setStatus(el, `Connected · ${r.latencyMs} ms${r.model ? ` · ${r.model}` : ''}`, 'ok');
  else setStatus(el, r?.error ?? 'Extension worker unavailable', 'error');
}

/* ------------------------------------------------------------------ profiles */

function renderProfileList() {
  const list = $('plist');
  const activeId = activeProfile(settings).id;
  const items = allProfiles(settings.customProfiles).map((p) => {
    const b = h(
      'button',
      { type: 'button', role: 'option', 'aria-selected': String(p.id === selectedId) },
      icon(p.icon),
      h('span', { class: 'grow' }, p.name),
      p.id === activeId ? h('span', { class: 'tag' }, 'active') : null,
    );
    b.addEventListener('click', () => selectProfile(p.id));
    return b;
  });
  const add = h(
    'button',
    { type: 'button', class: 'new' },
    icon('plus'),
    h('span', { class: 'grow' }, 'New profile'),
  );
  add.addEventListener('click', () => {
    const blank: Profile = {
      id: uniqueProfileId('custom'),
      name: 'My profile',
      icon: 'circle',
      strictness: 'balanced',
      clickbait: true,
      hideShorts: true,
      categories: [
        {
          id: 'wanted',
          label: 'Wanted',
          description: 'Describe what you want to see.',
          blocked: false,
        },
        { id: 'other', label: 'Everything else', description: 'Anything else.', blocked: true },
      ],
    };
    void saveCustom([...settings.customProfiles, blank]).then(() => selectProfile(blank.id));
  });
  list.replaceChildren(...items, add);
}

function uniqueProfileId(base: string) {
  const ids = new Set(allProfiles(settings.customProfiles).map((p) => p.id));
  let id = base;
  for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
  return id;
}

function selectProfile(id: string) {
  if (dirty && !confirm('Discard unsaved changes to this profile?')) return;
  selectedId = id;
  const p = profileById(settings, id);
  draft = p.builtin ? undefined : structuredClone(p);
  dirty = false;
  renderProfileList();
  renderEditor();
}

async function saveCustom(customProfiles: Profile[]) {
  settings = await saveSettings({ customProfiles });
}

function markDirty() {
  dirty = true;
  const b = document.getElementById('ed-save') as HTMLButtonElement | null;
  if (b) b.disabled = false;
}

function validate(p: Profile): string | undefined {
  if (!p.name.trim()) return 'Give the profile a name.';
  if (p.categories.length < 2) return 'A profile needs at least two categories.';
  if (p.categories.length > 255) return 'Jev accepts at most 255 categories.';
  if (!p.categories.some((c) => !c.blocked)) return 'Allow at least one category.';
  if (p.categories.some((c) => !c.label.trim() || !c.description.trim())) {
    return 'Every category needs a name and a description.';
  }
  return undefined;
}

/** Category ids come from labels, made unique. */
function normaliseIds(cats: Category[]): Category[] {
  const seen = new Set<string>();
  return cats.map((c) => {
    let id = slugify(c.label);
    for (let n = 2; seen.has(id); n++) id = `${slugify(c.label)}_${n}`;
    seen.add(id);
    return { ...c, id, label: c.label.trim(), description: c.description.trim() };
  });
}

function renderEditor() {
  const ed = $('editor');
  const p = draft ?? profileById(settings, selectedId);
  const readonly = !draft;
  const isActive = activeProfile(settings).id === p.id;

  // Header: name, icon, actions
  const name = h('input', {
    class: 'input',
    value: p.name,
    'aria-label': 'Profile name',
    disabled: readonly,
  });
  name.addEventListener('input', () => {
    draft!.name = name.value;
    markDirty();
  });

  const icons = h('div', { class: 'icons', role: 'group', 'aria-label': 'Icon' });
  for (const ic of PROFILE_ICONS) {
    const b = h(
      'button',
      {
        type: 'button',
        'aria-pressed': String(p.icon === ic),
        'aria-label': ic,
        disabled: readonly,
      },
      icon(ic),
    );
    b.addEventListener('click', () => {
      draft!.icon = ic;
      markDirty();
      renderEditor();
    });
    icons.append(b);
  }

  const actions = h('div', { class: 'actions' });
  if (!isActive) {
    const use = h('button', { type: 'button', class: 'btn primary' }, 'Use this profile');
    use.addEventListener('click', async () => {
      settings = await saveSettings({ activeProfileId: p.id });
      renderProfileList();
      renderEditor();
      renderBehaviour();
    });
    actions.append(use);
  }
  const dup = h(
    'button',
    { type: 'button', class: 'btn' },
    icon('copy'),
    readonly ? 'Duplicate to edit' : 'Duplicate',
  );
  dup.addEventListener('click', async () => {
    const copy = duplicateProfile(p, allProfiles(settings.customProfiles));
    await saveCustom([...settings.customProfiles, copy]);
    dirty = false;
    selectProfile(copy.id);
  });
  actions.append(dup);
  if (!readonly) {
    const del = h('button', { type: 'button', class: 'btn danger' }, icon('trash'), 'Delete');
    del.addEventListener('click', async () => {
      if (!confirm(`Delete "${p.name}"?`)) return;
      const rest = settings.customProfiles.filter((x) => x.id !== p.id);
      const patch: Partial<Settings> = { customProfiles: rest };
      if (isActive) patch.activeProfileId = PRESETS[0]!.id;
      settings = await saveSettings(patch);
      dirty = false;
      selectProfile(PRESETS[0]!.id);
      renderBehaviour();
    });
    actions.append(del);
  }

  // Categories
  const cats = h('div', { class: 'cats' });
  cats.append(
    h(
      'p',
      { class: 'cats-head' },
      'Categories. Each description is sent to Jev verbatim as the definition of that option, so be specific about what separates it from its neighbours.',
    ),
  );
  p.categories.forEach((c, i) => {
    const label = h('input', {
      class: 'input',
      value: c.label,
      'aria-label': 'Category name',
      disabled: readonly,
    });
    label.addEventListener('input', () => {
      draft!.categories[i]!.label = label.value;
      markDirty();
    });
    const desc = h('textarea', {
      class: 'input',
      'aria-label': 'Category description',
      disabled: readonly,
      rows: '1',
    });
    desc.value = c.description;
    const fit = () => {
      desc.style.height = 'auto';
      desc.style.height = `${Math.max(32, desc.scrollHeight + 2)}px`;
    };
    desc.addEventListener('input', () => {
      draft!.categories[i]!.description = desc.value;
      fit();
      markDirty();
    });
    requestAnimationFrame(fit);

    const mode = h('div', {
      class: 'seg',
      role: 'group',
      'aria-label': `${c.label}: allowed or blocked`,
    });
    for (const [blocked, text, cls] of [
      [false, 'Allow', 'allow'],
      [true, 'Block', 'block'],
    ] as const) {
      const b = h(
        'button',
        {
          type: 'button',
          class: cls,
          'aria-pressed': String(c.blocked === blocked),
          disabled: readonly,
        },
        text,
      );
      b.addEventListener('click', () => {
        draft!.categories[i]!.blocked = blocked;
        markDirty();
        renderEditor();
      });
      mode.append(b);
    }
    const remove = h(
      'button',
      {
        type: 'button',
        class: 'btn ghost icon',
        'aria-label': `Remove ${c.label}`,
        disabled: readonly,
      },
      icon('trash'),
    );
    remove.addEventListener('click', () => {
      draft!.categories.splice(i, 1);
      markDirty();
      renderEditor();
    });
    cats.append(h('div', { class: 'cat' }, label, desc, mode, remove));
  });
  if (!readonly) {
    const add = h('button', { type: 'button', class: 'btn ghost' }, icon('plus'), 'Add category');
    add.addEventListener('click', () => {
      draft!.categories.push({ id: '', label: '', description: '', blocked: false });
      markDirty();
      renderEditor();
      const inputs = $('editor').querySelectorAll<HTMLInputElement>('.cat input');
      inputs[inputs.length - 1]?.focus();
    });
    cats.append(h('div', {}, add));
  }

  // Toggles
  const toggle = (labelText: string, help: string, checked: boolean, on: (v: boolean) => void) => {
    const input = h('input', { type: 'checkbox', 'aria-label': labelText, disabled: readonly });
    input.checked = checked;
    input.addEventListener('change', () => {
      on(input.checked);
      markDirty();
    });
    return h(
      'div',
      { class: 'toggle' },
      h('div', {}, h('h3', {}, labelText), h('p', { class: 'small muted' }, help)),
      h('label', { class: 'switch' }, input, h('span')),
    );
  };
  const toggles = h(
    'div',
    { class: 'toggles' },
    toggle(
      'Block clickbait',
      'Also ask Jev whether each title is written mainly to provoke curiosity or outrage, and hide it if so.',
      p.clickbait,
      (v) => (draft!.clickbait = v),
    ),
    toggle(
      'Hide Shorts',
      'Remove every Short without asking Jev.',
      p.hideShorts,
      (v) => (draft!.hideShorts = v),
    ),
  );

  // Strictness
  const strictSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Strictness' });
  seg(strictSeg, STRICTNESS, p.strictness, async (v) => {
    if (draft) {
      draft.strictness = v;
      markDirty();
      renderEditor();
    } else {
      settings = await saveSettings({
        strictnessOverrides: { ...settings.strictnessOverrides, [p.id]: v },
      });
      renderEditor();
      renderBehaviour();
    }
  });
  const strictness = h(
    'div',
    { class: 'toggle' },
    h(
      'div',
      {},
      h('h3', {}, 'Strictness'),
      h('p', { class: 'small muted' }, STRICT_HELP[p.strictness]),
    ),
    strictSeg,
  );

  // Save bar
  const footer = h('div', { class: 'actions' });
  const err = h('span', { class: 'status', 'aria-live': 'polite' });
  if (!readonly) {
    const save = h(
      'button',
      { type: 'button', class: 'btn primary', id: 'ed-save', disabled: !dirty },
      'Save profile',
    );
    save.addEventListener('click', async () => {
      const next = {
        ...draft!,
        name: draft!.name.trim(),
        categories: normaliseIds(draft!.categories),
      };
      const problem = validate(next);
      if (problem) return setStatus(err, problem, 'error');
      await saveCustom(settings.customProfiles.map((x) => (x.id === next.id ? next : x)));
      draft = structuredClone(next);
      dirty = false;
      renderProfileList();
      renderEditor();
      renderBehaviour();
      setStatus($('ed-status'), 'Saved', 'ok');
    });
    const revert = h('button', { type: 'button', class: 'btn ghost' }, 'Revert');
    revert.addEventListener('click', () => {
      dirty = false;
      selectProfile(p.id);
    });
    footer.append(save, revert);
  } else {
    footer.append(
      h('span', { class: 'small muted' }, 'Preset profiles are read-only except for strictness.'),
    );
  }
  err.id = 'ed-status';
  footer.append(err);

  ed.replaceChildren(
    h('div', { class: 'editor-head' }, name, icons),
    actions,
    cats,
    toggles,
    strictness,
    renderTester(p),
    footer,
  );
}

function renderTester(p: Profile): HTMLElement {
  const title = h('input', {
    class: 'input',
    placeholder: 'Paste a video title',
    'aria-label': 'Test title',
  });
  const channel = h('input', {
    class: 'input',
    placeholder: 'Channel (optional)',
    'aria-label': 'Test channel',
  });
  const run = h('button', { type: 'button', class: 'btn' }, 'Test');
  const out = h('div', { class: 'grid' });
  const go = async () => {
    const t = title.value.trim();
    if (!t) return;
    run.disabled = true;
    out.replaceChildren(h('p', { class: 'small muted' }, 'Asking Jev…'));
    const prof = draft ? { ...draft, categories: normaliseIds(draft.categories) } : p;
    const r = await send<TestProfileResponse>({
      type: 'testProfile',
      profile: prof,
      title: t,
      channel: channel.value.trim(),
    });
    run.disabled = false;
    if (!r?.ok || !r.classification) {
      out.replaceChildren(
        h('p', { class: 'status error' }, r?.error ?? 'Extension worker unavailable'),
      );
      return;
    }
    const c = r.classification;
    const entries = prof.categories
      .map((cat) => ({ label: cat.label, p: c.probabilities[cat.id] ?? 0, blocked: cat.blocked }))
      .sort((a, b) => b.p - a.p);
    if (c.clickbait !== undefined)
      entries.push({ label: 'Clickbait', p: c.clickbait, blocked: true });
    const mass = blockedMass(prof, c.probabilities);
    out.replaceChildren(
      h(
        'p',
        { class: `verdict ${r.verdict === 'block' ? 'ember' : 'sage'}` },
        r.verdict === 'block' ? 'Hidden' : 'Shown',
        h('span', { class: 'muted' }, ` · ${pct(mass)} on blocked categories · ${r.latencyMs} ms`),
      ),
      bars(entries),
    );
  };
  run.addEventListener('click', go);
  title.addEventListener('keydown', (e) => e.key === 'Enter' && void go());
  return h(
    'div',
    { class: 'tester' },
    h('h3', {}, 'Test this profile'),
    h('div', { class: 'grid two' }, title, channel),
    h('div', { class: 'actions' }, run, h('span', { class: 'xs muted' }, 'Uses one API call.')),
    out,
  );
}

/* ------------------------------------------------------------------ surfaces */

const SURFACES: Array<[SurfaceId, string, string]> = [
  ['home', 'Home feed', 'The "For you" grid on the YouTube home page.'],
  ['watch', 'Watch page sidebar', 'Recommendations next to or below the video.'],
  [
    'endscreen',
    'End screen & autoplay',
    'Suggestions shown when a video ends, and the autoplay "Up next" card.',
  ],
  ['shorts', 'Shorts shelves', 'Shorts rows on the home feed and watch page.'],
  ['search', 'Search results', 'Off by default: you searched on purpose.'],
  ['subscriptions', 'Subscriptions feed', 'Off by default: you chose these channels.'],
];

function renderSurfaces() {
  const list = $('surface-list');
  const rows = SURFACES.map(([id, title, help]) => {
    const input = h('input', { type: 'checkbox', 'aria-label': title });
    input.checked = settings.surfaces[id];
    input.addEventListener('change', async () => {
      settings = await saveSettings({ surfaces: { ...settings.surfaces, [id]: input.checked } });
    });
    return h(
      'div',
      { class: 'item' },
      h('div', {}, h('h3', {}, title), h('p', { class: 'small muted' }, help)),
      h('label', { class: 'switch' }, input, h('span')),
    );
  });
  const all = h('input', { type: 'checkbox', 'aria-label': 'Hide Shorts everywhere' });
  all.checked = settings.hideShortsEverywhere;
  all.addEventListener('change', async () => {
    settings = await saveSettings({ hideShortsEverywhere: all.checked });
  });
  rows.push(
    h(
      'div',
      { class: 'item' },
      h(
        'div',
        {},
        h('h3', {}, 'Hide Shorts everywhere'),
        h(
          'p',
          { class: 'small muted' },
          'Removes every Short and the Shorts entry in the sidebar, in every profile, without classifying.',
        ),
      ),
      h('label', { class: 'switch' }, all, h('span')),
    ),
  );
  list.replaceChildren(...rows);
}

/* ------------------------------------------------------------------ behaviour */

function renderBehaviour() {
  const p = activeProfile(settings);
  $('strict-profile').textContent = `· ${p.name}`;
  $('strict-help').textContent = STRICT_HELP[p.strictness];
  seg($('strictness'), STRICTNESS, p.strictness, async (v) => {
    if (p.builtin) {
      settings = await saveSettings({
        strictnessOverrides: { ...settings.strictnessOverrides, [p.id]: v },
      });
    } else {
      settings = await saveSettings({
        customProfiles: settings.customProfiles.map((x) =>
          x.id === p.id ? { ...x, strictness: v } : x,
        ),
      });
      if (draft?.id === p.id) draft.strictness = v;
    }
    renderBehaviour();
    if (selectedId === p.id) renderEditor();
  });
  seg<FailMode>(
    $('failmode'),
    [
      ['closed', 'Keep hidden'],
      ['open', 'Show everything'],
    ],
    settings.failMode,
    async (v) => {
      settings = await saveSettings({ failMode: v });
      renderBehaviour();
    },
  );
  const pill = $<HTMLInputElement>('show-pill');
  pill.checked = settings.showPill;
  pill.onchange = async () => {
    settings = await saveSettings({ showPill: pill.checked });
  };
}

/* ------------------------------------------------------------------ channel lists */

const parseList = (s: string) =>
  [
    ...new Set(
      s
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    ),
  ].slice(0, 2000);

function renderLists() {
  const allow = $<HTMLTextAreaElement>('allow');
  const block = $<HTMLTextAreaElement>('block');
  allow.value = settings.channelAllow.join('\n');
  block.value = settings.channelBlock.join('\n');
  const save = async () => {
    settings = await saveSettings({
      channelAllow: parseList(allow.value),
      channelBlock: parseList(block.value),
    });
    setStatus(
      $('lists-status'),
      `Saved · ${settings.channelAllow.length} allowed, ${settings.channelBlock.length} blocked`,
      'ok',
    );
  };
  allow.addEventListener('change', save);
  block.addEventListener('change', save);
}

/* ------------------------------------------------------------------ cache, privacy, about */

async function renderCache() {
  const r = await send<{ size: number }>({ type: 'cacheSize' });
  $('cache-size').textContent = r ? r.size.toLocaleString() : '—';
}

function renderPrivacy() {
  $('privacy-host').textContent = new URL(PROVIDERS[settings.provider].origin).host;
}

async function init() {
  settings = await loadSettings();
  selectedId = activeProfile(settings).id;
  const p = profileById(settings, selectedId);
  draft = p.builtin ? undefined : structuredClone(p);

  bindKey();
  await renderKey();
  renderProfileList();
  renderEditor();
  renderSurfaces();
  renderBehaviour();
  renderLists();
  renderPrivacy();
  await renderCache();
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  $('cache-clear').addEventListener('click', async () => {
    await send({ type: 'clearCache' });
    await renderCache();
  });
  window.addEventListener('beforeunload', (e) => {
    if (dirty) e.preventDefault();
  });
}

void init();
