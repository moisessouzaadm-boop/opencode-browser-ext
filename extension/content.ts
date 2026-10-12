// OpenCode Browser Extension - Content Script
// Runs in all frames, communicates with background via port

interface Message {
  id: number;
  type: string;
  payload: any;
}

interface Response {
  id: number;
  success: boolean;
  result?: any;
  error?: string;
}

class ContentScript {
  private port: chrome.runtime.Port | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, (response: Response) => void>();
  private consoleLogs: Array<{ level: string; message: string; timestamp: number; url: string }> = [];

  constructor() {
    this.hookConsole();
    this.init();
  }

  private hookConsole() {
    const levels = ['log', 'warn', 'error', 'info', 'debug'] as const;
    for (const level of levels) {
      const orig = console[level].bind(console);
      (console[level] as any) = (...args: any[]) => {
        try {
          this.consoleLogs.push({
            level,
            message: args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '),
            timestamp: Date.now(),
            url: window.location.href
          });
          if (this.consoleLogs.length > 200) this.consoleLogs.splice(0, this.consoleLogs.length - 200);
        } catch {
          /* ignore */
        }
        orig(...args);
      };
    }
    window.addEventListener('error', (e) => {
      this.consoleLogs.push({ level: 'error', message: String(e.message), timestamp: Date.now(), url: window.location.href });
    });
  }

  private init() {
    // Script obsoleto após reload da extensão: runtime.id some; não tenta conectar
    if (!chrome.runtime?.id) return;
    try {
      this.port = chrome.runtime.connect({ name: 'content-script' });
    } catch {
      this.port = null;
      return;
    }
    
    this.port.onMessage.addListener((message: Message) => {
      this.handleMessage(message);
    });

    this.port.onDisconnect.addListener(() => {
      console.log('Disconnected from background');
      this.port = null;
      // Attempt reconnect
      setTimeout(() => this.init(), 1000);
    });

    // Announce readiness
    this.send({ id: ++this.messageId, type: 'ready', payload: { url: window.location.href } });
  }

  private handleMessage(message: Message) {
    switch (message.type) {
      case 'execute_script':
        this.executeScript(message.id, message.payload.script)
          .then(result => this.sendResponse(message.id, true, result))
          .catch(error => this.sendResponse(message.id, false, null, error.message));
        break;
      case 'snapshot':
        this.captureSnapshot(message.id);
        break;
      case 'navigate':
        this.navigate(message.id, message.payload.url);
        break;
      case 'click':
        this.click(message.id, message.payload);
        break;
      case 'hover':
        this.hover(message.id, message.payload);
        break;
      case 'drag':
        this.drag(message.id, message.payload);
        break;
      case 'type':
        this.type(message.id, message.payload);
        break;
      case 'press_key':
        this.pressKey(message.id, message.payload);
        break;
      case 'select_option':
        this.selectOption(message.id, message.payload);
        break;
      case 'get_console_logs':
        this.sendResponse(message.id, true, this.consoleLogs);
        break;
      case 'evaluate':
        this.evaluate(message.id, message.payload.script);
        break;
      case 'storage_get':
        this.storageGet(message.id, message.payload.keys);
        break;
      case 'storage_set':
        this.storageSet(message.id, message.payload.key, message.payload.value);
        break;
      case 'storage_clear':
        this.storageClear(message.id);
        break;
      case 'screenshot':
        this.screenshot(message.id);
        break;
      case 'wait':
        this.wait(message.id, message.payload.time);
        break;
      default:
        this.sendResponse(message.id, false, null, `Unknown message type: ${message.type}`);
    }
  }

  private async executeScript(id: number, script: string): Promise<any> {
    try {
      // Use Function constructor for safe execution in page context
      const fn = new Function(script);
      return await fn();
    } catch (error) {
      throw new Error(`Script execution failed: ${error}`);
    }
  }

  private async captureSnapshot(id: number) {
    try {
      // Capture accessibility tree
      const snapshot = await this.captureAriaSnapshot();
      this.sendResponse(id, true, snapshot);
    } catch (error) {
      this.sendResponse(id, false, null, String(error));
    }
  }

