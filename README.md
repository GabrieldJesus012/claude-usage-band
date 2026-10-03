# usage-band

Faixa de uso para o Claude Code (aba Code do app desktop e terminal), logo acima da caixa de mensagem:

- **5h** e **7d**: percentual do limite, barra (verde < 70%, amarela ≥ 70%, vermelha ≥ 90%), marcador de quanto da janela já passou e tempo até o reinício
- **↑ entrada**, **↓ saída** e **cache lido** em tokens (15.6k, 954.2k, 1.25M)
- **$ custo** da sessão (preço de tabela da API)

Passe o mouse sobre cada pílula para ver os detalhes.

## Instalar em um PC

Precisa de [Git](https://git-scm.com/) e [Node.js](https://nodejs.org/) instalados.

**Windows (PowerShell):**

```powershell
git clone https://github.com/GabrieldJesus012/claude-usage-band.git $HOME\claude-usage-band
node $HOME\claude-usage-band\install.mjs
```

**macOS / Linux:**

```sh
git clone https://github.com/GabrieldJesus012/claude-usage-band.git ~/claude-usage-band
node ~/claude-usage-band/install.mjs
```

Depois feche e abra o app do Claude (ou abra uma nova sessão no terminal). Faça isso uma vez em cada PC.

O instalador:

1. copia `usage-band/` para `~/.claude/mods/usage-band`;
2. no bloco `env` de `~/.claude/settings.json`, acrescenta esse caminho a `CLAUDE_CODE_PLUGIN_DIRS` (com `;` no Windows e `:` no macOS/Linux) e define `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`;
3. não altera nenhuma outra configuração e deixa a versão anterior em `settings.json.bak`.

## Atualizar

```sh
cd ~/claude-usage-band && git pull && node install.mjs
```

## Remover

```sh
node ~/claude-usage-band/install.mjs --remove
```

## Comando

- `/kullanim`: atualiza os dados e mostra um resumo de uma linha
- `/kullanim gizle` (ou `ocultar`): esconde a faixa
- `/kullanim goster` (ou `mostrar`): mostra a faixa de novo
- `/kullanim debug`: mostra o que o mod está vendo (para diagnosticar quando a faixa não aparece)

## Observações

- Os limites 5h/7d só aparecem depois da primeira resposta do modelo na sessão, e só em contas com assinatura.
- Os tokens vêm de `scripts/tokens.mjs`, que lê a transcrição da sessão em `~/.claude/projects`. Se o script não rodar, a faixa soma os turnos e mostra os números com `~`.
- Sessões do Claude Code na nuvem (claude.ai/code) rodam em contêineres temporários; lá o mod não fica instalado.
