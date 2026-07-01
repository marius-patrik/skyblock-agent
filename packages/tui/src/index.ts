import * as readline from "node:readline";
import { hypixelRequest, profileSummaries, publicConfig, setConfigValue, skyblockProfiles, compactProfileOverview, fetchProfileContext, uuidFromNameOrUuid } from "@skyagent/core";

type MenuId = "status" | "profiles" | "overview" | "debug" | "advanced";

const MENU: Array<{ id: MenuId; label: string }> = [
  { id: "status", label: "Config / status" },
  { id: "profiles", label: "Profile selector" },
  { id: "overview", label: "Profile overview" },
  { id: "debug", label: "Raw API / debug launcher" },
  { id: "advanced", label: "Advanced sections" },
];

const PENDING_SECTIONS = [
  ["Inventory", "available through CLI/MCP; richer TUI screen pending #28 follow-up"],
  ["Networth", "available through CLI/MCP; richer TUI screen pending #28 follow-up"],
  ["Accessories", "available through CLI/MCP; richer TUI screen pending #28 follow-up"],
  ["Progression", "available through CLI/MCP; richer TUI screen pending #28 follow-up"],
  ["Readiness", "available through CLI/MCP; richer TUI screen pending #28 follow-up"],
  ["Planner", "available through CLI/MCP; richer TUI screen pending #28 follow-up"],
];

const DEBUG_ACTIONS = [
  { label: "SkyBlock profiles", endpoint: "skyblock/profiles", needsProfile: false },
  { label: "Selected SkyBlock profile", endpoint: "skyblock/profile", needsProfile: true },
  { label: "Museum", endpoint: "skyblock/museum", needsProfile: true },
  { label: "Garden", endpoint: "skyblock/garden", needsProfile: true },
];

function boolLabel(value: unknown) {
  return value ? "yes" : "no";
}

function formatCoins(value: unknown) {
  return typeof value === "number" ? Math.round(value).toLocaleString("en-US") : "unknown";
}

function profileLabel(profile: any) {
  const name = profile.cuteName ?? "unnamed";
  const selected = profile.selected ? " selected" : "";
  return `${name} (${profile.profileId})${selected}`;
}

export function tuiStatus() {
  const config = publicConfig();
  return {
    surface: "tui",
    ready: true,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    configured: {
      username: Boolean(config.username),
      uuid: Boolean(config.uuid),
      profile: Boolean(config.selectedProfileId),
      apiKey: Boolean(config.apiKeyConfigured),
    },
    config: {
      username: config.username,
      uuid: config.uuid,
      selectedProfileId: config.selectedProfileId,
      apiKeyConfigured: config.apiKeyConfigured,
      apiKeySource: config.apiKeySource,
      dataDir: config.dataDir,
    },
    providers: {
      hypixelApi: config.apiKeyConfigured ? "configured" : "missing_api_key",
      itemMetadata: "on_demand_neu_provider",
      priceCache: "shared_core_provider_cache",
    },
  };
}

export function tuiSnapshot() {
  const status = tuiStatus();
  return {
    ...status,
    screens: MENU.map((item) => item.id),
    shortcuts: ["up/down or j/k", "left/right or h/l", "enter", "r", "q"],
    secrets: "api keys are never printed",
  };
}

function clear() {
  process.stdout.write("\x1b[2J\x1b[H");
}

function line(text = "") {
  process.stdout.write(`${text}\n`);
}

function renderHeader(title: string) {
  line("SkyAgent TUI");
  line(title);
  line("Use up/down or j/k for screens, left/right or h/l for lists, enter to open/select, r to refresh, q to quit.");
  line("");
}

function renderMenu(activeIndex: number) {
  for (let index = 0; index < MENU.length; index += 1) {
    const marker = index === activeIndex ? ">" : " ";
    line(`${marker} ${MENU[index].label}`);
  }
}