  private async captureAriaSnapshot(): Promise<any> {
    // Accessibility snapshot as YAML-ish text (MCP interpolates it into a string)
    const lines: string[] = [];
    const MAX_NODES = 8000;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      null
    );

    let node: Node | null;
    while ((node = walker.nextNode()) !== null) {
      if (lines.length >= MAX_NODES) break;
      const element = node as HTMLElement;
      let rect: DOMRect;
      try {
        rect = element.getBoundingClientRect();
      } catch {
        continue;
      }
      if (rect.width === 0 && rect.height === 0) continue;

      const role = element.getAttribute('role') || element.tagName.toLowerCase();
      const name = this.getAccessibleName(element).replace(/"/g, "'").slice(0, 120);
      const value = (element as HTMLInputElement).value;
      const selector = this.generateSelector(element);
      let line = `- ${role} "${name}" [${selector}]`;
      if (typeof value === 'string' && value) line += ` value="${value.slice(0, 80)}"`;
      lines.push(line);
    }

    return lines.join('\n');
  }

  private getAccessibleName(element: HTMLElement): string {
    // Try aria-label, aria-labelledby, then text content
    if (element.hasAttribute('aria-label')) {
      return element.getAttribute('aria-label')!;
    }
    if (element.hasAttribute('aria-labelledby')) {
      const id = element.getAttribute('aria-labelledby');
      const label = document.getElementById(id!);
      if (label) return label.textContent || '';
    }
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) return label.textContent || '';
    }
    return element.textContent?.trim().slice(0, 100) || '';
  }

  private generateSelector(element: HTMLElement): string {
    if (element.id) return `#${element.id}`;
    const cls: unknown = (element as any).className;
    const clsStr = typeof cls === 'string' ? cls : (cls && typeof (cls as any).baseVal === 'string' ? (cls as any).baseVal : '');
    if (clsStr.trim()) {
      const classes = clsStr.split(' ').filter((c: string) => c).join('.');
      return `${element.tagName.toLowerCase()}.${classes}`;
    }
    return element.tagName.toLowerCase();
  }

  private navigate(id: number, url: string) {
    window.location.href = url;
    this.sendResponse(id, true, { url });
  }

  private click(id: number, payload: { element: string; ref: string }) {
    const element = document.querySelector(payload.ref || payload.element);
    if (element) {
      (element as HTMLElement).click();
      this.sendResponse(id, true, { clicked: true });
    } else {
      this.sendResponse(id, false, null, 'Element not found');
    }
  }

  private type(id: number, payload: { element: string; ref: string; text: string; submit: boolean }) {
    const element = document.querySelector(payload.ref || payload.element) as HTMLInputElement;
    if (element) {
      element.focus();
      element.value = payload.text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      if (payload.submit) {
        const form = element.closest('form');
        if (form) form.submit();
      }
      this.sendResponse(id, true, { typed: true });
    } else {
      this.sendResponse(id, false, null, 'Element not found');
    }
  }

  private hover(id: number, payload: { element: string; ref: string }) {
    const element = document.querySelector((payload.ref || payload.element) as string) as HTMLElement | null;
    if (!element) {
      this.sendResponse(id, false, null, 'Element not found');
      return;
    }
    for (const type of ['pointerover', 'mouseover', 'mouseenter', 'mousemove']) {
      element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
    }
    this.sendResponse(id, true, { hovered: true });
  }

  private drag(id: number, payload: { startElement: string; startRef?: string; endElement: string; endRef?: string }) {
    const start = document.querySelector((payload.startRef || payload.startElement) as string) as HTMLElement | null;
    const end = document.querySelector((payload.endRef || payload.endElement) as string) as HTMLElement | null;
    if (!start || !end) {
      this.sendResponse(id, false, null, 'Drag start/end element not found');
      return;
    }
    const r1 = start.getBoundingClientRect();
    const r2 = end.getBoundingClientRect();
    const opts = (x: number, y: number) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y });
    start.dispatchEvent(new MouseEvent('mousedown', opts(r1.x + r1.width / 2, r1.y + r1.height / 2)));
    start.dispatchEvent(new DragEvent('dragstart', opts(r1.x + r1.width / 2, r1.y + r1.height / 2)));
    end.dispatchEvent(new DragEvent('dragover', opts(r2.x + r2.width / 2, r2.y + r2.height / 2)));
    end.dispatchEvent(new DragEvent('drop', opts(r2.x + r2.width / 2, r2.y + r2.height / 2)));
    start.dispatchEvent(new DragEvent('dragend', opts(r2.x + r2.width / 2, r2.y + r2.height / 2)));
    this.sendResponse(id, true, { dragged: true });
  }

  private pressKey(id: number, payload: { key: string }) {
    const key = payload.key;
    if (!key) {
      this.sendResponse(id, false, null, 'press_key: missing key');
      return;
    }
    const target = (document.activeElement as HTMLElement) || document.body;
    const opts: KeyboardEventInit = { key, bubbles: true, cancelable: true };
    target.dispatchEvent(new KeyboardEvent('keydown', opts));
    target.dispatchEvent(new KeyboardEvent('keypress', opts));
    if (key.length === 1 && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      target.value += key;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
    target.dispatchEvent(new KeyboardEvent('keyup', opts));
    this.sendResponse(id, true, { pressed: key });
  }

  private selectOption(id: number, payload: { element: string; ref: string; values: string[] }) {
    const element = document.querySelector((payload.ref || payload.element) as string) as HTMLSelectElement | null;
    if (!element) {
      this.sendResponse(id, false, null, 'Element not found');
      return;
    }
    const values = payload.values ?? [];
    let selected = 0;
    for (const opt of Array.from(element.options)) {
      const match = values.includes(opt.value) || values.includes(opt.text) || values.includes(opt.label);
      opt.selected = match;
      if (match) selected++;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    this.sendResponse(id, true, { selected });
  }

  private evaluate(id: number, script: string) {
    try {
      const result = eval(script);
      this.sendResponse(id, true, result);
    } catch (error) {
      this.sendResponse(id, false, null, String(error));
    }
  }

  private storageGet(id: number, keys: string[]) {
    const storage = keys.map(key => ({
      key,
      localStorage: localStorage.getItem(key),
      sessionStorage: sessionStorage.getItem(key)
    }));
    this.sendResponse(id, true, storage);
  }

  private storageSet(id: number, key: string, value: string) {
    localStorage.setItem(key, value);
    this.sendResponse(id, true, { key, value });
  }

  private storageClear(id: number) {
    localStorage.clear();
    sessionStorage.clear();
    this.sendResponse(id, true, { cleared: true });
  }

  private async screenshot(id: number) {
    try {
      // Create canvas from page
      const canvas = document.createElement('canvas');
      canvas.width = document.documentElement.scrollWidth;
      canvas.height = document.documentElement.scrollHeight;
      const ctx = canvas.getContext('2d')!;
      
      // This is a simplified version - in reality you'd use html2canvas or similar
      // For now, return a placeholder
      this.sendResponse(id, true, { 
        message: 'Screenshot would be captured here',
        width: canvas.width,
        height: canvas.height
      });
    } catch (error) {
      this.sendResponse(id, false, null, String(error));
    }
  }

  private wait(id: number, time: number) {
    setTimeout(() => {
      this.sendResponse(id, true, { waited: time });
    }, time * 1000);
  }

  private send(message: Message) {
    try {
      this.port?.postMessage(message);
    } catch {
      this.port = null; // background caiu; nova tentativa no próximo ciclo
    }
  }

  private sendResponse(id: number, success: boolean, result?: any, error?: string) {
    this.send({
      id,
      type: 'response',
      payload: { success, result, error }
    });
  }
}

// Initialize
console.log('OpenCode Browser content script loaded');
new ContentScript();