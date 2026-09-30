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
