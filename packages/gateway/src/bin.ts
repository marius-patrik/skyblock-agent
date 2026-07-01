#!/usr/bin/env bun

import fs from "node:fs";
import { startGateway } from "./index.ts";

const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const hostArg = process.argv.find((arg) => arg.startsWith("--host="));
const tokenArg = process.argv.find((arg) => arg.startsWith("--token="));
const tokenFileArg = process.argv.find((arg) => arg.startsWith("--token-file="));
const token = tokenArg
  ? tokenArg.slice("--token=".length)
  : tokenFileArg
    ? fs.readFileSync(tokenFileArg.slice("--token-file=".length), "utf8").trim()
    : "";
const host = hostArg ? hostArg.slice("--host=".length) : "127.0.0.1";

if (!token) {
  process.stderr.write("skyagent gateway requires --token=<token> or --token-file=<path>. Process-managed token persistence is added by the CLI gateway commands.\n");
  process.exit(1);
}

const gateway = startGateway({
  port: portArg ? Number(portArg.slice("--port=".length)) : 0,
  host,
  token,
  allowShutdown: ["127.0.0.1", "localhost", "::1"].includes(host),
});

process.stdout.write(`${JSON.stringify(gateway.status, null, 2)}\n`);
