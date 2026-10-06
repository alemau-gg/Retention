# Discovery prefill sources

Operational calls for `knowledge-retention-discovery-prefill`. Policy (what may be said, when to stop, what is saved) stays in `SKILL.md`.

Last 6 months. Own work only. Two passes: broad, then targeted on systems, projects, and processes the broad pass found. Read only a few full documents.

If a call fails or the source is not connected, skip that source. The skill mentions it once. Do not retry in a loop. Do not invent an action that is not listed here.

Slugs below are the Langdock action slugs. Input names are the manifest slugs, including casing.

## Missing action

Outlook Email has no `get_current_user`. Do not call it, and do not skip Outlook Email. Use `search_own_emails`. The signed-in address, when needed to keep only their own Teams messages, is the `senderEmail` on their sent mail. If sent mail was skipped, Viva Engage `get_current_user` returns `email`. If neither address is known, skip Teams message search so other people's messages are not kept. Listing teams and channels can still run.

## Client-side filters (always)

Apply these even when a server filter was also set:

- Older than six months.
- Private, personal, or confidential items. Do not mention them.
- Other people's messages. Keep the user's own.

A free-text `query` that an action forwards to Graph is not a date, author, or sender filter. Do not put `LastModifiedTime`, `author:`, or `from:<email>` in those queries.

## Broad pass

| Source | Action | Call |
|---|---|---|
| Outlook Email | `search_own_emails` | Sent mail only. One call per month for six months. Previews only. |
| Outlook Calendar | `list_calendar_events` | One call per month. Own calendar. No bodies. |
| Teams | `list_all_teams`, then `list_all_channels`, then `search_messages` | Teams and channels they are in. Keep only their own messages. |
| SharePoint | `list_recent_files`, then `search_files` | Recently used files, plus themed name/content searches. |
| OneDrive | `search_files` | Own drive. |
| OneNote | `search_pages_by_title` | Pages modified in the window. `list_notebooks` only to see which notebooks exist. |
| Planner | `search_my_tasks`, then `list_tasks` | Tasks assigned to them. Per plan, `list_tasks` for completion dates. |
| Viva Engage | `list_groups` | Communities only. `get_current_user` only if the signed-in email is still unknown. |

Targeted pass: the same search actions again, with the system, project, or process name as the search text. No third pass.

Full reads, a few only:

