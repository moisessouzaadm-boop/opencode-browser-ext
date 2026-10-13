# Instalação no Windows (Chrome)

Passo a passo executado em 13/10/2026 (Windows, Chrome 154). Projeto
independente, sem afiliação com a equipe OpenCode. Como funciona: o MCP
`@browsermcp/mcp` é o SERVIDOR WebSocket em `ws://127.0.0.1:9009` e a extensão
Chrome MV3 é o CLIENTE. Comandos (`browser_snapshot`, `browser_click`,
`browser_type` etc.) rodam na aba ativa via content scripts e voltam como
`messageResponse`.

> ATENÇÃO: exemplos antigos de config MCP neste README usavam o formato V1
> (`"mcp": { "browsermcp": {..., "enabled": true} }`). No OpenCode V2 o formato
> correto é `"mcp": { "servers": { "browsermcp": {...} } }` (sem campo
> `"enabled"`; usa-se `"disabled": true` para desativar).
> Fonte: https://opencode.ai/v2/docs/mcp-servers

----------------------------------------------------------------
## 0. Diagnóstico inicial

- FALTAVAM na máquina: Node.js, npm, git e CLI opencode no PATH.
- OpenCode em uso via app Desktop.

----------------------------------------------------------------
## 1. Instalar Node.js LTS (PowerShell)

```powershell
winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
```

Resultado: node v24 + npm 11 em `C:\Program Files\nodejs`. Conferir com:

```powershell
& "C:\Program Files\nodejs\node.exe" --version
& "C:\Program Files\nodejs\npm.cmd" --version
```

OBS Windows: o PATH das sessões antigas não inclui o Node; em cada
PowerShell novo, ou abra um terminal novo, ou rode:

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
```

----------------------------------------------------------------
## 2. Instalar Git (PowerShell) — opcional

```powershell
winget install --id Git.Git --accept-source-agreements --accept-package-agreements --silent
```

Dispensável se baixar o repo via ZIP (passo 3).

----------------------------------------------------------------
## 3. Baixar o repositório (sem git, via PowerShell)

```powershell
Invoke-WebRequest -Uri "https://github.com/moisessouzaadm-boop/opencode-browser-ext/archive/refs/heads/main.zip" -OutFile "$env:TEMP\opencode-browser-ext-main.zip"
Expand-Archive -Path "$env:TEMP\opencode-browser-ext-main.zip" -DestinationPath "$env:USERPROFILE\Documents\tmp-obe" -Force
Move-Item "$env:USERPROFILE\Documents\tmp-obe\opencode-browser-ext-main" "$env:USERPROFILE\Documents\opencode-browser-ext"
```

Equivalente com git:

```powershell
git clone https://github.com/moisessouzaadm-boop/opencode-browser-ext.git Documents\opencode-browser-ext
```

----------------------------------------------------------------
## 4. Compilar a extensão

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
cd "$env:USERPROFILE\Documents\opencode-browser-ext\extension"
npm install --no-audit --no-fund
npm run build
# script de build (package.json): "tsc && vite build" -> gera extension\dist\
```

