#!/bin/bash
# OpenCode Browser — instalador local (grátis, sem loja)
# Faz: build da extensão + manifest do native host (opcional) + guia do bloco MCP.
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${YELLOW}🔨 Build da extensão...${NC}"
(cd "$ROOT/extension" && npm install --no-audit --no-fund >/dev/null 2>&1 || true)
(cd "$ROOT/extension" && npm run build)
echo -e "${GREEN}✓ dist/ pronto${NC}"

echo -e "${YELLOW}🔧 Native host (opcional — só p/ protocolo próprio)…${NC}"
if [ -d "$ROOT/native-host" ]; then
  (cd "$ROOT/native-host" && npm install --no-audit --no-fund >/dev/null 2>&1 || true)
  (cd "$ROOT/native-host" && npm run build || true)
  mkdir -p "$HOME/.config/google-chrome/NativeMessagingHosts"
  sed "s|__PATH__|$ROOT/native-host/dist/index.js|" "$ROOT/native-host/manifest.json" \
    > "$HOME/.config/google-chrome/NativeMessagingHosts/com.moises.opencode.browser.json" \
    2>/dev/null && echo -e "${GREEN}✓ manifest instalado${NC}" || echo "  (pulado)"
fi

cat <<'EOF'

📦 Bloco MCP para ~/.config/opencode/opencode.jsonc (seção "mcp"):
  "browsermcp": {
    "type": "local",
    "command": ["node", "~/.config/opencode/browsermcp/node_modules/@browsermcp/mcp/dist/index.js"],
    "enabled": true
  }
  (fixe @browsermcp/mcp@0.1.3 — ver docs/MCP-PATCH.md)

🧩 Extensão (manual, 1 min):
  1. chrome://extensions → modo desenvolvedor → Carregar sem compactação
  2. Selecione: <repo>/extension/dist/
  3. Foque uma aba http(s), clique no ícone, chame browser_snapshot
EOF
echo -e "${GREEN}✅ Pronto!${NC}"
