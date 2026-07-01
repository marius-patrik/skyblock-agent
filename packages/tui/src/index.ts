import { publicConfig } from "@skyagent/core/store";

export function tuiStatus() {
  const config = publicConfig();
  return {
    surface: "tui",
    ready: true,
    configured: {
      username: Boolean(config.username),
      uuid: Boolean(config.uuid),
      profile: Boolean(config.selectedProfileId),
      apiKey: Boolean(config.apiKeyConfigured),
    },
  };
}

export function runTui(_args = []) {
  process.stdout.write(`${JSON.stringify(tuiStatus(), null, 2)}\n`);
}
