import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionCost, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { UsageLimits, UsageScan, UsageTokens, UsageWindow } from '../types'
import { BAR_COLORS, buildPills, levelOf, formatPercent, statusText, summaryLine } from './format'
import type { Pill, PillKind } from './format'
import { pillSvg } from './svg'

const limitsAtom = atom({ plugin: 'usage-band', key: 'limits' } as const, null)
const tokensAtom = atom({ plugin: 'usage-band', key: 'tokens' } as const, null)
const fallbackAtom = atom({ plugin: 'usage-band', key: 'fallback' } as const, {
  input: 0,
  cacheWrite: 0,
  output: 0,
  cacheRead: 0,
  requests: 0,
  isEstimate: true,
})
const scanAtom = atom({ plugin: 'usage-band', key: 'scan' } as const, null)
const nowAtom = atom({ plugin: 'usage-band', key: 'now' } as const, 0)
const hiddenAtom = atom({ plugin: 'usage-band', key: 'isHidden' } as const, false)

const COMMAND = 'kullanim'
const TICK_MS = 30_000
const NODES = [
  'node',
  '/usr/local/bin/node',
  '/opt/homebrew/bin/node',
  'C:\\Program Files\\nodejs\\node.exe',
]

/** Cor de destaque de cada pílula no terminal. */
const TERM_COLORS: Record<PillKind, string> = {
  five: '#2bb5a0',
  seven: '#a07be0',
  input: '#e0705f',
  output: '#4fb85a',
  cache: '#5b8fe0',
  cost: '#d4a72c',
}
const TERM_ICONS: Partial<Record<PillKind, string>> = { input: '↑', output: '↓', cache: '≋', cost: '$' }

type Figures = { context: SessionContextUsage; rateLimits: SessionRateLimit[]; cost?: SessionCost }

function windowOf(list: SessionRateLimit[], kind: string): UsageWindow | null {
  const found = list.find(one => one.kind === kind)
  if (found === undefined) return null
  const at = found.resetsAt === undefined ? NaN : Date.parse(found.resetsAt)
  return { percent: found.percentUsed, resetsAt: Number.isFinite(at) ? at : null }
}

function toLimits(f: Figures): UsageLimits {
  return {
    fiveHour: windowOf(f.rateLimits, 'five_hour'),
    sevenDay: windowOf(f.rateLimits, 'seven_day'),
    contextTokens: f.context.tokens ?? null,
    contextWindow: f.context.window,
    contextPercent: f.context.percent ?? null,
    costUsd: f.cost?.usd ?? null,
  }
}

type ScriptOut = UsageScan & Omit<UsageTokens, 'isEstimate'>

/** O que aconteceu na última execução do script (para /kullanim debug). */
let lastScript = 'ainda não rodou'

/** O último pedido de desenho da faixa (para /kullanim debug). */
let lastRender = 'nenhum pedido de desenho ainda'

async function runScript($: EngineInterface, id: string): Promise<ScriptOut | null> {
  const script = `${$.plugin.root}/scripts/tokens.mjs`
  const failures: string[] = []
  for (const node of NODES) {
    let ran
    try {
      ran = await $.process.run([node, script, id], { timeoutMs: 20_000 })
    } catch (err) {
      failures.push(`${node}: ${err instanceof Error ? err.message : String(err)}`)
      continue // este node não existe ou não iniciou: tenta o próximo
    }
    if (ran.exitCode !== 0) {
      lastScript = `${node} saiu com ${ran.exitCode}: ${ran.stderr.trim().slice(0, 300)}`
      return null
    }
    try {
      const out = JSON.parse(ran.stdout) as ScriptOut
      lastScript = `ok com ${node}`
      return out
    } catch {
      lastScript = `${node}: saída não é JSON: ${ran.stdout.slice(0, 200)}`
      return null
    }
  }
  lastScript = `nenhum node iniciou: ${failures.join(' | ').slice(0, 600)}`
  return null
}

let scanning: Promise<void> | null = null

/**
 * Uma contagem por vez. Quem chega durante outra espera ela acabar e conta
 * com o seu próprio `$`: o da outra pode ser de um despacho já encerrado.
 */
async function refreshTokens($: EngineInterface, force = false): Promise<void> {
  while (scanning !== null) await scanning.catch(() => undefined)
  const run = countTokens($, force)
  scanning = run
  try {
    await run
  } finally {
    if (scanning === run) scanning = null
  }
}

async function countTokens($: EngineInterface, force: boolean): Promise<void> {
  const id = await $.session.id()
  const last = await read($, scanAtom)
  if (!force && last !== null && last.file.endsWith(`${id}.jsonl`)) {
    try {
      const st = await $.fs.stat(last.file)
      if (st.size === last.size && st.mtimeMs === last.mtimeMs) return
    } catch {
      // o arquivo sumiu: conta de novo
    }
  }
  const out = await runScript($, id)
  if (out !== null) {
    const { file, size, mtimeMs, input, cacheWrite, output, cacheRead, requests } = out
    await update($, scanAtom, () => ({ file, size, mtimeMs }))
    await update($, tokensAtom, () => ({ input, cacheWrite, output, cacheRead, requests, isEstimate: false }))
    return
  }
  const fallback = await read($, fallbackAtom)
  await update($, tokensAtom, () => (fallback.requests > 0 ? { ...fallback, isEstimate: true } : null))
}

async function refreshAll($: EngineInterface, force = false): Promise<void> {
  const now = await $.clock.now()
  await update($, nowAtom, () => now)
  const usage = await $.session.usage()
  await update($, limitsAtom, () => toLimits(usage))
  await refreshTokens($, force)
  await showStatus($)
}

