# Helper scripts

Run these in Langdock after you fetch live Knowledge Retention Backend sources with Langdock tools. They return patches and check reports. You write updates back with Langdock tools.

## Input

```javascript
data.input = {
  actions: {
    // every KR Backend action slug → full source text
  },
  // verify-helpers also needs:
  manifest: { /* live manifest from Langdock */ },
  authTest: "<optional>"
}
```

Both scripts require the **full** known action set (see `REQUIRED_ACTION_SLUGS` inside each file). A partial fetch cannot succeed. If you add or remove a backend action, update that list in both scripts.

`admin_describe_schema`, `admin_query_records`, and `admin_bulk_writeback` are the separate Knowledge Retention Admin integration. They are not part of `REQUIRED_ACTION_SLUGS`. The employee interview never calls them.

## When to run

| Script | When |
|---|---|
| `sync-helpers.js` | After changing the shared helper in `get_runtime_state` |
| `verify-helpers.js` | Before treating any backend code/manifest change as done |

Then test the changed actions in Langdock.
