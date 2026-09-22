# Final Document Structure

Supporting file for `final-document.md` only. Do not load during a topic-summary run (`GenerateOrReviewTopicSummary`).

Section order for the handover Markdown. The backend renders `InterviewFinalSummary_{n}.docx` from that file with the same formatter as a topic document. It adds the document title line and a Supporting documents name list. Do not add a cover, a table of contents, or template placeholders, and do not build the `.docx`. Substitute role title, business unit, and reader group in the introduction. Do not leave `{}` or `[…]` tokens in the Markdown.

## 1. Headline

- **Headline**: official role title; leadership/governance tone. No shorthand.

## 2. Executive summary

About one to two pages when the interview was rich; never a short blurb. Written last (Phase 3 in `final-document.md`). Management-ready: what exists in this document and why capturing this role's knowledge matters — include the operational highlights, not a chapter-by-chapter rehash and not a compression of already-short topic summaries. It does not replace or compress the chapters.

## 3. Introduction (fixed, not a numbered chapter)

Front matter. Not Chapter 1. Base wording in `fixed-sections-template.md`. Substitute role title / business unit / reader group, then write these headings in the interview language.

- What This Document Is
- Target Group
- Delimitations and Instructions of Use
- Expectations of the Reader

## 4. Chapters 1…N — role content

Chapter 1 is the first role-content chapter from the agreed Phase 1 list. Writing rules live in Phase 2 of `final-document.md`. Together these chapters must exceed the approved topic summaries in detail: do not shorten or lightly paraphrase them. Each chapter keeps every concrete fact from the longer of `rawUserMessages` and the confirmed answer, plus relevant supporting-file facts, and adds cross-topic dependencies and successor steps. Gap callouts use the translated **Open gaps** heading (not “Open Items”, and not leftover English in a non-English interview). English headings in this file are source meaning only.

Discovery reference links go in the relevant chapter; if none fits, a short resources list at the end of the last chapter.
