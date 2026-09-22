---
name: Knowledge Retention Reporting
slug: knowledge-retention-reporting
description: >-
  ALWAYS use for knowledge-retention topic summaries
  (GenerateOrReviewTopicSummary), missing topic-file recovery
  (UploadMissingTopicDocuments), and the final handover
  (BuildFinalDocument / FinalizeAndCollectFeedback). Default path is writing
  and reviewing an editable Markdown summary file; the backend turns it into
  the .docx. Open
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
| Yes | `UploadMissingTopicDocuments` | **Topic files only** — call `generate_topic_document` for each missing entry's order, then retry `finalize_interview`. Not the final handover. |
| Yes | `BuildFinalDocument` or same-session `FinalizeAndCollectFeedback` (final-doc step) | **Final handover** — open `references/final-document.md` and follow it end-to-end |
| No | `RunPreInterviewDiscovery`, `GenerateTopicsAndQuestions`, `AskActiveQuestion` | Interviewing skill / verbatim `nextQuestionText` |
| No | Folder setup, consent, feedback-only, closing message | Backend instruction alone |

Default job when this skill is loaded: **topic summary**. Switch to the final path only when the backend asks for the final handover / `InterviewFinalSummary_{n}.docx`.

## Two document paths (never blend)

| | Topic summary | Final handover |
|---|---|---|
| Trigger | `GenerateOrReviewTopicSummary` | `BuildFinalDocument` / `FinalizeAndCollectFeedback` final-doc step |
| Methodology | `references/summary-format.md` only | `references/final-document.md` → `document-structure.md` + `fixed-sections-template.md` |
| Docx | **You never build one.** `generate_topic_document` renders it from the saved summary | **You never build one.** `save_final_document` stores the approved Markdown; `generate_final_document` (no arguments) renders the `.docx` |
| Upload | Handled by `generate_topic_document` | Handled by `generate_final_document`. `upload_document` is supporting files only |
| Forbidden | Building or uploading the topic `.docx` yourself; branded template; final-document refs; cover/TOC/1.1–1.4 | Reusing a topic summary as the handover; inventing facts; skipping Phase 1–4; writing chapters only from stored summaries; building, formatting, or uploading the `.docx`; the BASF document template skill; `upload_document` for the handover |

For a topic summary, do **not** open: `references/final-document.md`, `references/document-structure.md`, `references/fixed-sections-template.md`, or `assets/template.docx`.

## Supporting files

Do not create a supporting file automatically. Every file the user actually attaches, other than the topic-summary draft, a topic document, or the final handover, must be read and then proposed as a supporting document filed with the interview materials. That proposal is mandatory even when the file looks minor. Summaries are not supporting documents. After an explicit yes, file that original attachment with `upload_document` using `docType: supporting` and a unique filename. If they decline, do not upload it. Supporting uploads do not use the topic-summary format or the final-handover format.

Confirmed supporting files **are** source material for this skill. When writing a topic summary or the final handover, read each such file (chat attachment); if a confirmed file is missing from chat, use the optional `read_supporting_document` action with its exact basename, including extension (never a path or URL), when available. Include every relevant concrete fact and name the source filename. Do not invent contents you could not read. Do not attach this optional action to the agent by default.

---

## Topic summary

**Done when:** user explicitly approves the reviewed Markdown file → `save_topic_summary` (`expectedTopicOrder` + the exact `summaryFile`) → `generate_topic_document` (`topicOrder`) returns the filed `.docx`. Two distinct steps: `save_topic_summary` stores the file's text, `generate_topic_document` creates the Word file. Your job ends at the approved file.

### Forbidden (hard stop)

Do not open, copy, or populate:

- `assets/template.docx`
- `references/final-document.md`
- `references/document-structure.md`
- `references/fixed-sections-template.md`

Do not write: cover/title page, AI-generation notice, executive summary, table of contents, sections 1.1–1.4, chapter-structure proposal, leadership/governance framing, or `{}` / `[bracket]` placeholders.

If any of that appears in a draft, discard it and restart from `references/summary-format.md` only.

### Write

**Inputs:** ordered Q/A for one topic (`topicQnA` from state; do not call `get_answers` when it is usable). Prefer `rawUserMessages` when present, else the confirmed answer. Also any confirmed supporting files for this interview: read them and include relevant contents. Never from memory.

