import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { afterEach, expect, test } from "bun:test";
import { renderToString } from "ink";
import { stopGatewayProcess } from "@skyagent/gateway/manager";
import { SURFACE_CONTRACTS } from "@skyagent/core/surface-contracts";
import { activeObjectiveItems, agentConsumesPrintableInput, agentInputAction, agentRefreshShortcut, agentShouldAppendPrintableInput, applyAgentTranscriptDelta, clearProfileBoundScreenData, compactJson, connectTuiGateway, finishAgentTranscript, loadTuiSurfaceScreen, objectiveActionLabel, objectiveCursorAction, shouldAutoLoadTuiSurfaceScreen, SkyAgentTuiApp, startAgentTranscript, statusShouldAppendSetupInput, TUI_MENU_IDS, TUI_SURFACE_SCREEN_IDS, tuiAccessoriesSummary, tuiDegradedMessages, tuiEventsSummary, tuiGatewayStateLabel, tuiGearSummary, tuiInventorySummary, tuiListCursorAction, tuiMenuNavigationAction, tuiMenuStateNavigationAction, tuiNetworthSummary, tuiObjectivesSummary, tuiProgressionSummary, tuiProvidersSummary, TuiScreenPreview, tuiScreenIndex, tuiSetupCommand, tuiSetupDisplayInput, tuiSnapshot, tuiStatus } from "../src/index.tsx";

let tempHome: string | null = null;

afterEach(async () => {
  if (tempHome) {
    await stopGatewayProcess();
    fs.rmSync(tempHome, { recursive: true, force: true });
    tempHome = null;
  }
  delete process.env.SKYAGENT_HOME;
  delete process.env.SKYAGENT_GATEWAY_PORT;
});

function isolatedSkyAgentHome() {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "skyagent-tui-test-"));
  process.env.SKYAGENT_HOME = tempHome;
  process.env.SKYAGENT_GATEWAY_PORT = String(20_000 + Math.floor(Math.random() * 20_000));
}

test("tui status initializes without live credentials", () => {
  const status = tuiStatus();

  expect(status.surface).toBe("tui");
  expect(status.renderer).toBe("ink");
  expect(status.ready).toBe(true);
  expect(status.config.apiKeyConfigured).toBeTypeOf("boolean");
});

test("tui smoke snapshot exposes screens and does not print secrets", () => {
  const snapshot = tuiSnapshot();

  expect(snapshot.screens).toContain("agent");
  expect(snapshot.screens).toContain("status");
  expect(snapshot.screens).toContain("profiles");
  expect(snapshot.screens).toContain("overview");
  expect(snapshot.screens).toContain("inventory");
  expect(snapshot.screens).toContain("gear");
  expect(snapshot.screens).toContain("accessories");
  expect(snapshot.screens).toContain("networth");
  expect(snapshot.screens).toContain("progression");
  expect(snapshot.screens).toContain("providers");
  expect(snapshot.screens).toContain("events");
  expect(snapshot.screens).toContain("objectives");
  expect(snapshot.screens).toContain("debug");
  expect(snapshot.shortcuts).toContain("up/down or j/k");
  expect(snapshot.shortcuts).toContain("left/right or h/l");
  expect(snapshot.shortcuts).toContain("tab add objective");
  expect(snapshot.shortcuts).toContain("x complete objective");
  expect(snapshot.secrets).toContain("never printed");
  expect(snapshot.renderer).toBe("ink");
  expect(snapshot.representativeContentStates.inventory).toContain("section_summary");
  expect(snapshot.representativeContentStates.gear).toContain("wardrobe");
  expect(snapshot.representativeContentStates.accessories).toContain("magical_power");
  expect(snapshot.representativeContentStates.networth).toContain("compact_totals");
  expect(snapshot.representativeContentStates.progression).toContain("readiness_summary");
  expect(snapshot.representativeContentStates.providers).toContain("provider_freshness");
  expect(snapshot.representativeContentStates.events).toContain("recent_events");
  expect(snapshot.representativeContentStates.objectives).toContain("open_items");
  expect(snapshot.contractCoverage.map((contract: any) => contract.id)).toEqual(SURFACE_CONTRACTS.map((contract) => contract.id));
  expect(snapshot.trackedContractGaps).toEqual([]);
  for (const contract of snapshot.contractCoverage) {
    expect(contract.status).toBe("covered");
    for (const screen of contract.screens) {
      expect(snapshot.screens as string[]).toContain(screen);
    }
  }
});

