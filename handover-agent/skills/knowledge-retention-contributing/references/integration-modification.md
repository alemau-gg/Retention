# Integration modification methodology (KR Backend)

Langdock conventions for **changing** the live **Knowledge Retention Backend** — Integration Builder principles adapted to this state machine.

**Hard scope:** Knowledge Retention Backend only. Never open, diff, or patch another integration “for reference” while coding.

**Operations:** read and update live Dev actions/manifest through Langdock API tools. After helper edits, call the Dev-only `sync_helpers` and `verify_helpers` custom actions on fresh live sources, then write confirmed updates back.

**Precedence when rules conflict:**

1. Hard scope lock (contributing skill)
2. Contributing skill (helper sync, layer ownership, HOW invariants, verify)
3. This file (sandbox / manifest / response-shape rules for KR Backend)
4. Generic Integration Builder habits

---

## Mindset when modifying this backend

You are editing a live **state machine** over Dataverse + SharePoint (app-only `API_KEY` auth), not mirroring Graph or Dataverse CRUD.

1. **Design for the interview workflow, not the API surface.** Changes must serve stage progression, concurrency, SharePoint filing, and resume. Do not add calls “because Graph has them” (folder listing, extra Graph endpoints, exploratory admin surfaces on the employee path).
2. **One action, one clear job — without splintering the machine.** Prefer extending the action that already owns the stage. Add a new action / `nextAction` only when HOW’s stage model truly needs a new step; otherwise you create parallel paths the interview agent cannot follow.
3. **Map the whole path before coding.** A “small” write often touches `computeState` instructions, expected-order conflict tokens, open vs closed loaders (`60 ≤ status < 80`), sibling action bodies that author terminal `nextAction`s, and HOW. If you cannot name those touchpoints, you are not ready to write.
4. **Design for scale where lists grow.** Topic/question/answer sets grow per interview; paginate Dataverse/Graph list calls inside helpers when you touch them. Do not assume today’s row counts stay small. Employee-facing actions still return KR state keys, not a generic list envelope.
5. **Optimize returns for the interview agent (LLM).** Flat explicit keys. Put `nextAction`, `instruction`, conflict notes, and notices before bulky data (`topicQnA`, long text). Never dump raw Dataverse rows or record GUIDs when order integers exist.
6. **Prefer partial success where KR already does.** SharePoint invite failures on `set_up_interview_folder` are non-fatal: folder is ready, `accessGranted` / detail fields tell the truth, and `instruction` carries the sharing reminder. Still **throw** on hard API/auth failures via `failureMessage`.
7. **Judge from the seats that matter.** Employee-path `instruction` text is for the interview agent (directive, stage-correct). It must not leak record GUIDs, action slugs as user copy, or invent stage from chat. Administrator-facing error text must keep verbatim API bodies so support can act.

Before writing: fetch and carefully read the live action(s) and `get_runtime_state` via Langdock. If Graph/Dataverse behaviour is unclear, read vendor docs (methods, auth, params, pagination, rate limits, error shapes) and confirm non-trivial maps with the administrator.

For Langdock platform behavior, use the **Langdock Docs integration** first,
especially its Integration API reference. Do not rely on memory for endpoint
paths, request shapes, sandbox globals, status codes, or action behavior.

Write **complete, runnable** action code — not stubs. After each write, re-read the live artifact and confirm what Langdock stored matches intent. For Graph or Dataverse behavior, use the relevant vendor documentation.

---

## Hard Langdock sandbox rules

These are platform contracts the KR Backend already relies on. Do not invent a second style beside the shared helpers.

