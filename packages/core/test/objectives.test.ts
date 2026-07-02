import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { completeObjectiveItem, createObjectiveItem, deleteObjectiveItem, listObjectiveItems, objectiveContextSummary, objectiveStorePath, updateObjectiveItem } from "../src/objectives.ts";

let tempHome: string | null = null;

afterEach(() => {
  if (tempHome) {
    fs.rmSync(tempHome, { recursive: true, force: true });
    tempHome = null;
  }
  delete process.env.SKYAGENT_HOME;
});

function isolatedSkyAgentHome() {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "skyagent-objectives-test-"));
  process.env.SKYAGENT_HOME = tempHome;
}

describe("objective store", () => {
  test("persists objective items with price and freshness metadata", () => {
    isolatedSkyAgentHome();

    const item = createObjectiveItem({
      itemKind: "buy",
      title: "Buy Hyperion",
      itemId: "HYPERION",
      targetPrice: 2_000_000_000,
      budget: 2_100_000_000,
      priority: 10,
      sourceProvider: "coflnet",
      freshness: {
        status: "fresh",
        source: "coflnet",
        warnings: [{ code: "volatile", message: "Price is volatile", sourcePath: "prices.lbin" }],
      },
    });

    expect(fs.existsSync(objectiveStorePath())).toBe(true);
    expect(listObjectiveItems({ kind: "buy" }).items).toContainEqual(expect.objectContaining({
      id: item.id,
      itemKind: "buy",
      itemId: "HYPERION",
      targetPrice: 2_000_000_000,
      sourceProvider: "coflnet",
      freshness: expect.objectContaining({ source: "coflnet" }),
    }));
  });

  test("supports status transitions, hides deleted entries, and summarizes active work", () => {
    isolatedSkyAgentHome();
    const goal = createObjectiveItem({ itemKind: "objective", title: "Prepare for M5" });
    const task = createObjectiveItem({ itemKind: "task", title: "Practice routes", objectiveId: goal.id, priority: 5 });

    updateObjectiveItem(task.id, { status: "active" });
    completeObjectiveItem(task.id);
    deleteObjectiveItem(goal.id);

    expect(listObjectiveItems().items.map((item) => item.id)).toEqual([task.id]);
    expect(listObjectiveItems({ includeDeleted: true }).items.map((item) => item.status)).toContain("deleted");
    expect(objectiveContextSummary().counts).toMatchObject({ objective: 0, task: 0 });
  });

  test("rejects invalid numeric fields and terminal deleted transitions", () => {
    isolatedSkyAgentHome();
    expect(() => createObjectiveItem({ itemKind: "snipe", title: "Snipe pet", targetPrice: -1 })).toThrow("numeric objective fields");

    const item = createObjectiveItem({ itemKind: "snipe", title: "Snipe pet", targetPrice: 10 });
    deleteObjectiveItem(item.id);
    expect(() => updateObjectiveItem(item.id, { status: "open" })).toThrow("Invalid objective status transition");
  });
});