test("tui source has no placeholder-only feature sections", () => {
  const source = fs.readFileSync(path.resolve(import.meta.dir, "../src/index.tsx"), "utf8");

  expect(source).not.toContain("richer TUI screen pending");
  expect(source).not.toContain("PENDING_SECTIONS");
});

test("tui summaries unwrap gateway response payloads", () => {
  const inventory = tuiInventorySummary({
    inventory: {
      ok: true,
      inventory: {
        sections: {
          armor: { available: true },
          wardrobe: { warnings: [{ code: "partial" }] },
        },
      },
    },
    normalized: {
      ok: true,
      items: [
        { name: "Terror Helmet", section: "armor" },
        { name: "Black Cat", kind: "pet" },
      ],
    },
  });

  expect(inventory.names).toEqual(["armor", "wardrobe"]);
  expect(inventory.normalized).toHaveLength(2);

  const gear = tuiGearSummary({
    inventory: {
      ok: true,
      inventory: {
        armor: [{ name: "Terror Helmet" }],
        equipment: [{ name: "Molten Necklace" }],
        wardrobe: [{ name: "Storm Chestplate" }],
        pets: [{ name: "Black Cat" }],
      },
    },
    normalized: { ok: true, items: [] },
  });

  expect(gear.current.map((item: any) => item.name)).toEqual(["Terror Helmet", "Molten Necklace"]);
  expect(gear.wardrobe.map((item: any) => item.name)).toEqual(["Storm Chestplate"]);
  expect(gear.pets.map((item: any) => item.name)).toEqual(["Black Cat"]);
});

test("tui debug JSON redacts secrets before rendering", () => {
  const rendered = compactJson({
    apiKey: "real-api-key",
    token: "real-token",
    headers: { authorization: "Bearer real-token" },
    nested: { refreshSecret: "secret-value", safe: "visible" },
  });

  expect(rendered).toContain("[redacted]");
  expect(rendered).toContain("visible");
  expect(rendered).not.toContain("real-api-key");
  expect(rendered).not.toContain("real-token");
  expect(rendered).not.toContain("secret-value");
});

test("tui setup commands map status input to writable config", () => {
  expect(tuiSetupCommand("username Pastik_")).toEqual({ ok: true, field: "username", config: { username: "Pastik_" } });
  expect(tuiSetupCommand("uuid 1234")).toEqual({ ok: true, field: "uuid", config: { uuid: "1234" } });
  expect(tuiSetupCommand("api-key secret-key")).toEqual({ ok: true, field: "apiKey", config: { apiKey: "secret-key" } });
  expect(tuiSetupCommand("profile profile-id")).toEqual({ ok: true, field: "selectedProfileId", config: { selectedProfileId: "profile-id" } });
  expect(tuiSetupCommand("api-key").ok).toBe(false);
  expect(tuiSetupCommand("unknown value").ok).toBe(false);
});

test("tui setup status input masks api keys while preserving non-secret input", () => {
  expect(tuiSetupDisplayInput("username Pastik_")).toBe("username Pastik_");
  expect(tuiSetupDisplayInput("api-key secret-key")).toBe("api-key **********");
  expect(tuiSetupDisplayInput("  key secret-token-value")).toBe("  key ******************");
  expect(tuiSetupDisplayInput("api-key secret-key")).not.toContain("secret-key");
});

test("tui status setup input preserves global quit before typing", () => {
  expect(statusShouldAppendSetupInput("q", "")).toBe(false);
  expect(statusShouldAppendSetupInput("q", "api-ke")).toBe(true);
  expect(statusShouldAppendSetupInput("a", "")).toBe(true);
});

