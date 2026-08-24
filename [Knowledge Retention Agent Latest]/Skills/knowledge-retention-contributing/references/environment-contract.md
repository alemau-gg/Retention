# Environment contract and custom development actions

This reference defines where the BASF Knowledge Retention use case may be read, edited, tested, promoted, and reverted. Read it before every change so the target environment is explicit.

## Environments

| Environment | Purpose | Agent permissions |
|---|---|---|
| **Prod** | Human-managed live workspace | No access by process. Never request, accept, infer, read, write, promote to, or revert from a Prod ID. |
| **Staging** | Stable-testing baseline and rollback source | Read only for comparison and revert. It may change only through confirmed `promote_to_staging`. Never use `update_action`, `sync_helpers`, or `verify_helpers` against it. |
| **Dev** | Active development and exploratory testing | The only environment that may receive ordinary edits, helper synchronization, and verification. |

The same API key may technically reach multiple integration IDs. Environment safety is therefore a hard process rule, not an assumed API permission boundary.

Before doing anything else:

1. Confirm the request concerns the KR use case.
2. Identify the trusted Dev and Staging integration IDs.
3. Stop if an ID is missing, ambiguous, or may be Prod.
4. Never discover or guess an ID by name.

## Mandatory gates

### Gate 1: Fresh read

Read the complete current live artifact through the API immediately before mapping the edit. For action code, read the whole action and all coupled helpers, not only matching lines.

### Gate 2: Proposal

Show the user:

- affected assets and exact intended changes
- proposed semantic version
- dependencies and risks
- verification plan
- reversal approach

Do not change a runtime artifact yet.

### Gate 3: Explicit confirmation

Wait for explicit confirmation in the current conversation. Silence, “look into it”, a vague acknowledgement, or approval from an earlier request is not confirmation.

### Gate 4: Dev write

After confirmation, re-read the live Dev source and apply the smallest patch on top of that exact source. Every ordinary action-code write uses the confirmed `update_action` action, which itself requires confirmation.

### Gate 5: Dev integrity

If shared helper code changed:

1. Update canonical `get_runtime_state`.
2. Call `sync_helpers`.
3. Review the returned updates and blockers.
4. Apply every confirmed update with `update_action`.
5. Run `verify_helpers` on a fresh Dev fetch.

Stop while verification is false, incomplete, or blocked.

### Gate 6: User acceptance

The agent does not execute actions. After Dev verification, give the human the exact action names, inputs, expected results, and relevant edge cases to test. The human must test the changed behavior in Dev and explicitly state in the current conversation that Dev testing is satisfactory.

### Gate 7: Promotion

Only after the user-acceptance gate passes may the agent propose and call `promote_to_staging`. The action's own confirmation prompt is a second mandatory safeguard. Promotion mirrors creates, updates, and deletions and returns a pre-promotion Staging snapshot.

### Gate 8: Staging handoff

Test the promoted Staging copy. When the user is satisfied with Staging, tell the human owner to update Prod. The agent must never perform or initiate a Prod update.

## Revert gate

If Dev must be reset, explain that the operation will make Dev match Staging, including deletions. Obtain explicit confirmation, then call `revert_to_staging`.

The action returns a pre-revert Dev snapshot. It is not a generic undo for an unpromoted experiment: it restores Staging, so use it only when Staging is the intended source of truth.

## Custom development actions

The Langdock control-plane integration intentionally contains only these five self-contained actions. Do not add `_shared.js`, `require`, `import`, npm packages, or generic catalog actions.

| Action | Inputs | Behavior | Writes and restrictions |
|---|---|---|---|
| `update_action` | `integrationId`, `actionId`, and optional `name`, `description`, `code`, `inputFields`, `requiresConfirmation` | Fetches the complete current action, preserves omitted fields, updates it, fetches the stored result again, and returns `previousAction` plus `rollbackPayload`. | Writes Dev only. Requires confirmation. `inputFields` replaces the complete list. Does not create or delete actions. |
| `sync_helpers` | `integrationId` | Fetches the live integration, uses `get_runtime_state` as the canonical `KnowledgeRetentionUtils` source, dynamically discovers non-admin actions, and returns proposed helper replacements. | Read-only. Use against Dev only. Review `updates` and `blockers`; returned patches are not applied automatically. |
| `verify_helpers` | `integrationId` | Freshly fetches the integration and checks helper completeness, action coverage, `ACTION_SLUG` values, forbidden module syntax, and drift from `get_runtime_state`. | Read-only. Use against Dev only. `ok: true` is required before completion. |
| `promote_to_staging` | `devIntegrationId`, `stagingIntegrationId` | Compares actions by slug, creates missing actions, updates changed actions, deletes actions absent from Dev, and fetches Staging again to verify the mirror. | Writes Staging. Requires confirmation and the user-acceptance gate. Never pass a Prod ID. Returns `prePromotionStaging`. |
| `revert_to_staging` | `devIntegrationId`, `stagingIntegrationId` | Compares Staging and Dev by slug, creates missing actions, updates changed actions, deletes actions absent from Staging, and fetches Dev again to verify the mirror. | Writes Dev. Requires confirmation. Staging is the source of truth. Returns `preRevertDev`. |

These actions call the Langdock Integrations API internally with `ld.request`. Generic `list_integrations`, `get_integration`, `create_action`, and `delete_action` actions are intentionally absent, so IDs must come from trusted configuration or the user.
