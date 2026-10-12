# MCP patch notes (`@browsermcp/mcp@0.1.3`)

Patched copy lives at `~/.config/opencode/browsermcp/node_modules/@browsermcp/mcp/dist/index.js`.
Keep a backup before `npm install` overwrites it.

## Patch 1 — `server.close` recursion (upstream bug)

Upstream `close()` recursed infinitely. The patch saves the original and closes
the WS server + context in order (`dist/index.js`, ~line 267):

```js
const _origClose = server.close.bind(server);
server.close = async () => {
  await _origClose();
  await wss.close();
  await context.close();
};
```

## Patch 2 — port fallback 9009→9020

Instead of SIGKILL-ing the port holder (crash cascade), `createWebSocketServer`
tries `9009`, then the next 11 ports, then an ephemeral one, logging
`browsermcp: porta <p> ocupada, usando <q>` to stderr.

## Extension contract (implemented in `extension/`)

The MCP is the WS **server**; the extension is the **client**. Message flow:

- MCP → ext: `{ id, type, payload }` (id is a UUID string)
- ext → MCP: `{ type: "messageResponse", payload: { requestId: id, result?, error? } }`

Tool types: `getUrl`, `getTitle`, `browser_snapshot`, `browser_navigate`,
`browser_go_back/forward`, `browser_wait`, `browser_press_key`,
`browser_get_console_logs`, `browser_screenshot`, `browser_click/drag/hover/type/select_option`.