test("tui status setup input preserves screen navigation shortcuts", () => {
  expect(statusShouldAppendSetupInput("j", "")).toBe(false);
  expect(statusShouldAppendSetupInput("k", "")).toBe(false);
  expect(statusShouldAppendSetupInput("j", "username ")).toBe(true);
  expect(statusShouldAppendSetupInput("k", "api-")).toBe(true);
  expect(statusShouldAppendSetupInput("", "", { upArrow: true })).toBe(false);
  expect(statusShouldAppendSetupInput("", "", { downArrow: true })).toBe(false);
});

test("tui navigation reaches every major non-chat surface", () => {
  let index = tuiScreenIndex("agent");
  const visited = [TUI_MENU_IDS[index]];

  for (let step = 1; step < TUI_MENU_IDS.length; step += 1) {
    index = tuiMenuNavigationAction("j", {}, index);
    visited.push(TUI_MENU_IDS[index]);
  }

  expect(visited).toEqual(TUI_MENU_IDS);
  for (const screen of TUI_SURFACE_SCREEN_IDS) {
    expect(visited).toContain(screen);
  }
  expect(tuiMenuNavigationAction("k", {}, 0)).toBe(TUI_MENU_IDS.length - 1);
  expect(tuiMenuNavigationAction("", { rightArrow: true }, tuiScreenIndex("agent"))).toBe(tuiScreenIndex("agent"));
  expect(tuiMenuNavigationAction("", { leftArrow: true }, tuiScreenIndex("agent"))).toBe(tuiScreenIndex("agent"));
  expect(tuiMenuStateNavigationAction("j", {}, { menuIndex: tuiScreenIndex("inventory"), error: "Setup incomplete", errorScreen: "inventory" })).toEqual({
    menuIndex: tuiScreenIndex("gear"),
    error: null,
    errorScreen: null,
  });
});

test("tui auto-loads newly selected surface screens until data or an error exists", () => {
  expect(shouldAutoLoadTuiSurfaceScreen("inventory", { loading: false, error: null, errorScreen: null, screenData: {} })).toBe(true);
  expect(shouldAutoLoadTuiSurfaceScreen("inventory", { loading: true, error: null, errorScreen: null, screenData: {} })).toBe(false);
  expect(shouldAutoLoadTuiSurfaceScreen("inventory", { loading: false, error: "Setup incomplete", errorScreen: "inventory", screenData: {} })).toBe(false);
  expect(shouldAutoLoadTuiSurfaceScreen("providers", { loading: false, error: "Setup incomplete", errorScreen: "inventory", screenData: {} })).toBe(true);
  expect(shouldAutoLoadTuiSurfaceScreen("inventory", { loading: false, error: null, errorScreen: null, screenData: { inventory: { ok: true } } })).toBe(false);
  expect(shouldAutoLoadTuiSurfaceScreen("status", { loading: false, error: null, errorScreen: null, screenData: {} })).toBe(false);
});

test("tui clears profile-bound screen cache after setup or profile changes", () => {
  const cleared = clearProfileBoundScreenData({
    inventory: { old: true },
    gear: { old: true },
    accessories: { old: true },
    networth: { old: true },
    progression: { old: true },
    providers: { keep: true },
    events: { keep: true },
    objectives: { keep: true },
  });

  expect(cleared.inventory).toBeUndefined();
  expect(cleared.gear).toBeUndefined();
  expect(cleared.accessories).toBeUndefined();
  expect(cleared.networth).toBeUndefined();
  expect(cleared.progression).toBeUndefined();
  expect(cleared.providers).toEqual({ keep: true });
  expect(cleared.events).toEqual({ keep: true });
  expect(cleared.objectives).toEqual({ keep: true });
});

test("tui list navigation keeps profile and debug cursor movement", () => {
  expect(tuiListCursorAction("profiles", "l", {}, 0, 3)).toBe(1);
  expect(tuiListCursorAction("profiles", "h", {}, 0, 3)).toBe(2);
  expect(tuiListCursorAction("debug", "", { rightArrow: true }, 2, 4)).toBe(3);
  expect(tuiListCursorAction("debug", "", { leftArrow: true }, 0, 4)).toBe(3);
  expect(tuiListCursorAction("inventory", "l", {}, 0, 3)).toBe(0);
  expect(tuiListCursorAction("profiles", "l", {}, 0, 0)).toBe(0);
});

