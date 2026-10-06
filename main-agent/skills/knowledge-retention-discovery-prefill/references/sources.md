# Discovery prefill sources

Operational calls for `knowledge-retention-discovery-prefill`. Policy (what may be said, when to stop, what is saved) stays in `SKILL.md`.

Last 6 months. Own work only. Two passes: broad, then targeted on systems, projects, and processes the broad pass found. Read only a few full documents.

Sources are sent email, Teams, and SharePoint. Do not call OneDrive, Outlook Calendar, OneNote, Planner, or Viva Engage.

If a call fails or the source is not connected, skip that source. The skill mentions it once. Do not retry in a loop. Do not invent an action that is not listed here.

Slugs below are the Langdock action slugs. Input names are the manifest slugs, including casing.

## Signed-in address

Outlook Email has no `get_current_user`. Do not call it, and do not skip Outlook Email. Use `search_own_emails`. The signed-in address, when needed to keep only their own Teams messages, is the `senderEmail` on their sent mail. If sent mail was skipped and that address is unknown, skip Teams message search so other people's messages are not kept. Listing teams and channels can still run.

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
| Teams | `list_all_teams`, then `list_all_channels`, then `search_messages` | Teams and channels they are in. Keep only their own messages. |
| SharePoint | `list_recent_files`, then `search_files` | Recently used files, plus themed name/content searches. |

Targeted pass: the same search actions again, with the system, project, or process name as the search text. No third pass.

Full reads, a few only: SharePoint `get_file` with `parent` and `itemId` from a `search_files` hit (`itemId` is that hit's `documentId`).

`list_recent_files` does not return a `parent`, and its `documentId` is an insights id. Do not pass it to `get_file`.

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

## SharePoint

### `search_files`

| Input | Required | Use |
|---|---|---|
| `query` | yes | File name or content words, or a themed search. `*` lists files and is not a six-month filter. |

No date input. No author input. `query` is forwarded as Graph Search `queryString` for `driveItem`. A URL is resolved as one file instead of a search. The action does not apply a KQL date or author filter. Do not put `LastModifiedTime` or `author:` in `query`.

Filter client-side on `createdDate`, `lastModifiedByAnyone`, and `author`. Keep the user's own files inside six months. Drop OneDrive hits if a result is from the user's own drive rather than a SharePoint site.

A hit's `documentId` plus `parent` is what `get_file` needs.

### `list_recent_files`

| Input | Required | Use |
|---|---|---|
| `maxResults` | no | Default 50. Not `limit`. |

No date input. Recently used files for the signed-in user (insights). Drop older than six months client-side using `lastAccessedDateTime` or `lastModifiedDateTime`. Drop OneDrive items. These rows have no `parent`. Do not call `get_file` with them.

### `get_file`

| Input | Required | Use |
|---|---|---|
| `parent` | yes | The `parent` object from `search_files`. |
| `itemId` | yes | That hit's `documentId`. Not a URL. |

A few files only. Protected files fail closed; skip them. Do not retry.

`get_profile` exists on this integration and is not a search action. Do not call it for the draft. Directory job title and department come from `directoryProfile`.

## Server-side vs client-side

| Need | Where it is applied |
|---|---|
| Sent mail only | Server: `searchScope` `sent` |
| Email month window | Server: `dateFrom` / `dateTo`, on received time. Client: `sentDateTime` older than six months |
| Email bodies off | Server: `includeDetails` false (must be set; default is true) |
| Email private / confidential | Client: `sensitivity` is personal, private, or confidential. The SELECT cannot exclude those levels |
| Teams own messages | Client: `senderEmail`. `from:<email>` is not a schema filter |
| Teams date window | Client: `createdDateTime` |
| SharePoint date / author | Client. `search_files` has no date or author field and does not accept a KQL date/author filter |
| SharePoint recent date | Client. `list_recent_files` has no date field |
| OneDrive results | Client: drop them. Do not call the OneDrive integration |
