# Topic Summary Format

Load only for the **topic-summary** path (`GenerateOrReviewTopicSummary`). Write in the interview language. English headings below are source meaning: translate every heading in chat and in the `.docx`.

Length is comprehensive, not a recap. No upper word cap. No new sections: fullness stays inside the sections below. One mini-header per answered question. Cover that question's material, the decisions and exceptions the interviewee actually gave, and supporting-file detail already captured (risks, contacts, and open gaps only when the source has them). The summary must be at least as long as the combined `rawUserMessages` for the topic (or confirmed answers if raw is empty), plus supporting-file facts. If it is shorter, or it drops a decision, an exception, or a supporting-file fact, expand before presenting. A thin summary is a defect. Keep every concrete name, system, threshold, frequency, file location, and contact. Do not pad with filler. Incomplete-but-faithful beats polished-and-short.

Not the final handover. Do not use `../assets/template.docx`, `final-document.md`, `document-structure.md`, `fixed-sections-template.md`, or the BASF document template skill. No cover page, TOC, AI notice, executive summary, fixed intro 1.1–1.4, chapter framing, or `{}` / `[bracket]` placeholders.

Use `topicQnA` from state as the topic-summary source; do not call `get_answers` when it contains usable raw or confirmed text. If `topicQnA` is missing, empty, or lacks usable text, use `get_answers` as the fallback. Prefer `rawUserMessages` when present, otherwise the confirmed answer. Also use confirmed supporting-file contents that belong to this topic; name the file. Do not invent unread files.

## Required sections, in order

### 1. What this covers (short paragraph)

What the topic is and why it matters for this role. For a successor who has never done the job. Two to five sentences is fine; do not stop at a slogan.

### 2. What the successor needs to know

One heading per answered question (question meaning, translated). Make it easy to scan. The usual shape:

- Short paragraph: what it is and why the successor cares. Then a line break.
- Bullets when there is more than one concrete fact (steps, systems, people, thresholds, files). Nested bullets for sub-steps. Numbered lists only for ordered procedures.
- **For example** in its own block (translate that lead-in: Spanish "Por ejemplo", German "Zum Beispiel", etc.) — a concrete case from this interviewee. Pull from `rawUserMessages`. Do not invent an example they did not give; if they gave none, say that under Open gaps instead of fabricating one.
- Bold names a successor would hunt for (systems, people, files, thresholds).

Leave this shape when something else fits better: one tight paragraph, a quote, a table, a numbered procedure. Do not invent extra bullets to look busy.

Several items per question is expected when the source has several. A header with only a definition and no example is a defect unless the source truly has none. Do not present a short draft and wait for the user to ask for more examples. If they ask for more bullets, more breaks, or bolder names, revise the full draft and show it again.

### 3. How this fits together (short closing)

After the items, one short paragraph that maps the pieces the way a successor would use them (not a slogan). Then optional sections if they have content.

## Optional sections (omit the heading when empty)

### Risks and dependencies

- What breaks, how often, early warning signs
- Single-person dependencies ("only [name/role] can…")
- Workarounds and how fragile they are

### Key contacts

| Who | Role/Org | When to contact |
|---|---|---|

Only people the interviewee named. Informal roles are fine. Translate the table headers.

### Open gaps

Translate this heading (meaning: open gaps). Never use “Open Items”. Never leave the English heading in a non-English interview.

- "Not answered" questions — state the gap and reason if given
- Things flagged as undocumented, unfinished, or worrying

## Hard rules

- **No invention.** Every statement traces to the interviewee or a supporting file they confirmed.
- **No generalization of specifics.**
- **Visible gaps over smooth prose.**
- **Example-first.** Every named item has a real "For example" from the interview. Definitions without examples are too thin.
- **First draft is the full draft.** Never wait for "add more examples". A thin recap that drops examples, decisions, exceptions, or supporting detail already captured is a defect; bullets are for structure, not a shorter summary. Do not add sections this file does not list.
- **Headings in the interview language**, in the document and in the chat presentation.
