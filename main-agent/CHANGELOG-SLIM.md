# Dataverse Slim — change log

Applied the clear-path load reductions from SE-3215 on top of the restructured `main-agent/` tree (2026-08-24).

## Done (clear path)

| Item | What changed |
| --- | --- |
| Slim `save_answer` | Removed post-write `loadChildren` and all interview/topic counter PATCHes. After POST answer + PATCH question (+ optional topic readyForSummary), mutates in-memory children (synthetic answer + status flags) and runs `computeState`. |
| Drop post-write reloads | `save_topic_summary`, `revise_answer` synthesize in memory. `save_discovery` / `save_consent` / `save_topics_and_questions` / `set_up_interview_folder` drop redundant interview GETs (`Object.assign`). Generation still does one post-create `loadChildren` (real IDs). |
| Skip useless child loads | `needsChildren(interview)` — only load topics/questions/answers when status === generated (30). Wired in `get_runtime_state`, `create_interview`, `set_up_interview_folder`, `upload_document`. |
| Prompt | Topic summaries must use `topicQnA` (prefer `rawUserMessages`); `get_answers` only for final handover / revise / fallback. |
| Rate-limit UX | System prompt: on 429, do not claim saved; re-present answer recap; retry once. `failureMessage` 429 branch across all actions. |

## Deferred / spikes for you

| Item | Location |
| --- | --- |
| 7 — Joined read | `main-agent/spikes/01-joined-read-spike.js` + `README.md` |
| 8 — `$batch` generation | `main-agent/spikes/02-batch-create-spike.js` |
| 9 — Index `ckr_employeeemail` | Deferred (Dataverse ALM / maker portal) |

## Expected hot-path shape after this copy

`save_answer` happy path ≈ **1 interview GET + 3 child GETs + POST + 1–2 PATCHes** (no reload, no counters).

Wire spikes into actions only after they pass against non-prod.
