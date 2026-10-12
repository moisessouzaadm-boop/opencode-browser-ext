// OpenCode Browser Extension - Popup Script (plain JS, CSP-safe)

async function checkStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'get_status' });
    const ok = response && (response.status === 'mcp-bridge' || response.status === 'connected');
    document.getElementById('status-text').textContent = ok ? 'Conectado' : 'Desconectado';
    document.getElementById('status-indicator').style.background = ok ? '#4ade80' : '#ef4444';
    document.getElementById('test-btn').disabled = false;
  } catch (e) {
    document.getElementById('status-text').textContent = 'Erro';
    document.getElementById('status-indicator').style.background = '#ef4444';
  }
}

async function runTest() {
  const btn = document.getElementById('test-btn');
  const out = document.getElementById('test-result');
  btn.disabled = true;
  btn.textContent = 'Testando...';
  out.style.display = 'none';
  try {
    const d = await chrome.runtime.sendMessage({ type: 'test_connection' });
    const lines = [
      'MCP abertas: ' + (d.mcpOpen.length ? d.mcpOpen.join(', ') : 'nenhuma'),
      'MCP tentando: ' + (d.mcpProbing.length ? d.mcpProbing.join(', ') : '—'),
      'Estacionadas: ' + (d.parked.length ? d.parked.length + ' portas' : '—'),
      'Abas com content: ' + (d.contentTabs.length ? d.contentTabs.join(', ') : 'nenhuma'),
      'Abas http(s): ' + d.httpTabs
    ];
    out.textContent = lines.join('\n');
    out.style.display = 'block';
    const ok = d.mcpOpen.length > 0 && d.contentTabs.length > 0;
    document.getElementById('status-text').textContent = ok ? 'Teste OK' : 'Teste falhou';
    document.getElementById('status-indicator').style.background = ok ? '#4ade80' : '#ef4444';
  } catch (e) {
    out.textContent = 'Erro: ' + (e && e.message ? e.message : e);
    out.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Testar Conexão';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  checkStatus();
  document.getElementById('test-btn').addEventListener('click', runTest);
});
