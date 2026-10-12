#!/usr/bin/env node
// opencode-browser-setup: valida ambiente e imprime o bloco MCP + próximos passos.
// Não edita seu opencode.jsonc sozinho: mostra o diff exato para você colar.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ! ${m}`);

console.log('OpenCode Browser — setup check\n');

try {
  const v = execSync('node --version', { encoding: 'utf8' }).trim();
  ok(`node ${v}`);
} catch { warn('node não encontrado'); }

const mcp = join(homedir(), '.config/opencode/browsermcp/node_modules/@browsermcp/mcp/dist/index.js');
if (existsSync(mcp)) ok(`browsermcp MCP em ${mcp}`);
else warn(`MCP ausente — instale @browsermcp/mcp@0.1.3 em ~/.config/opencode/browsermcp e aplique docs/MCP-PATCH.md`);

const cfg = join(homedir(), '.config/opencode/opencode.jsonc');
if (existsSync(cfg)) ok(`opencode.jsonc em ${cfg}`);
else warn('opencode.jsonc não encontrado');

console.log('\nCole na seção "mcp" do opencode.jsonc:\n');
console.log(`  "browsermcp": {
    "type": "local",
    "command": ["node", "${mcp}"],
    "enabled": true
  }`);
console.log('\nDepois: carregue extension/dist/ em chrome://extensions, foque uma aba http(s), clique no ícone.');
