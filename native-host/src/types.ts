// Native Messaging Host - Type definitions

export interface NativeMessage {
  id: number;
  type: string;
  payload: any;
}

export interface NativeResponse {
  id: number;
  success: boolean;
  result?: any;
  error?: string;
}

export type MessageHandler = (payload: any) => Promise<any>;

export interface HandlerMap {
  [key: string]: MessageHandler;
}

export const MESSAGE_TYPES = {
  // Extension -> Host
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  SNAPSHOT: 'snapshot',
  NAVIGATE: 'navigate',
  CLICK: 'click',
  TYPE: 'type',
  EVALUATE: 'evaluate',
  STORAGE_GET: 'storage_get',
  STORAGE_SET: 'storage_set',
  STORAGE_CLEAR: 'storage_clear',
  SCREENSHOT: 'screenshot',
  WAIT: 'wait',
  NETWORK_INTERCEPT_START: 'network_intercept_start',
  NETWORK_INTERCEPT_STOP: 'network_intercept_stop',
  EXECUTE_SCRIPT: 'execute_script',
  
  // Host -> Extension
  RESPONSE: 'response',
  EVENT: 'event',
  ERROR: 'error'
} as const;

// Union type for messages that can come from stdin (both requests and responses)
export type StdioMessage = NativeMessage | NativeResponse;