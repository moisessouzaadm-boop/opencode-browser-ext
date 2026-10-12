#!/bin/bash
# Release: build + pack + GitHub Release + updates.xml
# Uso: ./scripts/release.sh 1.0.1
set -e
VERSION="${1:?Uso: $0 <versao, ex: 1.0.1>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY="$HOME/.config/opencode-browser/keys/opencode-browser.pem"
PAGES_BASE="https://moisessouzaadm-boop.github.io/opencode-browser-ext"
REPO="moisessouzaadm-boop/opencode-browser-ext"

[ -f "$KEY" ] || { echo "chave privada não encontrada: $KEY"; exit 1; }

echo "→ bump manifest para $VERSION"
python3 - "$ROOT/extension/manifest.json" "$VERSION" <<'EOF'
import json, sys
p, v = sys.argv[1], sys.argv[2]
m = json.load(open(p))
m['version'] = v
json.dump(m, open(p, 'w'), indent=2)
print("manifest:", v)
EOF

echo "→ build"
(cd "$ROOT/extension" && npm run build >/dev/null) && echo "build ok"

echo "→ pack"
rm -rf /tmp/ocb-rel && mkdir -p /tmp/ocb-rel
google-chrome --headless=new --no-sandbox \
  --pack-extension="$ROOT/extension/dist" \
  --pack-extension-key="$KEY" >/dev/null 2>&1
# Chrome grava ao lado do dist/; mover
mv "$ROOT/extension/dist.crx" /tmp/ocb-rel/opencode-browser.crx
echo "crx ok"

echo "→ release + upload"
gh release create "v$VERSION" /tmp/ocb-rel/opencode-browser.crx \
  --repo "$REPO" --title "v$VERSION" --generate-notes

echo "→ updates.xml"
python3 - "$ROOT/docs/updates.xml" "$VERSION" <<'EOF'
import sys
p, v = sys.argv[1], sys.argv[2]
xml = open(p).read()
import re
xml = re.sub(r"releases/download/v[\d.]+/", f"releases/download/v{v}/", xml)
xml = re.sub(r"version='[\d.]+'", f"version='{v}'", xml)
open(p, 'w').write(xml)
print("updates.xml:", v)
EOF

echo "OK v$VERSION — commite docs/updates.xml e o manifest."
