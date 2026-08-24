# Final handover document

Load only when every topic has an approved summary and the backend asks for the final handover — `nextAction` is `BuildFinalDocument`, or the final-doc step inside same-session `FinalizeAndCollectFeedback`.

For a single-topic / interim summary: close this file; use `../SKILL.md` + `summary-format.md` (blank `.docx` named exactly the backend `fileName`). Do not blend paths.

## Supporting files (this workflow only)

- `../assets/template.docx` — branded template to populate
- `document-structure.md` — section order
- `fixed-sections-template.md` — wording for the unnumbered introduction (front matter, not Chapter 1)
- **BASF document template** skill — call for branded `.docx` tooling; **never edit** that skill

Do not reuse a topic-summary `.docx` as the final. Build from the branded template.

## Preconditions (stop if unmet)

1. Call `get_discovery` and unscoped `get_answers`. Do not use memory. Start from `rawUserMessages`. If raw is empty or shorter than the confirmed answer, use the longer of the two. Also include confirmed supporting-file contents (read the attachments; name each file). Then walk stored topic summaries as a theme checklist only: they must not shrink, merge, or replace the source answers.
2. Every topic must have an approved summary. If any is missing, stop and run the topic-summary workflow in `../SKILL.md` first (or return to interviewing / Q&A if answers are incomplete).
3. Single-topic / interim write-up → topic summary, not this docx.

## Phase 1 — Chapter structure (a map, not approval)

**Done when:** user confirms chapter titles and one-line scopes, numbered from Chapter 1. That confirms the map only. It is not approval of chapter content.

- Read discovery and all Q/A (raw first, then the longer of raw vs confirmed). Use approved topic summaries only as grouping hints.
- Propose role chapters (merge/split topics for a first-time successor; interview topic order is not sacred).
- Number those chapters from **Chapter 1**. Chapter 1 is the first role-content chapter, not the introduction. Title page, executive summary, table of contents, and the fixed introduction block are front matter: they are not chapters and must not consume Chapter 1.
- Present titles + one-line scope each, starting at Chapter 1. Never start the list at Chapter 2. Never tell the user Chapter 1 is reserved for the introduction.
- Wait for confirmation of the map. Do not write chapters yet. Do not ask them to approve the handover on titles alone.
- Use the interview language from state for every title and scope you show.

## Phase 2 — Chapters

**Done when:** the user has seen and approved the **full text** of each chapter (individually or as a set).

For each chapter:

- Write from source answers first: `rawUserMessages`, or the confirmed answer when it is longer. Then supporting-file facts. Then walk the topic summary as a checklist of themes so nothing is skipped. If the summary is shorter than the answers, keep the answers. Do not let the summary shrink, merge, or polish away lists and examples the interviewee gave.
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
- **Executive summary**: comprehensive. One to two pages when the source is rich; never a short blurb or a condensation of already-short summaries. Draw from the approved chapters (which themselves come from raw answers). Interview language.
- **Introduction headings**: take meaning from `fixed-sections-template.md`, substitute role title, business unit, reader group, then **write them in the interview language**. They are front matter, not Chapter 1. Do not paste the English base wording into a non-English document. Leave no `[bracket]` or `{}` tokens.

Section order: `document-structure.md`.

## Phase 4 — Docx

**Done when:** delivery checks below all pass.

Before any template tooling, send one short message in the interview language that building the handover document will take a little while. Then follow the BASF document template skill fully. Do not send further progress updates and do not describe tool steps.

1. Populate `../assets/template.docx` via the BASF document template skill / document tool. Keep template styles (headings, cover, TOC field). Follow `document-structure.md` in order. Never show the raw template to the user. Never edit the BASF document template skill. Never describe template unpacking, assets, scripts, or tool steps to the user. Replace any English template chrome (cover labels, TOC title, notices) with the interview language.
2. **Placeholder sweep (mandatory before upload):** search the finished file for leftover substitution tokens — at least `{}`, `{…}`, `[official role title]`, `[business unit]`, and any other bracket/brace placeholders from the template or fixed-sections file. If any remain, substitute or delete them and re-sweep. Do not deliver or upload while any remain. Do not put markdown `**` into the `.docx`; apply real bold and real lists.
3. Re-read once for leftover English headings in a non-English interview. If any remain, rebuild before upload.
4. `upload_document` (`docType: final`) when the backend asks for filing — this advances status to `documentGenerated` (70). Do not rebuild per-topic topic `.docx` files on this path; `finalize_interview` already confirmed they are in the folder. If `finalize_interview` instead returned `UploadMissingTopicDocuments`, follow that instruction (blank topic docs from stored summaries, exact `fileName`) and do not start this final-handover workflow.
