#!/usr/bin/env bun

import { runCli } from "@skyagent/cli";

const args = process.argv.slice(2);

if (args[0] === "tui") {
  const { runTui } = await import("@skyagent/tui");
  await runTui(args.slice(1));
} else {
  runCli(args);
}
