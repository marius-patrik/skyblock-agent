import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { emitContextEvent } from "@skyagent/core/context-events";
import { listObjectiveItems } from "@skyagent/core/objectives";
import { command, doctorStatus, parseAccessoryUpgradeArgs, parseContextArgs, parseInventoryArgs, parseItemDumpArgs, parseItemNetworthArgs, parseNextUpgradesArgs, parsePlanArgs, parseProfileSnapshotArgs, parseSetupArgs } from "../src/index.ts";
import { installUpdate, parseUpdateArgs, updatePlan } from "../src/update.ts";

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
      maxItems: 150,
      timeoutMs: 8_000,
      includeItems: true,
    });
    expect(parseItemNetworthArgs(["Notch", "--section", "armor", "--max-items", "25", "--timeout-ms", "500", "--summary"])).toEqual({
      section: "armor",
      values: ["Notch"],
      maxItems: 25,
      timeoutMs: 500,
      includeItems: false,
    });
  });

  test("accessory-upgrades parses budget without treating it as a profile", () => {
    expect(parseAccessoryUpgradeArgs(["Notch", "Apple", "--budget", "1000000"])).toEqual({
      budget: 1_000_000,
      values: ["Notch", "Apple"],
      maxPriceLookups: 75,
      timeoutMs: 8_000,
    });
    expect(parseAccessoryUpgradeArgs(["Notch", "Apple", "--budget", "1000000", "--max-price-lookups", "20", "--timeout-ms", "750"])).toEqual({
      budget: 1_000_000,
      values: ["Notch", "Apple"],
      maxPriceLookups: 20,
      timeoutMs: 750,
    });
  });

  test("next-upgrades parses player profile and budget independently", () => {
    expect(parseNextUpgradesArgs(["Notch", "Apple", "--budget", "1000000"])).toEqual({
      budget: 1_000_000,
      values: ["Notch", "Apple"],
      maxPriceLookups: 75,
      accessoryTimeoutMs: 8_000,
    });
    expect(parseNextUpgradesArgs(["--budget", "1000000"])).toEqual({
      budget: 1_000_000,
      values: [],
      maxPriceLookups: 75,
      accessoryTimeoutMs: 8_000,
    });
    expect(parseNextUpgradesArgs(["Notch", "--budget", "1000000", "--max-price-lookups", "30", "--accessory-timeout-ms", "1200"])).toEqual({
      budget: 1_000_000,
      values: ["Notch"],
      maxPriceLookups: 30,
      accessoryTimeoutMs: 1200,
    });
  });

  test("plan parses goal player profile and optional budget", () => {
    expect(parsePlanArgs(["f7", "Notch", "Apple", "--budget", "1000000"])).toEqual({
      goal: "f7",
      budget: 1_000_000,
      values: ["Notch", "Apple"],
      maxItems: 150,
      networthTimeoutMs: 8_000,
      maxPriceLookups: 75,
      accessoryTimeoutMs: 8_000,
    });
    expect(parsePlanArgs(["garden"])).toEqual({
      goal: "garden",
      budget: null,
      values: [],
      maxItems: 150,
      networthTimeoutMs: 8_000,
      maxPriceLookups: 75,
      accessoryTimeoutMs: 8_000,
    });
    expect(parsePlanArgs(["f7", "Notch", "--budget", "1000000", "--max-items", "50", "--networth-timeout-ms", "1000", "--max-price-lookups", "25", "--accessory-timeout-ms", "1500"])).toEqual({
      goal: "f7",
      budget: 1_000_000,
      values: ["Notch"],
      maxItems: 50,
      networthTimeoutMs: 1000,
      maxPriceLookups: 25,
      accessoryTimeoutMs: 1500,
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

  test("profile-snapshot parses deterministic cache controls", () => {
    expect(parseProfileSnapshotArgs(["Notch", "Apple", "--refresh", "--ttl-ms", "60000"])).toEqual({
      values: ["Notch", "Apple"],
      refresh: true,
      cacheOnly: false,
      allowStale: false,
      ttlMs: 60_000,
    });
    expect(parseProfileSnapshotArgs(["--cache-only", "--allow-stale", "Notch"])).toEqual({
      values: ["Notch"],
      refresh: false,
      cacheOnly: true,
      allowStale: true,
      ttlMs: undefined,
    });
  });

  test("context parses refresh and cache controls", () => {
    expect(parseContextArgs(["Notch", "Apple", "--cache-only", "--allow-stale", "--ttl-ms", "60000"])).toEqual({
      refresh: false,
      values: ["Notch", "Apple"],
      cacheOnly: true,
      allowStale: true,
      ttlMs: 60_000,
    });
    expect(parseContextArgs(["refresh", "Notch", "Apple"])).toMatchObject({
      refresh: true,
      values: ["Notch", "Apple"],
    });
  });

  test("context watch and emit commands run without live credentials", async () => {
    isolatedSkyAgentHome();

    await command(["context", "emit", "cli.test", "--message", "hello"]);
    await command(["context", "watch", "--since", "0", "--limit", "1", "--once"]);
  });

  test("context emit and watch share persisted events across CLI processes", async () => {
    isolatedSkyAgentHome();
    await command(["context", "emit", "cli.persisted_test", "--message", "hello"]);

    const proc = Bun.spawn(["bun", "./scripts/skyagent.ts", "context", "watch", "--once", "--since", "0", "--limit", "5"], {
      cwd: path.resolve(import.meta.dir, "../../.."),
      env: { ...process.env, SKYAGENT_HOME: tempHome! },
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("cli.persisted_test");
  });

  test("context watch streams subscribed events until interrupted", async () => {
    isolatedSkyAgentHome();
    const writes: string[] = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      const watching = command(["context", "watch", "--since", "999999", "--limit", "1"]);
      emitContextEvent({
        type: "cli.stream_test",
        source: { kind: "cli", transport: "test" },
        payload: { ok: true },
        freshness: { status: "local", source: "test" },
      });
      process.emit("SIGINT");
      await watching;
    } finally {
      process.stdout.write = originalWrite;
    }

    expect(writes.join("")).toContain("\"type\":\"cli.stream_test\"");
  });

  test("objective commands create, update, complete, and delete local work items", async () => {
    isolatedSkyAgentHome();

    await command(["objective", "create", "buy", "Buy", "Hyperion", "--item-id", "HYPERION", "--target-price", "2000000000", "--budget", "2100000000", "--priority", "10", "--source-provider", "coflnet", "--freshness-status", "fresh", "--freshness-source", "coflnet", "--warning", "volatile:Price moved:prices.lbin", "--tag", "mage"]);
    const created = listObjectiveItems({ kind: "buy" }).items[0];

    expect(created).toMatchObject({
      title: "Buy Hyperion",
      itemId: "HYPERION",
      targetPrice: 2_000_000_000,
      sourceProvider: "coflnet",
      tags: ["mage"],
      freshness: {
        status: "fresh",
        source: "coflnet",
        warnings: [{ code: "volatile", message: "Price moved", sourcePath: "prices.lbin" }],
      },
    });

    await command(["objective", "update", created.id, "--status", "active", "--note", "Watch during low volume", "--freshness-status", "stale", "--warning", "old_cache:Refresh before buying"]);
    expect(listObjectiveItems({ status: "active" }).items[0]).toMatchObject({ id: created.id, notes: "Watch during low volume" });
    expect(listObjectiveItems({ status: "active" }).items[0].freshness).toMatchObject({
      status: "stale",
      warnings: [{ code: "old_cache", message: "Refresh before buying", sourcePath: null }],
    });

    await command(["objective", "complete", created.id]);
    expect(listObjectiveItems({ status: "done" }).items[0].id).toBe(created.id);

    await command(["objective", "delete", created.id]);
    expect(listObjectiveItems().items).toEqual([]);
    expect(listObjectiveItems({ includeDeleted: true }).items[0]).toMatchObject({ id: created.id, status: "deleted" });
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

  test("update commands parse flags and select compatible release artifact without installing", async () => {
    isolatedSkyAgentHome();
    const target = process.platform === "win32"
      ? "windows-x64"
      : process.platform === "darwin" && process.arch === "arm64"
        ? "darwin-arm64"
        : process.platform === "darwin"
          ? "darwin-x64"
          : "linux-x64";
    const metadata = {
      version: "1.2.3",
      tag: "v1.2.3",
      assets: [{ name: `skyagent-${target}.zip`, sha256: "abc123", size: 42 }],
    };
    const fetchText = async (url: string) => url.endsWith("SHA256SUMS.txt")
      ? `abc123  skyagent-${target}.zip\n`
      : JSON.stringify(metadata);

    expect(parseUpdateArgs(["--json", "--version", "1.2.3", "--dry-run", "--restart", "all"])).toEqual({
      json: true,
      dryRun: true,
      version: "1.2.3",
      restart: "all",
    });
    await expect(updatePlan({ version: "1.2.3", fetchText })).resolves.toMatchObject({
      latestVersion: "1.2.3",
      tag: "v1.2.3",
      target,
      asset: { name: `skyagent-${target}.zip`, sha256: "abc123" },
    });
    const standalonePath = path.join(os.tmpdir(), process.platform === "win32" ? "skyagent.exe" : "skyagent");
    await expect(installUpdate({
      version: "1.2.3",
      fetchText,
      dryRun: true,
      installPath: standalonePath,
      validateInstallPath: async () => ({ version: "0.1.0" }),
    })).resolves.toMatchObject({
      dryRun: true,
      latestVersion: "1.2.3",
      target,
    });
    expect(() => parseUpdateArgs(["--version"])).toThrow("--version requires a version value");
    expect(() => parseUpdateArgs(["--dryrun"])).toThrow("Unknown update flag");
    expect(() => parseUpdateArgs(["extra"])).toThrow("Unexpected update argument");
    await expect(installUpdate({
      fetchText: async (url: string) => url.endsWith("SHA256SUMS.txt")
        ? `abc123  skyagent-${target}.zip\n`
        : JSON.stringify({ ...metadata, version: "0.1.0", tag: "v0.1.0" }),
      installPath: path.join(os.tmpdir(), process.platform === "win32" ? "skyagent.exe" : "skyagent"),
      validateInstallPath: async () => ({ version: "0.1.0" }),
    })).rejects.toThrow("already up to date");
    await expect(installUpdate({
      version: "1.2.3",
      fetchText,
      installPath: path.resolve(import.meta.dir, "../../../scripts/skyagent.ts"),
      dryRun: true,
      validateInstallPath: async () => ({ version: "0.1.0" }),
    })).rejects.toThrow("non-standalone install path");
    await expect(installUpdate({
      version: "1.2.3",
      fetchText,
      installPath: path.join(os.tmpdir(), process.platform === "win32" ? "skyagent.exe" : "skyagent"),
      dryRun: true,
      validateInstallPath: async () => ({ version: "0.1.0" }),
    })).resolves.toMatchObject({ dryRun: true, installTarget: { version: "0.1.0" } });
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
