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

- Use `skyblock_plan_goal` for goal-specific plans, blockers, daily/weekly routes, prerequisites, and what to skip.
- Include `budget` when the user gives coins available.
- Use `skyblock_next_upgrades` for purchase ranking before recommending buys.
- Pull supporting detail with `skyblock_profile_overview`, `skyblock_progression`, `skyblock_readiness`, `skyblock_networth`, `skyblock_accessories`, `skyblock_price`, or `skyblock_price_history` when the plan output needs profile, economy, progression, readiness, or price context.
- Route patch-sensitive gear, money-making, class, boss, or route claims to `$skyagent-provider-maintenance` before making strong recommendations.

## Rules

- Preserve recommendation reason, expected impact, cost/time estimate, prerequisites, source freshness, uncertainty, and warnings.
- Put immediate actions first, then medium-term route.
- Say what to skip when the planner output includes skip guidance.
- Do not recommend a buyable upgrade without budget and price evidence.
- Keep profile, economy, progression, readiness, and external meta assumptions visible in the final plan.
