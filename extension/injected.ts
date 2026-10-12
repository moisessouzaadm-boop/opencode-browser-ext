// OpenCode Browser Extension - Injected Script
// Runs in page context (world: MAIN), has access to page variables

interface InjectedMessage {
  type: string;
  payload: any;
}

interface InjectedResponse {
  id: number;
  success: boolean;
  result?: any;
  error?: string;
}

// Expose API to page
(window as any).__OPENCODE_BROWSER__ = {
  // Intercept fetch/XHR
  interceptFetch: (callback: (request: Request) => Request | Promise<Request>) => {
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const modified = await callback(request);
      return originalFetch(modified);
    };
  },

  // Intercept XHR
  interceptXHR: (callback: (xhr: XMLHttpRequest) => void) => {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method: string, url: string | URL, async: boolean = true, username?: string | null, password?: string | null) {
      (this as any).__opencode_url = url;
      return originalOpen.call(this, method, url, async, username, password);
    };
    
    XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
      const xhr = this;
      const originalOnReadyStateChange = xhr.onreadystatechange;
      xhr.onreadystatechange = function(this: XMLHttpRequest, ev: Event) {
        callback(xhr);
        if (originalOnReadyStateChange) {
          originalOnReadyStateChange.call(this, ev);
        }
      };
      return originalSend.call(this, body);
    };
  },

  // LocalStorage access
  storage: {
    get: (key: string) => localStorage.getItem(key),
    set: (key: string, value: string) => localStorage.setItem(key, value),
    remove: (key: string) => localStorage.removeItem(key),
    clear: () => localStorage.clear(),
    getAll: () => ({ ...localStorage })
  },

  // SessionStorage access
  sessionStorage: {
    get: (key: string) => sessionStorage.getItem(key),
    set: (key: string, value: string) => sessionStorage.setItem(key, value),
    remove: (key: string) => sessionStorage.removeItem(key),
    clear: () => sessionStorage.clear()
  },

  // Cookies
  cookies: {
    get: (name: string) => {
      const value = `; ${document.cookie}`.split(`; ${name}=`).pop()?.split(';').shift();
      return value;
    },
    set: (name: string, value: string, days = 365) => {
      const expires = new Date(Date.now() + days * 864e5).toUTCString();
      document.cookie = `${name}=${value}; expires=${expires}; path=/`;
    },
    remove: (name: string) => {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  },

  // DOM utilities
  dom: {
    querySelector: (selector: string) => document.querySelector(selector),
    querySelectorAll: (selector: string) => Array.from(document.querySelectorAll(selector)),
    getElementById: (id: string) => document.getElementById(id),
    createElement: (tag: string, attrs?: Record<string, string>) => {
      const el = document.createElement(tag);
      if (attrs) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      return el;
    }
  }
};

// Listen for messages from content script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data?.type?.startsWith('OPENCODE_')) return;

  const { type, id, payload } = event.data;
  let result: any;

  try {
    switch (type) {
      case 'OPENCODE_EVALUATE':
        result = eval(payload.script);
        break;
      case 'OPENCODE_STORAGE_GET':
        result = { localStorage: payload.keys.map((k: string) => ({ key: k, value: localStorage.getItem(k) })) };
        break;
      case 'OPENCODE_STORAGE_SET':
        localStorage.setItem(payload.key, payload.value);
        result = { success: true };
        break;
      default:
        throw new Error(`Unknown type: ${type}`);
    }
    window.postMessage({ type: 'OPENCODE_RESPONSE', id, success: true, result }, '*');
  } catch (error) {
    window.postMessage({ type: 'OPENCODE_RESPONSE', id, success: false, error: String(error) }, '*');
  }
});

console.log('OpenCode Browser injected script loaded');