function renderStatus() {
  const status = tuiStatus();
  renderHeader("Config / status");
  line(`Username: ${status.config.username ?? "not configured"}`);
  line(`UUID: ${status.config.uuid ?? "not configured"}`);
  line(`Selected profile: ${status.config.selectedProfileId ?? "not configured"}`);
  line(`API key configured: ${boolLabel(status.config.apiKeyConfigured)}${status.config.apiKeySource ? ` (${status.config.apiKeySource})` : ""}`);
  line(`Data dir: ${status.config.dataDir}`);
  line("");
  line("Providers / cache");
  line(`Hypixel API: ${status.providers.hypixelApi}`);
  line(`Item metadata: ${status.providers.itemMetadata}`);
  line(`Price cache: ${status.providers.priceCache}`);
}

function renderAdvanced() {
  renderHeader("Advanced sections");
  for (const [name, note] of PENDING_SECTIONS) {
    line(`- ${name}: ${note}`);
  }
}

function renderProfiles(state: TuiState) {
  renderHeader("Profile selector");
  if (state.loading) {
    line("Loading profiles...");
    return;
  }
  if (state.error) {
    line(`Error: ${state.error}`);
    line("Set HYPIXEL_API_KEY and a username/uuid, then press r.");
    return;
  }
  if (!state.profiles.length) {
    line("No profiles loaded. Press r to fetch profiles.");
    return;
  }
  line("Select a profile and press enter to store it in SkyAgent config.");
  line("");
  state.profiles.forEach((profile, index) => {
    const marker = index === state.profileCursor ? ">" : " ";
    line(`${marker} ${profileLabel(profile)}`);
  });
}

function renderOverview(state: TuiState) {
  renderHeader("Profile overview");
  if (state.loading) {
    line("Loading overview...");
    return;
  }
  if (state.error) {
    line(`Error: ${state.error}`);
    line("Set HYPIXEL_API_KEY, username/uuid, and selected profile, then press r.");
    return;
  }
  if (!state.overview) {
    line("No overview loaded. Press r to fetch the selected profile overview.");
    return;
  }
  const overview: any = state.overview;
  line(`Profile: ${overview.selectedProfile.cuteName ?? "unnamed"} (${overview.selectedProfile.profileId})`);
  line(`Game mode: ${overview.selectedProfile.gameMode}`);
  line(`Purse: ${formatCoins(overview.economy.purse)}`);
  line(`Bank: ${formatCoins(overview.economy.bank)}`);
  line(`SkyBlock level XP: ${overview.progression.skyblockLevelXp ?? "unknown"}`);
  line(`Skill XP keys: ${overview.progression.skillExperienceKeys.length}`);
  line(`Slayer bosses: ${overview.progression.slayerBosses.join(", ") || "none"}`);
  line("");
  line("Inventory API signals");
  for (const [key, value] of Object.entries(overview.inventoryApiSignals)) {
    line(`- ${key}: ${boolLabel(value)}`);
  }
  if (overview.rateLimit) {
    line("");
    line(`Rate limit: remaining=${overview.rateLimit.remaining ?? "unknown"} reset=${overview.rateLimit.reset ?? "unknown"}`);
  }
}

function renderDebug(state: TuiState) {
  renderHeader("Raw API / debug launcher");
  if (state.loading) {
    line("Running request...");
    return;
  }
  if (state.error) {
    line(`Error: ${state.error}`);
    line("");
  }
  line("Select an existing endpoint abstraction and press enter.");
  line("");
  DEBUG_ACTIONS.forEach((action, index) => {
    const marker = index === state.debugCursor ? ">" : " ";
    line(`${marker} ${action.label}`);
  });
  if (state.debugResult) {
    line("");
    line("Last result");
    line(JSON.stringify(state.debugResult, null, 2));
  }
}

function render(state: TuiState) {
  clear();
  const active = MENU[state.menuIndex];
  if (active.id === "status") {
    renderStatus();
  } else if (active.id === "profiles") {
    renderProfiles(state);
  } else if (active.id === "overview") {
    renderOverview(state);
  } else if (active.id === "debug") {
    renderDebug(state);
  } else {
    renderAdvanced();
  }
  line("");
  renderMenu(state.menuIndex);
}

type TuiState = {
  menuIndex: number;
  profileCursor: number;
  debugCursor: number;
  loading: boolean;
  error: string | null;
  profiles: any[];
  overview: unknown;
  debugResult: unknown;
};

function createState(): TuiState {
  return {
    menuIndex: 0,
    profileCursor: 0,
    debugCursor: 0,
    loading: false,
    error: null,
    profiles: [],
    overview: null,
    debugResult: null,
  };
}