test("tui surface loader calls gateway clients for every major screen", async () => {
  const calls: string[] = [];
  const client = {
    inventory: async () => {
      calls.push("inventory");
      return { ok: true, inventory: { sections: { armor: { available: true } } } };
    },
    normalizedItems: async () => {
      calls.push("normalizedItems");
      return { ok: true, items: [{ name: "Terror Helmet", section: "armor" }] };
    },
    accessories: async (...args: any[]) => {
      calls.push(`accessories:${args[2]?.maxPriceLookups}`);
      return { ok: true, accessories: { magicalPower: 802, accessories: [{ id: "ABICASE" }] } };
    },
    missingAccessories: async (...args: any[]) => {
      calls.push(`missingAccessories:${args[2]?.timeoutMs}`);
      return { ok: true, missingAccessories: { missing: [{ id: "CAMPFIRE_TALISMAN" }] } };
    },
    networth: async (...args: any[]) => {
      calls.push(`networth:${args[2]?.includeItems}`);
      return { ok: true, networth: { total: 123_456_789, sections: { armor: { total: 100_000 } } } };
    },
    progression: async () => {
      calls.push("progression");
      return { ok: true, progression: { sections: { skills: { level: 45 } } } };
    },
    weight: async () => {
      calls.push("weight");
      return { ok: true, weight: { estimate: 321 } };
    },
    readiness: async (area: string, _uuid?: string, _profileId?: string, options?: any) => {
      calls.push(`readiness:${area}:${options?.maxItems}`);
      return { ok: true, readiness: { status: "ready" } };
    },
    providerStatus: async () => {
      calls.push("providerStatus");
      return { ok: true, providers: { providers: [{ id: "hypixel-api", status: "available" }], resources: [{ kind: "items" }] } };
    },
    serverStatus: async () => {
      calls.push("serverStatus");
      return { ok: true, serverStatus: { online: true } };
    },
    llmProviderStatus: async () => {
      calls.push("llmProviderStatus");
      return { ok: true, provider: { configured: true, provider: "litellm", model: "codex-test" } };
    },
    contextEvents: async (options: any) => {
      calls.push(`contextEvents:${options.limit}`);
      return { ok: true, events: { latestSequence: 7, events: [{ id: "ctx-7", sequence: 7 }] } };
    },
    agentObjectives: async () => {
      calls.push("agentObjectives");
      return { ok: true, objectives: { active: [{ id: "obj-1", title: "Buy accessory" }] } };
    },
  };
  const config = { username: "patrik", apiKeyConfigured: true, selectedProfileId: "profile-1" };

  for (const screen of TUI_SURFACE_SCREEN_IDS) {
    const result = await loadTuiSurfaceScreen(client, config, screen);
    expect(result.error).toBeNull();
    expect(result.data).toBeTruthy();
  }

  expect(calls).toContain("inventory");
  expect(calls).toContain("normalizedItems");
  expect(calls).toContain("accessories:40");
  expect(calls).toContain("missingAccessories:3000");
  expect(calls).toContain("networth:false");
  expect(calls).toContain("progression");
  expect(calls).toContain("weight");
  expect(calls).toContain("readiness:general:60");
  expect(calls).toContain("providerStatus");
  expect(calls).toContain("serverStatus");
  expect(calls).toContain("llmProviderStatus");
  expect(calls).toContain("contextEvents:20");
  expect(calls).toContain("agentObjectives");
});

test("tui surface loader returns setup guidance before profile-bound gateway calls", async () => {
  const calls: string[] = [];
  const result = await loadTuiSurfaceScreen({
    inventory: async () => {
      calls.push("inventory");
      return {};
    },
    normalizedItems: async () => {
      calls.push("normalizedItems");
      return {};
    },
  }, { username: null, apiKeyConfigured: false, selectedProfileId: null }, "inventory");

  expect(result.data).toBeNull();
  expect(result.error).toContain("username or UUID");
  expect(result.error).toContain("selected profile");
  expect(calls).toEqual([]);
});

