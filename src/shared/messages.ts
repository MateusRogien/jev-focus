import type { Classification, Decision, Profile, SurfaceId, VideoMeta } from './types';

/** Non-secret config the content script needs. Never includes the API key. */
export interface ContentConfig {
  enabled: boolean;
  profileKey: string;
  profileName: string;
  surfaces: Record<SurfaceId, boolean>;
  hideShorts: boolean;
  showPill: boolean;
  /** Whether a key is set; flipping it retries cards held by fail-closed. */
  hasKey: boolean;
  failOpen: boolean;
}

export type Request =
  | { type: 'getConfig' }
  | { type: 'classify'; profileKey: string; videos: VideoMeta[] }
  | { type: 'testConnection' }
  | { type: 'testProfile'; profile: Profile; title: string; channel: string }
  | { type: 'clearCache' }
  | { type: 'cacheSize' }
  | { type: 'openPopup' };

export interface ClassifyResponse {
  profileKey: string;
  decisions: Decision[];
  /** True when some videos failed and were decided by the failure mode. */
  degraded: boolean;
}

export interface TestConnectionResponse {
  ok: boolean;
  latencyMs?: number;
  error?: string;
  model?: string;
}

export interface TestProfileResponse {
  ok: boolean;
  error?: string;
  classification?: Classification;
  verdict?: 'allow' | 'block';
  latencyMs?: number;
}

/** Sent from the popup to the active tab's content script. */
export type TabRequest = { type: 'pageStats' };

export interface PageStats {
  hidden: number;
  profileName: string;
}
