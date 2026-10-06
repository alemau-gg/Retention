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
| Yes | `RunPreInterviewDiscovery` | Thin-answer bar + required discovery fields. If the instruction says to load `knowledge-retention-discovery-prefill`, that skill drafts; do not search from here |
| Yes | `GenerateTopicsAndQuestions` | Topic and question counts from the backend instruction; overview; then `save_topics_and_questions` |
| No | `AskActiveQuestion` | Ask `nextQuestionText` verbatim. Probing follow-ups (max 3, used much more often than not) are the system prompt, not this skill |
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

Live follow-ups are the system prompt (this skill is not loaded on `AskActiveQuestion`). Cap stays 3. Within it, follow up much more often than not, one gap at a time, and do not repeat what was already said. Go after assumptions, exceptions, failure cases, who else depends on this, numbers, sequence, and what would break if this person left.

## Discovery (`RunPreInterviewDiscovery`)

**Done when:** every required field is concrete, you read the profile back, user explicitly confirmed, then `save_discovery`.

When the backend instruction says to load `knowledge-retention-discovery-prefill`, follow that skill for the draft. Do not run the search yourself from this skill. This skill's thin-answer bar and field list still apply before save.

Collect one question at a time:

- role title and business unit
- core responsibilities and tasks
- additional or case-specific responsibilities
- KPIs and constraints (optional; probe once if absent)
- systems and tools used in the role
- focus topics they consider most important to hand over

**Thin-answer bar (before save):** at least one named system/tool, one concrete responsibility (not “support the team”), and one focus topic. If thin → one probe, then continue. Do not invent. Conversational, not a form.

## Generating topics and questions (`GenerateTopicsAndQuestions`)

**Done when:** the number of topics and questions per topic given in the backend instruction, coverage checks pass, user saw the overview, then `save_topics_and_questions`. Do not ask interview questions before that save succeeds. After it succeeds, follow the returned instruction. When `nextAction` is `AskActiveQuestion`, ask `nextQuestionText` verbatim directly without a readiness confirmation or wait.

**Inputs:** discovery profile; when present, CKR Company Context folder (ground topics there; do not invent org processes from training data).

1. **Topic count from the backend instruction** (it is set per environment; default 4–6), most critical first. `save_topics_and_questions` rejects any other count.
2. **Dedicated focus topics (hard):** every highlighted discovery focus topic gets at least one interview topic whose title and scope name that focus. Do not fold a named focus into a catch-all “role overview” topic. Closely related focuses may share a topic only when the topic title still names those focuses.
3. **Questions per topic from the backend instruction** (default 3–6), concrete → reflective (what/how X works → what you'd tell a successor about X).
4. Every question names something from **this person's** discovery. A question that fits any employee is bad.
5. Answerable in **2–5 spoken sentences**. Split compounds. No “describe everything about X”.
6. Stories and specifics, not opinions: “Walk me through the last time X went wrong” beats “What are the challenges with X?”
7. Do not restate discovery (role, tools list). Go one level deeper.
8. Cover at least: one risk/failure topic, one stakeholder/relationship topic, one systems/tools topic — unless clearly N/A (say why in the overview).

**Self-check before `save_topics_and_questions`:** list discovery focus topics against topic titles; rewrite if any named focus has no dedicated topic. Rewrite or drop any question that fails (4)–(7). Fix missing coverage in (8) or justify N/A. Present overview → save.

Patterns and a worked example: `references/question-patterns.md`. Adapt the slot; never paste example wording.
