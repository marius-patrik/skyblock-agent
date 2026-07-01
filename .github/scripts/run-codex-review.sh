#!/usr/bin/env bash
set -euo pipefail

REVIEW_OUTPUT="${REVIEW_OUTPUT:-codex-review.json}"
BASE_REF="${BASE_REF:-origin/main}"
CODEX_HOME="${CODEX_HOME:-/tmp/codex-home}"
SCHEMA_PATH="${SCHEMA_PATH:-/opt/codex-review/schema.json}"
PR_TITLE="${PR_TITLE:-}"
PR_BODY="${PR_BODY:-}"
CODEX_REVIEW_MODEL="${CODEX_REVIEW_MODEL:-gpt-5.5}"
CODEX_REVIEW_EFFORT="${CODEX_REVIEW_EFFORT:-low}"

write_blocked_review() {
  local summary="$1"
  local finding="$2"
  REVIEW_SUMMARY="${summary}" REVIEW_FINDING="${finding}" REVIEW_OUTPUT="${REVIEW_OUTPUT}" node <<'NODE'
const fs = require("node:fs");
fs.writeFileSync(process.env.REVIEW_OUTPUT, `${JSON.stringify({
  approved: false,
  summary: process.env.REVIEW_SUMMARY,
  blocking_findings: [process.env.REVIEW_FINDING],
  non_blocking_notes: [],
}, null, 2)}\n`);
NODE
}

if [ ! -s "${CODEX_HOME}/auth.json" ]; then
  write_blocked_review \
    "Codex autoreview could not run because CODEX_HOME/auth.json is missing." \
    "Configure CODEX_AUTH_JSON in GitHub repository secrets and mount it into the review container as CODEX_HOME/auth.json."
  exit 0
fi

git config --global --add safe.directory /workspace
git fetch origin main

DIFF_FILE="$(mktemp)"
PROMPT_FILE="$(mktemp)"
git diff --stat "${BASE_REF}...HEAD" > "${DIFF_FILE}"
printf '\n--- FULL DIFF ---\n' >> "${DIFF_FILE}"
git diff --find-renames "${BASE_REF}...HEAD" >> "${DIFF_FILE}"

cat > "${PROMPT_FILE}" <<EOF
You are reviewing a pull request for the SkyAgent repository.

Review the PR against the linked issue/spec, the repository rules in .agents/AGENTS.md, and the diff below.

Return only JSON that matches the provided schema.

Set approved=true only when:
- the implementation satisfies the stated PR/issue spec,
- there are no blocking correctness, security, CI, secret-handling, or workflow-regression findings,
- the change preserves the repo rules.

Set approved=false if the PR exposes secrets to untrusted PR code, fails to meet the spec, has broken CI behavior, or needs implementation changes.

PR title:
${PR_TITLE}

PR body:
${PR_BODY}

$(cat "${DIFF_FILE}")
EOF

if ! codex exec \
  --cd /workspace \
  --model "${CODEX_REVIEW_MODEL}" \
  --reasoning-effort "${CODEX_REVIEW_EFFORT}" \
  --sandbox read-only \
  --ephemeral \
  --output-schema "${SCHEMA_PATH}" \
  --output-last-message "${REVIEW_OUTPUT}" \
  - < "${PROMPT_FILE}"; then
  write_blocked_review \
    "Codex autoreview command failed before producing a valid review." \
    "Inspect the Codex Review workflow logs and fix the automation before allowing automerge."
fi

if ! node -e "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8'))" "${REVIEW_OUTPUT}"; then
  RAW_REVIEW="$(cat "${REVIEW_OUTPUT}" || true)"
  REVIEW_SUMMARY="Codex autoreview produced non-JSON output." \
  REVIEW_FINDING="${RAW_REVIEW:-Codex review output was empty or invalid.}" \
  REVIEW_OUTPUT="${REVIEW_OUTPUT}" node <<'NODE'
const fs = require("node:fs");
fs.writeFileSync(process.env.REVIEW_OUTPUT, `${JSON.stringify({
  approved: false,
  summary: process.env.REVIEW_SUMMARY,
  blocking_findings: [process.env.REVIEW_FINDING],
  non_blocking_notes: [],
}, null, 2)}\n`);
NODE
fi