/** Sem tela para desenhar a faixa (sessão na nuvem), fixa um resumo na linha de status. */
async function showStatus($: EngineInterface): Promise<void> {
  try {
    const hasSurface = (await $.session.surfaces()).length > 0
    $.ui.status(hasSurface ? undefined : statusText(await read($, limitsAtom), await read($, nowAtom)))
  } catch {
    // a linha de status é um extra: sem ela a faixa e o /kullanim seguem iguais
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Atualiza a faixa de uso e mostra um resumo (gizle: ocultar, goster: mostrar)',
      argumentHint: '[gizle|goster|debug]',
    })
    $.clock.every(TICK_MS, () => void refreshAll($).catch(() => undefined))
    void refreshAll($).catch(() => undefined)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, limitsAtom, () => toLimits(e))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const usage = e.usage
    if (usage !== undefined) {
      await update($, fallbackAtom, fb => ({
        input: fb.input + usage.input_tokens,
        cacheWrite: fb.cacheWrite + usage.cache_creation_input_tokens,
        output: fb.output + usage.output_tokens,
        cacheRead: fb.cacheRead + usage.cache_read_input_tokens,
        requests: fb.requests + 1,
        isEstimate: true,
      }))
    }
    const ran = await next(e)
    void refreshAll($).catch(() => undefined)
    return ran
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'gizle' || arg === 'ocultar') {
      await update($, hiddenAtom, () => true)
      return { text: 'Faixa de uso oculta. Use /kullanim goster para mostrá-la de novo.' }
    }
    if (arg === 'goster' || arg === 'göster' || arg === 'mostrar') {
      await update($, hiddenAtom, () => false)
    }
    if (arg === 'debug') {
      let refreshError = 'nenhum'
      try {
        await refreshAll($, true)
      } catch (err) {
        refreshError = err instanceof Error ? err.message : String(err)
      }
      const usage = await $.session.usage().catch(err => `erro: ${String(err)}`)
      const report = {
        versao: (await $.session.version()).version,
        superficies: await $.session.surfaces(),
        sessao: await $.session.id(),
        pasta: $.plugin.root,
        erroAoAtualizar: refreshError,
        script: lastScript,
        desenho: lastRender,
        usage,
        limits: await read($, limitsAtom),
        tokens: await read($, tokensAtom),
        fallback: await read($, fallbackAtom),
        oculta: await read($, hiddenAtom),
      }
      return { text: '```json\n' + JSON.stringify(report, null, 2) + '\n```' }
    }
    await refreshAll($, true)
    const text = summaryLine(await read($, limitsAtom), await read($, tokensAtom), await read($, nowAtom))
    return { text }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, hiddenAtom))) {
      lastRender = `${e.surface}: oculta (pesquisa ou /kullanim gizle)`
      return next(e)
    }

    const groups = buildPills(await read($, limitsAtom), await read($, tokensAtom), await read($, nowAtom))
    lastRender = `${e.surface}: ${groups.flat().length} pílulas`
    if (groups.length === 0) return next(e)

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
          {groups.map((group, g) => (
            <Box key={`g${g}`} flexDirection="row" columnGap={2}>
              {group.map(pill => terminalPill(Text, pill))}
            </Box>
          ))}
        </Box>
      )
    }

    if (e.surface === 'desktop' || e.surface === 'vscode' || e.surface === 'mobile') {
      const { Box, Svg } = $.ui.resolve(e)
      return (
        <Box flexDirection="row" flexWrap="wrap" columnGap={2} alignItems="center">
          {groups.map((group, g) => (
            <Box key={`g${g}`} flexDirection="row" flexWrap="wrap" columnGap={1}>
              {group.map(pill => {
                const svg = pillSvg(pill)
                return (
                  <Svg
                    source={svg.source}
                    alt={svg.alt}
                    width={svg.width}
                    height={svg.height}
                    isInteractive={true}
                  />
                )
              })}
            </Box>
          ))}
        </Box>
      )
    }

    return next(e)
  })
}

type TextCtor = ReturnType<EngineInterface['ui']['resolve']>['Text']

/** Barra de 10 células: █ preenchido, ░ vazio, │ onde a janela está. */
function barRuns(percent: number, elapsed: number | null): { text: string; color: string }[] {
  const cells = 10
  const filled = Math.round(Math.max(0, Math.min(100, percent)) / 10)
  const mark = elapsed === null ? -1 : Math.min(cells - 1, Math.floor(elapsed * cells))
  const color = BAR_COLORS[levelOf(percent)]
  const runs: { text: string; color: string }[] = []
  for (let i = 0; i < cells; i++) {
    const cell = i === mark ? { text: '│', color: '#d0d0d0' } : i < filled ? { text: '█', color } : { text: '░', color: '#6b6b6b' }
    const prev = runs[runs.length - 1]
    if (prev !== undefined && prev.color === cell.color && cell.text !== '│' && !prev.text.endsWith('│')) {
      prev.text += cell.text
    } else {
      runs.push({ ...cell })
    }
  }
  return runs
}

function terminalPill(Text: TextCtor, pill: Pill) {
  const color = TERM_COLORS[pill.kind]
  if (pill.shape === 'window') {
    return (
      <Text>
        <Text color={color} bold>
          {pill.label}{' '}
        </Text>
        {barRuns(pill.percent, pill.elapsed).map(run => (
          <Text color={run.color}>{run.text}</Text>
        ))}
        <Text bold> {formatPercent(pill.percent)}</Text>
        {pill.left !== null && <Text dimColor> · {pill.left}</Text>}
      </Text>
    )
  }
  return (
    <Text>
      <Text color={color}>{TERM_ICONS[pill.kind] ?? ''} </Text>
      <Text color={color} bold={pill.kind === 'cost'}>
        {pill.value}
      </Text>
    </Text>
  )
}
