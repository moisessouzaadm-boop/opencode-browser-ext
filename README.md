# OpenCode Browser

> **Not affiliated with the OpenCode team.** This is an independent community project, not built by or associated with [OpenCode](https://opencode.ai) (`anomalyco/opencode`).

Chrome MV3 extension that bridges **OpenCode** to your real browser tabs through [`@browsermcp/mcp`](https://www.npmjs.com/package/@browsermcp/mcp).

How it works: the MCP server listens on `ws://127.0.0.1:9009` → this extension connects as a client → commands (`browser_snapshot`, `browser_click`, `browser_type`, …) run in the active tab via content scripts → results return as `messageResponse`.

- 🇺🇸 English below · 🇧🇷 [Português](#opencode-browser--1)

## Install (3 steps, free, no Chrome Web Store)

1. **Extension**: `chrome://extensions` → Developer mode → *Load unpacked* → `extension/dist/`
2. **MCP**: add to your `opencode.jsonc` (`mcp` section):
   ```jsonc
   "browsermcp": {
     "type": "local",
     "command": ["node", "<HOME>/.config/opencode/browsermcp/node_modules/@browsermcp/mcp/dist/index.js"],
     "enabled": true
   }
   ```
   Pin `@browsermcp/mcp@0.1.3` and keep the `server.close` patch (see `docs/`).
3. **Use**: focus any `http(s)` tab, click the extension icon, then call `browser_snapshot` from OpenCode.

Auto-update without any store: see `docs/updates.md` (managed policy + GitHub Pages).

## Features

- 15 MCP tools: snapshot, navigate (new-tab aware), go back/forward, click, hover, drag, type, select option, press key, wait, screenshot, console logs
- Silent reconnect with backoff + parked dead ports (no console spam)
- Popup with real connection test, options page with configurable ports
- Zero data collection ([privacy policy](PRIVACY.md))

## Layout

- `extension/` — the MV3 extension (source + `dist/`)
- `native-host/` — optional native-messaging host (not required for browsermcp)
- `packages/opencode-browser-setup/` — npm setup helper
- `docs/` — Pages landing, updates pipeline, MCP patch notes

## License

MIT — see [LICENSE](LICENSE). No outside collaborators: see [CONTRIBUTING](CONTRIBUTING.md) (issues and PRs only, everything triaged before merge).

---

## OpenCode Browser 🇧🇷

Extensão Chrome MV3 que liga o **OpenCode** às suas abas reais via `@browsermcp/mcp`.

**Instalação (3 passos, grátis, sem Chrome Web Store):**

1. **Extensão**: `chrome://extensions` → modo desenvolvedor → *Carregar sem compactação* → `extension/dist/`
2. **MCP**: adicione o bloco `browsermcp` no `opencode.jsonc` (exemplo acima)
3. **Uso**: foque qualquer aba `http(s)`, clique no ícone da extensão e chame `browser_snapshot` no OpenCode

Sem coleta de dados ([privacidade](PRIVACY.md)). Licença MIT.
