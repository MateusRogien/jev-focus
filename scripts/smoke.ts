/*
 * Real-API smoke test. Never committed with a key; reads it from the environment.
 *
 *   JEV_API_KEY=... [JEV_PROVIDER=typesafe|openrouter|nanogpt] [JEV_MODEL=...] npm run smoke
 *
 * Sends one realistic 24-video home-feed batch through the same batching and decision code
 * the extension uses, then prints latency, token usage, and every verdict.
 */
import { callJev } from '../src/api/jev';
import { PROVIDERS } from '../src/api/providers';
import { buildBatches, readBatch } from '../src/background/batch';
import { blockedMass, decide } from '../src/shared/decision';
import { PRESETS } from '../src/shared/profiles';
import type { ProviderId, VideoMeta } from '../src/shared/types';

const key = process.env.JEV_API_KEY ?? '';
const providerId = (process.env.JEV_PROVIDER ?? 'typesafe') as ProviderId;
const adapter = PROVIDERS[providerId];
if (!key || !adapter) {
  console.error('Set JEV_API_KEY (and optionally JEV_PROVIDER, JEV_MODEL, JEV_PROFILE).');
  process.exit(2);
}
const model = process.env.JEV_MODEL ?? adapter.defaultModel;
const profile = PRESETS.find((p) => p.id === (process.env.JEV_PROFILE ?? 'deep-work'))!;

const feed: Array<[string, string, string, string[]?]> = [
  ['lofi hip hop radio 📚 beats to relax/study to', 'Lofi Girl', '', ['LIVE']],
  ['Bach - Cello Suite No.1 in G major, Prélude (Yo-Yo Ma)', 'Yo-Yo Ma', '2:32'],
  ['3 Hours of Deep Focus Ambient Music for Studying', 'Yellow Brick Cinema', '3:00:12'],
  ['Study With Me 4 Hours | Pomodoro 50/10 | Rain Sounds', 'Merve', '4:02:11'],
  ['Heavy Rain on a Tin Roof for Sleeping — 10 Hours', 'Relaxing Ambience ASMR', '10:00:00'],
  [
    'Coffee Shop Jazz Piano | Smooth Instrumental Jazz Playlist',
    'Cafe Music BGM channel',
    '11:54:30',
  ],
  ['I Spent 50 Hours Buried Alive', 'MrBeast', '12:21'],
  ['Why Everyone Is Wrong About Rust (Honest Reaction)', 'ThePrimeTime', '24:10'],
  ['Minecraft Hardcore Day 100 FINALE!!!', 'Forge Labs', '41:02'],
  ['The Weeknd - Blinding Lights (Official Video)', 'TheWeekndVEVO', '4:22'],
  ['Joe Rogan Experience #2201 - Neil deGrasse Tyson', 'PowerfulJRE', '2:41:33'],
  ['Breaking: Markets Plunge as Fed Holds Rates', 'CNBC Television', '8:14'],
  ["You Won't BELIEVE What Happened Next… 😱", 'Daily Dose Of Internet', '5:01'],
  ['Brian Eno - Music For Airports (Full Album)', 'Brian Eno', '48:02'],
  ['Chopin - Nocturnes (Complete) | Classical Piano', 'Halidon Music', '1:52:10'],
  ['Deep Space Drone — Interstellar Ambient for Focus', 'Cryo Chamber', '2:00:00'],
  ['Learn TypeScript in 1 Hour', 'Programming with Mosh', '1:02:15'],
  ['Top 10 Most Shocking Celebrity Feuds of 2026', 'WatchMojo.com', '13:44'],
  ['Forest Birdsong & Stream — Nature Sounds, No Music', 'Nature Soundscapes', '3:11:45'],
  ['chillhop essentials · fall 2026', 'Chillhop Music', '1:40:22'],
  ['iPhone 18 Pro Unboxing: THE TRUTH', 'Unbox Therapy', '9:48'],
  ['Stardew Valley but I can only eat fish', 'Hat Films', '32:10'],
  ['Night Jazz Lounge — Slow Saxophone for Work', 'Relax Jazz Cafe', '', ['LIVE']],
  ['This Video Will Make You ANGRY', 'Veritasium', '17:20'],
];

const videos: VideoMeta[] = feed.map(([title, channel, duration, badges], i) => ({
  id: `v${i}`,
  title,
  channel,
  duration,
  badges: badges ?? [],
}));

const batches = buildBatches(videos, profile);
console.log(
  `provider=${providerId} model=${model} profile=${profile.id} videos=${videos.length} requests=${batches.length}`,
);

let tokens = 0;
let estimated = 0;
for (const batch of batches) {
  const { response, latencyMs } = await callJev(batch.request, {
    adapter,
    baseUrl: process.env.JEV_BASE_URL ?? adapter.defaultBaseUrl,
    model,
    key,
    timeoutMs: 15_000,
  });
  tokens += response.inputTokens ?? 0;
  estimated += batch.estimatedTokens;
  console.log(
    `request: ${Object.keys(batch.request.questions).length} questions, ${latencyMs} ms, ` +
      `input_tokens=${response.inputTokens ?? 'n/a'} (estimated ${batch.estimatedTokens}), model=${response.model ?? '?'}`,
  );
  const out = readBatch(batch, response);
  for (const id of batch.videoIds) {
    const v = videos.find((x) => x.id === id)!;
    const c = out.get(id);
    if (!c) {
      console.log(`  ??    ${v.title}  (no answer)`);
      continue;
    }
    const top = Object.entries(c.probabilities).sort((a, b) => b[1] - a[1])[0]!;
    console.log(
      `  ${decide(profile, c) === 'block' ? 'BLOCK' : 'allow'} ` +
        `blocked=${blockedMass(profile, c.probabilities).toFixed(2)} ` +
        `clickbait=${c.clickbait?.toFixed(2) ?? '—'} top=${top[0]}:${top[1].toFixed(2)}  ${v.title}`,
    );
  }
}
const perVideo = (tokens || estimated) / videos.length;
console.log(`\ntokens/video: ${perVideo.toFixed(1)} (${tokens ? 'reported' : 'estimated'})`);
console.log(
  `cost per 1,000 videos: $${((perVideo * 1000 * adapter.inputPricePerMTok) / 1e6).toFixed(5)}`,
);
