# Upload-ready integration packages

These folders mirror the per-action custom-integration bundle layout while the original centralized integrations remain unchanged.

Each integration contains metadata-only `manifest.json`, optional `authTest.js`/OAuth files, and `actions/<slug>/code.js` plus `action_manifest.json`.

Included packages:

- `state-machine` — Knowledge Retention Backend
- `sharepoint-search` — SharePoint Scoped Search
- `coding-tools` — Langdock coding tools

No `_shared.js`, versioned folders, or `latest` folders are included.
