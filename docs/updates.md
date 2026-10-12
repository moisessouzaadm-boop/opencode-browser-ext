# Auto-update sem Chrome Web Store (grátis)

Instalação via **policy gerenciada** + `.crx` auto-hospedado. Funciona no Chrome Linux/Windows/Mac sem pagar a taxa da CWS.

## Como funciona

1. Cada release publica `opencode-browser.crx` (assinado com a chave privada do projeto) nos GitHub Releases.
2. `docs/updates.xml` (servido via GitHub Pages) informa a versão atual e a URL do `.crx`.
3. O Chrome com a policy `ExtensionInstallForcelist` instala e atualiza sozinho.

## Instalar (usuário final, 1 vez, requer sudo no Linux)

```bash
sudo cp docs/chrome-policy.json /etc/opt/chrome/policies/managed/opencode-browser.json
# reinicie o Chrome
```

Windows (regedit) e Mac (MCX) usam a mesma chave `ExtensionInstallForcelist`; ver docs do Chromium.

## Publicar nova versão (mantenedor)

```bash
# 1. bump extension/manifest.json -> version
# 2. build + repack + upload:
./scripts/release.sh 1.0.1
```

O script: builda, empacota com a chave em `~/.config/opencode-browser/keys/`,
cria o GitHub Release, anexa o `.crx` e atualiza `docs/updates.xml`.
A chave privada **nunca** entra no git (ver `.gitignore`).

## Alternativa sem sudo: modo desenvolvedor

`chrome://extensions` → modo desenvolvedor → *Carregar sem compactação* → `extension/dist/`.
Sem auto-update (recarregar manualmente a cada release).
