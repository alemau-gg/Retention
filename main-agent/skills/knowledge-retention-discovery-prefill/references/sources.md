# Discovery prefill sources

Operational calls for `knowledge-retention-discovery-prefill`. Policy (what may be said, when to stop, what is saved) stays in `SKILL.md`.

Last 6 months. Their own sent mail and Teams messages; SharePoint files they can open, including files others shared with them. Two passes: broad, then targeted on systems, projects, and processes the broad pass found. Read only a few full documents.

Sources are sent email, Teams, and SharePoint. Do not search the inbox. Do not call OneDrive, Outlook Calendar, OneNote, Planner, or Viva Engage.

If a call fails or the source is not connected, skip that source. The skill mentions it once. Do not retry in a loop. Do not invent an action that is not listed here.

Slugs below are the Langdock action slugs. Input names are the manifest slugs, including casing.

## Signed-in identity

Outlook Email has no `get_current_user`. Do not call it, and do not skip Outlook Email. Use `search_own_emails` first. The user's address is the `senderEmail` on their sent mail. It is needed to keep only their own Teams messages. Match it case-insensitively.

If sent mail was skipped or returned nothing, the address is unknown. Then skip Teams so other people's messages are not used. SharePoint can still run.

## Client-side filters (always)

Apply these even when a server filter was also set:

- Older than six months.
- Private, personal, or confidential items. Do not mention them.
- Other people's Teams messages. Keep the user's own. Do not read or use a dropped message's `summary`.
- OneDrive files, including files others shared from their OneDrive.

A free-text `query` that an action forwards to Graph is not a date, author, or sender filter. Do not put `LastModifiedTime`, `author:`, or `from:<email>` in those queries.

## Broad pass

| Source | Action | Call |
|---|---|---|
| Outlook Email | `search_own_emails` | Sent mail only. One call per month for six months. Previews only. Run this first: it gives their address for the Teams filter and the themes for the other two sources. |
| Teams | `search_messages` | One call per theme from their sent mail (a system, project, or process name), up to five. Keep only their own messages. |
| SharePoint | `list_recent_files`, then `search_files` | Recently used files, plus `search_files` with themes from sent mail. |

Do not call `list_all_teams` or `list_all_channels`. `search_messages` has no team or channel input, so listing them does not narrow the search.

Targeted pass: the same search actions again, with the system, project, or process name as the search text. No third pass.

Full reads, a few only: SharePoint `get_file` with `parent` and `itemId` from a kept `search_files` hit (`itemId` is that hit's `documentId`).

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

## Teams — `search_messages`

| Input | Required | Use |
|---|---|---|
| `query` | yes | One theme per call: a system, project, or process name from their sent mail. Several words are matched together, not as alternatives. |

This is the whole schema. There is no `from`, team, or channel field. The string is forwarded as Graph Search `queryString` for chat and channel messages (`size` 400, no paging input). It searches every message the user can see, including other people's. `from:<email>` is not a supported filter. Do not put it in `query`.

Each hit has `summary`, `senderEmail`, `senderName`, `createdDateTime`, and `type` (`channel` or `chat`). Keep a message only when `senderEmail` matches the signed-in address, and only inside the six-month window. Read `summary` only on kept hits. If `moreResultsAvailable` is true, stop. Do not invent a page call.

When speaking, say "your Teams activity". Never say chats. Never quote a message or name a colleague from a hit.

## SharePoint

### `search_files`

| Input | Required | Use |
|---|---|---|
| `query` | yes | File name or content words, or a themed search. `*` lists files and is not a six-month filter. |

No date input. No author input. `query` is forwarded as Graph Search `queryString` for `driveItem`. A URL is resolved as one file instead of a search. The action does not apply a KQL date or author filter. Do not put `LastModifiedTime` or `author:` in `query`.

It searches every file the user can open, including files others shared with them. Those are fine to use. Keep a hit when:

- **Not OneDrive.** Drop a hit whose `url` host contains `-my.sharepoint.com`.
- **Recent.** `lastModifiedByAnyone` (a timestamp, not a person) or `createdDate` is inside the six-month window.

Files they created or edited (`author` or `lastModifiedByUserId` is them) say the most about their own work. Weigh those first when drafting.

A kept hit's `documentId` plus `parent` is what `get_file` needs.

### `list_recent_files`

| Input | Required | Use |
|---|---|---|
| `maxResults` | no | Default 50. Pass 20. Not `limit`. |

No date input. Files the user recently opened (insights), theirs or shared with them. Drop rows older than six months (`lastAccessedDateTime` or `lastModifiedDateTime`), rows whose `containerType` is `OneDriveBusiness`, and rows whose `url` host contains `-my.sharepoint.com`. `title` and `previewText` may be used. These rows have no `parent`. To read one in full, find it with `search_files` by title, then `get_file`.

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
| SharePoint date | Client. `search_files` has no date field and does not accept a KQL date filter. Shared files are allowed |
| SharePoint recent files | Client: date window and OneDrive check |
| OneDrive results | Client: drop `url` hosts containing `-my.sharepoint.com` and recent rows with `containerType` `OneDriveBusiness`. Do not call the OneDrive integration |
