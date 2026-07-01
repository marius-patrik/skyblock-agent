import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { command, parseAccessoryUpgradeArgs, parseInventoryArgs, parseItemDumpArgs, parseItemNetworthArgs } from "../src/index.ts";

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
});