| Rule | Detail | KR application |
|---|---|---|
| `ld.request` only | Never `fetch` | All token, Dataverse, and Graph calls go through `ld.request` inside `getToken` / `dv` / `graph` or action bodies that match that pattern |
| Exact expected status | Check `200` / `201` / `204` (as appropriate), not bare `status >= 400` | Matches existing helpers. `graph()` soft-404 / non-throw on some statuses is intentional for invite and manager lookup — do not “fix” into throw-on-all-non-2xx without reading every call site |
| Throw, don’t return errors | `throw new Error(...)` for hard failures — never `return { error }` | API/auth failures use `KnowledgeRetentionUtils.failureMessage(...)`. Soft flow refusals (`conflict: true`, “no open interview”) are returns, not throws |
| Trust `required: true` | Don’t re-check required manifest fields in code | Platform already enforces before the sandbox runs |
| Auth at the call site | Read `data.auth.*` where the request is built — don’t pass secrets/tokens as helper arguments from the action body | Auth fields: `tenantId`, `clientId`, `clientSecret`, `dataverseUrl`, `sharepointSiteId` (lowercase **p**), `prefillEnabled`. Slug casing is the contract. This is app-only client credentials, not `data.auth.access_token` OAuth |
| OBJECT already parsed | Never `JSON.parse` an `OBJECT` input | e.g. `topics` on `save_topics_and_questions` |
| FILE buffer | Uploads: `Buffer.from(data.input.<field>.binary.data)` | `upload_document` — binary is already decoded |
| 429 retry + `ld.wait` cap | Retry with a counter; honor `Retry-After`; `ld.wait(Math.min(..., 30000))` | Already implemented in shared `dv` / `graph`. Extend those paths; do not invent a second retry style in one action |
| Batch fan-out if ever needed | Concurrent request storms in groups of 5–25 — never unbatched `Promise.allSettled` over unbounded sets | KR is mostly sequential today. If you add fan-out (e.g. many Graph lookups), batch it |

Sandbox globals: `data`, `ld`. No `require` / `import` / npm. Useful toolkit for this integration: `ld.request`, `ld.wait`, `ld.log` (remove before leaving a change), `ld.stripHtml` if you ever flatten HTML, `btoa`/`atob` for small base64. Skip SQL helpers, JWT signing, and parquet converters — KR does not use them.

---

## Response shaping for the interview agent

Employee-facing mutating and state actions return the **KR state contract**, not a generic CRUD payload:

- Control first: `nextAction`, `instruction`, then language / progress / expected orders, then bulk (`topicQnA`, long answer text, folder URLs).
- Flat keys the agent can bind to tools: `expectedQuestionOrder`, `expectedTopicOrder`, `nextQuestionText`, `sharePointFolderUrl`, etc.
- Never expose Dataverse record GUIDs to the model when topic/question **order** integers exist. Resolve targets server-side from status columns + expected-order tokens.
- Soft concurrency mismatch → `conflict: true` + fresh state + an instruction prefix that tells the agent what to do next (re-read / re-ask / add `topicOrder`). Do **not** retry the same save blindly; do **not** throw for soft conflicts.
- Hard API failure → throw with `failureMessage` so the model sees a real error (action slug, HTTP status, **verbatim** API body).

### Partial success and `_notices`

Where KR already uses partial success (folder create succeeded, invite uncertain), keep that pattern: structured fields (`accessGranted`, `accessFailureDetail`) plus an instruction prefix the agent must relay carefully.

Use an explicit `_notices` array when you add multi-step fetches that can partially fail and the gap is not already expressed in `instruction` / conflict prefixes:

```javascript
return {
  nextAction: state.nextAction,
  instruction: state.instruction,
  // …control fields…
  topicQnA: state.topicQnA,
  _notices: [
    'Manager lookup failed; folder is ready but only the employee invite was attempted. Ask the user to share manually if needed.',
  ],
};
```

Skip `_notices` on clean success — noise. Name a concrete next step (parameter or action), not “try again.”

### Errors (runnable pattern)

```javascript
// CORRECT — hard API / auth failure
throw new Error(KnowledgeRetentionUtils.failureMessage(response.status, detail));

// CORRECT — soft concurrency / stage refusal
return {
  conflict: true,
  nextAction: state.nextAction,
  instruction: `${mismatchNote}${state.instruction}`,
  // …fresh KR state keys…
};

// WRONG
return { error: `Failed with status ${response.status}` };
```

GET → expect `200`. Create → `200`/`201`. PATCH/DELETE → `200`/`204`. Always prefer the helper’s existing status handling over a one-off check in a single action that diverges.

### FILE uploads

```javascript
const fileBuffer = Buffer.from(data.input.file.binary.data);
// then pass buffer into Graph upload via ld.request / graph helper — match upload_document
```

