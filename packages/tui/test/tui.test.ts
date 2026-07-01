import path from "node:path";
import { expect, test } from "bun:test";
import { tuiSnapshot, tuiStatus } from "../src/index.ts";

test("tui status initializes without live credentials", () => {
  const status = tuiStatus();

  expect(status.surface).toBe("tui");
  expect(status.ready).toBe(true);
  expect(status.config.apiKeyConfigured).toBeTypeOf("boolean");
});

test("tui smoke snapshot exposes screens and does not print secrets", () => {
  const snapshot = tuiSnapshot();

  expect(snapshot.screens).toContain("status");
  expect(snapshot.screens).toContain("profiles");
  expect(snapshot.screens).toContain("overview");
  expect(snapshot.screens).toContain("debug");
  expect(snapshot.shortcuts).toContain("up/down or j/k");
  expect(snapshot.shortcuts).toContain("left/right or h/l");
  expect(snapshot.secrets).toContain("never printed");
});

test("root skyagent script delegates tui smoke mode", async () => {
  const proc = Bun.spawn(["bun", "./scripts/skyagent.ts", "tui", "--smoke"], {
    cwd: path.resolve(import.meta.dir, "../../.."),
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).json();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  expect(exitCode).toBe(0);
  expect(stderr).toBe("");
  expect(stdout.surface).toBe("tui");
  expect(stdout.screens).toContain("profiles");
});
