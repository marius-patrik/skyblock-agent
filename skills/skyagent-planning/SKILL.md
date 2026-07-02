---
name: skyagent-planning
description: Produce goal-specific SkyBlock plans and next-upgrade recommendations with SkyAgent. Use for goal plans, upgrade priority, budget-constrained recommendations, daily or weekly routes, blockers, prerequisites, source freshness, uncertainty, and what to skip.
metadata:
  display_name: "SkyAgent Planning"
  short_description: "Plan goals and next upgrades."
  default_prompt: "Use $skyagent-planning to make a budgeted plan for my next SkyBlock goal."
---

# SkyAgent Planning

Use this skill when the user has a concrete goal, asks what to do next, wants an upgrade route, or needs an auditable daily/weekly plan.

## Tool Routing

- Use `skyblock_plan_goal` for goal-specific plans, blockers, daily/weekly routes, prerequisites, immediate actions, todo candidates, buy-list candidates, source-item candidates, snipe targets, and what to skip. Set `useContext: true` for broad planning so cached profile/objective state is included before pulling raw details.
- Include `budget` when the user gives coins available.
- Use `skyblock_next_upgrades` for purchase ranking before recommending buys.
- Use planner bounds (`maxItems`, `networthTimeoutMs`, `maxPriceLookups`, `accessoryTimeoutMs`) for broad plans so networth/accessory fanout cannot block the session indefinitely.
- Use `persistObjectives: true` on `skyblock_plan_goal`, or use `skyagent_objective_create`, `skyagent_objective_list`, `skyagent_objective_update`, `skyagent_objective_complete`, and `skyagent_objective_delete`, only when the user explicitly wants a plan written as durable goals, tasks/todos, buy-list entries, source-list entries, or snipe targets.
- Start broad plans with `skyagent_start` through `$skyagent-context-engine` when no startup payload is already present. Use `skyagent_context_bootstrap` only for narrower cached context refreshes so the plan has compact profile, gear, pets, accessories, objective summary, provider freshness, warnings, and follow-up tools before pulling narrow details.
- Route context/session bootstrap to `$skyagent-context-engine`, durable plan tracking to `$skyagent-objectives`, and recent progress/event-stream checks to `$skyagent-live-progress`.
- Pull supporting detail with `skyblock_profile_snapshot`, `skyblock_profile_overview`, `skyblock_progression`, `skyblock_readiness`, `skyblock_networth`, `skyblock_accessories`, `skyblock_price`, or `skyblock_price_history` when the plan output needs profile, economy, progression, readiness, or price context. Prefer the snapshot cache for repeated planning passes and refresh it when current progress matters.
- Route patch-sensitive gear, money-making, class, boss, or route claims to `$skyagent-provider-maintenance` before making strong recommendations.

## Rules

- Preserve recommendation reason, expected impact, cost/time estimate, prerequisites, source freshness, uncertainty, and warnings.
- Planner outputs may consume partial networth or accessory valuation. Keep those partial/stale/unknown-price warnings visible and avoid presenting bounded totals as complete.
- Use the planner's `immediateActions`, `todoCandidates`, `buyListCandidates`, `sourceItemCandidates`, `snipeTargets`, and `skipGuidance` fields to structure the answer instead of reclassifying raw recommendations by hand.
- Put immediate actions first, then medium-term route.
- Say what to skip when the planner output includes skip guidance.
- Do not recommend a buyable upgrade without budget and price evidence.
- When the user accepts a route, persist it as objective/task entries; persist purchase candidates as `buy` entries and auction watch rules as `snipe` entries with `itemId`, `targetPrice`, `budget`, `priority`, source provider, freshness, and warnings. Do not create or update objective records during preview-only planning.
- Keep profile, economy, progression, readiness, and external meta assumptions visible in the final plan.
- Re-read recent context events before revising an in-progress objective so the user does not have to restate progress already captured by the context stream.
