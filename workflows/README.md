# Workflows

Langdock workflows that nudge Knowledge Retention usage. They run on a schedule, read interviews from Dataverse through the **Knowledge Retention Admin** integration (`admin_query_records`), send emails from the shared mailbox, and write a flag back (`admin_bulk_writeback`) so the same person is not emailed twice for the same thing.

| File | Workflow | Who gets the email |
| --- | --- | --- |
| `interview-completion-workflow.ldwf` | Interview Completion Workflow | The employee's manager |
| `interview-reminder-workflow.ldwf` | Interview reminder workflow | The employee |

Interview status codes used below (from the state machine): `10` created, `20` discovery, `30` questions generated / answering, `60` finalized (answers done, final summary not yet approved), `70` final document generated, `80` cancelled (abandoned). Only interviews whose name starts with `KR ` (every interview the agent creates, `KR — <name>`) are picked up.

All times are UTC unless your Langdock workspace sets another timezone for scheduled triggers.

---

## 1. Interview Completion Workflow

**Purpose:** tell the manager that an employee has finished their interview and link them to the employee's SharePoint handover folder.

**Schedule:** every day at 08:00 (`0 8 * * *`).

**Picks up** (`ckr_interviews`, up to 200 rows):
- not a DEV interview (`cr32c_devinterview = false`)
- has a manager email (`cr32c_manageremail` contains `@`)
- manager not notified yet (`cr32c_managernotified = false`)
- status `60` or `70` (`ge 60` and `ne 80`)

**Email:** one per interview, in English, from `Knowledge-Retention@basf.com`. Subject `Knowledge Retention interview completed - <Employee Name>`. Branded HTML (BASF logo inline via `cid:`), a button to `ckr_sharepointfolderurl` (or a "link not available" line). At status `60` it adds that the employee still has to review and submit the final summary.

**Writes back:** `cr32c_managernotified = true`, only for interviews whose send step returned output. An interview whose email failed is picked up again the next day.

**Flow:** Daily Check → Get file (BASF logo from SharePoint) → Query records → For each interview → Build manager notification email → Send manager notification → Loop end → Prepare successful send writeback → Bulk update manager notified.

---

## 2. Interview reminder workflow

**Purpose:** nudge employees who started an interview and went quiet, and ask people who abandoned their interview for feedback.

**Schedule:** weekdays at 08:00 (`0 8 * * 1-5`). Both branches run in the same execution after the logo download.

### Branch A: unfinished interviews

**Picks up** (`ckr_interviews`, up to 200 rows):
- status `10`, `20`, `30` or `60` (`ne 70` and `lt 80`)
- fewer than 2 reminders so far (`cr32c_reminder ne 2`, then the loop keeps rows with `cr32c_reminder < 2`, or status `60`)
- no checkpoint for 7 days (`ckr_lastcheckpointon` older than now − 7 days)

**Email:** to `ckr_employeeemail`, from `Knowledge-Retention@basf.com`, in the interview language (`ckr_language`: en, de, zh, fr, es, pt; anything else falls back to English). A yellow "automated email" banner and the BASF logo are injected at send time. The content depends on status:

| Status | Subject (en) | Message |
| --- | --- | --- |
| `10` | Your interview is waiting! | You started and stepped away; pick up where you left off |
| `20` / `25` | Ready when you are! | Topics and questions are ready; start answering |
| `30`, 1st reminder | Your interview is waiting! | There's more to share |
| `30`, 2nd reminder | Still waiting - for you! | Friendly reminder |
| `30`, 3rd+ | Last call! | Last time we reach out (not reachable today, see known issues) |
| `60` | One last thing! | Review and approve the AI summary (5–10 min) |

When question counts are known it adds "N questions left – about N×7 minutes" (or "no rush, split across sessions" when that is 30 minutes or more). Every button links to the agent chat (`https://aisuite.basf.net/chat?a=ea66c669-a5d1-4c43-b998-5f306d9c4a58`).

**Writes back:** `cr32c_reminder + 1` and `ckr_lastcheckpointon = now`. The counter caps reminders at 2; resetting the checkpoint spaces them 7 days apart.

### Branch B: abandoned interviews

**Picks up:** status `80` (cancelled / abandoned; the filter is `gt 70`, and 80 is the only status above 70), abandoned at least 7 days ago (`ckr_lastcheckpointon`), `cr32c_reminder < 2`.

**Email:** English only, to the employee, from `Knowledge-Retention@basf.com`, subject `We would love to hear from you`. It links to a Microsoft Forms feedback survey and offers to start the interview again.

**Writes back:** `cr32c_reminder + 1`, `ckr_lastcheckpointon = now`, `cr32c_abandonedfeedback = true`.

**Flow:** Scheduled → Download BASF Logo → (A) Get unfinished interviews → For Each Interview → Code (build email) → Delay 1 s → Send email → Track Successful Reminder → Loop end; (B) Get abandoned interviews → For Each Abandoned Interview → Build Abandonment Email → Delay 1 s → Send email → Track Successful Abandonment → Loop end. Both loop ends → Admin: bulk writeback (one call for both branches).