Do not hand-base64 huge buffers for downloads; let the platform handle binary returns when you add download paths.

---

## Manifest fields (when you touch them)

### Types we actually use

| Data | Type | KR notes |
|---|---|---|
| Fixed choices | `SELECT` | Language, document type, etc. Prefer over `BOOLEAN` when `false` isn’t simply “off” |
| Plain text | `TEXT` | Auth GUIDs/URLs, free text; `prefillEnabled` is TEXT `"true"`/`"false"` today — keep that contract unless product redesigns |
| Long text | `MULTI_LINE_TEXT` | Discovery / answer bodies when length warrants |
| Number | `NUMBER` | Order tokens (`expectedQuestionOrder`, `expectedTopicOrder`, …) |
| True/false | `BOOLEAN` | Only when unset→false is truly “off” and safe |
| JSON object/array | `OBJECT` | e.g. `topics` — already parsed; stringified `jsonSchema` required; put format examples in the schema’s own `description` fields |
| File | `FILE` | `upload_document` |
| Secret | `PASSWORD` | `clientSecret` |

Do not invent OAuth per-action `scopes` arrays on this API_KEY integration unless product deliberately moves to OAuth.

### Ordering, naming, labels

Fields render in array order — that is the form order. Context first (what interview stage needs), then natural workflow, optional/advanced last.

- Sentence-case labels, no trailing period.
- Field slugs: `camelCase`. Action slugs: `snake_case`.
- Every action needs `activeLabel` / `doneLabel` / `failedLabel` in plain chat language (`"Saving answer"` / `"Saved answer"` / `"Failed to save answer"`), not jargon.

### Descriptions

Each field description: what it does, a concrete format example if open-ended, and when to use or skip if optional. Vague descriptions are the usual reason the interview agent mis-fills concurrency tokens or OBJECT payloads.

Auth field descriptions and slugs are a contract with existing connections — especially `sharepointSiteId` (not `sharePointSiteId`). Changing auth slugs without a migration plan breaks every workspace connection.

---

## Hard KR overrides (beat generic builder habits)

These rules are specific to this codebase. When a generic Integration Builder habit conflicts, follow this section.

### Inlined `KnowledgeRetentionUtils`

Every non-admin action inlines the full helper block. Sandbox forbids `require` / `import`.

1. Edit the canonical block in live **`get_runtime_state`** first.
2. Sync that block into **every** other non-admin action via the Dev-only `sync_helpers` custom action, then write each confirmed update back. The only intentional difference per file is `ACTION_SLUG: '<that_action>'`.
3. Never trim “unused” methods. Actions that rarely call `computeState` (`finalize_interview`, `save_feedback`, `get_answers`, `get_discovery`, …) still carry the full helper.
4. Do not edit `admin_describe_schema` / `admin_query_records` helpers as part of employee-path sync.
5. After sync: run the Dev-only `verify_helpers` custom action on a fresh full fetch (`ok` must be true). Spot-check that methods the action body calls still exist on the helper.

A half-synced helper set is a production incident. If a write fails mid-sync, stop and finish sync before any further behaviour edits.

### Identity and targeting

- Session identity via `resolveIdentity`: UPN/email from `data.user`, **not** lowercased, never `alternativeEmail`, fail closed if missing.
- Mutating employee actions resolve write targets from status columns + expected-order tokens (`expectedQuestionOrder`, `expectedTopicOrder`, `expectedSequence`, …). **Never** accept Dataverse record IDs from the model.
- Question order repeats per topic — `save_answer` needs both order tokens; ambiguous revise targets return `conflict: true` with candidate topics.

### Failures vs conflicts

| Kind | Behaviour |
|---|---|
| Token / Dataverse / Graph / upload hard failure | `throw` + `failureMessage(status, detail)` — verbatim API body, action slug baked into `ACTION_SLUG` |
| Soft concurrency / stage refusal | `return { conflict: true, …fresh state }` — no write |
| Sequencing refusal (e.g. upload before folder) | Plain refusal string / structured return — not an invented “SharePoint is down” paraphrase |

### Post-finalize and filing

