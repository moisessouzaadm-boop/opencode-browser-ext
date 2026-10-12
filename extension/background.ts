// OpenCode Browser Extension - Background Service Worker
// WS CLIENT of @browsermcp/mcp (it is the WS *server* on 127.0.0.1:9009+).
// Protocol: recv {id, type, payload} -> reply {type:"messageResponse", payload:{requestId:id, result|error}}

const MCP_WS_PORTS = [9009, 9010, 9011, 9012, 9013, 9014, 9015, 9016, 9017, 9018, 9019, 9020];
// Boot/keepalive usam só o range provável (padrão + fallbacks comuns);
// o range completo só é varrido no teste explícito do popup.
// Ambas as listas vêm da página de opções (chrome.storage 'mcp-config').
const MCP_EAGER_PORTS = [9009, 9010, 9011, 9012];
const CONFIG_KEY = 'mcp-config';
const MCP_WS_HOST = '127.0.0.1';
const RECONNECT_MS = 2000;
const TAB_OP_TIMEOUT_MS = 25000;

type McpId = string | number;

interface McpIncoming {
  id: McpId;
  type: string;
  payload?: any;
}

interface TabResponse {
  id: number;
  type: string;
  payload: { success: boolean; result?: any; error?: string };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class McpBridge {
  private sockets = new Map<number, WebSocket>();
  private reconnectTimers = new Map<number, number>();
  private portFailures = new Map<number, number>();
  private parkedPorts = new Set<number>(); // portas sem servidor: silêncio até ação explícita
  private static readonly MAX_FAILURES = 2;
  private static readonly PARK_TTL_MS = 30 * 60 * 1000; // redescobre após 30min
  private static readonly PARK_KEY = 'mcp-parked-ports';
  private fullPorts: number[] = MCP_WS_PORTS;
  private eagerPorts: number[] = MCP_EAGER_PORTS;
  private tabMessageId = 0;
  private tabPending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: number }>();
  private contentPorts = new Map<number, chrome.runtime.Port>();

  constructor() {
    this.init();
  }

