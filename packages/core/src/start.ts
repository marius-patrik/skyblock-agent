import { agentContextForPlayer } from "./agent-context.ts";
import { persistContextEvent, readPersistedContextEvents, serverStatusForPlayer } from "./context-events.ts";
import { llmProviderStatus } from "./llm-provider.ts";
import { objectiveContextSummary } from "./objectives.ts";
import { setupStatus } from "./setup.ts";

function compactWarning(warning: any, fallbackCode = "warning") {
  return {
    code: warning?.code ?? fallbackCode,
    message: warning?.message ?? String(warning),
    sourcePath: warning?.sourcePath ?? warning?.source ?? null,
  };
}

function errorWarning(code: string, error: unknown, sourcePath: string) {
  return compactWarning({
    code,
    message: error instanceof Error ? error.message : String(error),
    sourcePath,
  });
}

function configuredPlayer(setup: any) {
  return setup.config?.username ?? setup.config?.uuid ?? null;
}

function publicStartupSetup(setup: any) {
  return {
    installPath: setup.installPath ?? null,
    version: setup.version ?? null,
    dataDir: setup.dataDir ?? setup.config?.dataDir ?? null,
    config: {
      username: setup.config?.username ?? null,
      uuid: setup.config?.uuid ?? null,
      selectedProfileId: setup.config?.selectedProfileId ?? null,
      apiKeyConfigured: Boolean(setup.config?.apiKeyConfigured),
      apiKeySource: setup.config?.apiKeySource ?? null,
      dataDir: setup.config?.dataDir ?? setup.dataDir ?? null,
    },
  };
}

function playerForStatus(inputPlayer: string | undefined, context: any, setup: any) {
  return inputPlayer
    ?? context?.player?.username
    ?? context?.player?.uuid
    ?? configuredPlayer(setup)
    ?? undefined;
}

function selectedProfile(inputProfile: string | undefined, context: any, setup: any) {
  return context?.selectedProfile ?? (inputProfile || setup.config?.selectedProfileId
    ? {
      input: inputProfile ?? null,
      profileId: setup.config?.selectedProfileId ?? null,
      cuteName: null,
    }
    : null);
}

function contextFreshness(context: any) {
  if (!context) {
    return { status: "unavailable", fetchedAt: null, source: "skyagent-start", rateLimit: null };
  }
  return {
    status: context.cache?.stale ? "stale" : context.cache?.status ?? "unknown",
    fetchedAt: context.cache?.fetchedAt ?? context.generatedAt ?? null,
    source: context.cache?.sourceProvider ?? "profile-snapshot-cache",
    rateLimit: context.rateLimit ?? null,
  };
}

function providerStatusSummary(context: any, serverStatus: any, llmStatus: any) {
  return {
    profile: context?.providerFreshness ?? null,
    hypixel: serverStatus?.providers ?? null,
    llm: llmStatus,
  };
}

function followUpTools(context: any) {
  return context?.followUpTools ?? {
    startup: ["skyagent_start", "skyagent_context_bootstrap", "skyagent_context_refresh"],
    profile: ["skyblock_profile_snapshot", "skyblock_profile_overview", "skyblock_profile_member"],
    status: ["skyagent_server_status", "skyagent_context_events", "skyagent_context_watch"],
    objectives: ["skyagent_objective_create", "skyagent_objective_list", "skyagent_objective_update"],
  };
}

export async function startSkyAgentSession(input: Record<string, any> = {}) {
  const generatedAt = new Date(input.now ?? Date.now()).toISOString();
  const setup = setupStatus();
  const publicSetup = publicStartupSetup(setup);
  const cacheOnly = input.cacheOnly !== undefined
    ? Boolean(input.cacheOnly)
    : false;
  const refresh = Boolean(input.refresh) || !cacheOnly;
  const allowStale = Boolean(input.allowStale);
  const ttlMs = input.ttlMs === undefined ? undefined : Number(input.ttlMs);
  const source = {
    kind: input.sourceKind ?? "cli",
    id: input.sourceId ?? "skyagent-start",
    transport: input.sourceTransport ?? "command",
  };
  const freshnessPolicy = { refresh, cacheOnly, allowStale, ttlMs: ttlMs ?? null };
  const warnings: any[] = [];
  let context: any = null;
  let serverStatus: any = null;
  let llmStatus: any = null;

  try {
    context = await agentContextForPlayer(input.player, input.profile, {
      refresh,
      cacheOnly,
      allowStale,
      ttlMs,
      now: input.now,
    });
  } catch (error) {
    warnings.push(errorWarning("profile_context_unavailable", error, "profile-context"));
  }

  const statusPlayer = playerForStatus(input.player, context, setup);
  try {
    serverStatus = await serverStatusForPlayer(statusPlayer, { now: input.now });
  } catch (error) {
    warnings.push(errorWarning("server_status_unavailable", error, "hypixel.status"));
  }

  try {
    llmStatus = await llmProviderStatus({ checkHealth: input.checkLlmHealth ?? false });
  } catch (error) {
    warnings.push(errorWarning("llm_provider_status_unavailable", error, "llm-provider"));
  }

  const objectives = context?.objectives ?? objectiveContextSummary();
  const allWarnings = [
    ...warnings,
    ...(context?.warnings ?? []).map((warning: any) => compactWarning(warning)),
    ...(serverStatus?.warnings ?? []).map((warning: any) => compactWarning(warning)),
    ...(llmStatus?.warnings ?? []).map((warning: any) => compactWarning(warning)),
  ];
  const player = context?.player ?? {
    input: input.player ?? configuredPlayer(setup),
    uuid: setup.config?.uuid ?? null,
    username: setup.config?.username ?? null,
  };
  const profile = selectedProfile(input.profile, context, setup);
  const event = persistContextEvent({
    type: "agent.session_start",
    source,
    player,
    profile,
    payload: {
      generatedAt,
      setup: publicSetup,
      freshnessPolicy,
      cache: context?.cache ?? null,
      contextAvailable: Boolean(context),
      serverStatus: serverStatus ? {
        api: serverStatus.api,
        online: serverStatus.online,
        session: serverStatus.session,
      } : null,
      objectives: {
        count: objectives.count,
        counts: objectives.counts,
      },
      providerStatus: providerStatusSummary(context, serverStatus, llmStatus),
      warnings: allWarnings,
      rawPayloadsIncluded: false,
    },
    freshness: {
      ...contextFreshness(context),
      warnings: allWarnings,
    },
    provenance: { provider: "skyagent-start" },
  });
  const events = readPersistedContextEvents({
    sinceSequence: input.sinceSequence ?? 0,
    limit: input.limit ?? 10,
    type: input.type,
  });

  return {
    kind: "skyagent.startup",
    schemaVersion: 1,
    generatedAt,
    setup: publicSetup,
    player,
    selectedProfile: profile,
    freshnessPolicy,
    context,
    serverStatus,
    objectives,
    events,
    sessionEvent: event,
    providerStatus: providerStatusSummary(context, serverStatus, llmStatus),
    followUpTools: followUpTools(context),
    warnings: allWarnings,
    rawPayloadsIncluded: false,
  };
}
