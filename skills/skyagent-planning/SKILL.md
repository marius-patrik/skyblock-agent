---
name: skyagent-planning
description: Produce goal-specific SkyBlock plans and next-upgrade recommendations with SkyAgent. Use for what to do next, daily or weekly routes, budget-constrained upgrades, blockers, prerequisites, source-aware uncertainty, and what to skip.
---

# SkyAgent Planning

Use this skill when the user has a concrete goal or asks for a prioritized route.

## Tool Routing

- Use `skyblock_plan_goal` for goal-specific plans.
- Include `budget` when the user gives coins available.
- Use `skyblock_next_upgrades` for purchase ranking before recommending buys.
- Pull supporting detail with progression, accessory, networth, or price tools only when the plan output is not specific enough.

## Rules

- Preserve recommendation reason, expected impact, cost/time estimate, prerequisites, source freshness, uncertainty, and warnings.
- Put immediate actions first, then medium-term route.
- Say what to skip when the planner output includes skip guidance.
