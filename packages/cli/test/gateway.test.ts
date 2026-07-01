import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "bun:test";
import { command } from "../src/index.ts";
import { gatewayCommand, gatewayLogPath, gatewayRuntimePath, gatewayStatus, gatewayTokenPath, startGatewayProcess, stopGatewayProcess } from "../src/gateway.ts";

let tempHome: string | null = null;

afterEach(async () => {
  await stopGatewayProcess();
  if (tempHome) {
    fs.rmSync(tempHome, { recursive: true, force: true });
    tempHome = null;
  }
  delete process.env.SKYAGENT_HOME;
});

function isolatedSkyAgentHome() {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "skyagent-gateway-cli-test-"));
  process.env.SKYAGENT_HOME = tempHome;
}

async function freePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        resolve(typeof address === "object" && address ? address.port : 0);
      });
    });
  });
}

function expectRunningGatewayStatus(status: Awaited<ReturnType<typeof startGatewayProcess>>) {
  if (!("pid" in status)) {
    throw new Error("Expected running gateway status to include pid");
  }
  return status;
}

async function killAndWait(pid: number) {
  try {
    process.kill(pid);
  } catch {
    return;
  }
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch {
      return;
    }
  }
  throw new Error(`Gateway process ${pid} did not exit after kill`);
}

test("gateway status reports stopped when no runtime exists", async () => {
  isolatedSkyAgentHome();

  expect(await gatewayStatus()).toEqual({ running: false });
});

test("gateway start persists redacted runtime metadata and stop removes it", async () => {
  isolatedSkyAgentHome();

  const port = await freePort();
  const status = expectRunningGatewayStatus(await startGatewayProcess([`--port=${port}`]));
  expect(status.running).toBe(true);
  expect(status.url).toBe(`http://127.0.0.1:${port}`);
  expect(status.tokenConfigured).toBe(true);
  expect(JSON.stringify(status)).not.toContain('"token":');
  expect(fs.existsSync(gatewayRuntimePath())).toBe(true);
  expect(fs.existsSync(gatewayTokenPath())).toBe(true);
  expect(fs.readFileSync(gatewayRuntimePath(), "utf8")).not.toContain("token");
  expect(fs.existsSync(gatewayLogPath())).toBe(true);
  expect(fs.readFileSync(gatewayLogPath(), "utf8")).not.toContain(fs.readFileSync(gatewayTokenPath(), "utf8").trim());

  const stopped = await stopGatewayProcess();
  expect(stopped.stopped).toBe(true);
  expect(fs.existsSync(gatewayRuntimePath())).toBe(false);
  expect(fs.existsSync(gatewayTokenPath())).toBe(false);
});

test("gateway stop treats token or endpoint mismatch as stale without killing by pid", async () => {
  isolatedSkyAgentHome();
  const port = await freePort();
  const status = expectRunningGatewayStatus(await startGatewayProcess([`--port=${port}`]));
  fs.writeFileSync(gatewayTokenPath(), "wrong-token\n", "utf8");

  const stopped = await stopGatewayProcess();
  expect(stopped).toEqual({ stopped: false, reason: "stale_runtime" });
  expect(fs.existsSync(gatewayRuntimePath())).toBe(false);
  await killAndWait(status.pid);
});

test("gateway status redacts stale runtime metadata", async () => {
  isolatedSkyAgentHome();
  const port = await freePort();
  const status = expectRunningGatewayStatus(await startGatewayProcess([`--port=${port}`]));
  fs.writeFileSync(gatewayTokenPath(), "wrong-token\n", "utf8");

  expect(await gatewayStatus()).toEqual({ running: false, stale: true });
  await killAndWait(status.pid);
});

test("gateway start removes stale runtime metadata when readiness fails", async () => {
  isolatedSkyAgentHome();
  const port = await freePort();
  fs.writeFileSync(gatewayRuntimePath(), JSON.stringify({
    pid: 1,
    port: 12345,
    host: "127.0.0.1",
    url: "http://127.0.0.1:12345",
    logPath: gatewayLogPath(),
    startedAt: new Date(0).toISOString(),
    version: "stale",
  }));
  fs.writeFileSync(gatewayTokenPath(), "stale-token\n", "utf8");

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch: () => Response.json({ ok: false }, { status: 409 }),
  });

  try {
    await expect(startGatewayProcess([`--port=${port}`])).rejects.toThrow("Gateway did not become ready");
    expect(fs.existsSync(gatewayRuntimePath())).toBe(false);
    expect(fs.existsSync(gatewayTokenPath())).toBe(false);
  } finally {
    server.stop(true);
  }
});

test("gateway commands treat missing token with runtime metadata as stale", async () => {
  isolatedSkyAgentHome();
  fs.writeFileSync(gatewayRuntimePath(), JSON.stringify({
    pid: process.pid,
    port: 12345,
    host: "127.0.0.1",
    url: "http://127.0.0.1:12345",
    logPath: gatewayLogPath(),
    startedAt: new Date(0).toISOString(),
    version: "stale",
  }));

  expect(await gatewayStatus()).toEqual({ running: false, stale: true });
  expect(await stopGatewayProcess()).toEqual({ stopped: false, reason: "stale_runtime" });
  expect(fs.existsSync(gatewayRuntimePath())).toBe(false);
});

test("gateway command rejects unknown action", async () => {
  isolatedSkyAgentHome();

  await expect(gatewayCommand("unknown")).rejects.toThrow("Usage: skyagent gateway");
});

test("gateway start rejects ephemeral port because status must be reusable", async () => {
  isolatedSkyAgentHome();

  await expect(startGatewayProcess(["--port=0"])).rejects.toThrow("between 1 and 65535");
});

test("gateway restart starts when no runtime exists", async () => {
  isolatedSkyAgentHome();
  const port = await freePort();

  const status = await gatewayCommand("restart", [`--port=${port}`]);

  expect(status).toMatchObject({
    running: true,
    url: `http://127.0.0.1:${port}`,
  });
});

test("root command delegates gateway status without touching direct commands", async () => {
  isolatedSkyAgentHome();

  await command(["gateway", "status"]);
  await expect(command(["plan", "f7", "--budget", "-1"])).rejects.toThrow("Usage: skyagent plan");
});

test("root gateway start command exits while managed gateway keeps running", async () => {
  isolatedSkyAgentHome();
  const port = await freePort();
  const proc = Bun.spawn(["bun", "./scripts/skyagent.ts", "gateway", "start", `--port=${port}`], {
    cwd: path.resolve(import.meta.dir, "../../.."),
    env: { ...process.env, SKYAGENT_HOME: tempHome ?? "" },
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await Promise.race([
    proc.exited,
    new Promise<number>((resolve) => setTimeout(() => resolve(124), 3_000)),
  ]);
  const stderr = await new Response(proc.stderr).text();

  expect(exitCode).toBe(0);
  expect(stderr).toBe("");
  expect(await gatewayStatus()).toMatchObject({
    running: true,
    url: `http://127.0.0.1:${port}`,
  });
});

test("gateway --json emits compact JSON and strips output flag", async () => {
  isolatedSkyAgentHome();
  const proc = Bun.spawn(["bun", "./scripts/skyagent.ts", "gateway", "status", "--json"], {
    cwd: path.resolve(import.meta.dir, "../../.."),
    env: { ...process.env, SKYAGENT_HOME: tempHome ?? "" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  expect(exitCode).toBe(0);
  expect(stderr).toBe("");
  expect(stdout).toBe(`${JSON.stringify({ running: false })}\n`);
});
