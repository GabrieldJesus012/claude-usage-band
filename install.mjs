#!/usr/bin/env node
// Instala o mod usage-band para todas as sessões do Claude Code desta máquina.
//
//   node install.mjs            instala ou atualiza
//   node install.mjs --remove   desinstala
//
// Copia ./usage-band para ~/.claude/mods/usage-band e, no bloco "env" de
// ~/.claude/settings.json, acrescenta o caminho a CLAUDE_CODE_PLUGIN_DIRS
// (separador ";" no Windows, ":" no resto) e liga
// CLAUDE_CODE_ENABLE_FUNCTION_HOOKS. Nenhuma outra configuração é alterada;
// uma cópia do settings.json anterior fica em settings.json.bak.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const isRemove = process.argv.includes('--remove')
const here = dirname(fileURLToPath(import.meta.url))
const claudeDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
const dest = join(claudeDir, 'mods', 'usage-band')
const settingsPath = join(claudeDir, 'settings.json')

function readSettings() {
  if (!existsSync(settingsPath)) return {}
  const text = readFileSync(settingsPath, 'utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text)
  } catch (err) {
    console.error(`Não consegui ler ${settingsPath} como JSON: ${err.message}`)
    console.error('Corrija o arquivo e rode de novo; nada foi alterado.')
    process.exit(1)
  }
}

const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b)
const settings = readSettings()
const env = settings.env && typeof settings.env === 'object' ? settings.env : {}
const dirs = String(env.CLAUDE_CODE_PLUGIN_DIRS ?? '')
  .split(delimiter)
  .filter(d => d.trim() !== '')
const others = dirs.filter(d => !same(resolve(d.replace(/^~(?=$|[\\/])/, homedir())), resolve(dest)))

if (isRemove) {
  rmSync(dest, { recursive: true, force: true })
  if (others.length > 0) env.CLAUDE_CODE_PLUGIN_DIRS = others.join(delimiter)
  else delete env.CLAUDE_CODE_PLUGIN_DIRS
} else {
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(join(here, 'usage-band'), dest, { recursive: true })
  env.CLAUDE_CODE_PLUGIN_DIRS = [...others, dest].join(delimiter)
  env.CLAUDE_CODE_ENABLE_FUNCTION_HOOKS = '1'
}

settings.env = env
mkdirSync(claudeDir, { recursive: true })
if (existsSync(settingsPath)) copyFileSync(settingsPath, `${settingsPath}.bak`)
writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')

if (isRemove) {
  console.log(`Removido: ${dest}`)
  console.log('CLAUDE_CODE_ENABLE_FUNCTION_HOOKS foi mantido (outros mods podem usar).')
} else {
  console.log(`Instalado em: ${dest}`)
  console.log(`CLAUDE_CODE_PLUGIN_DIRS = ${env.CLAUDE_CODE_PLUGIN_DIRS}`)
  console.log('Abra uma nova sessão do Claude Code (ou reinicie o app) para ver a faixa.')
}
