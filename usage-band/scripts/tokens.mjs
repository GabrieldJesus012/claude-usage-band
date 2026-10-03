#!/usr/bin/env node
// Soma os campos usage das mensagens assistant da transcrição de uma sessão
// (e das transcrições de subagentes) e escreve uma linha de JSON.
//
//   node tokens.mjs <id-da-sessão>
//
// A mesma mensagem é regravada a cada bloco de conteúdo: deduplica pela chave
// message.id + requestId e fica com o maior valor de cada campo.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const id = process.argv[2]
if (!id || !/^[A-Za-z0-9._-]+$/.test(id)) {
  console.error('uso: tokens.mjs <id-da-sessão>')
  process.exit(2)
}

const root = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects')

function findTranscript() {
  let best = null
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const file = join(root, dir.name, `${id}.jsonl`)
    if (!existsSync(file)) continue
    const st = statSync(file)
    if (best === null || st.mtimeMs > best.st.mtimeMs) best = { file, dir: join(root, dir.name), st }
  }
  return best
}

const FIELDS = ['input_tokens', 'cache_creation_input_tokens', 'output_tokens', 'cache_read_input_tokens']
const seen = new Map()

function scan(file) {
  const text = readFileSync(file, 'utf8')
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"')) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    const msg = row && row.type === 'assistant' ? row.message : null
    const usage = msg && msg.usage
    if (!usage) continue
    const key = `${msg.id ?? row.uuid}|${row.requestId ?? ''}`
    const prev = seen.get(key) ?? [0, 0, 0, 0]
    seen.set(key, FIELDS.map((f, i) => Math.max(prev[i], Number(usage[f]) || 0)))
  }
}

const found = findTranscript()
if (found === null) {
  console.error(`transcrição não encontrada: ${id}`)
  process.exit(1)
}

scan(found.file)
const subDir = join(found.dir, id, 'subagents')
let subagents = 0
if (existsSync(subDir)) {
  for (const name of readdirSync(subDir)) {
    if (!name.endsWith('.jsonl')) continue
    subagents += 1
    scan(join(subDir, name))
  }
}

const sum = [0, 0, 0, 0]
for (const v of seen.values()) for (let i = 0; i < 4; i++) sum[i] += v[i]

process.stdout.write(
  JSON.stringify({
    file: found.file,
    size: found.st.size,
    mtimeMs: found.st.mtimeMs,
    input: sum[0],
    cacheWrite: sum[1],
    output: sum[2],
    cacheRead: sum[3],
    requests: seen.size,
    subagents,
  }) + '\n',
)