- SharePoint `get_file` with `parent` and `itemId` from a `search_files` hit (`itemId` is that hit's `documentId`).
- OneNote `get_page` with `pageId`.

`list_recent_files` does not return a `parent`, and its `documentId` is an insights id. Do not pass it to `get_file`. OneDrive `search_files` returns metadata only. Do not download OneDrive bodies in this skill.

Signature: after the sent-mail preview pass, one more `search_own_emails` with `includeDetails` true, `searchScope` `sent`, a small `limit`, and no keywords. Use it only to read the signature. Do not quote the mail.

## Outlook Email — `search_own_emails`

There is no `get_current_user` in this integration.

| Input | Required | Use |
|---|---|---|
| `searchScope` | no | `sent` for this skill. Values: `inbox`, `all`, `sent`, `folder`. |
| `folderId` | no | Only when `searchScope` is `folder`. Leave unset. |
| `keywords` | no | Broad pass: leave unset. Targeted pass: the system, project, or process name. Commas mean OR. Not raw KQL. |
| `senderEmail` | no | Leave unset. Sent scope is already their mail. |
| `to` | no | Leave unset. |
| `subjectContains` | no | Leave unset on the broad pass. |
| `dateFrom` | no | `YYYY-MM-DD`. Start of that month. |
| `dateTo` | no | `YYYY-MM-DD`. End of that month. |
| `includeDetails` | no | `false` on the preview pass. Default is `true` (full body). `true` only on the signature call. |
| `limit` | no | Default 10. Keep the monthly preview pass small. Do not page. |
| `searchQuery` | no | Do not set. It overrides the structured fields and is raw KQL. |

`dateFrom` / `dateTo` are server-side, but they filter `received` / `receivedDateTime`, not a sent-date property. Still pass them, and drop anything older than six months client-side using `sentDateTime` when it is present.

`sensitivity` is a SELECT for a single level (`normal`, `personal`, `private`, `confidential`), not an exclude filter. Leave it unset. Results include `sensitivity`. Drop `personal`, `private`, and `confidential` client-side.

Leave `isRead`, `isFlagged`, `withAttachments`, `importance`, `category`, `sortBy`, and `includeAttachmentDetails` unset.

## Outlook Calendar — `list_calendar_events`

Field slugs are lowercase, not `dateFrom` / `includeDetails`.

| Input | Required | Use |
|---|---|---|
| `calendarIdentifier` | no | Leave empty. That is the user's own default calendar. Do not pass a colleague's email. |
| `datefrom` | no | Start of the month, ISO date. |
| `dateto` | no | End of the month, ISO date. |
| `includebody` | no | Leave unset. Default is false. Do not set it true. |
| `maxEvents` | no | Default 25. One page only. |
| `subjectcontains` | no | Broad pass: unset. Targeted pass: the system, project, or process name. |
| `timezone` | no | Leave unset unless a timezone is already known from Outlook settings. |

Always pass both `datefrom` and `dateto`. If `dateto` is omitted and `datefrom` is set, the action returns that single day. If both are omitted, it returns today through 30 days ahead, not the last six months. A date-only `dateto` is sent as that date plus `T23:59:59`. `datefrom` is sent as given.

The date window is server-side (`calendarView` start and end). There is no sensitivity input. Results include `sensitivity`. Drop `personal`, `private`, and `confidential` client-side. `includecancelled` defaults to excluding cancelled events; leave it unset.

`recurrence` on each event is a boolean, not a series id. Group recurring meetings by subject yourself. Do not mention private events.

`maxEvents` is a single `$top`. The response may include `hasMore` and `nextLink`, and no input accepts the next page. If `hasMore` is true, that month is truncated. Do not loop.

## Teams

### `list_all_teams`

| Input | Required | Use |
|---|---|---|
| `limit` | no | Default 100. |

### `list_all_channels`

| Input | Required | Use |
|---|---|---|
| `teamId` | yes | From `list_all_teams`. |
| `limit` | no | Default 100. |

### `search_messages`

| Input | Required | Use |
|---|---|---|
| `query` | yes | Words for the broad pass, then the targeted system, project, or process name. |

This is the whole schema. There is no `from` field. The string is forwarded as Graph Search `queryString` for chat and channel messages (`size` 400, no paging input). `from:<email>` is not a supported filter. Do not put it in `query`.

Each hit has `senderEmail`, `senderName`, `createdDateTime`, and `type` (`channel` or `chat`). Keep a message only when `senderEmail` is the signed-in user, and only inside the six-month window. Drop the rest client-side. If `moreResultsAvailable` is true, stop. Do not invent a page call.

When speaking, say "your Teams activity". Never say chats. Never quote a message or name a colleague from a hit.

## Viva Engage

### `get_current_user`

No inputs. Returns `id`, `fullName`, `email`, `jobTitle`, `network`. Use `email` only as the signed-in address when sent mail did not provide one. Do not read `jobTitle` over `directoryProfile`. Do not recite the profile.

### `list_groups`

Slug is `list_groups`. The action title is "List communities".

| Input | Required | Use |
|---|---|---|
| `limit` | no | Default 50. No paging input. Communities beyond 50 are dropped. |

Returns communities the user belongs to (`name`, `description`, `privacy`, `membersCount`). Do not call `get_group_messages`, `search`, or `post_message`. Do not name members. Community names may inform the draft. Do not read them out as a membership list.

## SharePoint

### `search_files`

| Input | Required | Use |
|---|---|---|
| `query` | yes | File name or content words, or a themed search. `*` lists files and is not a six-month filter. |

No date input. No author input. `query` is forwarded as Graph Search `queryString` for `driveItem`. A URL is resolved as one file instead of a search. The action does not apply a KQL date or author filter. Do not put `LastModifiedTime` or `author:` in `query`.

Filter client-side on `createdDate`, `lastModifiedByAnyone`, and `author`. Keep the user's own files inside six months.

A hit's `documentId` plus `parent` is what `get_file` needs.

### `list_recent_files`

| Input | Required | Use |
|---|---|---|
| `maxResults` | no | Default 50. Not `limit`. |

No date input. Recently used files for the signed-in user (insights). Drop older than six months client-side using `lastAccessedDateTime` or `lastModifiedDateTime`. These rows have no `parent`. Do not call `get_file` with them.

### `get_file`

| Input | Required | Use |
|---|---|---|
| `parent` | yes | The `parent` object from `search_files`. |
| `itemId` | yes | That hit's `documentId`. Not a URL. |

A few files only. Protected files fail closed; skip them. Do not retry.

`get_profile` exists on this integration and is not a search action. Do not call it for the draft. Directory job title and department come from `directoryProfile`.

## OneDrive — `search_files`

| Input | Required | Use |
|---|---|---|
| `driveId` | no | Leave empty. Empty uses the user's own drive (`/me/drive`). |
| `name` | yes | Not `query`. Partial, case-insensitive file name. |

Not KQL. No date input. The drive search is server-side for the name only. Filter `lastModifiedDateTime` client-side to the last six months. Results are metadata. Do not download file bodies here.

`search_onedrive` is a different action. Do not use it for this skill.

## OneNote

### `list_notebooks`

| Input | Required | Use |
|---|---|---|
| `limit` | no | Default 20. |
| `includeSharedNotebooks` | no | Leave unset (default false) unless their own notebooks are empty. |
| `filterByName` | no | Leave unset on the broad pass. |
| `includeSections` | no | Leave unset. |

### `search_pages_by_title`

| Input | Required | Use |
|---|---|---|
| `query` | no | Title substring. Broad pass may leave it empty and rely on the date window. Targeted pass: the system, project, or process name. |
| `modifiedAfter` | no | Start of the six-month window, `YYYY-MM-DD`. Server-side `lastModifiedDateTime ge`. |
| `modifiedBefore` | no | Today, `YYYY-MM-DD`. Server-side `lastModifiedDateTime le`. |
| `notebookId` | no | Leave unset to scan across notebooks. |
| `sectionId` | no | Leave unset. |
| `createdAfter` / `createdBefore` | no | Leave unset. The window is modified date. |
| `limit` | no | Default 20. |

The date fields are real schema filters. Still drop anything outside the window client-side if a row slips through.

The search scans at most the 150 most recently modified sections. If `_notices` says older sections were skipped, do not loop. Narrow once with `notebookId` only when a notebook from `list_notebooks` is clearly theirs. Then stop.

### `get_page`

| Input | Required | Use |
|---|---|---|
| `pageId` | yes | From the search result. |
| `includeRawHtml` | no | Leave unset. |

A few pages only. Use the text `content`. Do not quote it back.

`list_recent_pages` exists and has no modified-date input. Prefer `search_pages_by_title` with `modifiedAfter` and `modifiedBefore`.

## Planner

### `search_my_tasks`

| Input | Required | Use |
|---|---|---|
| `planId` | no | Leave empty on the broad pass so it searches plans assigned to the user. |
| `includeToDo` | no | Set `false`. Default `true` also returns Microsoft To Do tasks, marked `isPrivate`. |
| `includeDetails` | no | Leave unset. Descriptions are not required for the draft. |
| `dueDate` | no | Do not use it as the six-month window. It keeps tasks due on or before that instant, after the fetch. |
| `priority` / `progress` | no | Leave unset. |

No created-date input. Results include `createdDateTime`, `dueDateTime`, `title`, `planId`, `planTitle`, `percentComplete`. They do not include `completedDateTime`. Drop tasks older than six months client-side. Drop anything private.

### `list_tasks`

| Input | Required | Use |
|---|---|---|
| `planId` | yes for a Planner plan | One call per plan id from `search_my_tasks`. The action throws if `planId`, `todoListId`, and `todoListName` are all empty. |
| `assignedToMe` | no | `true`. |
| `includeDetails` | no | Leave unset. Completion dates are on the task without details. |
| `limit` | no | Default 50. |
| `todoListId` / `todoListName` | no | Do not set. That branch is private To Do. |
| `filterByAssigneeEmail` / `filterByAssignee` | no | Leave unset. `assignedToMe` is the own-work filter. |

Planner rows include `completedDateTime`. Use that only as a hint that the work happened. Do not report completion counts.

## Server-side vs client-side

| Need | Where it is applied |
|---|---|
| Sent mail only | Server: `searchScope` `sent` |
| Email month window | Server: `dateFrom` / `dateTo`, on received time. Client: `sentDateTime` older than six months |
| Email bodies off | Server: `includeDetails` false (must be set; default is true) |
| Email private / confidential | Client: `sensitivity` is personal, private, or confidential. The SELECT cannot exclude those levels |
| Calendar month window | Server: both `datefrom` and `dateto` |
| Calendar bodies off | Server: leave `includebody` unset |
| Calendar private events | Client: `sensitivity` |
| Calendar series | Client: group on subject where `recurrence` is true |
| Teams own messages | Client: `senderEmail`. `from:<email>` is not a schema filter |
| Teams date window | Client: `createdDateTime` |
| SharePoint date / author | Client. `search_files` has no date or author field and does not accept a KQL date/author filter |
| SharePoint recent date | Client. `list_recent_files` has no date field |
| OneDrive date | Client: `lastModifiedDateTime`. Name match is server-side (`name`) |
| OneNote modified window | Server: `modifiedAfter` / `modifiedBefore` |
| Planner assigned to the user | Server: `search_my_tasks` (assigned tasks) and `list_tasks` `assignedToMe` true |
| Planner exclude To Do | Server: `includeToDo` false |
| Planner six-month window | Client: `createdDateTime` / `completedDateTime` |
| Viva Engage communities only | Server: `list_groups` is membership, not messages. Do not call a message action |
