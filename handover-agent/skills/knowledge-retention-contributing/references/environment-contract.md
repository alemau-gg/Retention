# Environment contract and custom development actions

This reference defines where the BASF Knowledge Retention use case may be read, edited, tested, promoted, and reverted. Read it before every change so the target environment is explicit.

## Environments

| Environment | Purpose | Agent permissions |
|---|---|---|
| **Prod** | Human-managed live workspace | No access by process. Never request, accept, infer, read, write, promote to, or revert from a Prod ID. |
| **Staging** | Stable-testing baseline and rollback source | Read only for comparison and revert. It may change only through confirmed `promote_to_staging`. Never use `update_action`, `sync_helpers`, or `verify_helpers` against it. |
| **Dev** | Active development and exploratory testing | The only environment that may receive ordinary edits, helper synchronization, and verification. Its ID must be configured as the trusted Dev integration ID. |

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

## Coding-tools actions

The Langdock control-plane integration contains five confirmed mutators plus
read-only catalog/detail actions. Do not add `_shared.js`, `require`, `import`,
npm packages, or actions with caller-controlled HTTP methods, paths, or
upstream URLs.

| Action | Inputs | Behavior | Writes and restrictions |
|---|---|---|---|
| `update_action` | `integrationId`, `actionId`, and optional `name`, `description`, `code`, `inputFields`, `requiresConfirmation` | Fetches the complete current action, preserves omitted fields, updates it, fetches the stored result again, and returns `previousAction` plus `rollbackPayload`. | Writes Dev only. Requires confirmation. `inputFields` replaces the complete list. Does not create or delete actions. |
| `sync_helpers` | `integrationId` | Fetches the live integration, uses `get_runtime_state` as the canonical `KnowledgeRetentionUtils` source, dynamically discovers non-admin actions, and returns proposed helper replacements. | Read-only. Use against Dev only. Review `updates` and `blockers`; returned patches are not applied automatically. |
| `verify_helpers` | `integrationId` | Freshly fetches the integration and checks helper completeness, action coverage, `ACTION_SLUG` values, forbidden module syntax, and drift from `get_runtime_state`. | Read-only. Use against Dev only. `ok: true` is required before completion. |
| `promote_to_staging` | `devIntegrationId`, `stagingIntegrationId` | Compares actions by slug, creates missing actions, updates changed actions, deletes actions absent from Dev, and fetches Staging again to verify the mirror. | Writes Staging. Requires confirmation and the user-acceptance gate. Never pass a Prod ID. Returns `prePromotionStaging`. |
| `revert_to_staging` | `devIntegrationId`, `stagingIntegrationId` | Compares Staging and Dev by slug, creates missing actions, updates changed actions, deletes actions absent from Staging, and fetches Dev again to verify the mirror. | Writes Dev. Requires confirmation. Staging is the source of truth. Returns `preRevertDev`. |
| `list_integrations` | None | Lists shared private API, MCP, and A2A integrations with bounded metadata; it never returns credentials or action code. | Read-only. No confirmation. |
| `get_integration` | `integrationId` | Reads bounded metadata plus nested action definitions and complete stored action code for the configured Dev or Staging integration. | Read-only. Requires a configured integration allowlist; no confirmation. |
| `get_action` | `integrationId`, `actionId` or `actionSlug` | Reads one action by UUID or safe slug from a configured Dev or Staging integration, including its complete stored code within Langdock's documented action-code limit. | Read-only. Requires the integration allowlist and exactly one selector; no confirmation. |
| `get_agent` | `agentId` | Reads the configured handover agent by UUID using the documented Agent API endpoint. | Read-only. No workspace-wide `list_agents` endpoint is assumed or invented; no confirmation. Fails closed without `trustedAgentId`. |
| `list_skills` | Optional `limit`, `cursor`, `query`, `slug` | Lists configured Knowledge Retention skills with bounded metadata and documented pagination cursor. | Read-only. No confirmation. Fails closed without `trustedSkillIds`. |
| `get_skill` | `skillId` | Reads one configured Knowledge Retention skill's bounded instructions and stored-file metadata, without file contents. | Read-only. UUID and skill allowlist required; no confirmation. |
| `get_skill_file` | `skillId`, `path` | Reads one UTF-8 file only when the skill is allowlisted and the path is relative, traversal-free, extension-allowlisted, and within 512 KB. | Read-only. UUID, skill allowlist, and strict path validation; no confirmation. |

All actions call approved Langdock API paths internally with `ld.request`.
Read actions have fixed GET methods and paths; callers cannot supply an HTTP
method, path, or upstream URL. The manifest's optional
`devIntegrationId`/`stagingIntegrationId` fields are trusted connection
configuration, not caller input. Any environment-sensitive action fails
closed until those IDs are configured and exact input IDs match them. Never
guess or infer those IDs from names. The catalog is informational; use only
allowlisted IDs for detail or mutation actions.