async function loadProfiles(state: TuiState) {
  state.loading = true;
  state.error = null;
  render(state);
  try {
    const response = await skyblockProfiles(undefined);
    const uuid = await uuidFromNameOrUuid(undefined);
    const config = publicConfig();
    state.profiles = profileSummaries(response.body?.profiles ?? [], uuid);
    const selectedIndex = state.profiles.findIndex((profile) => profile.profileId === config.selectedProfileId || profile.selected);
    state.profileCursor = Math.max(0, selectedIndex);
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.loading = false;
  }
}

async function loadOverview(state: TuiState) {
  state.loading = true;
  state.error = null;
  render(state);
  try {
    state.overview = compactProfileOverview(await fetchProfileContext(undefined, undefined));
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.loading = false;
  }
}

async function runDebugAction(state: TuiState) {
  const action = DEBUG_ACTIONS[state.debugCursor];
  const config = publicConfig();
  state.loading = true;
  state.error = null;
  state.debugResult = null;
  render(state);
  try {
    const query: Record<string, unknown> = {};
    if (action.needsProfile) {
      query.profile = config.selectedProfileId;
    }
    const response = action.endpoint === "skyblock/profiles"
      ? await skyblockProfiles(undefined)
      : await hypixelRequest(action.endpoint, query, { requireKey: true });
    state.debugResult = {
      endpoint: action.endpoint,
      ok: response.ok,
      status: response.status,
      url: response.url,
      rateLimit: response.rateLimit,
      bodyKeys: response.body && typeof response.body === "object" ? Object.keys(response.body) : [],
    };
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.loading = false;
  }
}

async function refreshActive(state: TuiState) {
  const active = MENU[state.menuIndex].id;
  if (active === "profiles") {
    await loadProfiles(state);
  } else if (active === "overview") {
    await loadOverview(state);
  }
}

async function selectActive(state: TuiState) {
  const active = MENU[state.menuIndex].id;
  if (active === "profiles" && state.profiles[state.profileCursor]) {
    setConfigValue("selectedProfileId", state.profiles[state.profileCursor].profileId);
    await loadOverview(state);
    state.menuIndex = MENU.findIndex((item) => item.id === "overview");
  } else if (active === "debug") {
    await runDebugAction(state);
  } else {
    await refreshActive(state);
  }
}

function moveMenu(state: TuiState, direction: number) {
  state.menuIndex = (state.menuIndex + direction + MENU.length) % MENU.length;
}

function moveSelection(state: TuiState, direction: number) {
  const active = MENU[state.menuIndex].id;
  if (active === "profiles" && state.profiles.length) {
    state.profileCursor = (state.profileCursor + direction + state.profiles.length) % state.profiles.length;
  } else if (active === "debug") {
    state.debugCursor = (state.debugCursor + direction + DEBUG_ACTIONS.length) % DEBUG_ACTIONS.length;
  }
}

export async function runInteractiveTui() {
  const state = createState();
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  render(state);

  return new Promise<void>((resolve) => {
    const done = () => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.off("keypress", onKeypress);
      clear();
      resolve();
    };

    const onKeypress = async (_text: string, key: readline.Key) => {
      if (state.loading) {
        return;
      }
      if (key.name === "q" || (key.ctrl && key.name === "c")) {
        done();
        return;
      }
      if (key.name === "up" || key.name === "k") {
        moveMenu(state, -1);
      } else if (key.name === "down" || key.name === "j") {
        moveMenu(state, 1);
      } else if (key.name === "left" || key.name === "h") {
        moveSelection(state, -1);
      } else if (key.name === "right" || key.name === "l") {
        moveSelection(state, 1);
      } else if (key.name === "return") {
        await selectActive(state);
      } else if (key.name === "r") {
        await refreshActive(state);
      }
      render(state);
    };

    process.stdin.on("keypress", onKeypress);
  });
}

export async function runTui(args = process.argv.slice(2)) {
  if (args.includes("--smoke") || !process.stdin.isTTY || !process.stdout.isTTY) {
    process.stdout.write(`${JSON.stringify(tuiSnapshot(), null, 2)}\n`);
    return;
  }
  await runInteractiveTui();
}
