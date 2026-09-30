// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { extract, idFromHref, isAd, isShort, surfaceOf } from '../src/content/extract';

const html = (s: string) => {
  document.body.innerHTML = s;
  return document.body.firstElementChild!;
};

describe('idFromHref', () => {
  it.each([
    ['/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['/watch?v=abc123DEF_-&list=RDabc&index=2', 'abc123DEF_-'],
    ['/shorts/AbCdEf12345', 'AbCdEf12345'],
    ['/playlist?list=PL123', 'pl:PL123'],
    ['/show/VLPLoSWVnSA9vG8SK6?sbp=x', 'pl:PLoSWVnSA9vG8SK6'],
    ['https://www.youtube.com/watch?v=xyz789abc', 'xyz789abc'],
    ['/@lofigirl', ''],
  ])('%s → %s', (href, id) => expect(idFromHref(href)).toBe(id));
});

describe('extract', () => {
  it('reads a view-model home card', () => {
    const card = html(`
      <ytd-browse page-subtype="home"><ytd-rich-item-renderer>
        <yt-lockup-view-model>
          <a href="/watch?v=jfKfPfyJRdk" class="yt-lockup-view-model__content-image">
            <yt-thumbnail-badge-view-model><badge-shape><div class="yt-badge-shape__text">LIVE</div></badge-shape></yt-thumbnail-badge-view-model>
          </a>
          <h3 class="yt-lockup-metadata-view-model__heading-reset" title="lofi hip hop radio 📚 beats to relax/study to">
            <a class="yt-lockup-metadata-view-model__title"><span>lofi hip hop radio 📚 beats to relax/study to</span></a>
          </h3>
          <div class="yt-content-metadata-view-model__metadata-row">
            <span class="yt-content-metadata-view-model__metadata-text"><a href="/@LofiGirl">Lofi Girl</a></span>
          </div>
        </yt-lockup-view-model>
      </ytd-rich-item-renderer></ytd-browse>`).querySelector('ytd-rich-item-renderer')!;
    expect(extract(card)).toEqual({
      id: 'jfKfPfyJRdk',
      title: 'lofi hip hop radio 📚 beats to relax/study to',
      channel: 'Lofi Girl',
      duration: '',
      badges: ['LIVE'],
    });
    expect(surfaceOf(card)).toBe('home');
  });

  it('reads a classic compact sidebar card with a duration', () => {
    const card = html(`
      <ytd-watch-flexy><div id="secondary"><ytd-compact-video-renderer>
        <a id="thumbnail" href="/watch?v=abcdefghijk"><ytd-thumbnail-overlay-time-status-renderer overlay-style="DEFAULT"><span id="text"> 3:02:11 </span></ytd-thumbnail-overlay-time-status-renderer></a>
        <span id="video-title" title="Bach Cello Suites">Bach Cello Suites</span>
        <ytd-channel-name><div id="text">Yo-Yo Ma</div></ytd-channel-name>
      </ytd-compact-video-renderer></div></ytd-watch-flexy>`).querySelector(
      'ytd-compact-video-renderer',
    )!;
    expect(extract(card)).toMatchObject({
      id: 'abcdefghijk',
      title: 'Bach Cello Suites',
      channel: 'Yo-Yo Ma',
      duration: '3:02:11',
    });
    expect(surfaceOf(card)).toBe('watch');
  });

  it('returns undefined until the card has a link and a title', () => {
    expect(extract(html('<ytd-rich-item-renderer></ytd-rich-item-renderer>'))).toBeUndefined();
    expect(
      extract(
        html(
          '<ytd-rich-item-renderer><a href="/watch?v=abcdefghijk"></a></ytd-rich-item-renderer>',
        ),
      ),
    ).toBeUndefined();
  });

  it('reads only title, channel, duration and badges', () => {
    const card =
      html(`<ytd-video-renderer><a id="thumbnail" href="/watch?v=abcdefghijk"></a><a id="video-title" title="T"></a>
      <span class="view-count">1.2M views</span><span>3 days ago</span></ytd-video-renderer>`);
    expect(Object.keys(extract(card)!).sort()).toEqual([
      'badges',
      'channel',
      'duration',
      'id',
      'title',
    ]);
    expect(JSON.stringify(extract(card))).not.toContain('views');
  });

  it('trims end-screen author text to the channel', () => {
    const card =
      html(`<div class="html5-video-player"><a class="ytp-videowall-still" href="https://www.youtube.com/watch?v=abcdefghijk">
      <span class="ytp-videowall-still-info-title">Title</span><span class="ytp-videowall-still-info-author">Chan • 1.2M views</span></a></div>`).querySelector(
        'a',
      )!;
    expect(extract(card)).toMatchObject({ id: 'abcdefghijk', channel: 'Chan' });
    expect(surfaceOf(card)).toBe('endscreen');
  });
});

describe('live markup (captured from www.youtube.com, 2026-09-30)', () => {
  it('reads a camelCase view-model mix lockup, including its listed videos', () => {
    const card =
      html(`<ytd-search><yt-lockup-view-model class="ytLockupViewModelWrapper"><div class="ytLockupViewModelHost">
      <a href="/watch?v=oMRijktGkVs&amp;list=RDEMwT6HSBpGX0ZJerBB3rWMjg&amp;start_radio=1" class="ytLockupViewModelContentImage">
        <yt-collection-thumbnail-view-model><yt-thumbnail-view-model><yt-thumbnail-overlay-badge-view-model><yt-thumbnail-badge-view-model>
          <badge-shape class="ytBadgeShapeHost"><div class="ytBadgeShapeText">Mix</div></badge-shape>
        </yt-thumbnail-badge-view-model></yt-thumbnail-overlay-badge-view-model></yt-thumbnail-view-model></yt-collection-thumbnail-view-model></a>
      <div class="ytLockupViewModelMetadata"><yt-lockup-metadata-view-model><div class="ytLockupMetadataViewModelTextContainer">
        <h3 class="ytLockupMetadataViewModelHeadingReset" title="YouTube Mix"><a href="/watch?v=oMRijktGkVs&amp;list=RDEMwT6HSBpGX0ZJerBB3rWMjg" class="ytLockupMetadataViewModelTitle"><span>YouTube Mix</span></a></h3>
        <div class="ytLockupMetadataViewModelMetadata"><yt-content-metadata-view-model class="ytContentMetadataViewModelHost">
          <div class="ytContentMetadataViewModelMetadataRow"><span class="ytContentMetadataViewModelMetadataText">Personalized mix for you</span></div>
          <div class="ytContentMetadataViewModelMetadataRow"><span class="ytContentMetadataViewModelMetadataText"><a href="/watch?v=oMRijktGkVs&amp;list=RDEM">12 Most Beautiful Violin &amp; Piano Adagios - Relaxing Classical Music for the Soul · 1:19:02</a></span></div>
          <div class="ytContentMetadataViewModelMetadataRow"><span class="ytContentMetadataViewModelMetadataText"><a href="/watch?v=4WIMyqBG9gs&amp;list=RDEM">Fantasy Medieval Music for Focus &amp; Calm · 2:01:33</a></span></div>
        </yt-content-metadata-view-model></div></div></yt-lockup-metadata-view-model></div>
    </div></yt-lockup-view-model></ytd-search>`).querySelector('yt-lockup-view-model')!;
    const m = extract(card)!;
    expect(m.id).toBe('oMRijktGkVs');
    expect(m.title).toBe('YouTube Mix');
    expect(m.badges).toContain('Mix');
    expect(m.includes).toEqual([
      '12 Most Beautiful Violin & Piano Adagios - Relaxing Classical Music for the Soul',
      'Fantasy Medieval Music for Focus & Calm',
    ]);
    expect(surfaceOf(card)).toBe('search');
  });

  it('reads the duration from a camelCase badge', () => {
    const card =
      html(`<ytd-video-renderer><ytd-thumbnail><a id="thumbnail" href="/watch?v=sjkrrmBnpGE&amp;pp=x"></a>
      <div class="thumbnail-overlay-badge-shape"><badge-shape class="ytBadgeShapeHost" aria-label="3 hours, 57 minutes, 52 seconds"><div class="ytBadgeShapeText">3:57:52</div></badge-shape></div></ytd-thumbnail>
      <a id="video-title" title="Ambient Study Music To Concentrate"></a><ytd-channel-name><div id="text">Quiet Quest - Study Music</div></ytd-channel-name></ytd-video-renderer>`);
    expect(extract(card)).toMatchObject({
      id: 'sjkrrmBnpGE',
      duration: '3:57:52',
      channel: 'Quiet Quest - Study Music',
    });
  });

  it('reads a v2 Shorts lockup', () => {
    const card =
      html(`<ytm-shorts-lockup-view-model-v2 class="shortsLockupViewModelHost"><ytm-shorts-lockup-view-model class="shortsLockupViewModelHost">
      <a href="/shorts/4Z91tH3VFLI" class="shortsLockupViewModelHostEndpoint reel-item-endpoint"></a>
      <h3 class="shortsLockupViewModelHostMetadataTitle"><a href="/shorts/4Z91tH3VFLI" title="Study Music Alpha Waves">Study Music Alpha Waves</a></h3>
    </ytm-shorts-lockup-view-model></ytm-shorts-lockup-view-model-v2>`);
    expect(isShort(card)).toBe(true);
    expect(extract(card)).toMatchObject({
      id: '4Z91tH3VFLI',
      title: 'Study Music Alpha Waves',
      badges: ['Shorts'],
    });
  });
});

describe('classification helpers', () => {
  it('detects Shorts and routes home Shorts to the shorts surface', () => {
    const card = html(`<ytd-browse page-subtype="home"><ytd-rich-item-renderer is-slim-media>
      <ytm-shorts-lockup-view-model><a href="/shorts/AbCdEf12345"></a></ytm-shorts-lockup-view-model></ytd-rich-item-renderer></ytd-browse>`).querySelector(
      'ytd-rich-item-renderer',
    )!;
    expect(isShort(card)).toBe(true);
    expect(surfaceOf(card)).toBe('shorts');
  });

  it('keeps Shorts in search on the search surface', () => {
    const card = html(
      `<ytd-search><ytd-video-renderer><a id="thumbnail" href="/shorts/AbCdEf12345"></a></ytd-video-renderer></ytd-search>`,
    ).querySelector('ytd-video-renderer')!;
    expect(surfaceOf(card)).toBe('search');
  });

  it('detects ads', () => {
    expect(
      isAd(
        html(
          '<ytd-rich-item-renderer><ytd-ad-slot-renderer></ytd-ad-slot-renderer></ytd-rich-item-renderer>',
        ),
      ),
    ).toBe(true);
  });

  it('has no surface on unfiltered pages (channel pages, playlists)', () => {
    const card = html(
      `<ytd-browse page-subtype="channels"><ytd-rich-item-renderer><a href="/watch?v=abcdefghijk"></a></ytd-rich-item-renderer></ytd-browse>`,
    ).querySelector('ytd-rich-item-renderer')!;
    expect(surfaceOf(card)).toBeUndefined();
  });
});
