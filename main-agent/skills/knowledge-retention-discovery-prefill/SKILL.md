---
name: knowledge-retention-discovery-prefill
description: >-
  ALWAYS use when the backend prefilled-discovery instruction says to load
  this skill (RunPreInterviewDiscovery after discovery prefill was accepted).
  Do NOT use for interview questions, summaries, or the handover.
---

# Knowledge Retention Discovery Prefill

Draft the discovery profile from the employee's own recent work, then hand the draft to them. Progress and `save_discovery` still come from the backend instruction.

Parameters, action slugs, and which filters are real: `references/sources.md`. This file is the policy.

## When to load

Load only when the backend instruction for `RunPreInterviewDiscovery` says to load `knowledge-retention-discovery-prefill`. That is pre-interview discovery, after they accepted discovery prefill. Once per conversation.

| Load | Moment | Use this skill for |
|---|---|---|
| Yes | Prefilled `RunPreInterviewDiscovery` | Search, draft, invite additions, then the interviewing skill's field list before save |
| No | Standard `RunPreInterviewDiscovery` (prefill off or declined) | Do not search. Interviewing skill runs question-by-question discovery |
| No | After `save_discovery` | Unload. Interview answers, topic summaries, and the handover never use this search |

On resume, discovery is not saved yet, so search again. Do not search a second time in the same conversation.

Consent is already done. Do not offer it again.

## Hard rules

- Describe their work, not their data. Name source types only: "your documents", "your Teams activity", "your email". Never say chats. Do not search OneDrive, calendar, OneNote, Planner, or Viva Engage.
- Never quote messages, name colleagues from search hits, give counts, or mention private events. Present findings as "it looks like…".
- The no-negative-remarks rule applies to everything found. Keep the work lesson; drop blame and private details.
- Every found value is a suggestion, including `directoryProfile` job title and department. The user confirms or corrects it.
- Focus topics are always asked explicitly. Candidates are suggestions. Do not decide the focus topics.
- Nothing is saved until the user confirms the full profile and `save_discovery` is called.
- Search window: last 6 months. Own work only. Two passes, then stop.
- A source that is unconnected or fails: skip it. Mention once which sources could not be searched. Never retry in a loop.
- After discovery, do not search again. Outside discovery, documents are fetched only when the user explicitly asks, and then the supporting-file rules apply.

## Before searching

Send one short message in the interview language: this takes a moment. No tool names, no action names, no source-by-source narration.

## Search

Follow `references/sources.md`.

1. **Broad pass** over the sources in that file. Sent mail, the user's own Teams messages, and SharePoint files. Nothing else.
2. **Targeted pass** for the systems, projects, and processes the first pass found. Do not open a third pass.
3. Read only a few full documents, via SharePoint `get_file`.
4. Always drop, client-side: anything older than six months, private or confidential items, and other people's messages.

If a listed action does not exist, skip that source. Do not invent a replacement call.

## Draft

One entry per discovery field. Suggestions only.

| Field | How to draft |
|---|---|
| Role and business unit | `directoryProfile` first (`jobTitle`, `department`). If it is null or the instruction says "not available", use the email signature. |
| Responsibilities | Concrete work the sources support. |
| Additional responsibilities | Own entry in the draft. `save_discovery` has no separate input: after they confirm, include this text in `responsibilities`, still distinct in the read-back. |
| Systems and tools | Named systems the work actually uses. |
| KPIs and constraints | Only if found. Do not invent one. If none was found, leave it empty. |
| Focus topic candidates | Suggestions beside the draft. Do not treat them as the chosen focus topics. |

Then invite them to add anything the draft missed. Say that skipping that is fine. Wait for an addition or a skip before the gap questions.

## Gaps, then save

Ask only the gaps, one question at a time. The thin-answer bar and the field list live in `knowledge-retention-interviewing`. Apply that bar before save. Do not invent a second bar. Do not search from that skill.

Ask focus topics explicitly even when candidates exist. They choose.

Read the full profile back. Explicit confirmation, then `save_discovery`. Silence, "I guess", or a topic change is not confirmation.

**Done when:** the profile was read back, they explicitly confirmed, and `save_discovery` succeeded. Then unload this skill. Do not search again for answers, summaries, or the handover.

## Nothing usable

If the passes produce nothing you can draft, say so briefly and stop searching. Run standard discovery with `knowledge-retention-interviewing`, question by question. Do not retry the sources.
