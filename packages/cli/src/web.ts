import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDataDir } from "@skyagent/core/store";
import { gatewayClient } from "@skyagent/gateway/manager";

type WebRuntime = {
  pid: number;
  port: number;
  host: string;
  url: string;
  logPath: string;
  startedAt: string;
  gatewayUrl: string;
  processIdentity: ProcessIdentity;
};

type ProcessIdentity = {
  platform: string;
  startTime: string;
  commandLine: string;
};

export function webRuntimePath() {
  return path.join(ensureDataDir(), "web.json");
}

export function webLogPath() {
  return path.join(ensureDataDir(), "web.log");
}

function readRuntime(): WebRuntime | null {
  try {
    return JSON.parse(fs.readFileSync(webRuntimePath(), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function writeRuntime(runtime: WebRuntime) {
  fs.writeFileSync(webRuntimePath(), `${JSON.stringify(runtime, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(webRuntimePath(), 0o600);
}

function deleteRuntime() {
  fs.rmSync(webRuntimePath(), { force: true });
}

function isPidRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function processIdentity(pid: number): ProcessIdentity | null {
  if (!isPidRunning(pid)) {
    return null;
  }
  if (process.platform === "linux") {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      const end = stat.lastIndexOf(")");
      const fields = stat.slice(end + 2).split(" ");
      const startTime = fields[19] ?? "";
      const commandLine = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim();
      return { platform: process.platform, startTime, commandLine };
    } catch {
      return null;
    }
  }
  if (process.platform === "win32") {
    const script = `$p=Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"; if ($p) { [pscustomobject]@{creationDate=$p.CreationDate.ToString("o"); commandLine=$p.CommandLine} | ConvertTo-Json -Compress }`;
    const proc = Bun.spawnSync(["powershell", "-NoProfile", "-Command", script], { stdout: "pipe", stderr: "ignore" });
    const text = new TextDecoder().decode(proc.stdout).trim();
    if (!text) {
      return null;
    }
    const parsed = JSON.parse(text);
    return { platform: process.platform, startTime: parsed.creationDate ?? "", commandLine: parsed.commandLine ?? "" };
  }
  const proc = Bun.spawnSync(["ps", "-p", String(pid), "-o", "lstart=", "-o", "command="], { stdout: "pipe", stderr: "ignore" });
  const text = new TextDecoder().decode(proc.stdout).trim();
  return text ? { platform: process.platform, startTime: text.split(/\s+/).slice(0, 5).join(" "), commandLine: text } : null;
}

function sameProcessIdentity(runtime: WebRuntime) {
  const current = processIdentity(runtime.pid);
  return Boolean(
    current
      && current.platform === runtime.processIdentity?.platform
      && current.startTime === runtime.processIdentity?.startTime
  );
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
  return 18473;
}

function gatewayArgs(args: string[]) {
  const inline = args.find((arg) => arg.startsWith("--gateway-port="));
  if (inline) {
    return [`--port=${inline.slice("--gateway-port=".length)}`];
  }
  const index = args.indexOf("--gateway-port");
  if (index !== -1) {
    return [`--port=${args[index + 1]}`];
  }
  return [];
}

async function runtimeIsWeb(runtime: WebRuntime) {
  if (!sameProcessIdentity(runtime)) {
    return false;
  }
  return urlServesSkyAgentWeb(runtime.url);
}

async function urlServesSkyAgentWeb(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(500) });
    return response.ok && await response.text().then((text) => text.includes("skyagent-web"));
  } catch {
    return false;
  }
}

async function publicRuntime(runtime: WebRuntime | null) {
  if (!runtime) {
    return { running: false };
  }
  if (!await runtimeIsWeb(runtime)) {
    return { running: false, stale: true };
  }
  return {
    running: true,
    pid: runtime.pid,
    port: runtime.port,
    host: runtime.host,
    url: runtime.url,
    logPath: runtime.logPath,
    startedAt: runtime.startedAt,
    gatewayUrl: runtime.gatewayUrl,
  };
}

function webPackageDir() {
  return path.dirname(fileURLToPath(import.meta.resolve("@skyagent/web/package.json")));
}

function webServerEntry() {
  return fileURLToPath(import.meta.resolve("@skyagent/web/server"));
}

function webDistIndexPath() {
  return path.join(webPackageDir(), "dist", "index.html");
}

function assertWebBundle() {
  const indexPath = webDistIndexPath();
  if (fs.existsSync(indexPath) && fs.readFileSync(indexPath, "utf8").includes("skyagent-web")) {
    return;
  }
  throw new Error(`SkyAgent web bundle is missing or stale at ${indexPath}. Reinstall SkyAgent or run 'bun run build:web' in the source checkout.`);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function terminateProcessTree(pid: number) {
  if (process.platform === "win32") {
    Bun.spawnSync(["taskkill", "/PID", String(pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
    return;
  }
  try {
    process.kill(-pid);
  } catch {
    process.kill(pid);
  }
}

async function waitForWeb(url: string) {
  const deadline = Date.now() + 8_000;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      const text = response.ok ? await response.text() : "";
      if (response.ok && text.includes("skyagent-web")) {
        return true;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(150);
  }
  throw new Error(`Web app did not become ready: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function assertPortAvailable(host: string, port: number) {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        reject(new Error(`Web port ${port} is already in use.`));
        return;
      }
      reject(new Error(`Could not bind web port ${port} on ${host}: ${error.message}`));
    });
    server.listen(port, host, () => server.close(() => resolve()));
  });
}

async function waitForWebStopped(runtime: WebRuntime) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (!await urlServesSkyAgentWeb(runtime.url)) {
      return true;
    }
    await sleep(100);
  }
  return !await urlServesSkyAgentWeb(runtime.url);
}

async function openUrl(url: string) {
  const platform = process.platform;
  const command = platform === "win32"
    ? ["cmd", "/c", "start", "", url]
    : platform === "darwin"
      ? ["open", url]
      : ["xdg-open", url];
  const proc = Bun.spawn(command, { stdout: "ignore", stderr: "ignore", stdin: "ignore" });
  await proc.exited;
  return { opened: true, url };
}

export async function startWebProcess(args: string[] = []) {
  const existing = readRuntime();
  if (existing && await runtimeIsWeb(existing)) {
    await gatewayClient(gatewayArgs(args));
    const status = await publicRuntime(existing);
    if (!args.includes("--no-open")) {
      await openUrl(existing.url);
    }
    return { ...status, opened: !args.includes("--no-open") };
  }
  if (existing) {
    deleteRuntime();
  }

  const host = "127.0.0.1";
  const port = parsePort(args);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Web port must be an integer between 1 and 65535.");
  }
  await assertPortAvailable(host, port);
  const gateway = await gatewayClient(gatewayArgs(args));

  const logPath = webLogPath();
  fs.writeFileSync(logPath, "", { encoding: "utf8", flag: "a" });
  assertWebBundle();
  const logFile = Bun.file(logPath);
  const proc = Bun.spawn(["bun", webServerEntry(), "--host", host, "--port", String(port)], {
    cwd: webPackageDir(),
    stdout: logFile,
    stderr: logFile,
    stdin: "ignore",
    detached: true,
  } as Parameters<typeof Bun.spawn>[1] & { detached: boolean });
  (proc as unknown as { unref?: () => void }).unref?.();

  const runtime: WebRuntime = {
    pid: proc.pid,
    port,
    host,
    url: `http://${host}:${port}`,
    logPath,
    startedAt: new Date().toISOString(),
    gatewayUrl: gateway.status.url,
    processIdentity: processIdentity(proc.pid) ?? { platform: process.platform, startTime: "", commandLine: "" },
  };
  if (!runtime.processIdentity.startTime) {
    if (isPidRunning(proc.pid)) {
      terminateProcessTree(proc.pid);
    }
    throw new Error("Could not record web process identity.");
  }
  writeRuntime(runtime);
  try {
    await waitForWeb(runtime.url);
  } catch (error) {
    if (isPidRunning(proc.pid)) {
      terminateProcessTree(proc.pid);
    }
    deleteRuntime();
    throw error;
  }
  if (!args.includes("--no-open")) {
    await openUrl(runtime.url);
  }
  return { ...(await publicRuntime(runtime)), opened: !args.includes("--no-open") };
}

export async function stopWebProcess() {
  const runtime = readRuntime();
  if (!runtime) {
    return { stopped: false, reason: "not_running" };
  }
  if (!await runtimeIsWeb(runtime)) {
    deleteRuntime();
    return { stopped: false, reason: "stale_runtime" };
  }
  terminateProcessTree(runtime.pid);
  if (!await waitForWebStopped(runtime)) {
    return { stopped: false, reason: "stop_timeout", pid: runtime.pid };
  }
  deleteRuntime();
  return { stopped: true, pid: runtime.pid };
}

export async function webStatus() {
  return publicRuntime(readRuntime());
}

export function webLogs() {
  const logPath = webLogPath();
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

export async function webCommand(action = "status", args: string[] = []) {
  if (action === "start") {
    return startWebProcess(args);
  }
  if (action === "stop") {
    return stopWebProcess();
  }
  if (action === "restart") {
    const stopped = await stopWebProcess();
    if (stopped.stopped === false && !["not_running", "stale_runtime"].includes(stopped.reason)) {
      throw new Error(`Web restart failed during stop: ${stopped.reason}`);
    }
    return startWebProcess(args);
  }
  if (action === "status") {
    return webStatus();
  }
  if (action === "open") {
    const status = await webStatus();
    if ("url" in status) {
      await gatewayClient(gatewayArgs(args));
      return openUrl(status.url);
    }
    const started = await startWebProcess(["--no-open", ...args]);
    if (!("url" in started)) {
      throw new Error("Web app is not running.");
    }
    return openUrl(started.url);
  }
  if (action === "logs") {
    return webLogs();
  }
  throw new Error("Usage: skyagent web start|stop|restart|status|open|logs");
}
