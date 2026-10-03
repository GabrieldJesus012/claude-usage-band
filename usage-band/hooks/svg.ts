import { BAR_COLORS, formatPercent, levelOf } from './format'
import type { Pill, PillKind } from './format'

/** Cores por pílula: [fundo claro, texto claro, fundo escuro, texto escuro]. */
const THEMES: Record<PillKind, [string, string, string, string]> = {
  five: ['#d3f3ec', '#0b4f45', '#123a33', '#9be8d8'],
  seven: ['#ebe3fb', '#4b2a86', '#2c2245', '#d4c2f7'],
  input: ['#fbe1de', '#8a2a1f', '#41201c', '#f4b3a9'],
  output: ['#dcf3dc', '#1e5b23', '#1c3820', '#a8e2ac'],
  cache: ['#dde9fb', '#1d4380', '#1a2b45', '#a9c6f4'],
  cost: ['#fbefc9', '#6e5106', '#3d3214', '#f1d27a'],
}

const DARK_BARS = { ok: '#45c46a', warn: '#e8b92c', high: '#f0625a' }

const ICONS: Record<string, string> = {
  gauge: '<path d="M1.5 9.5a4.5 4.5 0 0 1 9 0"/><path d="M6 9.5 8.4 6.1"/>',
  calendar: '<rect x="1.5" y="2.5" width="9" height="8" rx="1.5"/><path d="M1.5 5.2h9M4 1v2.6M8 1v2.6"/>',
  timer: '<circle cx="6" cy="6.8" r="4.3"/><path d="M6 6.8V4.4M4.8 1h2.4"/>',
  up: '<path d="M6 10.8V1.6M2.6 5 6 1.6 9.4 5"/>',
  down: '<path d="M6 1.2v9.2M2.6 7 6 10.4 9.4 7"/>',
  layers: '<path d="M6 1.4 10.6 3.9 6 6.4 1.4 3.9Z"/><path d="M1.4 6.4 6 8.9 10.6 6.4"/><path d="M1.4 8.7 6 11.2 10.6 8.7"/>',
  dollar:
    '<path d="M8.6 3.4C8.1 2.6 7.2 2.1 6 2.1 4.6 2.1 3.5 2.9 3.5 4s1.1 1.6 2.5 1.9 2.5.9 2.5 2.1-1.1 2-2.5 2c-1.2 0-2.1-.5-2.6-1.4M6 .8v10.4"/>',
}

const KIND_ICON: Record<PillKind, string> = {
  five: 'gauge',
  seven: 'calendar',
  input: 'up',
  output: 'down',
  cache: 'layers',
  cost: 'dollar',
}

const FONT = 12
const CHAR = 7.23
const H = 22
const PAD = 9
const ICON = 12
const BAR_W = 40
const BAR_H = 5

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const textW = (s: string) => Math.ceil(s.length * CHAR)

function icon(name: string, x: number, size = ICON): string {
  const k = size / 12
  return `<g class="ic" transform="translate(${x} ${(H - size) / 2}) scale(${k})">${ICONS[name] ?? ''}</g>`
}

function text(s: string, x: number, bold = false): string {
  return `<text x="${x}" y="${H / 2}" dominant-baseline="central"${bold ? ' class="b"' : ''}>${esc(s)}</text>`
}

/** CSS da pílula, com seletores sob `.k-<tipo>` para não colidir com outra. */
function style(kind: PillKind): string {
  const [bg, fg, dbg, dfg] = THEMES[kind]
  const k = `.k-${kind}`
  return (
    `<style>` +
    // No quadro do app: color-scheme igual ao da página deixa o fundo transparente
    // (sem cantos brancos), e sem margem o desenho não se desloca
    `:root,html,body{color-scheme:light dark;background:transparent!important;margin:0;padding:0;overflow:hidden}` +
    `svg{display:block;-webkit-user-select:none;user-select:none;cursor:default}` +
    `${k} .p{color:${fg}}${k} .bg{fill:${bg}}` +
    `${k} text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:${FONT}px;fill:currentColor}` +
    `${k} .b{font-weight:700}${k} .tr{fill:currentColor;opacity:.18}${k} .sep{stroke:currentColor;opacity:.35}` +
    `${k} .ic{fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}` +
    `${k} .mk{stroke:currentColor;stroke-width:1.5;stroke-linecap:round}` +
    `${k} .ok{fill:${BAR_COLORS.ok}}${k} .warn{fill:${BAR_COLORS.warn}}${k} .high{fill:${BAR_COLORS.high}}` +
    `@media (prefers-color-scheme: dark){${k} .p{color:${dfg}}${k} .bg{fill:${dbg}}` +
    `${k} .ok{fill:${DARK_BARS.ok}}${k} .warn{fill:${DARK_BARS.warn}}${k} .high{fill:${DARK_BARS.high}}}` +
    `</style>`
  )
}

export type PillSvg = { source: string; width: number; height: number; alt: string }

/** O SVG de uma pílula, com <title> como dica e cores por tema. */
export function pillSvg(pill: Pill): PillSvg {
  const parts: string[] = []
  let x = PAD
  parts.push(icon(KIND_ICON[pill.kind], x))
  x += ICON + 5

  if (pill.shape === 'window') {
    parts.push(text(pill.label, x))
    x += textW(pill.label) + 6
    const y = (H - BAR_H) / 2
    const fill = Math.max(0, Math.min(1, pill.percent / 100)) * BAR_W
    parts.push(`<rect class="tr" x="${x}" y="${y}" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/>`)
    if (fill > 0) {
      parts.push(
        `<rect class="${levelOf(pill.percent)}" x="${x}" y="${y}" width="${fill.toFixed(1)}" height="${BAR_H}" rx="${BAR_H / 2}"/>`,
      )
    }
    if (pill.elapsed !== null) {
      const mx = (x + pill.elapsed * BAR_W).toFixed(1)
      parts.push(`<line class="mk" x1="${mx}" x2="${mx}" y1="${y - 3}" y2="${y + BAR_H + 3}"/>`)
    }
    x += BAR_W + 6
    const pct = formatPercent(pill.percent)
    parts.push(text(pct, x, true))
    x += textW(pct)
    if (pill.left !== null) {
      x += 7
      parts.push(`<line class="sep" x1="${x}" x2="${x}" y1="5" y2="${H - 5}"/>`)
      x += 7
      parts.push(icon('timer', x, 11))
      x += 11 + 4
      parts.push(text(pill.left, x))
      x += textW(pill.left)
    }
  } else {
    parts.push(text(pill.value, x))
    x += textW(pill.value)
  }

  const width = Math.ceil(x + PAD)
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" class="k-${pill.kind}" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}">` +
    style(pill.kind) +
    `<g class="p"><title>${esc(pill.tip)}</title>` +
    `<rect class="bg" x="0" y="0" width="${width}" height="${H}" rx="${H / 2}"/>` +
    parts.join('') +
    `</g></svg>`
  return { source, width, height: H, alt: pill.tip.split('\n')[0] ?? pill.kind }
}
