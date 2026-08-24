# Dataverse Slim — change log

Applied the clear-path load reductions from SE-3215 on top of the restructured `main-agent/` tree (2026-08-24).

## Done (clear path)

| Item | What changed |
| --- | --- |
| Slim `save_answer` | Removed post-write `loadChildren` and all interview/topic counter PATCHes. After POST answer + PATCH question (+ optional topic readyForSummary), mutates in-memory children (synthetic answer + status flags) and runs `computeState`. |
| Drop post-write reloads | `save_topic_summary`, `revise_answer` synthesize in memory. `save_discovery` / `save_consent` / `save_topics_and_questions` / `set_up_interview_folder` drop redundant interview GETs (`Object.assign`). Generation still does one post-create `loadChildren` (real IDs). |
| Skip useless child loads | `needsChildren(interview)` — only load topics/questions/answers when status === generated (30). Wired in `get_runtime_state`, `create_interview`, `set_up_interview_folder`, `upload_document`. |
| FetchXML `loadChildren` | Replaced 3 child GETs with one FetchXML join + adapter (null-coercion for omitted attributes). Canonical in `get_runtime_state`; synced into all non-admin actions. Gate: `admin_spike_joined_read` → `readyToReplaceLoadChildren` PASS. |
| `$batch` generation | `save_topics_and_questions` creates all topics + questions in one `$batch` changeset (client-assigned topic GUIDs). Gate: `admin_spike_batch_create` → `readyToReplaceGenerationCreates` PASS. |
| Prompt | Topic summaries must use `topicQnA` (prefer `rawUserMessages`); `get_answers` only for final handover / revise / fallback. |
| Rate-limit UX | System prompt: on 429, do not claim saved; re-present answer recap; retry once. `failureMessage` 429 branch across all actions. |

## Spikes (same integration, same auth)

| Item | Action | Status |
| --- | --- | --- |
| 7 — Joined read | `admin_spike_joined_read` | PASS → wired into `loadChildren` |
| 8 — `$batch` generation | `admin_spike_batch_create` | PASS → wired into `save_topics_and_questions` |
| 9 — Index `ckr_employeeemail` | Deferred (Dataverse ALM / maker portal) | — |

These are admin actions on the Knowledge Retention Backend connection (`data.auth.clientId` / `clientSecret` / `dataverseUrl` / `tenantId`). They are not on the employee interview path.

## Expected hot-path shape after this copy

`save_answer` happy path ≈ **1 interview GET + 1 FetchXML child load + POST + 1–2 PATCHes** (no reload, no counters).

`save_topics_and_questions` generation ≈ **1 interview GET + 1 FetchXML (cleanup) + sequential DELETEs if needed + 1 `$batch` create + 1 status PATCH + 1 FetchXML reload**.