test("tui profile-bound surfaces allow cached gateway reads without an api key", async () => {
  const calls: string[] = [];
  const result = await loadTuiSurfaceScreen({
    inventory: async () => {
      calls.push("inventory");
      return { ok: true, inventory: { freshness: { status: "stale" } } };
    },
    normalizedItems: async () => {
      calls.push("normalizedItems");
      return { ok: true, items: [] };
    },
  }, { username: "patrik", apiKeyConfigured: false, selectedProfileId: "profile-1" }, "inventory");

  expect(result.error).toBeNull();
  expect(result.data).toBeTruthy();
  expect(calls).toEqual(["inventory", "normalizedItems"]);
});

test("tui renders new screen empty and loaded states through Ink", () => {
  const empty = renderToString(React.createElement(TuiScreenPreview, { screen: "inventory" }));
  expect(empty).toContain("Inventory / sections");
  expect(empty).toContain("No inventory loaded. Press r to refresh.");

  const loaded = renderToString(React.createElement(TuiScreenPreview, {
    screen: "inventory",
    state: {
      screenData: {
        inventory: {
          inventory: { ok: true, inventory: { sections: { armor: { available: true } } } },
          normalized: { ok: true, items: [{ name: "Terror Helmet", section: "armor" }] },
        },
      },
    },
  }));
  expect(loaded).toContain("Sections: armor");
  expect(loaded).toContain("Normalized items: 1");
});

test("tui renders provider freshness and degraded gateway state", () => {
  const output = renderToString(React.createElement(TuiScreenPreview, {
    screen: "providers",
    state: {
      gateway: { status: { running: true, url: "http://127.0.0.1:1234" } } as any,
      screenData: {
        providers: {
          providerStatus: {
            ok: true,
            providers: {
              providers: [
                { id: "hypixel-api", status: "missing_api_key", warnings: [{ code: "hypixel_api_key_missing" }] },
                { id: "pricing", status: "available", cache: { staleCount: 1 } },
              ],
              resources: [{ kind: "items", cacheStatus: "stale" }],
              warnings: [{ message: "Profile data is stale." }],
            },
          },
          serverStatus: { ok: true, serverStatus: { online: false } },
          llm: { ok: true, provider: { configured: false } },
        },
      },
    },
  }));

  expect(output).toContain("Gateway state: degraded");
  expect(output).toContain("hypixel-api: missing_api_key [degraded]");
  expect(output).toContain("pricing: available [stale]");
  expect(output).toContain("items: stale");
  expect(output).toContain("Profile data is stale.");
});

test("tui gateway state reports stale separately from degraded", () => {
  const staleSummary = tuiProvidersSummary({
    providerStatus: {
      providers: {
        providers: [{ id: "pricing", status: "available", cache: { staleCount: 1 } }],
        resources: [{ kind: "items", cacheStatus: "fresh" }],
      },
    },
  });
  const degradedSummary = tuiProvidersSummary({
    providerStatus: {
      providers: {
        providers: [{ id: "hypixel-api", status: "missing_api_key" }],
        resources: [],
      },
    },
  });

  expect(tuiGatewayStateLabel({ status: { running: true } }, staleSummary)).toBe("stale");
  expect(tuiGatewayStateLabel({ status: { running: true } }, degradedSummary)).toBe("degraded");
  expect(tuiGatewayStateLabel({ status: { running: false } }, staleSummary)).toBe("offline");
});

test("tui providers summary handles flat gateway provider status responses", () => {
  const summary = tuiProvidersSummary({
    providerStatus: {
      ok: true,
      providers: [{ id: "pricing", status: "available", cache: { staleCount: 1 } }],
      resources: [{ kind: "items", cacheStatus: "stale" }],
      warnings: [{ code: "provider_stale" }],
    },
  });

  expect(summary.providers[0].id).toBe("pricing");
  expect(summary.resources[0].kind).toBe("items");
  expect(summary.warnings[0].code).toBe("provider_stale");
  expect(tuiGatewayStateLabel({ status: { running: true } }, summary)).toBe("stale");
});

