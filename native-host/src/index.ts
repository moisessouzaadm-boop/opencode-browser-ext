// OpenCode Browser - Native Messaging Host
// Communicates with Chrome extension via stdin/stdout (native messaging protocol)
// and provides WebSocket server for browsermcp clients (port 9012)

import { EventEmitter } from 'node:events';
import { createDefaultHandlers } from './handler.js';
import type { NativeMessage, NativeResponse, HandlerMap } from './types.js';

const BROWSERMCP_PORT = 9012;
const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_ATTEMPTS = 10;

class NativeMessagingHost extends EventEmitter {
  private handlers: Map<string, Function>;
  private browsermcpWsServer: any = null;
  private browsermcpClients = new Set<any>();
  private messageId = 0;
  private pendingRequests = new Map<number, { resolve: Function; reject: Function }>();
  private stdinBuffer = Buffer.alloc(0);
  constructor() {
    super();
    this.handlers = new Map();
    
    // Register default handlers
    const defaultHandlers = createDefaultHandlers();
    for (const [type, handler] of Object.entries(defaultHandlers)) {
      this.registerHandler(type, handler);
    }
  }

  registerHandler(type: string, handler: Function) {
    this.handlers.set(type, handler);
  }

  async start() {
    console.error('[NativeHost] Starting native messaging host...');
    
    // Start WebSocket server for browsermcp clients (port 9012)
    await this.startBrowsermcpWebSocketServer();
    
    // Set up stdin/stdout for native messaging protocol
    this.setupStdio();
    
    console.error('[NativeHost] Native messaging host started');
  }

  private async startBrowsermcpWebSocketServer(): Promise<void> {
    const { WebSocketServer } = await import('ws');
    const wsModule = await import('ws');
    this.browsermcpWsServer = new wsModule.WebSocketServer({ port: BROWSERMCP_PORT });
    
    return new Promise((resolve, reject) => {
      this.browsermcpWsServer.on('listening', () => {
        console.error(`[NativeHost] Browsermcp WebSocket server listening on port ${BROWSERMCP_PORT}`);
        resolve();
      });
      
      this.browsermcpWsServer.on('connection', (ws: any) => {
        console.error('[NativeHost] Browsermcp client connected');
        this.browsermcpClients.add(ws);
        
        ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleBrowsermcpMessage(ws, message);
          } catch (error) {
            console.error('[NativeHost] Invalid browsermcp message:', error);
          }
        });
        
        ws.on('close', () => {
          console.error('[NativeHost] Browsermcp client disconnected');
          this.browsermcpClients.delete(ws);
        });
        
        ws.on('error', (error: Error) => {
          console.error('[NativeHost] Browsermcp WebSocket error:', error);
        });
      });
      
      this.browsermcpWsServer.on('error', (error: Error) => {
        console.error('[NativeHost] Browsermcp WebSocket server error:', error);
        reject(error);
      });
    });
  }

  private setupStdio() {
    // Native messaging protocol: 4-byte length (little-endian) + JSON
    let buffer = Buffer.alloc(0);
    
    process.stdin.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      this.processStdinBuffer(buffer);
    });
    
    process.stdin.on('end', () => {
      console.error('[NativeHost] stdin ended');
      process.exit(0);
    });
    
    process.stdin.on('error', (err: Error) => {
      console.error('[NativeHost] stdin error:', err);
      process.exit(1);
    });
  }

  private processStdinBuffer(buffer: Buffer) {
    let offset = 0;
    
    while (buffer.length - offset >= 4) {
      const length = buffer.readUInt32LE(offset);
      if (buffer.length - offset < 4 + length) {
        break; // Wait for more data
      }
      
      const messageBytes = buffer.subarray(offset + 4, offset + 4 + length);
      offset += 4 + length;
      
      try {
        const message = JSON.parse(messageBytes.toString('utf8'));
        this.handleMessage(message);
      } catch (error) {
        console.error('[NativeHost] Invalid stdin message:', error);
      }
    }
    
    // Keep remaining bytes
    if (offset > 0) {
      this.stdinBuffer = Buffer.from(buffer.subarray(offset));
    }
  }

  private handleMessage(message: any) {
    if (message.type === 'response' && message.id) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        if (message.success) {
          pending.resolve(message.result);
        } else {
          pending.reject(new Error(message.error || 'Unknown error'));
        }
        this.pendingRequests.delete(message.id);
      }
    } else if (message.type === 'request' || message.type === 'notification') {
      this.handleRequest(message);
    }
  }

  private handleExtensionMessage(message: any) {
    // Forward messages from extension to browsermcp clients
    if (message.type === 'request' || message.type === 'notification') {
      this.broadcastToBrowsermcpClients(message);
    }
  }

  private handleBrowsermcpMessage(ws: any, message: any) {
    if (message.type === 'response' && message.id) {
      // This would be a response to a request we sent to browsermcp
      // Currently we don't send requests to browsermcp, only receive
    } else if (message.type === 'request' || message.type === 'notification') {
      // Forward browsermcp requests to extension via stdout (native messaging)
      this.sendToStdout(message);
    }
  }

  private broadcastToBrowsermcpClients(message: any) {
    for (const ws of this.browsermcpClients) {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(JSON.stringify(message));
      }
    }
  }

  private async handleRequest(message: any) {
    const { id, type, payload } = message;
    
    if (!id || !type) {
      this.sendStdioResponse(id, false, null, 'Invalid message format');
      return;
    }

    const handler = this.handlers.get(type);
    if (!handler) {
      this.sendStdioResponse(id, false, null, `No handler for type: ${type}`);
      return;
    }

    try {
      const result = await handler(payload);
      this.sendStdioResponse(id, true, result);
    } catch (error) {
      this.sendStdioResponse(id, false, null, String(error));
    }
  }

  private sendStdioResponse(id: number, success: boolean, result?: any, error?: string) {
    const response = {
      id,
      success,
      result,
      error
    };
    
    this.sendToStdout({ id, success, result, error });
  }

  private sendToStdout(message: any) {
    const json = JSON.stringify(message);
    const buffer = Buffer.alloc(4 + Buffer.byteLength(json, 'utf8'));
    buffer.writeUInt32LE(Buffer.byteLength(json, 'utf8'), 0);
    buffer.write(json, 4, 'utf8');
    process.stdout.write(buffer);
  }

  async sendToExtension(type: string, payload: any): Promise<any> {
    const id = ++this.messageId;
    const message = { id, type, payload };
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      // Send via stdout (native messaging protocol)
      this.sendToStdout({ id, type, payload });
      
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  private messageIdCounter = 0;

  async sendToPlugin(message: any) {
    // Send via stdout (native messaging protocol)
    this.sendToStdout(message);
    console.log(JSON.stringify(message));
  }
}

// Main entry point
async function main() {
  const host = new NativeMessagingHost();
  
  process.on('SIGINT', async () => {
    console.error('[NativeHost] Shutting down...');
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.error('[NativeHost] Shutting down...');
    process.exit(0);
  });
  
  await host.start();
  
  // Keep process alive
  await new Promise(() => {});
}

main().catch(console.error);