- Completed-interview fallback: where uploads/reads must work after finalize, load with open **or** `60 ≤ status < 80` completed path (same pattern as existing folder/upload recovery).
- Flip status **last** when possible so a mid-flight failure does not strand the interview past a gate it did not complete.
- Topic files have no “filed” flag; only the final upload advances 60 → 70 (see HOW). Do not invent a second filing flag without a HOW redesign.
- **No SharePoint folder-listing action** unless HOW deliberately redesigns the topic-upload gap.

### Return contract

Preserve employee-path keys: `nextAction`, `instruction`, orders, `topicQnA`, language, progress, folder URL fields as today’s actions return them. Terminal `nextAction` values authored only in action bodies (`FinalizeAndCollectFeedback`, `SendClosingMessage`, …) stay out of `computeState` unless you deliberately move them and sync + update HOW.

---

## Common mistakes

| Mistake | Fix |
|---|---|
| Edit one action’s helper copy only | Canonical `get_runtime_state` → Langdock sync to all non-admin actions |
| Trim helper because this action doesn’t call `computeState` | Keep the full block |
| `return { error }` or `fetch` | `throw new Error(...)` + `ld.request` |
| Bare `status >= 400` | Exact expected status; respect intentional soft Graph statuses |
| Re-validate `required: true` in code | Trust the manifest |
| `JSON.parse` on `OBJECT` | Already parsed |
| Uncapped `ld.wait` / one-off 429 logic beside helpers | Cap at 30s; extend shared `dv` / `graph` |
| Unbatched fan-out over many IDs | Batches of 5–25 if you add concurrency |
| Pass `clientSecret` / tokens into helpers as args | Read `data.auth.*` at the call site |
| Typo `sharePointSiteId` | `sharepointSiteId` only |
| Lowercase email for OData `eq` | Keep asserted session case |
| Accept record GUIDs from the model | Orders + server resolution |
| Throw on soft `conflict` | Return `conflict: true` + fresh state |
| Invent stage / `nextAction` in chat-facing wording | Backend `instruction` owns stage |
| Add folder listing “to help uploads” | Refuse unless HOW redesigns |
| Skip sync/verify after a helper edit | Run `sync_helpers`, write confirmed updates, then `verify_helpers` until `ok: true` |
| Touch another integration while coding | Refuse — scope lock |
| `BOOLEAN` where false has a specific meaning | Prefer `SELECT` with explicit options |
| Vague field descriptions | What + example + when to skip |

---

## Backend-change checklist (before you write)

Use this after the contributing skill’s map, before the first Langdock update:

1. **Scope** — Knowledge Retention Backend only? If not, refuse.
2. **Live read** — Fetched current action code + `get_runtime_state` (and siblings the map names)?
3. **Layer** — Belongs in backend vs interviewing/reporting skill vs interview prompt vs HOW?
4. **Blast radius** — Which statuses, `nextAction`s, conflict tokens, open/closed loaders, and instructions move?
5. **Helper sync?** — Any change inside `KnowledgeRetentionUtils` / `STATUS` / `SCHEMA` / `MESSAGES` / `computeState` → yes: edit canonical `get_runtime_state` in Dev, call `sync_helpers`, and write every confirmed update via Langdock.
6. **Auth / fields** — Manifest field order, types, labels, descriptions; auth slug casing untouched unless migration planned.
7. **Sandbox** — `ld.request`, exact status, throw vs conflict return, OBJECT/FILE patterns, no second 429 style.
8. **Returns** — Still KR state shape; no record IDs to the model; notices/instruction prefixes for partial success.
9. **Approval** — Structural / status / schema-semantic / helper sync → explicit administrator go-ahead.
10. **Verify plan** — Fresh-fetch all Dev actions + manifest; run `verify_helpers` until `ok: true`; provide the human a test handoff for changed paths; walk contributing regression matrix as needed.

Then edit. Then sync if required. Then run `verify_helpers`. Then close out (what changed, residual risk, and any separate setup-documentation follow-up).

---

## What this file deliberately does not cover

OAuth action-scope catalogs, greenfield CRUD action menus, generic `{ count, results, hasMore }` as the default employee return shape, and SQL/JWT/parquet toolkit pages. Those belong to general Integration Builder material; they are not how this KR Backend is extended.
