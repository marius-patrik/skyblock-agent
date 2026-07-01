import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { ensureDataDir } from "@skyagent/core/store";
import { GatewayClient } from "@skyagent/gateway";

type GatewayRuntime = {
  pid: number;
  port: number;
  host: string;
  url: string;
  logPath: string;
  startedAt: string;
  version: string;
};

export function gatewayRuntimePath() {
  return path.join(ensureDataDir(), "gateway.json");
}

export function gatewayLogPath() {
  return path.join(ensureDataDir(), "gateway.log");
}

export function gatewayTokenPath() {
  return path.join(ensureDataDir(), "gateway.token");
}

function readRuntime(): GatewayRuntime | null {
  try {
    return JSON.parse(fs.readFileSync(gatewayRuntimePath(), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function writeRuntime(runtime: GatewayRuntime) {
  fs.writeFileSync(gatewayRuntimePath(), `${JSON.stringify(runtime, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(gatewayRuntimePath(), 0o600);
}

function deleteRuntime() {
  fs.rmSync(gatewayRuntimePath(), { force: true });
}

function readToken() {
  return fs.readFileSync(gatewayTokenPath(), "utf8").trim();
}

function tryReadToken() {
  try {
    return readToken();
  } catch {
    return null;
  }
}

function isPidRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function runtimeIsGateway(runtime: GatewayRuntime) {
  if (!isPidRunning(runtime.pid)) {
    return false;
  }
  const token = tryReadToken();
  if (!token) {
    return false;
  }
  try {
    const version = await new GatewayClient({ baseUrl: runtime.url, token }).version();
    return version.pid === runtime.pid;
  } catch {
    return false;
  }
}

function publicRunningRuntime(runtime: GatewayRuntime) {
  return {
    running: true,
    pid: runtime.pid,
    port: runtime.port,
    host: runtime.host,
    url: runtime.url,
    tokenConfigured: fs.existsSync(gatewayTokenPath()),
    logPath: runtime.logPath,
    startedAt: runtime.startedAt,
    version: runtime.version,
  };
}

async function publicRuntime(runtime: GatewayRuntime | null) {
  if (!runtime) {
    return { running: false };
  }
  if (!await runtimeIsGateway(runtime)) {
    return { running: false, stale: true };
  }
  return publicRunningRuntime(runtime);
}

function parsePort(args: string[]) {
  const inline = args.find((arg) => arg.startsWith("--port="));
  if (inline) {
    return Number(inline.slice("--port=".length));
  }
  const index = args.indexOf("--port");
  if (index !== -1) {
    return Number(args[index + 1]);
  }
  return 18472;
}

function gatewayScriptPath() {
  return fileURLToPath(import.meta.resolve("@skyagent/gateway/bin"));
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForGateway(url: string, token: string) {
  const client = new GatewayClient({ baseUrl: url, token });
  const deadline = Date.now() + 3_000;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      return await client.version();
    } catch (error) {
      lastError = error;
      await sleep(100);
    }
  }
  throw new Error(`Gateway did not become ready: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function waitForGatewayShutdown(url: string, token: string) {
  const client = new GatewayClient({ baseUrl: url, token });
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      await client.version();
      await sleep(50);
    } catch {
      return true;
    }
  }
  return false;
}

async function waitForPidExit(pid: number) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (!isPidRunning(pid)) {
      return true;
    }
    await sleep(50);
  }
  return !isPidRunning(pid);
}

export async function startGatewayProcess(args: string[] = []) {
  const existing = readRuntime();
  if (existing) {
    if (await runtimeIsGateway(existing)) {
      return publicRuntime(existing);
    }
    deleteRuntime();
    fs.rmSync(gatewayTokenPath(), { force: true });
  }

  const host = "127.0.0.1";
  const port = parsePort(args);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Gateway port must be an integer between 1 and 65535.");
  }

  const token = randomBytes(32).toString("base64url");
  const logPath = gatewayLogPath();
  const tokenPath = gatewayTokenPath();
  fs.writeFileSync(tokenPath, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(tokenPath, 0o600);
  fs.writeFileSync(logPath, "", { encoding: "utf8", flag: "a" });
  const logFile = Bun.file(logPath);
  const proc = Bun.spawn(["bun", gatewayScriptPath(), `--host=${host}`, `--port=${port}`, `--token-file=${tokenPath}`], {
    cwd: process.cwd(),
    stdout: logFile,
    stderr: logFile,
    stdin: "ignore",
    detached: true,
  } as Parameters<typeof Bun.spawn>[1] & { detached: boolean });
  (proc as unknown as { unref?: () => void }).unref?.();

  const runtime: GatewayRuntime = {
    pid: proc.pid,
    port,
    host,
    url: `http://${host}:${port}`,
    logPath,
    startedAt: new Date().toISOString(),
    version: "unknown",
  };
  try {
    const version = await waitForGateway(runtime.url, token);
    runtime.pid = version.pid;
    runtime.version = version.version ?? runtime.version;
  } catch (error) {
    if (isPidRunning(proc.pid)) {
      process.kill(proc.pid);
    }
    deleteRuntime();
    fs.rmSync(tokenPath, { force: true });
    throw error;
  }
  writeRuntime(runtime);
  return publicRuntime(runtime);
}

export async function stopGatewayProcess() {
  const runtime = readRuntime();
  if (!runtime) {
    return { stopped: false, reason: "not_running" };
  }
  if (!await runtimeIsGateway(runtime)) {
    deleteRuntime();
    fs.rmSync(gatewayTokenPath(), { force: true });
    return { stopped: false, reason: "stale_runtime" };
  }

  const token = tryReadToken();
  if (!token) {
    deleteRuntime();
    return { stopped: false, reason: "stale_runtime" };
  }
  const client = new GatewayClient({ baseUrl: runtime.url, token });
  try {
    await client.shutdown();
  } catch {
    // The authenticated version probe above already proved this is our gateway.
    // If graceful shutdown is unavailable, fall through to the PID fallback.
  }
  if (!await waitForGatewayShutdown(runtime.url, token)) {
    try {
      process.kill(runtime.pid);
    } catch {
      // Treat a missing process as stopped and clean up stale metadata below.
    }
    if (!await waitForPidExit(runtime.pid)) {
      return { stopped: false, reason: "shutdown_timeout", pid: runtime.pid };
    }
  }
  deleteRuntime();
  fs.rmSync(gatewayTokenPath(), { force: true });
  return { stopped: true, pid: runtime.pid };
}

export async function gatewayStatus() {
  const runtime = readRuntime();
  return publicRuntime(runtime);
}

export function gatewayLogs() {
  const logPath = gatewayLogPath();
  let tail = "";
  try {
    const text = fs.readFileSync(logPath, "utf8");
    tail = text.split(/\r?\n/).slice(-80).join("\n").trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  return { logPath, tail };
}

export async function gatewayCommand(action = "status", args: string[] = []) {
  if (action === "start") {
    return startGatewayProcess(args);
  }
  if (action === "stop") {
    return stopGatewayProcess();
  }
  if (action === "restart") {
    const stopped = await stopGatewayProcess();
    if (stopped.stopped === false && !["not_running", "stale_runtime"].includes(stopped.reason)) {
      throw new Error(`Gateway restart failed during stop: ${stopped.reason}`);
    }
    return startGatewayProcess(args);
  }
  if (action === "status") {
    return gatewayStatus();
  }
  if (action === "logs") {
    return gatewayLogs();
  }
  throw new Error("Usage: skyagent gateway start|stop|restart|status|logs");
}