test("tui summaries cover loaded major screen fixtures", () => {
  const accessories = tuiAccessoriesSummary({
    accessories: {
      ok: true,
      accessories: {
        magicalPower: 802,
        accessories: [{ id: "ABICASE" }],
        warnings: [{ code: "stale_price" }],
      },
    },
    missing: {
      ok: true,
      missingAccessories: { missing: [{ id: "CAMPFIRE_TALISMAN" }] },
    },
  });
  expect(accessories.magicalPower).toBe(802);
  expect(accessories.owned).toHaveLength(1);
  expect(accessories.missing).toHaveLength(1);
  expect(accessories.warnings[0].code).toBe("stale_price");

  const networth = tuiNetworthSummary({
    ok: true,
    networth: {
      total: 123_456_789,
      currency: { purse: 1_000, bank: 2_000 },
      sections: { armor: { total: 100_000 } },
      warnings: [{ code: "partial" }],
    },
  });
  expect(networth.total).toBe(123_456_789);
  expect(networth.purse).toBe(1_000);
  expect(Object.keys(networth.sections)).toEqual(["armor"]);

  const progression = tuiProgressionSummary({
    progression: {
      ok: true,
      progression: {
        sections: { skills: { level: 45 } },
        warnings: [{ code: "missing_bestiary" }],
      },
    },
    weight: { ok: true, weight: { estimate: 321 } },
    readiness: { ok: true, readiness: { status: "ready", warnings: [{ code: "unsupported_exact_meta" }] } },
  });
  expect(progression.weight.estimate).toBe(321);
  expect(progression.readiness.status).toBe("ready");
  expect(progression.sections.skills.level).toBe(45);
  expect(progression.warnings[0].code).toBe("unsupported_exact_meta");

  const providers = tuiProvidersSummary({
    providerStatus: {
      ok: true,
      providers: {
        providers: [{ id: "hypixel-api", status: "available" }],
        resources: [{ kind: "items" }],
      },
    },
    serverStatus: { ok: true, serverStatus: { online: true } },
    llm: { ok: true, provider: { configured: true, provider: "litellm", model: "codex-test" } },
  });
  expect(providers.providers[0].id).toBe("hypixel-api");
  expect(providers.resources[0].kind).toBe("items");
  expect(providers.server.online).toBe(true);
  expect(providers.llm.model).toBe("codex-test");

  const events = tuiEventsSummary({
    ok: true,
    events: {
      latestSequence: 7,
      events: [{ id: "ctx-7", sequence: 7, type: "agent.session_start" }],
    },
  });
  expect(events.latestSequence).toBe(7);
  expect(events.events[0].type).toBe("agent.session_start");

  const objectives = tuiObjectivesSummary({
    ok: true,
    objectives: {
      active: [{ id: "obj-1", title: "Buy accessory", status: "open" }],
    },
  });
  expect(objectives.objectives.map((item: any) => item.id)).toEqual(["obj-1"]);
});

test("tui exports an Ink-backed React app surface", () => {
  expect(SkyAgentTuiApp).toBeTypeOf("function");
});

test("agent prompt keeps q as quit only before message input starts", () => {
  expect(agentInputAction("q", "")).toEqual({ action: "quit", input: "" });
  expect(agentInputAction("r", "")).toEqual({ action: "append", input: "r" });
  expect(agentInputAction("r", "oute to F7")).toEqual({ action: "append", input: "oute to F7r" });
  expect(agentInputAction("q", "how much is ")).toEqual({ action: "append", input: "how much is q" });
});

test("agent prompt reserves refresh for ctrl+r", () => {
  expect(agentRefreshShortcut("r", { ctrl: true })).toBe(true);
  expect(agentRefreshShortcut("\x12", { ctrl: true })).toBe(true);
  expect(agentRefreshShortcut("r", {})).toBe(false);
});

