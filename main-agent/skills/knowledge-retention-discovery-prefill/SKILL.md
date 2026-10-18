---
name: knowledge-retention-discovery-prefill
description: >-
  ALWAYS use when the backend prefilled-discovery instruction says to load
  this skill (RunPreInterviewDiscovery after discovery prefill was accepted).
  Do NOT use for interview questions, summaries, or the handover.
---

# Knowledge Retention Discovery Prefill

Research who this person is and what their work actually involves, then hand them a draft discovery profile to correct. Progress and `save_discovery` still come from the backend instruction.

Load only when the prefilled `RunPreInterviewDiscovery` instruction says so. Consent is already given; do not offer it again. On resume, discovery is not saved yet, so research again, once per conversation.

## Before searching

Ask once whether there is any system, project, or topic they would rather you not look into. Respect whatever they name for the rest of the research. Then say this takes a moment, and work silently; no narration of tools or sources.

Use every connected source: their email, Teams, and SharePoint, including everything those connections let them see. Stick to the last six months so the profile reflects what they do now, not a role they left. If a source is not connected or fails, skip it and mention once what could not be searched.

Keep a short running picture of the person (role, responsibilities, systems, threads still open) and update it as you go. Carry that forward, not raw search results. Judge hits by their previews and open a full document only when it looks like it defines their work.

## Method

### 1. Establish who they are

Start from the connected account (name, email address) and `directoryProfile` (job title, department). Read the signature on a mail they sent for title, team, location, and site. Then search their name, and common variants of it, in every source. Their own documents, presentations they authored, and threads they drive show what they own better than any title.

Their surroundings say a lot too: the people they interact with most (by role and department, never by name), the teams they belong to, and the SharePoint sites they work in.

### 2. Map their work broadly

Cast a wide net before going deep:

- **Email:** the mail folders they created (people file by project, customer, or process), and recurring themes in recent mail. If their mail or signature points to a shared mailbox they work from, such as a team or support inbox, search that too; what lands there is often part of their job.
- **Teams:** the teams and channels they are in, and what they post about.
- **SharePoint:** the sites they use, the files they recently worked on, and the lists on those sites. Trackers, issue logs, and registers often show recurring duties better than any document.

Look for systems, projects, processes, plants, customers, committees, and reports. Build a working list of threads worth pulling.

### 3. Follow the threads

Take the strongest threads and dig. Search each system, project, or process name across every source; a term found in email is often best explained by a SharePoint document, and the reverse. When a hit names something new and specific (a tool, a recurring report, a handover partner role, a KPI), follow it one more level.

Go from snippets to full content only where it pays: the full email of a key thread and its attachments (often the actual report or spec), the channel conversation behind a hit, the items of a tracker they maintain, a site page describing their process, and the few documents that define their responsibilities (role descriptions, process docs, status reports, slides they presented).

Go down a rabbit hole while it keeps adding something new about *their* work. Stop when searches return what you already know, when a thread is about someone else's work, or when you have enough to draft every field. Two or three levels deep on the main threads is usually enough; don't exhaust every hit.

### 4. Weigh what you found

- What they created, sent, or edited says more than what they were merely sent or copied on.
- Recurring beats one-off. A system they mention every month is core; a single mention is a candidate to ask about.
- When newer material contradicts older, the newer wins; they may have changed role or handed something off.
- Look for what a successor would miss: things only they seem to do, recurring deadlines and reports, the roles that come to them for answers, where their working knowledge lives. These make the best focus topic candidates.
- Others' messages and documents may show what they are known for. Use them to understand their work, never to quote or attribute anything to a colleague.
- Drop private, personal, or confidential material entirely, and do not mention it.

## Hard rules

- Describe their work, not their data. Messages are referred to only as "your email" or "your Teams activity"; never say chats. Documents may be named by title.
- Never quote messages, name colleagues, give counts, or mention private events. Present findings as "it looks like…".
- The no-negative-remarks rule applies to everything found. Keep the work lesson; drop blame and private details.
- Every found value is a suggestion, including the directory job title and department.
- Nothing is saved until the user confirms the full profile and `save_discovery` succeeds.
- If they withdraw ("don't search", "stop", "I changed my mind") before `save_discovery`: stop, drop everything found, call `save_consent` with `consentGranted` false, and follow the instruction it returns.
- After `save_discovery`, unload this skill. Search results never feed interview answers, topic summaries, or the handover.

## Present the draft

Present what you concluded as one structured message, with a bold heading per section and short bullet points under each. Every bullet is a suggestion. Where the evidence is thin, phrase it as a question rather than a claim, and mark any section you found nothing for as open.

1. **Role and business unit:** directory values first; the signature fills only what the directory left empty.
2. **Core responsibilities:** the concrete work the research supports.
3. **Additional responsibilities:** case-specific or occasional duties, kept separate.
4. **Systems and tools:** the named systems their work actually uses.
5. **KPIs and constraints:** only if found. Never invent one.
6. **Possible focus topics:** candidates for the handover, clearly labelled as suggestions.
7. **Based on:** the few documents that shaped the draft, by title, plus "your email" and "your Teams activity" where they contributed.

End by asking them to correct, remove, or add anything; skipping additions is fine.

## Refine, then save

Work through their corrections, then the gaps, one question at a time. After each round, show only the sections that changed. Do not repeat the whole draft every turn.

Steer every follow-up toward the fields `save_discovery` needs: role, business unit, responsibilities, systems and tools, and focus topics are required; KPIs and constraints are optional but probed once. Apply the thin-answer bar from `knowledge-retention-interviewing`. Do not re-ask a field they already confirmed or corrected. Always ask focus topics explicitly, even when candidates exist; they choose.

When every required field meets the bar, read the full profile back in the same sections. Explicit confirmation, then `save_discovery`, with additional responsibilities folded into `responsibilities`. Silence, "I guess", or a topic change is not confirmation.

## Nothing usable

If the research yields nothing you can draft from, say so briefly and run standard discovery with `knowledge-retention-interviewing`, question by question. Do not retry the sources.
