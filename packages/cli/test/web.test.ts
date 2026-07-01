import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "bun:test";
import { command } from "../src/index.ts";
import { stopGatewayProcess } from "@skyagent/gateway/manager";
import { startWebProcess, stopWebProcess, webRuntimePath, webStatus } from "../src/web.ts";

let tempHome: string | null = null;

afterEach(async () => {
  await stopWebProcess();
  await stopGatewayProcess();
  if (tempHome) {
    fs.rmSync(tempHome, { recursive: true, force: true });
    tempHome = null;
  }
  delete process.env.SKYAGENT_HOME;
});

function isolatedSkyAgentHome() {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "skyagent-web-cli-test-"));
  process.env.SKYAGENT_HOME = tempHome;
}

async function occupiedPort() {
  const server = net.createServer();
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });
  return { server, port };
}

test("web status reports stopped when no runtime exists", async () => {
  isolatedSkyAgentHome();

  expect(await webStatus()).toEqual({ running: false });
});

test("web status redacts stale runtime metadata", async () => {
  isolatedSkyAgentHome();
  fs.writeFileSync(webRuntimePath(), JSON.stringify({
    pid: process.pid,
    port: 18473,
    host: "127.0.0.1",
    url: "http://127.0.0.1:18473",
    logPath: path.join(tempHome ?? "", "web.log"),
    startedAt: new Date(0).toISOString(),
    gatewayUrl: "http://127.0.0.1:18472",
  }));

  expect(await webStatus()).toEqual({ running: false, stale: true });
});

test("root command delegates web status without starting servers", async () => {
  isolatedSkyAgentHome();

  await command(["web", "status"]);
  expect(await webStatus()).toEqual({ running: false });
});

test("web --json emits compact JSON and strips output flag", async () => {
  isolatedSkyAgentHome();
  const proc = Bun.spawn(["bun", "./scripts/skyagent.ts", "web", "status", "--json"], {
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

test("web start rejects occupied ports before spawning a web runtime", async () => {
  isolatedSkyAgentHome();
  const { server, port } = await occupiedPort();
  try {
    await expect(startWebProcess([`--port=${port}`, "--no-open"])).rejects.toThrow("already in use");
    expect(await webStatus()).toEqual({ running: false });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("web start serves the built app and stop removes the runtime", async () => {
  isolatedSkyAgentHome();
  const { server, port } = await occupiedPort();
  const { server: gatewayServer, port: gatewayPort } = await occupiedPort();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise<void>((resolve) => gatewayServer.close(() => resolve()));

  try {
    const started = await startWebProcess([`--port=${port}`, `--gateway-port=${gatewayPort}`, "--no-open"]);
    expect(started).toMatchObject({ running: true, port, opened: false });
    expect(fs.existsSync(webRuntimePath())).toBe(true);

    const response = await fetch(`http://127.0.0.1:${port}`);
    expect(response.ok).toBe(true);
    expect(await response.text()).toContain("skyagent-web");
    const malformedPath = await fetch(`http://127.0.0.1:${port}/%E0%A4%A`);
    expect(malformedPath.ok).toBe(true);
    expect(await malformedPath.text()).toContain("skyagent-web");

    expect(await stopWebProcess()).toMatchObject({ stopped: true });
    expect(await webStatus()).toEqual({ running: false });
  } finally {
    await stopWebProcess();
  }
}, 15_000);
