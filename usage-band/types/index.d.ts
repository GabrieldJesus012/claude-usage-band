/** Uma janela de limite: percentual usado e momento do reinício (epoch ms). */
export type UsageWindow = { percent: number; resetsAt: number | null }

/** Valores lidos de $.session.usage() / session.measure. */
export type UsageLimits = {
  fiveHour: UsageWindow | null
  sevenDay: UsageWindow | null
  contextTokens: number | null
  contextWindow: number
  contextPercent: number | null
  costUsd: number | null
}

/** Totais de tokens; isEstimate indica que vêm do fallback de turn.complete. */
export type UsageTokens = {
  input: number
  cacheWrite: number
  output: number
  cacheRead: number
  requests: number
  isEstimate: boolean
}

/** Estado da transcrição na última contagem. */
export type UsageScan = { file: string; size: number; mtimeMs: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': {
      limits: UsageLimits | null
      tokens: UsageTokens | null
      fallback: UsageTokens
      scan: UsageScan | null
      now: number
      isHidden: boolean
    }
  }
}