1. Write for the **successor**, not the interviewee.
2. Follow `references/summary-format.md` only.
3. Preserve specifics verbatim. Never generalize a concrete detail.
4. Gaps stay visible under the translated **Open gaps** heading when present; omit empty optional sections. Do not use “Open Items”.
5. No invention: no inferences, training-data best practices, or embellishment.
6. Length and shape: comprehensive, inside this format only. No new sections. No upper word cap. One heading per answered question. Prefer a short paragraph, then bullets when there are several facts, then a translated "For example" from the source (never invent), with line breaks between blocks. Leave that shape if a quote, table, or one tight paragraph fits better. Close with a short how-this-fits-together paragraph. Comprehensive means each answered question's material, the decisions and exceptions they gave, and supporting-file detail already captured all appear in those sections (risks, contacts, and open gaps stay optional and only when the source has them). A thin draft is a defect. First draft must already be this dense and scannable; do not wait for the user to ask for more examples. If they ask for more bullets, more breaks, or bolder names, treat that as a change request: revise and re-present the full draft. The draft must be at least as long as the combined `rawUserMessages` for the topic (or confirmed answers if raw is empty), plus supporting-file facts. If it is shorter, drops a decision, an exception, or a supporting-file fact, or lacks examples the source gave, expand before showing it.
7. Language: interview language from state for body **and** every section heading, including the headings shown to the user in chat.

### Deliver

Create or update the complete Markdown summary file with the `write` document tool, attach or show the exact file the user reviews, and get explicit approval. Whenever you present or re-present that draft, before `save_topic_summary` and before any Word file exists, tell them in the interview language that you handle conversion and formatting into Word, and kindly ask them to focus on the contents and adjust those where needed. Then:

1. Call `save_topic_summary` with `expectedTopicOrder` and that exact `summaryFile`. This saves the file's text only — no Word file exists yet.
2. Follow the returned instruction to call `generate_topic_document` with the same order and nothing else. The backend reads the saved summary, renders the standardized `.docx`, files it, and returns it as an attachment. Do not build, format, name, or upload that file, do not use the code interpreter for it, and do not call `upload_document` for it.
3. Show the returned attachment and the folder link. If it comes back with `conflict: true`, follow its instruction instead of improvising a file.

Use the `write` document tool to create or update the editable Markdown file: headings, bullets, numbered lists, `**bold**`, `*italic*`, and pipe tables all survive into Word. Show or attach that file for user review and use the exact approved file in `save_topic_summary`. Mermaid fences are kept out of the `.docx` and preserved in the Markdown transcript the backend files under `Source transcripts/`. Never write `{}` / `[bracket]` placeholders, a cover page, TOC, exec summary, or 1.1–1.4 sections.

---

## Final handover instead?

Only when every topic has an approved summary **and** the backend asks for the final record (`BuildFinalDocument` or the final-doc step in `FinalizeAndCollectFeedback`): open `references/final-document.md` and run that workflow end-to-end. Write chapters from `get_answers` (raw first) and supporting files; use topic summaries only as a theme checklist. The finished handover must be more in-depth than those approved topic summaries. It has to exceed their detail. Do not shorten them or lightly paraphrase them: each chapter keeps every concrete fact from the longer of `rawUserMessages` and the confirmed answer, plus relevant supporting-file facts, and adds cross-topic dependencies and successor steps that no single topic summary contains. The executive summary does not replace or compress the chapters. Do not invent facts to look longer. If the chapters together are shorter than the approved summaries, they are not ready to show. Draft the complete handover as Markdown with the `write` document tool and get explicit approval of that text. Whenever you show that draft, before `save_final_document`, tell the user in the interview language that you handle conversion and formatting into Word, and kindly ask them to focus on the contents and adjust those where needed. Then `save_final_document` with the exact approved file (`handoverFile`) — content only, no Word file — then `generate_final_document` with no arguments. That action reads the stored Markdown, renders the Word file with the same formatter as topic documents, files `InterviewFinalSummary_{n}.docx`, returns it as an attachment, and marks the interview Document Generated. The backend adds the document title line and a Supporting documents name list. Do not build, format, or upload a `.docx`, do not use the BASF document template skill, and do not call `upload_document` for the handover. Do not call a document tool that is not already in that path. Confirm the chapter map first; approve only after full chapter text. Do not blend this with a topic-summary pass. The finished document must be in the interview language from state, including every heading.
