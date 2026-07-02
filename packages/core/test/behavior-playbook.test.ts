import { expect, test } from "bun:test";
import { skyAgentBehaviorRoute, skyAgentBehaviorToolNames } from "../src/behavior-playbook.ts";

test("behavior playbook bootstraps compact context before broad planning", () => {
  const route = skyAgentBehaviorRoute("broad_planning");
  const tools = route.steps.map((step) => step.tool);

  expect(tools.slice(0, 3)).toEqual(["skyagent_start", "skyagent_objective_list", "skyagent_server_status"]);
  expect(route.steps.every((step) => step.compact)).toBe(true);
  expect(route.rawPayloadPolicy).toContain("Prefer compact summaries");
  expect(route.fallbackRules.map((rule) => rule.condition)).toEqual([
    "MCP tools unavailable",
    "stale cache",
    "missing parser or missing compact summary",
    "huge raw payload",
    "missing API key",
    "server maintenance or provider outage",
    "partial provider data",
  ]);
});

test("behavior smoke routes museum goals to donation planner before generic progression planning", () => {
  const tools = skyAgentBehaviorToolNames("museum_goal");

  expect(tools.slice(0, 3)).toEqual(["skyagent_start", "skyagent_objective_list", "skyagent_server_status"]);
  expect(tools).toContain("skyblock_museum_donation_plan");
  expect(tools).toContain("skyblock_profile_section:museum");
  expect(tools).toContain("skyblock_price");
  expect(tools).not.toContain("skyblock_progression");

  const museumPlan = skyAgentBehaviorRoute("museum_goal").steps.find((step) => step.id === "museum_plan");
  expect(museumPlan?.fallback).toEqual([
    "skyblock_profile_section:museum",
    "skyblock_museum",
    "hypixel_request:skyblock/museum",
  ]);
});

test("behavior smoke checks complete damage and slayer context before purchases", () => {
  const route = skyAgentBehaviorRoute("damage_slayer_goal");
  const tools = route.steps.map((step) => step.tool);

  expect(tools.slice(0, 3)).toEqual(["skyagent_start", "skyagent_objective_list", "skyagent_server_status"]);
  expect(tools).toContain("skyblock_readiness:slayer");
  expect(tools).toContain("skyblock_inventory");
  expect(tools).toContain("skyblock_inventory_section:pets");
  expect(tools).toContain("skyblock_accessories");
  expect(tools).toContain("skyblock_next_upgrades");
  expect(tools).toContain("skyagent_context_events");

  const gear = route.steps.find((step) => step.id === "gear");
  expect(gear?.reason).toContain("wardrobe");
  expect(gear?.reason).toContain("storage");
  expect(gear?.reason).toContain("museum");

  const purchases = route.steps.find((step) => step.id === "budget_prices");
  expect(purchases?.reason).toContain("budgeted upgrades");
  expect(purchases?.fallback).toContain("skip purchases without price evidence");
});

test("behavior playbook persists objectives only after user acceptance", () => {
  const route = skyAgentBehaviorRoute("objective_building");

  expect(route.persistence.previewOnly).toContain("Do not create");
  expect(route.persistence.onUserAcceptance.join("\n")).toContain("buy entries");
  expect(route.steps.find((step) => step.id === "persist")).toMatchObject({
    tool: "skyagent_objective_create",
    required: false,
  });
});
