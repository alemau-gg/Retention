# Retention

BASF Knowledge Retention agent sources, split by agent.

## Layout

- **`main-agent/`** — employee-facing interview agent
  - `system-prompt.md` — interview system prompt
  - `skills/` — `knowledge-retention-interviewing`, `knowledge-retention-reporting`
  - `integrations/state-machine/` — Knowledge Retention Backend actions + manifest (incl. SE-3215 slim path and `admin_spike_*` probes)
  - `CHANGELOG-SLIM.md` — Dataverse load-reduction notes (SE-3215)

- **`handover-agent/`** — administrator-facing handover agent
  - `system-prompt.md` — handover system prompt
  - `how-the-agent-works.md` — structural source of truth
  - `contributing.md` — pointer to the contributing skill
  - `skills/` — `knowledge-retention-contributing`, `debug-agent`
  - `integrations/coding-tools/` — promote / revert / sync / verify helpers

Skill folder names and action filenames match Langdock; do not rename them.
