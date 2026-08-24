# Scope, ownership, and regression rules

Use this reference when deciding whether a request is allowed, which layer owns it, and which behavioral checks are required.

## Hard scope lock

### Integrations

Only the Knowledge Retention Backend business integration and these five custom Langdock control-plane actions are in scope:

- `update_action`
- `sync_helpers`
- `verify_helpers`
- `promote_to_staging`
- `revert_to_staging`

Never touch another integration to fix, align, copy a pattern, peek, or experiment. If a request needs another integration changed, refuse and propose a KR Backend, KR skill, or KR prompt alternative, or escalate to a human.

### Skills

Only Knowledge Retention agent skills may be edited. New skills may be created only for the same agent.

In scope:

- `knowledge-retention-interviewing`
- `knowledge-retention-reporting`
- `knowledge-retention-contributing`
- any new KR-only skill

Never edit, rename, delete, or improve a non-KR skill, including BASF document-template or shared organization skills.

Scope lock beats urgency.

## HOW boundary

`how-the-agent-works.md` is BASF Retention Agent setup documentation, not a development artifact.

- Read it for context when necessary.
- Never edit it, include it in a live write, or update it automatically.
- If a change requires setup-documentation changes, stop and propose a separate task.
- When a functional integration or runtime-skill change is logged, record
  whether a separate follow-up was identified in its `HOW impact` field.

## Layer ownership

| Change type | Owner |
|---|---|
| Etiquette, pauses, reminders, failure UX, follow-up count, prompt hooks | Interview system prompt |
| Topic/question counts, discovery bar, summary format, final-document phases | `knowledge-retention-interviewing` or `knowledge-retention-reporting` |
| Stage order, gates, instruction text, status semantics, `MESSAGES` | Backend through `get_runtime_state` and helper synchronization |
| Field names, types, limits, JSON schema | Integration manifest |
| Use-case structure explanation | HOW, as a separate setup-documentation task only |
| Edit, verification, and administrator process | This skill |

Decision rule:

- survives a context wipe → backend instruction
- judgment after skill load → content skill
- manner → interview prompt
- must be forced at a stage → backend instruction

## Coupled-edit checklists

### Add a `nextAction`

Update `computeState` and synchronize helpers. Update the interview prompt if the value is user-visible. If setup documentation needs alignment, report a separate HOW task without editing HOW here.

### Add a status code

Update the Dataverse option set, `STATUS` everywhere through helper synchronization, and numeric gates such as `< 60` open and `60..79` closed. Check topic and `readyForSummary` behavior.

### Rename an action

Update the manifest, all runtime instructions, both content skills, the interview prompt, and this skill where referenced. Report any setup-documentation follow-up separately.

### Add a post-finalize action

Check completed-interview fallback behavior for `60 ≤ status < 80`.

### Change auth

Preserve the manifest contract. `sharepointSiteId` uses lowercase `p`; `authTest` and Graph callers must match.

## Invariants

- Target records from status and expected-order tokens, never LLM-provided record IDs.
- Preserve session identity casing; do not lowercase it.
- Flip status last when possible.
- Never invent a stage from chat or expose internal mechanics to interviewees.
- Do not add a folder-listing action unless a separate HOW redesign addresses the topic-upload gap.
- Topic files have no `filed` flag; only final upload advances `60 → 70`.

## Minimum regression matrix

For behavioral changes, identify the relevant paths and give the human a
concrete test plan. The agent does not execute actions:

1. Fresh start → first question
2. Resume mid-topic in a new chat
3. Revise before and after summary approval, including interruption during a later topic
4. Concurrency conflict tokens
5. Prefill on and off
6. Abandon → restart
7. Finalize → final upload (`70`) → feedback → close
8. Reopen: `BuildFinalDocument`, `InterviewComplete`, and `CollectProfile`
9. Blank topic document and branded final-document path

## Admin Dataverse

Use `admin_describe_schema` before `admin_query_records` and before any recommendation that depends on column, choice, or operator identity.

- Use only schema-returned fields and operators.
- Narrow selects and filters.
- Respect `top` limits.
- Use `exportAsCsv` when a file is needed.
- Treat data as sensitive production data.
- Do not bypass the state machine unless explicitly requested and the blast radius is mapped.
- If schema and HOW conflict, surface the conflict instead of silently choosing.

## Content-skill boundaries

- Interviewing owns discovery and topic/question generation. It must not rewrite live `AskActiveQuestion` text.
- Reporting owns topic summaries and final handover. Keep the blank topic-document path separate from the branded final-template path, which is called rather than edited.
- Topic summary gaps use the heading **Open gaps**.
