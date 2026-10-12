// OpenCode Browser Extension - Options Script (plain JS, CSP-safe)
const DEFAULT_PORTS = '9009, 9010, 9011, 9012';

document.addEventListener('DOMContentLoaded', async () => {
  const input = document.getElementById('ports');
  const status = document.getElementById('status');
  try {
    const data = await chrome.storage.local.get('mcp-config');
    const cfg = data['mcp-config'];
    input.value = cfg && cfg.ports ? cfg.ports.join(', ') : DEFAULT_PORTS;
  } catch (e) {
    input.value = DEFAULT_PORTS;
  }
  document.getElementById('save').addEventListener('click', async () => {
    const ports = input.value.split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0 && n < 65536)
      .filter((n, i, arr) => arr.indexOf(n) === i)
      .slice(0, 12);
    if (!ports.length) {
      status.textContent = 'Informe ao menos uma porta válida.';
      status.style.color = '#dc2626';
      return;
    }
    try {
      await chrome.storage.local.set({ 'mcp-config': { ports } });
      status.textContent = 'Salvo: ' + ports.join(', ') + ' (recarregue a extensão)';
      status.style.color = '#059669';
    } catch (e) {
      status.textContent = 'Erro ao salvar: ' + (e && e.message ? e.message : e);
      status.style.color = '#dc2626';
    }
  });
});
