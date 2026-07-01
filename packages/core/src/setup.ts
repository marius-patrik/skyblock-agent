import packageMetadata from "../../../package.json" with { type: "json" };
import { hypixelRequest, resolveMinecraftUsername, skyblockProfiles } from "./hypixel.ts";
import { profileSummaries } from "./profile.ts";
import { dataDir, getApiKey, publicConfig, readConfig, setConfigValue } from "./store.ts";

type SetupInput = {
  username?: string | null;
  apiKey?: string | null;
  profile?: string | null;
  write?: boolean;
};

type SetupDeps = {
  resolveMinecraftUsername?: typeof resolveMinecraftUsername;
  skyblockProfiles?: typeof skyblockProfiles;
  providerCheck?: (context?: { apiKey?: string }) => Promise<unknown>;
  setConfigValue?: typeof setConfigValue;
  readConfig?: typeof readConfig;
  publicConfig?: typeof publicConfig;
  getApiKey?: typeof getApiKey;
};

function packageVersion() {
  return packageMetadata.version ?? "unknown";
}

function installPath() {
  const argvPath = process.argv[1];
  if (argvPath && !argvPath.includes("~BUN")) {
    return argvPath;
  }
  return process.execPath ?? argvPath ?? null;
}

function step(id: string, status: "ok" | "missing" | "skipped", detail: string) {
  return { id, status, detail };
}

function chooseProfile(profiles: any[], selector?: string | null) {
  if (!profiles.length) {
    return null;
  }
  if (selector) {
    const normalized = selector.toLowerCase();
    return profiles.find((profile) => (
      String(profile.profileId).toLowerCase() === normalized
      || String(profile.cuteName ?? "").toLowerCase() === normalized
    )) ?? null;
  }
  return profiles.find((profile) => profile.selected) ?? profiles[0];
}

export function setupStatus(deps: SetupDeps = {}) {
  const read = deps.readConfig ?? readConfig;
  const pub = deps.publicConfig ?? publicConfig;
  const config = read();
  return {
    installPath: installPath(),
    version: packageVersion(),
    dataDir: dataDir(),
    config: pub(config),
  };
}

export async function runSetup(input: SetupInput = {}, deps: SetupDeps = {}) {
  const read = deps.readConfig ?? readConfig;
  const writeConfigValue = deps.setConfigValue ?? setConfigValue;
  const pub = deps.publicConfig ?? publicConfig;
  const key = deps.getApiKey ?? getApiKey;
  const resolveName = deps.resolveMinecraftUsername ?? resolveMinecraftUsername;
  const fetchProfiles = deps.skyblockProfiles ?? skyblockProfiles;
  const providerCheck = deps.providerCheck ?? ((context) => hypixelRequest("resources/skyblock/bingo", {}, { apiKey: context?.apiKey }));
  const shouldWrite = input.write !== false;
  const steps = [];
  const required = [];
  const config = read();
  const username = input.username || config.username || null;

  if (!username) {
    required.push("username");
    steps.push(step("player", "missing", "Minecraft username is required."));
    return {
      complete: false,
      required,
      steps,
      status: setupStatus(deps),
    };
  }

  const resolved = await resolveName(username);
  if (shouldWrite) {
    writeConfigValue("username", resolved.username);
    writeConfigValue("uuid", resolved.uuid);
  }
  steps.push(step("player", "ok", `Resolved ${resolved.username}.`));

  if (input.apiKey) {
    if (shouldWrite) {
      writeConfigValue("apiKey", input.apiKey);
    }
    steps.push(step("auth", "ok", "Stored Hypixel API key in local config."));
  } else if (key(read())) {
    steps.push(step("auth", "ok", "Hypixel API key is already configured."));
  } else {
    required.push("apiKey");
    steps.push(step("auth", "missing", "Hypixel API key is required for SkyBlock profiles."));
    steps.push(step("profile", "skipped", "Profile selection skipped until auth is configured."));
    return {
      complete: false,
      required,
      player: resolved,
      steps,
      status: setupStatus(deps),
    };
  }

  const profilesResponse = input.apiKey && !shouldWrite && !deps.skyblockProfiles
    ? await hypixelRequest("skyblock/profiles", { uuid: resolved.uuid }, { requireKey: true, apiKey: input.apiKey })
    : await fetchProfiles(resolved.uuid);
  const profiles = profileSummaries(profilesResponse.body?.profiles ?? [], resolved.uuid);
  const selectedProfile = chooseProfile(profiles, input.profile || config.selectedProfileId);
  if (!selectedProfile) {
    required.push("profile");
    steps.push(step(
      "profile",
      "missing",
      profiles.length
        ? `Profile selector did not match an available profile: ${input.profile || config.selectedProfileId}`
        : "No SkyBlock profiles were returned for this player.",
    ));
    return {
      complete: false,
      required,
      player: resolved,
      profiles,
      steps,
      status: setupStatus(deps),
    };
  }
  if (shouldWrite) {
    writeConfigValue("selectedProfileId", selectedProfile.profileId);
  }
  steps.push(step("profile", "ok", `Selected ${selectedProfile.cuteName ?? selectedProfile.profileId}.`));

  await providerCheck({ apiKey: input.apiKey && !shouldWrite ? input.apiKey : undefined });
  steps.push(step("providerCheck", "ok", "SkyBlock provider check completed."));

  return {
    complete: true,
    required,
    player: resolved,
    profiles,
    selectedProfile,
    steps,
    status: {
      installPath: installPath(),
      version: packageVersion(),
      dataDir: dataDir(),
      config: pub(read()),
    },
  };
}
