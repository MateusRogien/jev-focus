import type { Category, Profile } from './types';

/*
 * Preset focus profiles. Category descriptions are sent verbatim to Jev as the criteria of
 * a `choice` question, so they are written to separate neighbouring buckets, not to read well
 * in the UI. Every profile ends with a broad blocked catch-all so probability mass that
 * belongs to "everything else" has somewhere to go instead of being forced into the
 * closest allowed option.
 */

const c = (id: string, label: string, description: string, blocked = false): Category => ({
  id,
  label,
  description,
  blocked,
});

export const CLICKBAIT_QUESTION =
  'Is this title written primarily to provoke curiosity or outrage rather than describe the content?';

export const CLICKBAIT_CRITERIA = {
  true: 'The title withholds or exaggerates to bait a click: shock words, all-caps, cliffhangers, "you won\'t believe", manufactured outrage, or a vague teaser.',
  false:
    'The title plainly states what the video contains, even if enthusiastic, or is a neutral name, list, or mix title.',
};

const deepWork: Profile = {
  id: 'deep-work',
  name: 'Deep Work',
  icon: 'lamp',
  strictness: 'balanced',
  clickbait: true,
  hideShorts: true,
  builtin: true,
  categories: [
    c(
      'lofi',
      'Lofi / chillhop',
      'Lofi hip hop, chillhop, or chill beats mixes and radio streams meant for studying or relaxing.',
    ),
    c(
      'classical',
      'Classical',
      'Classical music recordings or compilations: orchestral, piano, chamber, baroque, opera, film-score style concert music.',
    ),
    c(
      'ambient',
      'Ambient & drone',
      'Ambient, drone, space, or soundscape music with no vocals, designed as background atmosphere.',
    ),
    c(
      'study_with_me',
      'Study with me',
      'Long "study with me" or "work with me" sessions, pomodoro timers, or silent co-working streams.',
    ),
    c(
      'nature_sounds',
      'Nature & rain sounds',
      'Rain, thunder, ocean, forest, fireplace, white/brown noise, or other continuous nature and noise recordings.',
    ),
    c(
      'instrumental_jazz',
      'Instrumental jazz',
      'Instrumental jazz, bossa nova, or coffee-shop jazz playlists and mixes without a vocalist in focus.',
    ),
    c(
      'other_music',
      'Other music',
      'Any other music: songs with vocals, pop, rock, hip hop, EDM, music videos, singles, covers, or live concerts.',
      true,
    ),
    c(
      'talk',
      'Talk & spoken',
      'Spoken-word content: podcasts, interviews, vlogs, commentary, tutorials, lectures, or news.',
      true,
    ),
    c(
      'entertainment',
      'Entertainment',
      'Entertainment: gaming, comedy, reactions, challenges, drama, sports, movie clips, trailers, or pranks.',
      true,
    ),
  ],
};

const learning: Profile = {
  id: 'learning',
  name: 'Learning',
  icon: 'book',
  strictness: 'balanced',
  clickbait: true,
  hideShorts: true,
  builtin: true,
  categories: [
    c(
      'tutorial',
      'Tutorials',
      'Step-by-step tutorials or how-to guides teaching a concrete skill, tool, or technique.',
    ),
    c(
      'lecture',
      'Lectures',
      'Recorded university or school lectures, courses, or long-form classes.',
    ),
    c(
      'documentary',
      'Documentaries',
      'Documentaries or long-form investigative pieces about history, science, nature, or society.',
    ),
    c(
      'technical_talk',
      'Technical talks',
      'Conference talks, keynotes, or technical presentations by practitioners or researchers.',
    ),
    c(
      'explainer',
      'Explainers',
      'Explainer videos that break down one concept in science, math, economics, or technology.',
    ),
    c(
      'language',
      'Language learning',
      'Lessons or practice material for learning a foreign language.',
    ),
    c(
      'entertainment',
      'Entertainment',
      'Entertainment made mainly to amuse: comedy, sketches, challenges, vlogs, movie or TV clips.',
      true,
    ),
    c(
      'reaction',
      'Reaction',
      'Reaction videos, where someone watches and reacts to other content.',
      true,
    ),
    c('gaming', 'Gaming', "Gameplay, let's plays, speedruns, game reviews, or esports.", true),
    c(
      'drama',
      'Drama & gossip',
      'Drama, gossip, feuds, callouts, or commentary about influencers and celebrities.',
      true,
    ),
    c('pranks', 'Pranks', 'Pranks, social experiments staged for shock, or stunts.', true),
    c(
      'other',
      'Everything else',
      'Anything else that does not teach: music, news, sports, shopping, lifestyle.',
      true,
    ),
  ],
};

const musicOnly: Profile = {
  id: 'music-only',
  name: 'Music Only',
  icon: 'note',
  strictness: 'balanced',
  clickbait: false,
  hideShorts: true,
  builtin: true,
  categories: [
    c(
      'music',
      'Music',
      'Music of any genre: songs, official music videos, lyric videos, playlists, mixes, radio streams.',
    ),
    c(
      'live_performance',
      'Live performances',
      'Live music performances, concerts, sessions (e.g. Tiny Desk, KEXP), or recitals.',
    ),
    c('album', 'Albums', 'Full albums, EPs, or complete soundtrack uploads.'),
    c(
      'non_music',
      'Non-music',
      'Anything that is not primarily music: talk, vlogs, gaming, news, tutorials, reactions, or music commentary and reviews.',
      true,
    ),
  ],
};

