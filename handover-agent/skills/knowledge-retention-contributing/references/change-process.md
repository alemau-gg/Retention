# Change process

This reference defines the read, propose, confirm, edit, verify, and closeout procedure for every in-scope change.

## Source of truth

Use Langdock API tools for live artifacts. Do not use a local checkout, desktop copy, shell, filesystem, editor, memory, or stale export as a substitute for a live API read or write. Live Langdock state wins.

Before mapping a change:

1. Restate the goal, success condition, out-of-scope items, and what must not change.
2. Fetch and carefully read the complete live artifacts.
3. Map purpose, inputs, outputs, state transitions, callers, sibling dependencies, helper coupling, and relevant documentation.
4. Stop if the fetch is partial, fails, or leaves behavior uncertain.

### Read matrix

| Changing | Read at least |
|---|---|
| Shared helper, `computeState`, `STATUS`, or `MESSAGES` | `get_runtime_state`, every non-admin action that must stay synchronized, and the manifest if fields or slugs are involved |
| One action body | That action and `get_runtime_state` when current instructions or `nextAction` matter |
| Manifest or auth fields | Manifest, `authTest`, and every action that reads those auth fields |
| Content skill | That KR skill's `SKILL.md` and every reference that will be touched |
| Interview system prompt | The complete live KR prompt |
| Documentation | Current HOW for context only, plus this skill for editable process rules |

## Proposal and confirmation

Before any live runtime edit:

1. Show the user the goal, exact assets, granular edits, HOW impact, dependencies, proposed semantic version, blast radius, verification plan, and reversal prompt.
2. Wait for explicit confirmation in the current conversation.
3. If the user declines or changes scope, do not edit live artifacts.

This contributing-skill process does not update the functional change log. When
the mapped change modifies the KR Backend integration or a functional runtime
skill, follow the functional log's own integration/runtime-skill procedure.

Structural, status, schema-semantic, helper-sync, or hard-to-reverse work also needs explicit administrator approval.

## Stack on the latest source

After confirmation and immediately before every code edit:

1. Fetch the complete current source again.
2. Use that exact response as the patch base.
3. Preserve all unrelated code and assets.
4. Apply the smallest additive or targeted diff.
5. Stop and remap if the live source differs materially from the proposed base.

Never replace live code with a local copy, reconstructed version, or stale fetch.

## Semantic versioning

Track `MAJOR.MINOR.PATCH` in this skill's metadata:

- **PATCH:** documentation, copy, tests, or backward-compatible bug fixes
- **MINOR:** additive, non-breaking capabilities
- **MAJOR:** deliberate breaking changes to API contracts, fields, states, or behavior

Do not bump the version before confirmation. A version bump never replaces confirmation.

## End-to-end procedure

### 1. Understand and scope

Clarify the need and fail closed if the request is outside:

- the Knowledge Retention Backend
- the dedicated coding-tools control-plane actions: confirmed Dev/Staging
  mutators and the fixed-GET read-only catalog/detail actions
- KR skills, including new KR-only skills
- the KR interview prompt
- explicitly in-scope KR documentation

Never touch another integration or non-KR skill.

### 2. Map the change

The proposal must identify:

1. Need, in one sentence
2. Scope decision
3. Layer
4. Exact action slugs, skill files, or prompt
5. Dependencies, including instructions, skills, prompt, status, `nextAction`, and resume behavior
6. Whether helper synchronization is required
7. Verification actions and tests
8. Blast radius and rollback
9. Documentation follow-up

### 3. Edit

Apply only mapped changes:

- `update_action` on Dev for ordinary action edits
- the explicitly confirmed promotion or revert action for environment mirroring
- the mapped KR skill or prompt process for content changes
- never Prod

For backend sandbox conventions, read `references/integration-modification.md`.

### 4. Verify

After backend code or manifest changes:

1. Fetch the full relevant Dev action set and manifest, plus `authTest` if auth changed.
2. Run `verify_helpers` on a fresh Dev fetch.
3. Require `ok: true`.
4. If helpers changed, confirm one canonical helper fingerprint across non-admin actions.
5. Re-read every artifact written and compare stored content with intent.
6. Do not execute actions. Give the human a concrete test handoff listing the
   changed action, inputs, expected result, and relevant edge cases.
7. Walk the regression matrix in `scope-and-regression.md` and identify the
   cases the human should test.

A backend change is ready for human testing when live Dev artifacts reflect it and `verify_helpers` returned `ok: true`.

If `sync_helpers` or `verify_helpers` is unavailable, stop. Do not recreate either action with a shell script, local editor, or reconstructed source.

### 5. Close out

Before reporting completion, provide:

- what changed and why
- applied version and confirmation record
- residual risk
- artifacts re-read
- verification summary
- the human action-testing handoff
- rollback or reversal instructions

If setup documentation appears stale, report a separate follow-up. Do not edit HOW or Prod.

The coding-tools read actions are non-mutating and require no confirmation,
but they still use only documented Langdock endpoint paths, never return the
API key, and never accept an HTTP method, path, or upstream URL from the
caller. Integration detail/action reads are limited to the trusted Dev and
Staging IDs configured in the connection. Agent lookup is by ID because the
documented Agent API has no workspace-wide list endpoint. Skill file reads
must reject absolute paths, drive prefixes, control characters, backslashes,
dot segments, unsupported extensions, and files over 512 KB.

## Helper synchronization

Every non-admin KR Backend action carries the complete `KnowledgeRetentionUtils` block. The only intentional per-action difference is `ACTION_SLUG`.

### Synchronize when

| Edit | Sync |
|---|---|
| Anything inside `KnowledgeRetentionUtils`, including `STATUS`, `SCHEMA`, `MESSAGES`, `computeState`, `dv`, or `graph` | Yes |
| Action body below the helper closing `};` | No, but re-read siblings when instructions must remain consistent |
| Manifest or `authTest` only | No |

### Synchronization sequence

1. Edit canonical `get_runtime_state` in Dev.
2. Call Dev-only `sync_helpers`; it fetches the complete live action set itself.
3. Review its `updates` and `blockers`.
4. After explicit confirmation, write each update through `update_action`.
5. If a blocker appears or a write fails mid-sync, stop and report updated versus stale actions.
6. Finish the synchronization before any further behavior edit.
7. Run `verify_helpers` on a fresh Dev fetch.

Never trim helper methods because an action does not call `computeState`. Actions such as `finalize_interview`, `save_feedback`, `get_answers`, and `get_discovery` still receive the full helper.

Action-authored `nextAction` values such as `FinalizeAndCollectFeedback`, `GenerateFinalDocument`, and `SendClosingMessage` remain in those action bodies, not in `computeState`, unless the change deliberately moves them and updates all coupled artifacts.
