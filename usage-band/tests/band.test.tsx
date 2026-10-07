import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { buildPills, formatCount, formatLeft } from '../hooks/format'
import { pillSvg } from '../hooks/svg'

const T0 = Date.UTC(2026, 9, 3, 12, 0, 0)
const MIN = 60_000

const USAGE = {
  startedAt: T0 - 3600_000,
  context: { tokens: 45_200, window: 200_000, percent: 23 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 20, resetsAt: new Date(T0 + 160 * MIN).toISOString() },
    { kind: 'seven_day', percentUsed: 58, resetsAt: new Date(T0 + (24 * 60 + 7 * 60) * MIN).toISOString() },
  ],
  cost: { usd: 4.32 },
}

const SCRIPT = {
  file: '/home/u/.claude/projects/p/s1.jsonl',
  size: 100,
  mtimeMs: 5,
  input: 600,
  cacheWrite: 15_000,
  output: 3_000,
  cacheRead: 954_200,
  requests: 12,
  subagents: 0,
}

const statuses: (string | undefined)[] = []

function world(on: On, opts: { scriptWorks: boolean; surfaces?: ('terminal' | 'desktop')[] }) {
  mock.clock(on, { now: T0 })
  on('session.usage', () => ({ value: USAGE }))
  on('session.id', () => ({ value: 's1' }))
  on('fs.stat', () => ({ value: { kind: 'file' as const, size: 1, mtimeMs: 1, isLink: false } }))
  on('session.surfaces', () => ({ value: opts.surfaces ?? ['desktop' as const] }))
  on('ui.status', (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('command.register', () => ({ value: { command: 'kullanim' } }))
  on('process.run', () => ({
    value: opts.scriptWorks
      ? { exitCode: 0, stdout: JSON.stringify(SCRIPT), stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
      : { exitCode: 1, stdout: '', stderr: 'x', isStdoutTruncated: false, isStderrTruncated: false },
  }))
}

const BAND = {
  plugin: 'usage-band',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const RUN = {
  command: 'kullanim',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const

describe('formatação', () => {
  test('números e tempos', () => {
    expect(formatCount(15_600)).toBe('15.6k')
    expect(formatCount(954_200)).toBe('954.2k')
    expect(formatCount(1_250_000)).toBe('1.25M')
    expect(formatLeft(160 * MIN)).toBe('2h 40m')
    expect(formatLeft(31 * 60 * MIN)).toBe('1d 7h')
  })

  test('svg tem dica, tema escuro e marcador', () => {
    const groups = buildPills(
      {
        fiveHour: { percent: 20, resetsAt: T0 + 160 * MIN },
        sevenDay: null,
        contextTokens: null,
        contextWindow: 200_000,
        contextPercent: null,
        costUsd: 4.32,
      },
      null,
      T0,
    )
    expect(groups).toHaveLength(2)
    const five = groups[0]?.[0]
    if (five === undefined) throw new Error('sem pílula')
    const svg = pillSvg(five)
    expect(svg.source).toContain('<title>')
    expect(svg.source).toContain('prefers-color-scheme: dark')
    expect(svg.source).toContain('class="mk"')
    expect(svg.source).toContain('2h 40m')
  })
})

test('a faixa desenha as pílulas no terminal e no desktop', async ($, on) => {
  world(on, { scriptWorks: true })
  const done = await $.command.run({ ...RUN, args: '' })
  expect(done.text).toContain('5h 20%')
  expect(done.text).toContain('custo $4.32')

  const term = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await term.find({ type: 'Text', text: /20%/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: '954.2k' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: '15.6k' })).toBeDefined()

  const desk = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svgs = await desk.findAll({ type: 'Svg' })
  expect(svgs).toHaveLength(6)
  expect(String(svgs[5]?.props.source)).toContain('preço de tabela da API')
})

test('sem o script usa o fallback com ~', async ($, on) => {
  world(on, { scriptWorks: false })
  on('turn.complete', () => ({ text: '' }))
  await $.command.run({ ...RUN, args: '' })
  await $.turn.complete({
    answer: '',
    durationMs: 1,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: { input_tokens: 10, cache_creation_input_tokens: 2000, output_tokens: 300, cache_read_input_tokens: 5000, model: 'm' },
  })
  const done = await $.command.run({ ...RUN, args: '' })
  expect(done.text).toContain('entrada ~2.0k')
})

test('gizle oculta e goster mostra', async ($, on) => {
  world(on, { scriptWorks: true })
  await $.command.run({ ...RUN, args: 'gizle' })
  const hidden = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await hidden.findAll({ type: 'Svg' })).toHaveLength(0)
  await $.command.run({ ...RUN, args: 'goster' })
  const shown = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await shown.findAll({ type: 'Svg' })).toHaveLength(6)
})

test('sem tela, o resumo vai para a linha de status; com tela, ela é limpa', async ($, on) => {
  world(on, { scriptWorks: true, surfaces: [] })
  statuses.length = 0
  await $.command.run({ ...RUN, args: '' })
  expect(statuses.at(-1)).toBe('5h 20% 2h 40m · 7d 58% 1d 7h · $4.32')
})

test('com tela a linha de status fica vazia', async ($, on) => {
  world(on, { scriptWorks: true, surfaces: ['desktop'] })
  statuses.length = 0
  await $.command.run({ ...RUN, args: '' })
  expect(statuses.at(-1)).toBeUndefined()
})
