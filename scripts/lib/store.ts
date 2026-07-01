import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP_NAME = "skyagent";

export function dataDir() {
  if (process.env.SKYAGENT_HOME) {
    return path.resolve(process.env.SKYAGENT_HOME);
  }

  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, APP_NAME);
  }

  return path.join(os.homedir(), ".skyagent");
}

export function ensureDataDir() {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function configPath() {
  return path.join(dataDir(), "config.json");
}

export function memoriesPath() {
  return path.join(dataDir(), "memories.json");
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export function writeJson(file, value) {
  ensureDataDir();
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function readConfig() {
  return readJson(configPath(), {});
}

export function writeConfig(config) {
  writeJson(configPath(), config);
}

export function getApiKey(config = readConfig()) {
  return process.env.HYPIXEL_API_KEY || config.apiKey || "";
}

export function publicConfig(config = readConfig()) {
  return {
    username: config.username ?? null,
    uuid: config.uuid ?? null,
    selectedProfileId: config.selectedProfileId ?? null,
    apiKeyConfigured: Boolean(getApiKey(config)),
    apiKeySource: process.env.HYPIXEL_API_KEY ? "env" : config.apiKey ? "config" : null,
    dataDir: dataDir(),
  };
}

export function setConfigValue(key, value) {
  const config = readConfig();
  if (value === null || value === undefined || value === "") {
    delete config[key];
  } else {
    config[key] = value;
  }
  writeConfig(config);
  return publicConfig(config);
}

export function readMemories() {
  return readJson(memoriesPath(), []);
}

export function writeMemories(memories) {
  writeJson(memoriesPath(), memories);
}

export function addMemory({ text, tags = [], source = "user" }) {
  const memories = readMemories();
  const memory = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    source,
    tags,
    text,
  };
  memories.push(memory);
  writeMemories(memories);
  return memory;
}

export function deleteMemory(id) {
  const memories = readMemories();
  const next = memories.filter((memory) => memory.id !== id);
  writeMemories(next);
  return { deleted: next.length !== memories.length };
}