Conteúdo de `extension\dist\`: `background.js`, `content.js`, `injected.js`,
`manifest.json`, `popup.html`, `popup.js`, `options.html`, `options.js`, `icons\`.
Avisos de "Use of eval" em `content.ts` e `injected.ts` são pré-existentes
(vite, minify desativado) e NÃO quebram o build.

----------------------------------------------------------------
## 5. Instalar o MCP `@browsermcp/mcp@0.1.3` (versão PINADA)

```powershell
$dir = Join-Path $env:USERPROFILE ".config\opencode\browsermcp"
New-Item -ItemType Directory -Force -Path $dir; cd $dir
npm init -y
npm install @browsermcp/mcp@0.1.3 --no-audit --no-fund
# Backup ANTES de patchear:
Copy-Item "$dir\node_modules\@browsermcp\mcp\dist\index.js" "$dir\node_modules\@browsermcp\mcp\dist\index.js.bak" -Force
# NUNCA rode npm update aqui sem refazer backup + patches.
```

----------------------------------------------------------------
## 6. Patch 1 — recursão infinita em `server.close` (bug upstream)

Arquivo: `...\node_modules\@browsermcp\mcp\dist\index.js`. ANTES (trava o
encerramento):

```js
server.close = async () => {
  await server.close();
  await wss.close();
  await context.close();
};
```

DEPOIS:

```js
const _origClose = server.close.bind(server);
server.close = async () => {
  await _origClose();
  await wss.close();
  await context.close();
};
```

Ver `docs/MCP-PATCH.md` (Patch 1).

----------------------------------------------------------------
## 7. Patch 2 — trocar `taskkill` + espera ocupada por fallback de portas

Arquivo: mesmo `index.js`, função `createWebSocketServer`. ANTES (cascata de
taskkill no Windows + while travado):

```js
killProcessOnPort(port);
while (await isPortInUse(port)) { await wait(100); }
return new WebSocketServer({ port });
```

DEPOIS (tenta 9009 até 9020, loga em stderr, cai em porta efêmera):

```js
async function createWebSocketServer(port = mcpConfig.defaultWsPort) {
  for (let p = port; p <= port + 11; p++) {
    if (!(await isPortInUse(p))) {
      if (p !== port) {
        console.error(`browsermcp: porta ${port} ocupada, usando ${p}`);
      }
      return new WebSocketServer({ port: p });
    }
    console.error(`browsermcp: porta ${p} ocupada, tentando ${p + 1}`);
  }
  console.error(`browsermcp: portas ${port}-${port + 11} ocupadas, usando porta efemera`);
  return new WebSocketServer({ port: 0 });
}
```

Ver `docs/MCP-PATCH.md` (Patch 2).

----------------------------------------------------------------
## 8. Validar o MCP

Sintaxe:

```powershell
& "C:\Program Files\nodejs\node.exe" --check "<dir>\node_modules\@browsermcp\mcp\dist\index.js"
```

Smoke test (porta 9009 abre com stdin aberto, como o OpenCode usa):

```powershell
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "C:\Program Files\nodejs\node.exe"
$psi.Arguments = '"<dir>\node_modules\@browsermcp\mcp\dist\index.js"'
$psi.RedirectStandardInput = $true; $psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$p = [System.Diagnostics.Process]::Start($psi)
# após ~8s, Test-NetConnection 127.0.0.1 -Port 9009 deve ABRIR
$p.Kill()
```

DETALHE: rodar sem stdin redirecionado FAZ a porta ficar fechada (watchdog
fecha o servidor quando stdin fecha) — isso é normal, não é falha do patch.

----------------------------------------------------------------
## 9. Criar a config global do OpenCode (formato V2)

Arquivo: `%USERPROFILE%\.config\opencode\opencode.jsonc`

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "browsermcp": {
        "type": "local",
        "command": [
          "C:/Program Files/nodejs/node.exe",
          "C:/Users/<seu-usuario>/.config/opencode/browsermcp/node_modules/@browsermcp/mcp/dist/index.js"
        ]
      }
    }
  }
}
```

- Usa caminho ABSOLUTO do node (o app Desktop pode não ter o Node no PATH,
  pois foi instalado depois do app).
- Barras `/` funcionam no Windows para o Node.
- Reiniciar o OpenCode Desktop para ele ler a nova config.

----------------------------------------------------------------
## 10. Instalar a extensão no Chrome (manual, 1 min)

1. Abrir `chrome://extensions`
2. Ativar "Modo do desenvolvedor" (canto superior direito)
3. "Carregar sem compactação" → selecionar:
   `C:\Users\<seu-usuario>\Documents\opencode-browser-ext\extension\dist`
4. Fixar a extensão na barra (ícone quebra-cabeça → pin)
5. Focar qualquer aba http(s), clicar no ícone da extensão (isso "acorda"
   o service worker e conecta o WS)
6. Auto-update via policy (`docs/updates.md`) é OPCIONAL e exige elevação;
   no modo desenvolvedor, recarregue manualmente a cada release.

----------------------------------------------------------------
## 11. Teste final

No OpenCode, chamar `browser_snapshot`. Sucesso = retorna
"Page URL / Page Title / Page Snapshot" da aba ativa.
Teste real em 13/10/2026: snapshot da aba `chrome://extensions/`
("Extensões") retornado corretamente.

----------------------------------------------------------------
## 12. Native-host — pulado (opcional, não exigido)

`native-host/` é host de native-messaging para protocolo próprio, NÃO exigido
para o fluxo browsermcp. Provas: README ("optional native-messaging host (not
required for browsermcp)") e `install.sh` ("opcional — só p/ protocolo
próprio"). Sem ele, aparece no log `[Native] disconnected: Specified native
messaging host not found` — NORMAL e inofensivo. Além disso o `manifest.json`
dele vem com path Linux fixo e no Windows exigiria Registro em vez de pasta —
trabalho extra sem benefício aqui.

----------------------------------------------------------------
## 13. Erros normais em `chrome://extensions/?errors=<id>`

- `[Native] disconnected...` → normal (ver item 12)
- Falhas de WS nas portas 9010-9020 → normais/transitórias (fallback
  estaciona em silêncio; só a 9009 precisa OPEN)
- `Unchecked runtime.lastError` em voltar/avançar → benigno (só se usar
  essas ferramentas sem histórico na aba)
- ANORMAL: falha de registro do service worker ou erro na 9009.
