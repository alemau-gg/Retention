---
name: knowledge-retention-contributing
version: "1.5.2"
description: >-
  ALWAYS use before proposing or applying any change to the BASF Knowledge
  Retention use case. Defines hard scope, live-read, confirmation, Dev/Staging/
  Prod, helper synchronization, verification, and rollback rules. Do NOT use
  for employee interviews. NEVER touch non-KR integrations or non-KR skills.
---
# Knowledge Retention Contributing

This is the entrypoint for changing the BASF Knowledge Retention use case. It
defines the process; focused details live in the references below.

## Read these references

Read these before acting, then follow the routing table:

1. [`environment-contract.md`](references/environment-contract.md) — always.
2. [`change-process.md`](references/change-process.md) — always.
3. [`scope-and-regression.md`](references/scope-and-regression.md) — for scope,
   ownership, invariants, admin data, or behavioral changes.
4. [`integration-modification.md`](references/integration-modification.md) —
   for Knowledge Retention Backend action or manifest code.

| Request | Read |
|---|---|
| Any change | Environment contract + change process |
| Backend code or manifest | Scope/regression + integration modification |
| Helper, `computeState`, `STATUS`, or `MESSAGES` change | Scope/regression + change process helper-sync section |
| Skill or prompt change | Scope/regression layer ownership + change process |
| Promotion or revert | Environment contract gates and action reference |
| Behavioral change | Scope/regression ownership, invariants, and regression matrix |

## Non-negotiable rules

- **No Prod:** the agent never targets, reads, writes, promotes to, or reverts
  from Prod.
- **Dev first:** ordinary edits, helper synchronization, and verification target
  Dev only.
- **Staging is controlled:** Staging changes only through confirmed
  `promote_to_staging`; `revert_to_staging` uses Staging as the source for Dev.
- **Fresh read:** fetch and fully read the current live source before mapping
  and again immediately before each edit.
- **No unconfirmed changes:** propose the exact change, risks, version,
  verification, and reversal, then wait for explicit confirmation in the
  current conversation.
- **Stack, do not overwrite:** apply the smallest change to the latest
  API-fetched source and preserve unrelated code.
- **Functional change log only:** the separate package-level functional change
  log tracks integration and runtime-skill changes. Do not read or update it
  when changing this contributing skill or other process documentation.
- **Helper integrity:** canonical `get_runtime_state` first, then
  `sync_helpers`, confirmed `update_action` writes, and fresh
  `verify_helpers` with `ok: true`.
- **Human action testing:** the agent does not execute actions. After Dev
  verification, give the human the exact actions, inputs, expected results,
  and edge cases to test. Promotion still requires the human to state that
  Dev testing is satisfactory.
- **HOW is read-only here:** `how-the-agent-works.md` is setup documentation.
  Report a separate follow-up instead of editing it.
- **Scope is narrow:** only the KR Backend, KR skills/prompt, and the five
  custom Langdock development actions are in scope. Refuse other integrations
  and non-KR skills.

## Completion standard

A change is complete only when:

1. The requested scope and environment gates passed.
2. The user confirmed the proposed change before any runtime write.
3. Live Dev reflects the intended change.
4. Helper synchronization and `verify_helpers` passed when applicable.
5. Relevant verification and regression guidance was completed.
6. The human received a concrete action-testing handoff for Dev behavior.
7. The user tested Dev and stated that it is satisfactory before promotion.

For Staging promotion, also require the explicit user-acceptance gate and the
action-level confirmation. Prod handoff always remains human-managed.