  private init() {
    // 1. Connect to the eager MCP ports (default + common fallbacks)
    this.loadConfig()
      .catch(() => {})
      .then(() => this.loadParked())
      .catch(() => {})
      .finally(() => {
        this.ensurePorts(this.eagerPorts);
      });

    // 2. Content-script ports (one per tab)
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name !== 'content-script') return;
      const tabId = port.sender?.tab?.id;
      if (tabId == null) return;
      this.contentPorts.set(tabId, port);
      port.onDisconnect.addListener(() => {
        if (this.contentPorts.get(tabId) === port) this.contentPorts.delete(tabId);
      });
      port.onMessage.addListener((msg: TabResponse) => this.handleTabMessage(msg));
    });

    // 3. Reconnect attempts when tabs change (wakes suspended SW)
    chrome.tabs.onActivated.addListener(() => this.ensureConnections());
    chrome.tabs.onUpdated.addListener((_id, info) => {
      if (info.status === 'complete') this.ensureConnections();
    });

    // 3b. Keepalive: alarms wake a suspended SW so sockets get re-established
    try {
      chrome.alarms.create('mcp-keepalive', { periodInMinutes: 0.5 });
      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'mcp-keepalive') this.ensureConnections();
      });
    } catch (e) {
      console.log('[MCP] alarms unavailable:', e);
    }

    // 3c. Re-inject content script into pre-existing tabs (fixes
    // "Extension context invalidated" after extension reload without F5)
    this.reinjectContentScripts();

    // 4. Optional native-host link (best effort, never fatal)
    this.connectNativeHost();
  }

  // ---------- MCP WebSocket client ----------

  public ensureConnections() {
    this.ensurePorts(this.eagerPorts);
  }

  private ensurePorts(ports: number[]) {
    for (const port of ports) {
      if (this.parkedPorts.has(port)) continue; // só via ação explícita
      if (this.reconnectTimers.has(port)) continue; // backoff em vigor
      const ws = this.sockets.get(port);
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        this.connectMcp(port);
      }
    }
  }

  /** Ação explícita do usuário (ícone/popup): reativa portas estacionadas. */
  public wakeUp() {
    this.parkedPorts.clear();
    void this.saveParked();
    this.ensurePorts(this.eagerPorts);
  }

  private async loadConfig(): Promise<void> {
    try {
      const data = await chrome.storage.local.get(CONFIG_KEY);
      const cfg = data[CONFIG_KEY] as { ports?: number[] } | undefined;
      const ports = (cfg?.ports ?? []).filter((n) => Number.isInteger(n) && n > 0 && n < 65536).slice(0, 12);
      if (ports.length) {
        this.fullPorts = ports;
        this.eagerPorts = ports.slice(0, 4);
      }
    } catch {
      /* usa padrões */
    }
  }

  private async loadParked(): Promise<void> {
    try {
      const data = await chrome.storage.local.get(McpBridge.PARK_KEY);
      const raw = data[McpBridge.PARK_KEY] as Record<string, number> | undefined;
      if (!raw) return;
      const now = Date.now();
      for (const [portStr, ts] of Object.entries(raw)) {
        if (now - ts < McpBridge.PARK_TTL_MS) this.parkedPorts.add(Number(portStr));
      }
    } catch {
      /* storage indisponível: segue sem cache */
    }
  }

  private async saveParked(): Promise<void> {
    try {
      const raw: Record<string, number> = {};
      const now = Date.now();
      for (const port of this.parkedPorts) raw[String(port)] = now;
      await chrome.storage.local.set({ [McpBridge.PARK_KEY]: raw });
    } catch {
      /* ignora */
    }
  }

  /** Diagnóstico real para o botão "Testar Conexão" do popup: varre o range completo. */
  public async getDiagnostics(): Promise<any> {
    this.parkedPorts.clear();
    await this.saveParked();
    this.ensurePorts(this.fullPorts);
    await sleep(2500); // deixa os handshakes assentarem antes de relatar
    const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'] as const;
    const mcp = this.fullPorts.map((port) => {
      const ws = this.sockets.get(port);
      return { port, state: ws ? states[ws.readyState] ?? ws.readyState : '—' };
    }).filter((e) => e.state !== '—' || this.parkedPorts.has(e.port) === false);
    let tabs = 0;
    try {
      tabs = (await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] })).length;
    } catch {
      tabs = -1;
    }
    return {
      mcpOpen: mcp.filter((e) => e.state === 'OPEN').map((e) => e.port),
      mcpProbing: mcp.filter((e) => e.state !== 'OPEN').map((e) => `${e.port}:${e.state}`),
      parked: [...this.parkedPorts],
      contentTabs: [...this.contentPorts.keys()],
      httpTabs: tabs
    };
  }

  private connectMcp(port: number) {
    const existing = this.sockets.get(port);
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return;
    }
    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://${MCP_WS_HOST}:${port}`);
    } catch {
      this.scheduleReconnect(port);
      return;
    }
    this.sockets.set(port, ws);

    ws.onopen = () => {
      console.log(`[MCP] connected to ws://${MCP_WS_HOST}:${port}`);
      this.portFailures.set(port, 0);
      if (this.parkedPorts.delete(port)) void this.saveParked();
    };
    ws.onmessage = (event) => {
      this.handleMcpMessage(ws, event.data).catch((e) =>
        console.error('[MCP] handler error:', e)
      );
    };
    ws.onclose = () => {
      if (this.sockets.get(port) === ws) this.sockets.delete(port);
      this.scheduleReconnect(port);
    };
    ws.onerror = () => {
      // onclose follows; keep socket map until then
    };
  }

  private scheduleReconnect(port: number) {
    if (this.reconnectTimers.has(port)) return;
    // Backoff exponencial 2s -> 5min; após o teto, estaciona (silêncio total)
    const failures = (this.portFailures.get(port) ?? 0) + 1;
    this.portFailures.set(port, failures);
    if (failures > McpBridge.MAX_FAILURES) {
      this.parkedPorts.add(port);
      void this.saveParked();
      return;
    }
    const delay = Math.min(RECONNECT_MS * 2 ** Math.min(failures - 1, 8), 5 * 60 * 1000);
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(port);
      this.connectMcp(port);
    }, delay) as unknown as number;
    this.reconnectTimers.set(port, timer);
  }

  private reply(ws: WebSocket, requestId: McpId, result?: any, error?: string) {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: 'messageResponse',
        payload: { requestId, result, error }
      })
    );
  }

  private async handleMcpMessage(ws: WebSocket, raw: any) {
    let msg: McpIncoming;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    } catch {
      return;
    }
    if (!msg || msg.id === undefined || !msg.type) return;
    // Ignore our own responses / echoes
    if (msg.type === 'messageResponse') return;

    try {
      const result = await this.dispatch(msg.type, msg.payload ?? {});
      this.reply(ws, msg.id, result);
    } catch (error) {
      this.reply(ws, msg.id, undefined, error instanceof Error ? error.message : String(error));
    }
  }

  // ---------- Dispatch MCP types ----------

  private async dispatch(type: string, payload: any): Promise<any> {
    switch (type) {
      case 'getUrl': {
        const tab = await this.getActiveTab();
        return tab.url ?? '';
      }
      case 'getTitle': {
        const tab = await this.getActiveTab();
        return tab.title ?? '';
      }
      case 'browser_navigate': {
        if (!payload?.url) throw new Error('browser_navigate: missing url');
        const tabId = await this.navigateSmart(payload.url);
        return { url: payload.url, tabId };
      }
      case 'browser_go_back':
        await this.tabsGo('back');
        return { ok: true };
      case 'browser_go_forward':
        await this.tabsGo('forward');
        return { ok: true };
      case 'browser_snapshot': {
        return await this.askTab('snapshot', {});
      }
      case 'browser_screenshot': {
        return await this.captureScreenshot();
      }
      case 'browser_wait': {
        const secs = Math.min(Number(payload?.time ?? 1), 25);
        await sleep(secs * 1000);
        return { waited: secs };
      }
      case 'browser_click':
      case 'browser_hover':
      case 'browser_drag':
      case 'browser_type':
      case 'browser_press_key':
      case 'browser_select_option':
      case 'browser_get_console_logs': {
        const tabType = type.replace(/^browser_/, '');
        return await this.askTab(tabType, payload);
      }
      default:
        throw new Error(`Unsupported message type: ${type}`);
    }
  }

  private isNewTabPage(url?: string): boolean {
    return !url || url === 'chrome://newtab/' || url === 'about:blank';
  }

  /** Navegação inteligente: reusar aba nova-guia, senão abrir nova guia. */
  private async navigateSmart(url: string): Promise<number> {
    let active: chrome.tabs.Tab | null = null;
    try {
      active = await this.getActiveTab();
    } catch {
      active = null;
    }
    let tabId: number;
    if (active?.id != null && this.isNewTabPage(active.url)) {
      await chrome.tabs.update(active.id, { url });
      tabId = active.id;
    } else {
      const created = await chrome.tabs.create({ url, active: true });
      if (created.id == null) throw new Error('Failed to open new tab');
      tabId = created.id;
    }
    await this.waitForTabLoad(tabId, 15000);
    return tabId;
  }

  private waitForTabLoad(tabId: number, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
        if (id === tabId && info.status === 'complete') finish();
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(finish, timeoutMs);
    });
  }

  /** Aguarda o content-script da aba conectar (cobre a corrida navigate->snapshot). */
  private async waitForPort(tabId: number, timeoutMs: number): Promise<chrome.runtime.Port | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const port = this.contentPorts.get(tabId);
      if (port) return port;
      await sleep(250);
    }
    return this.contentPorts.get(tabId) ?? null;
  }

  private async tabsGo(dir: 'back' | 'forward'): Promise<void> {
    const tab = await this.getActiveTab();
    await new Promise<void>((resolve) => {
      const cb = () => resolve();
      if (dir === 'back') chrome.tabs.goBack(cb);
      else chrome.tabs.goForward(cb);
    });
    await sleep(1000);
  }

  private async captureScreenshot(): Promise<string> {
    const dataUrl: string = await chrome.tabs.captureVisibleTab({ format: 'png' });
    const comma = dataUrl.indexOf(',');
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  }

  private async getActiveTab(): Promise<chrome.tabs.Tab> {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0] ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (!tab?.id) throw new Error('No tab is connected');
    return tab;
  }

  // ---------- Background <-> content-script ----------

  private async resolveTabId(): Promise<number> {
    // Prefer the active tab; fall back to the most recently connected tab
    // (the active tab may be chrome:// or another page without content script).
    try {
      const tab = await this.getActiveTab();
      if (tab.id != null && this.contentPorts.has(tab.id)) return tab.id;
    } catch {
      /* fall through to fallback */
    }
    const candidates = [...this.contentPorts.keys()].reverse();
    for (const id of candidates) {
      try {
        await chrome.tabs.get(id);
        return id;
      } catch {
        this.contentPorts.delete(id);
      }
    }
    throw new Error('No tab is connected (content script not ready — focus a normal http(s) tab)');
  }

  private askTab(type: string, payload: any): Promise<any> {
    return this.resolveTabId().then(
      async (tabId) => {
        const port = await this.waitForPort(tabId, 10000);
        return new Promise((resolve, reject) => {
          if (!port) {
            reject(new Error('No tab is connected (content script not ready — reload the page)'));
            return;
          }
          const id = ++this.tabMessageId;
          const timer = setTimeout(() => {
            this.tabPending.delete(id);
            reject(new Error(`Tab operation timed out: ${type}`));
          }, TAB_OP_TIMEOUT_MS) as unknown as number;
          this.tabPending.set(id, { resolve, reject, timer });
          try {
            port.postMessage({ id, type, payload });
          } catch (e) {
            clearTimeout(timer);
            this.tabPending.delete(id);
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        });
      }
    );
  }

  private handleTabMessage(msg: TabResponse) {
    if (!msg || msg.type !== 'response' || msg.id == null) return;
    const pending = this.tabPending.get(msg.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.tabPending.delete(msg.id);
    if (msg.payload?.success) pending.resolve(msg.payload.result);
    else pending.reject(new Error(msg.payload?.error || 'Tab operation failed'));
  }

  private async reinjectContentScripts() {
    try {
      const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
      for (const tab of tabs) {
        if (tab.id == null) continue;
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        } catch {
          // tab may not allow injection; content script tag handles fresh loads
        }
      }
    } catch (e) {
      console.log('[MCP] reinject failed:', e);
    }
  }

  // ---------- Optional native host (best effort) ----------

  private connectNativeHost() {
    try {
      const nativePort = chrome.runtime.connectNative('com.moises.opencode.browser');
      nativePort.onMessage.addListener((message: any) => {
        console.log('[Native] message:', message);
      });
      nativePort.onDisconnect.addListener(() => {
        console.log('[Native] disconnected:', chrome.runtime.lastError?.message);
      });
      console.log('[Native] connected');
    } catch (error) {
      console.log('[Native] unavailable:', error);
    }
  }
}

const bridge = new McpBridge();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'get_status') {
    // Popup open wakes the SW: use it to heal sockets too
    bridge.wakeUp();
    sendResponse({ status: 'mcp-bridge' });
  } else if (message?.type === 'test_connection') {
    bridge.getDiagnostics().then(sendResponse);
    return true; // resposta assíncrona
  }
  return true;
});

console.log('OpenCode Browser Extension background (mcp-bridge) loaded');
