import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { startSkyAgentSession } from "../src/start.ts";

let tempHome: string | null = null;

afterEach(() => {
  if (tempHome) {
    fs.rmSync(tempHome, { recursive: true, force: true });
    tempHome = null;
  }
  delete process.env.SKYAGENT_HOME;
});

function isolatedSkyAgentHome() {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "skyagent-start-test-"));
  process.env.SKYAGENT_HOME = tempHome;
}

describe("session start", () => {
  test("defaults to live refresh unless cache-only is explicit", async () => {
    isolatedSkyAgentHome();

    const live = await startSkyAgentSession({ checkLlmHealth: false });
    const cached = await startSkyAgentSession({ cacheOnly: true, allowStale: true, checkLlmHealth: false });

    expect(live.freshnessPolicy).toMatchObject({ refresh: true, cacheOnly: false });
    expect(cached.freshnessPolicy).toMatchObject({ refresh: false, cacheOnly: true, allowStale: true });
    expect(live.sessionEvent.type).toBe("agent.session_start");
    expect(cached.sessionEvent.type).toBe("agent.session_start");
  });
});
