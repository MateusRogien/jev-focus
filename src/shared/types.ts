export type ProviderId = 'typesafe' | 'openrouter' | 'nanogpt';

export type Strictness = 'relaxed' | 'balanced' | 'strict';

export type FailMode = 'closed' | 'open';

export type SurfaceId = 'home' | 'watch' | 'endscreen' | 'shorts' | 'search' | 'subscriptions';

export type ProfileIcon = 'lamp' | 'book' | 'note' | 'wrench' | 'moon' | 'leaf' | 'circle';

export interface Category {
  /** Stable option key sent to Jev. snake_case, unique within a profile. */
  id: string;
  label: string;
  /** One line. Sent verbatim as the Jev choice criterion for this option. */
  description: string;
  blocked: boolean;
}

export interface Profile {
  id: string;
  name: string;
  icon: ProfileIcon;
  strictness: Strictness;
  categories: Category[];
  /** Ask Jev whether the title is clickbait, and block if so. */
  clickbait: boolean;
  /** Hide every Short without classifying it. */
  hideShorts: boolean;
  /** Presets ship in code and can be duplicated but not edited. */
  builtin?: boolean;
}

export interface ProviderConfig {
  baseUrl: string;
  model: string;
}

export interface Settings {
  enabled: boolean;
  provider: ProviderId;
  providers: Record<ProviderId, ProviderConfig>;
  activeProfileId: string;
  /** User-created profiles. Presets are merged in at read time. */
  customProfiles: Profile[];
  /** Strictness chosen for a preset, which is otherwise read-only. */
  strictnessOverrides: Record<string, Strictness>;
  surfaces: Record<SurfaceId, boolean>;
  hideShortsEverywhere: boolean;
  failMode: FailMode;
  channelAllow: string[];
  channelBlock: string[];
  showPill: boolean;
}

/** What the content script extracts from one card. Nothing else leaves the page. */
export interface VideoMeta {
  id: string;
  title: string;
  channel: string;
  duration: string;
  badges: string[];
}

export type Verdict = 'allow' | 'block';

export type DecisionSource = 'cache' | 'jev' | 'channel-list' | 'fail-open' | 'fail-closed';

export interface Decision {
  id: string;
  verdict: Verdict;
  source: DecisionSource;
}

/** Raw Jev output for one video, cached so strictness changes need no new call. */
export interface Classification {
  probabilities: Record<string, number>;
  /** Probability that the title is clickbait; absent when the profile skips that check. */
  clickbait?: number;
}

export type ApiErrorKind =
  | 'no-key'
  | 'auth'
  | 'rate-limit'
  | 'network'
  | 'timeout'
  | 'server'
  | 'bad-request'
  | 'bad-response';

export interface ApiStatus {
  state: 'ok' | 'error' | 'idle';
  error?: ApiErrorKind;
  httpStatus?: number;
  latencyMs?: number;
  /** Epoch ms until which calls are paused after a 429. */
  backoffUntil?: number;
  at: number;
}

export interface DailyStats {
  day: string;
  hidden: number;
  apiCalls: number;
  inputTokens: number;
}
