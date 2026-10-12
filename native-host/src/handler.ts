// Native Messaging Host - Message Handlers

import type { MessageHandler, HandlerMap } from './types.js';

export class MessageHandlerRegistry {
  private handlers: HandlerMap = {};

  register(type: string, handler: MessageHandler) {
    this.handlers[type] = handler;
  }

  get(type: string): MessageHandler | undefined {
    return this.handlers[type];
  }

  has(type: string): boolean {
    return type in this.handlers;
  }
}

// Create default handlers
export function createDefaultHandlers(): HandlerMap {
  return {
    snapshot: async (payload: any) => {
      // This will be implemented by the extension side
      return { success: true, data: { message: 'Snapshot requested from native host' } };
    },
    
    navigate: async (payload: { url: string }) => {
      return { success: true, data: { url: payload.url } };
    },
    
    click: async (payload: { selector: string }) => {
      return { success: true, data: { selector: payload.selector } };
    },
    
    type: async (payload: { selector: string; text: string; submit?: boolean }) => {
      return { success: true, data: payload };
    },
    
    evaluate: async (payload: { script: string }) => {
      return { success: true, data: { evaluated: true } };
    },
    
    storage_get: async (payload: { keys: string[] }) => {
      return { success: true, data: { storage: [] } };
    },
    
    storage_set: async (payload: { key: string; value: string }) => {
      return { success: true, data: { key: payload.key, value: payload.value } };
    },
    
    storage_clear: async () => {
      return { success: true, data: { cleared: true } };
    },
    
    screenshot: async () => {
      return { success: true, data: { message: 'Screenshot requested' } };
    },
    
    wait: async (payload: { time: number }) => {
      await new Promise(resolve => setTimeout(resolve, payload.time * 1000));
      return { success: true, data: { waited: payload.time } };
    },
    
    execute_script: async (payload: { script: string }) => {
      return { success: true, data: { executed: true } };
    }
  };
}