const builder: Profile = {
  id: 'builder',
  name: 'Builder',
  icon: 'wrench',
  strictness: 'balanced',
  clickbait: true,
  hideShorts: true,
  builtin: true,
  categories: [
    c(
      'programming',
      'Programming',
      'Programming, software development, code walkthroughs, or developer tooling.',
    ),
    c(
      'engineering',
      'Engineering',
      'Hardware, electronics, mechanical, or systems engineering and making things.',
    ),
    c(
      'product',
      'Product & design',
      'Product management, UX, or design process for building products.',
    ),
    c(
      'business',
      'Business',
      'Starting or running a business: entrepreneurship, startups, marketing, sales, or finance for founders.',
    ),
    c(
      'conference_talk',
      'Conference talks',
      'Conference talks, keynotes, or meetup presentations on technology or business.',
    ),
    c(
      'entertainment',
      'Entertainment',
      'Entertainment: comedy, sketches, challenges, movie or TV clips, sports, or music.',
      true,
    ),
    c(
      'lifestyle_vlog',
      'Lifestyle vlogs',
      'Lifestyle vlogs: day-in-the-life, travel, fashion, food, routines, or personal updates.',
      true,
    ),
    c('reaction', 'Reaction', 'Reaction videos or commentary on other creators.', true),
    c('gaming', 'Gaming', "Gameplay, let's plays, game reviews, or esports.", true),
    c('other', 'Everything else', 'Anything else unrelated to building things.', true),
  ],
};

const windDown: Profile = {
  id: 'wind-down',
  name: 'Wind Down',
  icon: 'moon',
  strictness: 'balanced',
  clickbait: true,
  hideShorts: true,
  builtin: true,
  categories: [
    c(
      'calm_music',
      'Calm music',
      'Calm, slow, or soft music: acoustic, piano, lofi, ambient, or sleep music.',
    ),
    c(
      'slow_travel',
      'Slow nature & travel',
      'Slow-paced nature, scenic, walking tours, or travel footage with little talking.',
    ),
    c(
      'meditation',
      'Meditation',
      'Guided meditation, breathing exercises, yoga nidra, or sleep stories.',
    ),
    c(
      'long_interview',
      'Long-form interviews',
      'Long-form, calm interviews or conversations (an hour or more) on a thoughtful topic.',
    ),
    c(
      'rage_bait',
      'Rage bait',
      'Content designed to make viewers angry: outrage commentary, hot takes, culture war.',
      true,
    ),
    c('news', 'News', 'News, current events, politics, or breaking-news coverage.', true),
    c('drama', 'Drama', 'Drama, gossip, feuds, or callouts about creators or celebrities.', true),
    c(
      'high_energy_gaming',
      'High-energy gaming',
      'Fast, loud, or competitive gaming: shooters, rage moments, esports, streamer highlights.',
      true,
    ),
    c(
      'other',
      'Everything else',
      'Anything else that is energetic or stimulating: tutorials, vlogs, challenges, sports, reactions.',
      true,
    ),
  ],
};

const kidSafe: Profile = {
  id: 'kid-safe',
  name: 'Kid Safe',
  icon: 'leaf',
  strictness: 'strict',
  clickbait: true,
  hideShorts: true,
  builtin: true,
  categories: [
    c(
      'kids_education',
      'Educational for kids',
      'Educational content made for children: letters, numbers, reading, nursery rhymes, or school topics.',
    ),
    c(
      'kids_animation',
      'Animation for young kids',
      'Animated shows or cartoons made for young children and suitable for all ages.',
    ),
    c(
      'kids_science',
      'Science for kids',
      'Science, nature, animals, or space explained for children.',
    ),
    c(
      'mature',
      'Mature themes',
      'Mature themes: violence, sexual content, strong language, substance use, or disturbing news.',
      true,
    ),
    c('pranks', 'Pranks', 'Pranks, dangerous stunts, or challenges children might copy.', true),
    c(
      'horror',
      'Horror',
      'Horror, scary stories, creepypasta, jump scares, or unsettling characters.',
      true,
    ),
    c('drama', 'Drama', 'Drama, gossip, feuds, or callouts about creators or celebrities.', true),
    c(
      'toy_ads',
      'Unboxing & toy ads',
      'Toy unboxing, surprise eggs, haul, or product videos that function as advertising to kids.',
      true,
    ),
    c(
      'adult_general',
      'General audience',
      'Content made for adults or teens that is not specifically for children, even if harmless.',
      true,
    ),
  ],
};

export const PRESETS: readonly Profile[] = [
  deepWork,
  learning,
  musicOnly,
  builder,
  windDown,
  kidSafe,
];

export const DEFAULT_PROFILE_ID = deepWork.id;

export function allProfiles(custom: readonly Profile[]): Profile[] {
  return [...PRESETS, ...custom];
}

export function findProfile(custom: readonly Profile[], id: string): Profile {
  return allProfiles(custom).find((p) => p.id === id) ?? deepWork;
}

export function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .slice(0, 40);
  return slug || 'category';
}

/**
 * Stable short hash of everything that changes what Jev is asked. Part of the cache key, so
 * editing a profile's categories re-evaluates videos but changing strictness does not.
 */
export function profileFingerprint(p: Profile): string {
  const src = JSON.stringify([p.categories.map((x) => [x.id, x.description]), p.clickbait]);
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function duplicateProfile(p: Profile, existing: readonly Profile[]): Profile {
  let n = 1;
  let id = `${p.id}-copy`;
  const ids = new Set(existing.map((x) => x.id));
  while (ids.has(id)) id = `${p.id}-copy-${++n}`;
  return {
    ...structuredClone(p),
    id,
    name: `${p.name} (copy)`,
    builtin: false,
  };
}
