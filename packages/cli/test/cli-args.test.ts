import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { command, doctorStatus, parseAccessoryUpgradeArgs, parseInventoryArgs, parseItemDumpArgs, parseItemNetworthArgs, parseNextUpgradesArgs, parsePlanArgs, parseSetupArgs } from "../src/index.ts";

let tempHome: string | null = null;

afterEach(() => {
  if (tempHome) {
    fs.rmSync(tempHome, { recursive: true, force: true });
    tempHome = null;
  }
  delete process.env.SKYAGENT_HOME;
});

function isolatedSkyAgentHome() {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "skyagent-cli-test-"));
  process.env.SKYAGENT_HOME = tempHome;
}

describe("CLI argument parsing", () => {
  test("item-dump accepts the documented no-player --section form", async () => {
    isolatedSkyAgentHome();

    await expect(command(["item-dump", "--section", "accessory_bag"])).rejects.toThrow("No username or UUID provided");
    await expect(command(["item-dump", "--section", "accessory_bag"])).rejects.not.toThrow("Usage: skyagent item-dump");
  });

  test("inventory honors --debug-raw when the flag is first", async () => {
    expect(parseInventoryArgs(["--debug-raw"])).toEqual({ values: [], debugRaw: true });
  });

  test("item-dump honors --debug-raw when the flag is first", async () => {
    expect(parseItemDumpArgs(["--debug-raw", "--section", "accessory_bag"])).toEqual({
      section: "accessory_bag",
      values: [],
      debugRaw: true,
    });
  });

  test("item-networth accepts player and profile around --section", () => {
    expect(parseItemNetworthArgs(["Notch", "Apple", "--section", "armor"])).toEqual({
      section: "armor",
      values: ["Notch", "Apple"],
    });
  });

  test("accessory-upgrades parses budget without treating it as a profile", () => {
    expect(parseAccessoryUpgradeArgs(["Notch", "Apple", "--budget", "1000000"])).toEqual({
      budget: 1_000_000,
      values: ["Notch", "Apple"],
    });
  });

  test("next-upgrades parses player profile and budget independently", () => {
    expect(parseNextUpgradesArgs(["Notch", "Apple", "--budget", "1000000"])).toEqual({
      budget: 1_000_000,
      values: ["Notch", "Apple"],
    });
    expect(parseNextUpgradesArgs(["--budget", "1000000"])).toEqual({
      budget: 1_000_000,
      values: [],
    });
  });

  test("plan parses goal player profile and optional budget", () => {
    expect(parsePlanArgs(["f7", "Notch", "Apple", "--budget", "1000000"])).toEqual({
      goal: "f7",
      budget: 1_000_000,
      values: ["Notch", "Apple"],
    });
    expect(parsePlanArgs(["garden"])).toEqual({
      goal: "garden",
      budget: null,
      values: [],
    });
  });

  test("plan validates budget before fetching profile data", async () => {
    await expect(command(["plan", "f7", "--budget", "-1"])).rejects.toThrow("Usage: skyagent plan");
  });

  test("setup parses non-interactive flags", () => {
    expect(parseSetupArgs(["--json", "--username", "Pastik_", "--api-key", "secret", "--profile", "Apple", "--no-write"])).toEqual({
      json: true,
      noWrite: true,
      username: "Pastik_",
      apiKey: "secret",
      profile: "Apple",
    });
  });

  test("setup status runs without live credentials", async () => {
    isolatedSkyAgentHome();

    await command(["setup", "status", "--json"]);
  });

  test("setup --json reports missing username without prompting", async () => {
    isolatedSkyAgentHome();

    await command(["setup", "--json"]);
  });

  test("version and doctor commands report install diagnostics", async () => {
    isolatedSkyAgentHome();

    await command(["version", "--json"]);
    await command(["doctor", "--json"]);
    expect(doctorStatus()).toMatchObject({
      ok: true,
      version: "0.1.0",
      runtime: {
        platform: process.platform,
        arch: process.arch,
      },
    });
  });

  test("root skyagent script delegates plan command to CLI", async () => {
    const proc = Bun.spawn(["bun", "./scripts/skyagent.ts", "plan", "f7", "--budget", "-1"], {
      cwd: path.resolve(import.meta.dir, "../../.."),
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage: skyagent plan");
  });
});
