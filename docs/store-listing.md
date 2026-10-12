# Edge Add-ons — textos da ficha (PT-BR + EN)

## Nome
OpenCode Browser

## Descrição curta (≤132 caracteres)
- EN: Bridge OpenCode to your real browser tabs: snapshot, click, type and screenshot via local MCP. Free, open-source, zero data collection.
- PT: Liga o OpenCode às suas abas reais: snapshot, clique, digitação e screenshot via MCP local. Grátis, open-source, zero coleta.

## Descrição longa
- EN: OpenCode Browser connects the OpenCode AI agent to the tabs you already have open. It works as a WebSocket client of a local Model Context Protocol (MCP) server (`@browsermcp/mcp`) running on your machine: every command executes locally — nothing leaves your computer. Features: accessibility snapshot, smart navigation (reuses new-tab pages, otherwise opens a new tab), click, hover, drag, type, option select, key press, wait, screenshot and console logs. Includes a popup with a real connection test and an options page with configurable ports. Free and open-source (MIT). Source: https://github.com/moisessouzaadm-boop/opencode-browser-ext — Privacy: https://moisessouzaadm-boop.github.io/opencode-browser-ext/privacy.html
- PT: (mesmo conteúdo em português — ver README.md do repo)

## Justificativas de permissão (questionário da loja)
- `<all_urls>` + `tabs` + `activeTab` + `scripting`: ler e automatizar o conteúdo das abas **a pedido explícito do usuário** via MCP local (snapshot de acessibilidade, clique, digitação). Nada é enviado para fora da máquina.
- `nativeMessaging`: canal opcional com host nativo local (protocolo próprio, best-effort).
- `storage`: somente configurações funcionais locais (portas MCP, cache). Sem analytics.
- `alarms` + `webNavigation`: manter a ponte WebSocket íntegra e reinjetar o content-script após reload.

## Categoria / idioma
- Productivity · EN (principal) + PT-BR
