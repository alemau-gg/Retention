---
name: knowledge-retention-interviewing
description: >-
  ALWAYS use when nextAction is GenerateTopicsAndQuestions (build topics/
  questions from discovery). ALSO use during RunPreInterviewDiscovery for the
  thin-answer bar and field checklist. Do NOT use for AskActiveQuestion
  rewrites, topic summaries, or the final handover — those are backend
  verbatim / knowledge-retention-reporting.
---
# Knowledge Retention Interviewing

Methodology only. Progress, saves, and `nextQuestionText` come from the backend instruction — never invent stage from chat.

## When to load

| Load | `nextAction` / moment | Use this skill for |
|---|---|---|
| Yes | `RunPreInterviewDiscovery` | Thin-answer bar + required discovery fields |
| Yes | `GenerateTopicsAndQuestions` | 4–6 topics × 3–6 questions; overview; then `save_topics_and_questions` |
| No | `AskActiveQuestion` | Ask `nextQuestionText` verbatim; clarifying follow-ups are system-prompt, not this skill |
| No | `GenerateOrReviewTopicSummary`, `BuildFinalDocument`, `FinalizeAndCollectFeedback` | Load `knowledge-retention-reporting` instead |

Do not load for consent, folder setup, finalize, feedback, or document upload — follow the backend instruction.

## Boundaries

| Owns | Does not own |
|---|---|
| Discovery quality bar; topic/question design | Interview stage, concurrency tokens, SharePoint |
| Grounding in discovery (+ Company Context when present) | Rewriting, paraphrasing, or translating live questions |
| Coverage checks before save | Topic summaries or final handover docx |

Language: interview language from state. Do not translate into English unless that is the interview language.

## What to capture

Undocumented know-how that would leave with this person — not process manuals. Chase:

- Undocumented know-how (actual vs manual)
- Single-person dependencies
- Risks and failure modes
- Process exceptions (the non-standard 20%)
- Stakeholder maps and unwritten escalation
- System quirks and tribal workarounds
- Judgment criteria (thresholds, heuristics, red flags)

## Discovery (`RunPreInterviewDiscovery`)

**Done when:** every required field is concrete, you read the profile back, user explicitly confirmed, then `save_discovery`.

Collect one question at a time:

- role title and business unit
- core responsibilities and tasks
- additional or case-specific responsibilities
- KPIs and constraints (optional; probe once if absent)
- systems and tools used in the role
- focus topics they consider most important to hand over

**Thin-answer bar (before save):** at least one named system/tool, one concrete responsibility (not “support the team”), and one focus topic. If thin → one probe, then continue. Do not invent. Conversational, not a form.

## Generating topics and questions (`GenerateTopicsAndQuestions`)

**Done when:** 4–6 topics each with 3–6 questions, coverage checks pass, user saw the overview, then `save_topics_and_questions`. Do not ask interview questions yet.

**Inputs:** discovery profile; when present, CKR Company Context folder (ground topics there; do not invent org processes from training data).

1. **4–6 topics**, most critical first.
2. **Dedicated focus topics (hard):** every highlighted discovery focus topic gets at least one interview topic whose title and scope name that focus. Do not fold a named focus into a catch-all “role overview” topic. Closely related focuses may share a topic only when the topic title still names those focuses.
3. **3–6 questions per topic**, concrete → reflective (what/how X works → what you'd tell a successor about X).
4. Every question names something from **this person's** discovery. A question that fits any employee is bad.
5. Answerable in **2–5 spoken sentences**. Split compounds. No “describe everything about X”.
6. Stories and specifics, not opinions: “Walk me through the last time X went wrong” beats “What are the challenges with X?”
7. Do not restate discovery (role, tools list). Go one level deeper.
8. Cover at least: one risk/failure topic, one stakeholder/relationship topic, one systems/tools topic — unless clearly N/A (say why in the overview).

**Self-check before `save_topics_and_questions`:** list discovery focus topics against topic titles; rewrite if any named focus has no dedicated topic. Rewrite or drop any question that fails (4)–(7). Fix missing coverage in (8) or justify N/A. Present overview → save.

Patterns and a worked example: `references/question-patterns.md`. Adapt the slot; never paste example wording.
