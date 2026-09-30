import type { Classification, Profile, Strictness, Verdict } from './types';

/**
 * Probability mass on blocked categories at or above which a video is hidden. Lower is
 * stricter. Balanced sits at 0.5: hide when Jev thinks "blocked" is more likely than not.
 */
export const BLOCK_THRESHOLD: Record<Strictness, number> = {
  relaxed: 0.75,
  balanced: 0.5,
  strict: 0.3,
};

/**
 * Clickbait probability at or above which a video is hidden. Kept higher than the category
 * threshold: an honest-but-excited title shouldn't lose a video the user actually wants.
 */
export const CLICKBAIT_THRESHOLD: Record<Strictness, number> = {
  relaxed: 0.85,
  balanced: 0.7,
  strict: 0.55,
};

export function blockedMass(profile: Profile, probabilities: Record<string, number>): number {
  let blocked = 0;
  let total = 0;
  for (const cat of profile.categories) {
    const p = probabilities[cat.id] ?? 0;
    total += p;
    if (cat.blocked) blocked += p;
  }
  // Renormalise: probabilities should sum to 1, but don't trust it.
  return total > 0 ? blocked / total : 0;
}

export function decide(profile: Profile, c: Classification): Verdict {
  if (blockedMass(profile, c.probabilities) >= BLOCK_THRESHOLD[profile.strictness]) return 'block';
  if (
    profile.clickbait &&
    c.clickbait !== undefined &&
    c.clickbait >= CLICKBAIT_THRESHOLD[profile.strictness]
  ) {
    return 'block';
  }
  return 'allow';
}

export function normaliseChannel(name: string): string {
  return name.trim().replace(/^@/, '').toLowerCase();
}

/** Local pre-pass. Returns a verdict if a channel list decides it, else undefined. */
export function channelVerdict(
  channel: string,
  allow: readonly string[],
  block: readonly string[],
): Verdict | undefined {
  if (!channel) return undefined;
  const n = normaliseChannel(channel);
  if (block.some((b) => normaliseChannel(b) === n)) return 'block';
  if (allow.some((a) => normaliseChannel(a) === n)) return 'allow';
  return undefined;
}