---

## Setup / import

1. Import the `.ldwf` file in Langdock Workflows. Connections are not exported (`connectionId: null`), so pick one on every action node:
   - **Knowledge Retention Admin** for the query and bulk writeback nodes (needs read/write on `ckr_interview`).
   - **SharePoint / OneDrive** for Get file / Download BASF Logo (item `01GEALFYYEXTQXI54TNBDYVJ2YNY373CJH`, file `BASFo_wh100db_3c.png`, on the drive set in the node).
   - **Outlook** "send from shared mailbox" with send-as rights on `Knowledge-Retention@basf.com`.
2. The logo is attached by file name and referenced in the HTML as `cid:BASFo_wh100db_3c.png`. If you replace the file, keep the name or update both places.
3. The agent link and the feedback form URL are hard-coded in the code nodes; change them there if the agent is republished under a new ID.
4. Dry-run first: set `dryRun` to `true` on the writeback node and point the recipients at yourself.

## Known issues / before going live

Checked against the exported JSON and the current agent code.

**Completion workflow**
1. **Hard-coded recipient.** `toRecipients` is `U10171839@basfad.basf.net`, not the manager. `buildManagerNotificationEmail` already returns `managerEmail`; use `{{buildManagerNotificationEmail.output.managerEmail}}`. As is, every manager email goes to that one address and the interview is still marked `cr32c_managernotified = true`, so the real manager is never told.
2. **`requiresConfirmation: true` on the send step.** A scheduled run waits for a manual approval on every email. Set it to `false` for unattended runs.

**Reminder workflow**
3. **DEV interviews are not excluded.** Neither query filters `cr32c_devinterview`; the completion workflow does. Add `{field:'cr32c_devinterview',operator:'eq',value:false}` to both queries.
4. **The abandonment email repeats.** `cr32c_abandonedfeedback` is selected but never filtered. Branch B only checks `cr32c_reminder < 2` and resets the checkpoint, so an abandoned interview with 0 reminders gets the "sad to see you go" email twice, a week apart. Filter on `cr32c_abandonedfeedback eq false` (or `ne true`).
5. **The automated-email banner is never added.** Both send steps use `/(<body[^>]>)/`, which only matches a body tag with exactly one character of attributes and never matches the real `<body style="...">` (tested). It should be `/(<body[^>]*>)/`. The `*` may have been lost in the paste; check the live workflow.
6. **Chinese counters show escape codes.** As pasted, `qWord`/`minuteWord` return `'\\u4E2A\\u95EE\\u9898'` / `'\\u5206\\u949F'`, which renders as literal `\u4E2A…` text (tested: `只剩3\u4E2A\u95EE\u9898，大约21 \u5206\u949F`). Same for `normalizeName`'s `/\\s+/g`, which doesn't collapse whitespace; the completion workflow uses `/\s+/g`. These may also be paste artifacts; compare with the live workflow.
7. **The "Last call!" stage (reminder 3) can't be reached.** The query excludes `cr32c_reminder = 2` and the loop keeps `< 2`, so status `30` gets at most the 1st and 2nd templates.
8. **The status 20 copy doesn't match status 20.** In the state machine, `20` is discovery (questions not generated yet) and `30` is when questions exist, but the `20`/`25` email says "your topics and questions are all set". Status `25` doesn't exist.
9. **`cr32c_reminder ne 2` may skip never-reminded interviews.** Dataverse `ne` doesn't match null values. If `cr32c_reminder` has no default (null instead of 0), first-time reminders are never sent. Check the column default, or filter on `lt 2` with null handled.
10. **Reminders overwrite `ckr_lastcheckpointon`.** The agent doesn't read it back, so nothing breaks, but it no longer shows the employee's last real activity for reporting. A dedicated `cr32c_lastreminderon` would be cleaner.
11. **Writeback payload types.** `rows` is passed as `JSON.stringify(...)` (a string) and `dryRun` as the string `"false"`. `admin_bulk_writeback` rejects a `rows` that isn't an array and a `dryRun` that isn't a boolean. That works only if Langdock coerces field types. The completion workflow passes `{{...updates}}` and `{{false}}`; use the same here.
12. **The writeback node has two incoming edges** (one from each loop end). Check that Langdock runs it once after both branches, not once per branch.
13. **`ckr_latinteractionon`** is selected in both queries but isn't used anywhere in the agent (likely a typo of a last-interaction field). If the column doesn't exist, `admin_query_records` fails the query.

**Both workflows**
14. **Empty days fail the run.** When nothing was sent, the writeback receives `[]`, and `admin_bulk_writeback` requires at least 1 row, so the run ends as failed. Skip the writeback when the count is 0 (condition node), or treat the error as expected.
15. **A single failed send may stop the run.** Send steps use `errorHandling: stop`. If that aborts the run before the writeback, people already emailed in that run are not flagged and get the email again next run. Consider `continue` on the send steps (the writeback already only counts successful sends).
16. **200-row cap** (`top` and `maxIterations`). Fine for now; anything beyond 200 rolls over to the next run.
