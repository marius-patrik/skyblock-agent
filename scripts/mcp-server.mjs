#!/usr/bin/env node

import readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function error(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

rl.on("line", (line) => {
  if (!line.trim()) {
    return;
  }

  let request;
  try {
    request = JSON.parse(line);
  } catch {
    error(null, -32700, "Parse error");
    return;
  }

  if (request.id === undefined) {
    return;
  }

  switch (request.method) {
    case "initialize":
      respond(request.id, {
        protocolVersion: request.params?.protocolVersion ?? "2024-11-05",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "skyagent",
          version: "0.1.0",
        },
      });
      break;
    case "tools/list":
      respond(request.id, { tools: [] });
      break;
    default:
      error(request.id, -32601, `Method not found: ${request.method}`);
      break;
  }
});
