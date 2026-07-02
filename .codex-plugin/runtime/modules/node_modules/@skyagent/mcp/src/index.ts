#!/usr/bin/env bun

import { callTool, textResult, tools } from "./tools.ts";

function response(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function errorResponse(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function send(message) {
  const payload = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`);
}

async function handle(message) {
  if (message.id === undefined) {
    return;
  }

  try {
    switch (message.method) {
      case "initialize":
        send(response(message.id, {
          protocolVersion: message.params?.protocolVersion ?? "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "skyagent", version: "0.1.0" },
        }));
        break;
      case "tools/list":
        send(response(message.id, { tools }));
        break;
      case "tools/call": {
        const result = await callTool(message.params?.name, message.params?.arguments ?? {});
        send(response(message.id, textResult(result)));
        break;
      }
      default:
        send(errorResponse(message.id, -32601, `Method not found: ${message.method}`));
        break;
    }
  } catch (error) {
    send(errorResponse(message.id, -32000, error.message));
  }
}

let buffer = Buffer.alloc(0);

function parseMessages() {
  while (buffer.length > 0) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const header = buffer.slice(0, headerEnd).toString("utf8");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        buffer = buffer.slice(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (buffer.length < bodyEnd) {
        return;
      }
      const body = buffer.slice(bodyStart, bodyEnd).toString("utf8");
      buffer = buffer.slice(bodyEnd);
      handle(JSON.parse(body));
      continue;
    }

    const newline = buffer.indexOf("\n");
    if (newline === -1) {
      return;
    }
    const line = buffer.slice(0, newline).toString("utf8").trim();
    buffer = buffer.slice(newline + 1);
    if (line) {
      handle(JSON.parse(line));
    }
  }
}

export function startMcpServer() {
  process.stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    parseMessages();
  });
}

if (import.meta.main) {
  startMcpServer();
}

