import type { UsageLimits, UsageTokens, UsageWindow } from '../types'

export const FIVE_HOURS = 5 * 3600_000
export const SEVEN_DAYS = 7 * 86400_000

/** 15.6k, 954.2k, 1.25M */
export function formatCount(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

/** 2h 40m, 1d 7h, 12m */
export function formatLeft(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function formatPercent(p: number): string {
  return `${Math.round(p)}%`
}

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`
}

/** Parte decorrida da janela: 1 − restante / janela, 0..1. */
export function elapsedShare(win: UsageWindow, length: number, now: number): number | null {
  if (win.resetsAt === null) return null
  const left = win.resetsAt - now
  return Math.min(1, Math.max(0, 1 - left / length))
}

export type Level = 'ok' | 'warn' | 'high'

export function levelOf(percent: number): Level {
  if (percent >= 90) return 'high'
  if (percent >= 70) return 'warn'
  return 'ok'
}

export const BAR_COLORS: Record<Level, string> = { ok: '#2fa44f', warn: '#d4a20a', high: '#d9443a' }

export type PillKind = 'five' | 'seven' | 'input' | 'output' | 'cache' | 'cost'

/** Conteúdo de uma pílula, independente da superfície. */
export type Pill =
  | {
      shape: 'window'
      kind: 'five' | 'seven'
      label: string
      percent: number
      elapsed: number | null
      left: string | null
      tip: string
    }
  | { shape: 'value'; kind: 'input' | 'output' | 'cache' | 'cost'; value: string; tip: string }

function clockOf(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function windowPill(
  kind: 'five' | 'seven',
  label: string,
  title: string,
  win: UsageWindow,
  length: number,
  now: number,
): Pill {
  const elapsed = elapsedShare(win, length, now)
  const left = win.resetsAt === null ? null : formatLeft(win.resetsAt - now)
  const lines = [`${title}: ${Math.round(win.percent)}% usado`]
  if (win.resetsAt !== null) {
    lines.push(`Reinicia em ${left} (${clockOf(win.resetsAt)})`)
  }
  if (elapsed !== null) lines.push(`${Math.round(elapsed * 100)}% da janela já passou`)
  return { shape: 'window', kind, label, percent: win.percent, elapsed, left, tip: lines.join('\n') }
}

/** Grupos: [5h 7d] [entrada saída cache] [custo]; grupo vazio é omitido. */
export function buildPills(
  limits: UsageLimits | null,
  tokens: UsageTokens | null,
  now: number,
): Pill[][] {
  const groups: Pill[][] = []
  const windows: Pill[] = []
  if (limits?.fiveHour) {
    windows.push(windowPill('five', '5h', 'Limite de 5 horas', limits.fiveHour, FIVE_HOURS, now))
  }
  if (limits?.sevenDay) {
    windows.push(windowPill('seven', '7d', 'Limite de 7 dias', limits.sevenDay, SEVEN_DAYS, now))
  }
  if (windows.length > 0) groups.push(windows)

  if (tokens !== null && tokens.requests > 0) {
    const est = tokens.isEstimate ? '~' : ''
    const note = tokens.isEstimate ? '\n(aproximado: transcrição ilegível, soma dos turnos)' : ''
    const ctx =
      limits?.contextTokens != null
        ? `\nContexto: ${formatCount(limits.contextTokens)} / ${formatCount(limits.contextWindow)}` +
          (limits.contextPercent != null ? ` (${Math.round(limits.contextPercent)}%)` : '')
        : ''
    const reqs = `\nRequisições: ${tokens.requests}`
    const input = tokens.input + tokens.cacheWrite
    groups.push([
      {
        shape: 'value',
        kind: 'input',
        value: est + formatCount(input),
        tip:
          `Entrada: ${formatCount(input)}\n  sem cache: ${formatCount(tokens.input)}` +
          `\n  gravado no cache: ${formatCount(tokens.cacheWrite)}${ctx}${reqs}${note}`,
      },
      {
        shape: 'value',
        kind: 'output',
        value: est + formatCount(tokens.output),
        tip: `Saída: ${formatCount(tokens.output)}${ctx}${reqs}${note}`,
      },
      {
        shape: 'value',
        kind: 'cache',
        value: est + formatCount(tokens.cacheRead),
        tip: `Lido do cache: ${formatCount(tokens.cacheRead)}${ctx}${reqs}${note}`,
      },
    ])
  }

  if (limits?.costUsd != null && (limits.costUsd > 0 || groups.length > 0)) {
    groups.push([
      {
        shape: 'value',
        kind: 'cost',
        value: formatUsd(limits.costUsd),
        tip: `Custo da sessão: ${formatUsd(limits.costUsd)}\nPelo preço de tabela da API; não é o valor cobrado na assinatura.`,
      },
    ])
  }
  return groups
}

/** Resumo de uma linha (/kullanim). */
export function summaryLine(limits: UsageLimits | null, tokens: UsageTokens | null, now: number): string {
  const parts: string[] = []
  const win = (label: string, w: UsageWindow | null | undefined) => {
    if (!w) return
    const left = w.resetsAt === null ? '' : ` (faltam ${formatLeft(w.resetsAt - now)})`
    parts.push(`${label} ${formatPercent(w.percent)}${left}`)
  }
  win('5h', limits?.fiveHour)
  win('7d', limits?.sevenDay)
  if (tokens !== null && tokens.requests > 0) {
    const est = tokens.isEstimate ? '~' : ''
    parts.push(
      `entrada ${est}${formatCount(tokens.input + tokens.cacheWrite)}`,
      `saída ${est}${formatCount(tokens.output)}`,
      `cache ${est}${formatCount(tokens.cacheRead)}`,
    )
  }
  if (limits?.costUsd != null) parts.push(`custo ${formatUsd(limits.costUsd)}`)
  return parts.length > 0 ? parts.join(' · ') : 'Ainda não há dados de uso.'
}
