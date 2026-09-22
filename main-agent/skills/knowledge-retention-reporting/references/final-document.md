# Final handover document

Load only when every topic has an approved summary and the backend asks for the final handover — `nextAction` is `BuildFinalDocument`, or the final-doc step inside same-session `FinalizeAndCollectFeedback`.

For a single-topic / interim summary: close this file; use `../SKILL.md` + `summary-format.md`. Do not blend paths.

## Supporting files (this workflow only)

- `document-structure.md` — section order of the Markdown
- `fixed-sections-template.md` — wording for the unnumbered introduction (front matter, not Chapter 1)

Do not reuse a topic summary as the final handover. Do not call the BASF document template skill. Draft the Markdown; `generate_final_document` renders the Word file.

## Preconditions (stop if unmet)

1. Call `get_discovery` and unscoped `get_answers`. Do not use memory. Start from `rawUserMessages`. If raw is empty or shorter than the confirmed answer, use the longer of the two. Also include confirmed supporting-file contents (read the attachments; name each file). Then walk stored topic summaries as a theme checklist only: they must not shrink, merge, or replace the source answers.
2. Every topic must have an approved summary. If any is missing, stop and run the topic-summary workflow in `../SKILL.md` first (or return to interviewing / Q&A if answers are incomplete).
3. Single-topic / interim write-up → topic summary, not this docx.

## Phase 1 — Chapter structure (a map, not approval)

**Done when:** user confirms chapter titles and one-line scopes, numbered from Chapter 1. That confirms the map only. It is not approval of chapter content.

- Read discovery and all Q/A (raw first, then the longer of raw vs confirmed). Use approved topic summaries only as grouping hints.
- Propose role chapters (merge/split topics for a first-time successor; interview topic order is not sacred).
- Number those chapters from **Chapter 1**. Chapter 1 is the first role-content chapter, not the introduction. Headline, executive summary, and the fixed introduction block are front matter: they are not chapters and must not consume Chapter 1.
- Present titles + one-line scope each, starting at Chapter 1. Never start the list at Chapter 2. Never tell the user Chapter 1 is reserved for the introduction.
- Wait for confirmation of the map. Do not write chapters yet. Do not ask them to approve the handover on titles alone.
- Use the interview language from state for every title and scope you show.

## Phase 2 — Chapters

**Done when:** the user has seen and approved the **full text** of each chapter (individually or as a set).

The handover must be more in-depth than the approved topic summaries. It has to exceed their detail. Shortening them, or lightly paraphrasing them, is a defect. Each chapter keeps every concrete fact from the longer of `rawUserMessages` and the confirmed answer, plus relevant supporting-file facts, and adds cross-topic dependencies and successor steps. The executive summary does not replace or compress the chapters.

For each chapter:

- Write from source answers first: `rawUserMessages`, or the confirmed answer when it is longer. Then supporting-file facts. Then walk the topic summary as a checklist of themes so nothing is skipped. Keep every concrete fact from the longer of `rawUserMessages` and the confirmed answer, plus relevant supporting-file facts, and add sequence, exceptions, numbers, cross-topic dependencies, successor steps, and examples the summary did not spell out. Do not invent facts to look longer. If the summary is shorter than the answers, keep the answers. Do not let the summary shrink, merge, or polish away lists and examples the interviewee gave. If the chapters together are shorter than the approved topic summaries, they are not ready to show.
- Successor can act from the chapter alone. Practical depth: enough detail that they do not need the original Q&A. Same default layout as topic summaries: heading, short paragraph, line breaks, bullets when there are several facts, translated "For example" in its own block, bold names. Leave that shape if a quote, table, or one tight paragraph fits better. Do not invent examples. If they ask for more bullets, more breaks, or bolder names, revise the full chapter and show it again.
- After the draft, reread that chapter's source answers. Every concrete fact (name, number, step, example, person, list item) must appear in the chapter, or under Open gaps if they said they do not know. If anything is missing, add it before asking for approval.
- Show the full chapter text, then ask for approval. Never ask approval on a title or outline of that chapter.
- No invented steps or best practices. Preserve names, systems, thresholds, frequencies, contacts, URLs, and quoted lists verbatim.
- Surface risks, dependencies, pitfalls, and open-gaps callouts (translated heading; never “Open Items”).
- Always use the official role title from discovery.
- Write the chapter in the interview language from state, including every heading shown in chat.
- Put discovery reference links in the relevant chapter, or a short resources list at the end of the last chapter.

## Phase 3 — Front matter

**Done when:** headline and executive summary are drafted from finished, approved chapters.

Write only after Phase 2 is approved:

- **Headline**: official role title; leadership/governance tone; interview language.
- **Executive summary**: comprehensive. One to two pages when the source is rich; never a short blurb or a condensation of already-short summaries. It does not replace or compress the chapters. Draw from the approved chapters (which themselves come from raw answers). Interview language.
- **Introduction headings**: take meaning from `fixed-sections-template.md`, substitute role title, business unit, reader group, then **write them in the interview language**. They are front matter, not Chapter 1. Do not paste the English base wording into a non-English document. Leave no `[bracket]` or `{}` tokens.

Section order: `document-structure.md`.

## Phase 4 — Markdown, then Word

**Done when:** the user has explicitly approved the complete Markdown, `save_final_document` has stored it, and `generate_final_document` has returned the filed Word file.

Present or update the complete handover as one Markdown file with the `write` document tool. The file contains the headline, executive summary, introduction, and chapters, in the order in `document-structure.md`. It does not contain a cover, a table of contents, or template placeholders. Headings, bullets, numbered lists, `**bold**`, `*italic*`, and pipe tables are fine. The backend adds the document title line and a Supporting documents name list, the same way it does for a topic document.

Whenever you present or re-present that draft, before `save_final_document` and before any Word file exists, tell the user in the interview language that you handle conversion and formatting into Word, and kindly ask them to focus on the contents and adjust those where needed. If they request changes, use `write` to update the full file, show it again, and ask again. Anything other than clear approval is a change request or a question.

1. Re-read once for leftover English headings in a non-English interview. If any remain, rebuild the Markdown before save.
2. After explicit approval, call `save_final_document` with the exact approved Markdown file (`handoverFile`). This stores the file's text only — no Word file exists yet.
3. Call `generate_final_document` with no arguments. The backend reads the stored Markdown, renders the Word file with the same formatter as topic documents, files `InterviewFinalSummary_{n}.docx`, returns it as an attachment, and marks the interview Document Generated. Do not build, format, name, or upload that file, do not use the code interpreter, do not use the BASF document template skill, and do not call `upload_document` for it. Do not pass text, a filename, or a folder path.
4. Show the returned attachment and the folder link. Do not rebuild per-topic topic documents on this path; `finalize_interview` already confirmed they are in the folder. If `finalize_interview` instead returned `UploadMissingTopicDocuments`, follow that instruction (`generate_topic_document` for each missing order) and do not start this final-handover workflow.
