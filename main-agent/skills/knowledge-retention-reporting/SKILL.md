---
name: Knowledge Retention Reporting
slug: knowledge-retention-reporting
description: >-
  ALWAYS use for knowledge-retention topic summaries
  (GenerateOrReviewTopicSummary), missing topic-file recovery
  (UploadMissingTopicDocuments), and the final branded handover
  (BuildFinalDocument / FinalizeAndCollectFeedback). Default path is topic
  summary + blank .docx named exactly the backend fileName. Open
  references/final-document.md only for the final handover. Not for discovery,
  topic generation, or live Q&A — those belong to
  knowledge-retention-interviewing / backend nextQuestionText.
---
# Knowledge Retention Reporting

Methodology only. Stage, approval gates, and uploads follow the backend `instruction`. Do not invent stage from chat. Do not blend a topic-summary pass with the final-document pass.

## When to load

| Load | `nextAction` | Path |
|---|---|---|
| Yes | `GenerateOrReviewTopicSummary` | **Topic summary** (this file + `references/summary-format.md` only) |
| Yes | `UploadMissingTopicDocuments` | **Topic files only** — blank `.docx` named exactly `missingTopicFiles.fileName`; then retry `finalize_interview`. Not the final handover. |
| Yes | `BuildFinalDocument` or same-session `FinalizeAndCollectFeedback` (final-doc step) | **Final handover** — open `references/final-document.md` and follow it end-to-end |
| No | `RunPreInterviewDiscovery`, `GenerateTopicsAndQuestions`, `AskActiveQuestion` | Interviewing skill / verbatim `nextQuestionText` |
| No | Folder setup, consent, feedback-only, closing message | Backend instruction alone |

Default job when this skill is loaded: **topic summary**. Switch to the final path only when the backend asks for the final handover / `InterviewFinalSummary_{n}.docx`.

## Two document paths (never blend)

| | Topic summary | Final handover |
|---|---|---|
| Trigger | `GenerateOrReviewTopicSummary` | `BuildFinalDocument` / `FinalizeAndCollectFeedback` final-doc step |
| Methodology | `references/summary-format.md` only | `references/final-document.md` → `document-structure.md` + `fixed-sections-template.md` |
| Docx | **New blank** file named exactly the backend `fileName` | Populate branded `assets/template.docx` via the **BASF document template** skill (call it; never edit that skill) |
| Upload | `upload_document` `docType: topic` | `upload_document` `docType: final` |
| Forbidden | Branded template, final-document refs, cover/TOC/1.1–1.4 | Reusing a topic summary `.docx`; inventing facts; skipping Phase 1–4; writing chapters only from stored summaries |

For a topic summary, do **not** open: `references/final-document.md`, `references/document-structure.md`, `references/fixed-sections-template.md`, or `assets/template.docx`.

## Supporting files

Do not create a supporting file automatically. If the user attaches a file and explicitly confirms that it is useful for the interview, file that original attachment with `upload_document` using `docType: supporting` and a unique filename. Supporting uploads do not use the topic-summary format or the branded final template.

Confirmed supporting files **are** source material for this skill. When writing a topic summary or the final handover, read each such file (chat attachment) and include every relevant concrete fact. Name the source filename. Do not invent contents you could not read.

---

## Topic summary

**Done when:** user explicitly approves → `save_topic_summary` (`expectedTopicOrder`) → blank `.docx` uploaded (`docType: topic`) named exactly the backend `fileName`, with none of the final-doc machinery.

### Forbidden (hard stop)

Do not open, copy, or populate:

- `assets/template.docx`
- `references/final-document.md`
- `references/document-structure.md`
- `references/fixed-sections-template.md`

Do not write: cover/title page, AI-generation notice, executive summary, table of contents, sections 1.1–1.4, chapter-structure proposal, leadership/governance framing, or `{}` / `[bracket]` placeholders.

If any of that appears in a draft, discard it and restart from `references/summary-format.md` only.

### Write

**Inputs:** ordered Q/A for one topic (`topicQnA` from state; always call `get_answers` as well). Prefer `rawUserMessages` when present, else the confirmed answer. Also any confirmed supporting files for this interview: read them and include relevant contents. Never from memory.

1. Write for the **successor**, not the interviewee.
2. Follow `references/summary-format.md` only.
3. Preserve specifics verbatim. Never generalize a concrete detail.
4. Gaps stay visible under the translated **Open gaps** heading when present; omit empty optional sections. Do not use “Open Items”.
5. No invention: no inferences, training-data best practices, or embellishment.
6. Length and shape: exhaustive. No upper word cap. One heading per answered question. Prefer a short paragraph, then bullets when there are several facts, then a translated "For example" from the source (never invent), with line breaks between blocks. Leave that shape if a quote, table, or one tight paragraph fits better. Close with a short how-this-fits-together paragraph. First draft must already be this dense and scannable; do not wait for the user to ask for more examples. If they ask for more bullets, more breaks, or bolder names, treat that as a change request: revise and re-present the full draft. The draft must be at least as long as the combined `rawUserMessages` for the topic (or confirmed answers if raw is empty), plus supporting-file facts. If it is shorter or lacks examples, expand before showing it.
7. Language: interview language from state for body **and** every section heading, including the headings shown to the user in chat.

### Deliver

After explicit approval:

1. `save_topic_summary` with `expectedTopicOrder`.
2. Build a **new blank document** named exactly `fileName` from the backend instruction (ASCII hyphens, no spaces, no accents). Body = approved summary sections only. Never start from `assets/template.docx`. Never call the BASF document template skill for topic files. Do not invent a prettier filename.
3. Before upload: search for `{` / `}` / `[…]` placeholders and for title/TOC/exec-summary/1.1–1.4 wording. If any appear, fix or rebuild — do not upload. Do not put markdown `**` into the `.docx`; apply real bold and real lists.
4. `upload_document` (`docType: topic`, `fileName` exactly as given); confirm with the folder link.

---

## Final handover instead?

Only when every topic has an approved summary **and** the backend asks for the final record (`BuildFinalDocument` or the final-doc step in `FinalizeAndCollectFeedback`): open `references/final-document.md` and run that workflow end-to-end. Write chapters from `get_answers` (raw first) and supporting files; use topic summaries only as a theme checklist. Confirm the chapter map first; approve only after full chapter text. Do not blend this with a topic-summary pass. Call the BASF document template skill for branded `.docx` tooling; never edit that skill. Do not narrate that tooling to the user. The finished document must be in the interview language from state, including every heading.
