# Upload-ready integration packages

These folders mirror the per-action custom-integration bundle layout while the original centralized integrations remain unchanged.

Each integration contains metadata-only `manifest.json`, optional `authTest.js`/OAuth files, and `actions/<slug>/code.js` plus `action_manifest.json`.

Included packages:

- `state-machine` — Knowledge Retention Backend (19 actions)
- `sharepoint-search` — SharePoint Scoped Search (1 action)
- `coding-tools` — Langdock coding tools (12 actions)

No `_shared.js`, versioned folders, or `latest` folders are included.