test("agent prompt leaves vim navigation keys global until text input starts", () => {
  expect(agentConsumesPrintableInput("j", "")).toBe(false);
  expect(agentConsumesPrintableInput("k", "")).toBe(false);
  expect(agentConsumesPrintableInput("h", "")).toBe(false);
  expect(agentConsumesPrintableInput("l", "")).toBe(false);
  expect(agentConsumesPrintableInput("\n", "juju")).toBe(false);
  expect(agentConsumesPrintableInput("\r", "juju")).toBe(false);
  expect(agentConsumesPrintableInput("j", "juju")).toBe(true);
});

test("agent prompt does not append backspace or delete control input", () => {
  expect(agentShouldAppendPrintableInput("\b", "juju", { backspace: true })).toBe(false);
  expect(agentShouldAppendPrintableInput("\x7f", "juju", { delete: true })).toBe(false);
  expect(agentShouldAppendPrintableInput("\t", "Buy Juju", { tab: true })).toBe(false);
  expect(agentShouldAppendPrintableInput("\t", "Buy Juju")).toBe(false);
  expect(agentShouldAppendPrintableInput("u", "juj")).toBe(true);
});

test("agent transcript tracks streaming assistant state", () => {
  const started = startAgentTranscript([], "what next?");
  expect(started).toEqual([
    { role: "user", content: "what next?" },
    { role: "assistant", content: "", pending: true },
  ]);

  const streamed = applyAgentTranscriptDelta(started, "Do dailies.");
  expect(streamed.at(-1)).toEqual({ role: "assistant", content: "Do dailies.", pending: true });

  const finished = finishAgentTranscript(streamed, "Do dailies.");
  expect(finished.at(-1)).toEqual({ role: "assistant", content: "Do dailies." });

  expect(applyAgentTranscriptDelta([], "Recovered.")).toEqual([{ role: "assistant", content: "Recovered.", pending: true }]);
  expect(finishAgentTranscript([], "")).toEqual([{ role: "assistant", content: "(no text returned)" }]);
});

test("agent degraded state exposes missing Hypixel and provider auth guidance", () => {
  const messages = tuiDegradedMessages(
    { username: null, uuid: null, apiKeyConfigured: false, selectedProfileId: null },
    {
      warnings: [{ code: "snapshot_only_context", message: "Context was built from cached snapshot data only." }],
      providerStatus: {
        llm: {
          warnings: [{ code: "llm_provider_missing", message: "Configure SkyAgent with provider=litellm before starting the persistent agent runtime." }],
        },
      },
    },
    true,
  );

  expect(messages.join("\n")).toContain("username or UUID");
  expect(messages.join("\n")).toContain("Hypixel API key");
  expect(messages.join("\n")).toContain("selected profile");
  expect(messages.join("\n")).toContain("cached snapshot");
  expect(messages.join("\n")).toContain("provider=litellm");
});

test("agent objective controls expose selectable actionable work items", () => {
  const agent = {
    objectives: {
      active: [
        { id: "obj-1", title: "Buy Juju", status: "open" },
        { id: "obj-2", title: "Done thing", status: "done" },
        { id: "obj-3", title: "Run dailies", status: "active" },
      ],
    },
  };

  expect(activeObjectiveItems(agent).map((item: any) => item.id)).toEqual(["obj-1", "obj-3"]);
  expect(objectiveCursorAction("]", 0, 2)).toBe(1);
  expect(objectiveCursorAction("[", 0, 2)).toBe(1);
  expect(objectiveCursorAction("", 5, 2)).toBe(1);
  expect(objectiveActionLabel("tab")).toBe("create");
  expect(objectiveActionLabel("\t")).toBe("create");
  expect(objectiveActionLabel("x")).toBe("complete");
});

test("tui gateway session starts local gateway and returns redacted config", async () => {
  isolatedSkyAgentHome();

  const session = await connectTuiGateway();

  expect(session.gateway.status.running).toBe(true);
  expect(session.gateway.status.url).toStartWith("http://127.0.0.1:");
  expect(session.agent.running).toBe(true);
  expect(session.agent.ready).toBe(true);
  expect(session.config.apiKeyConfigured).toBeTypeOf("boolean");
  expect(JSON.stringify(session.gateway.status)).not.toContain("\"token\":");
  expect(JSON.stringify(session.config)).not.toContain("apiKey\":");
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
