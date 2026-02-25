export interface UsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  cachedContentTokenCount?: number;
  totalTokenCount: number;
}

export interface ModelLimits {
  tier: '128k' | '1M' | '2M';
  maxTokens: number;
}

export const PLAN_LIMITS: Record<string, ModelLimits> = {
  'gemini-1.5-flash': { tier: '1M', maxTokens: 1048576 },
  'gemini-1.5-pro': { tier: '2M', maxTokens: 2097152 },
  'default': { tier: '128k', maxTokens: 131072 } 
};

export interface TokenEvent {
  type: 'TOKEN_UPDATE';
  data: UsageMetadata;
  source: 'network' | 'fallback_estimate';
}
