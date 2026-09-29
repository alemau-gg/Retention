# Upload-ready integration packages

These folders mirror the per-action custom-integration bundle layout while the original centralized integrations remain unchanged.

Each integration contains metadata-only `manifest.json`, optional `authTest.js`/OAuth files, and per-action `code.js` plus `action_manifest.json`.

`state-machine` follows the Langdock importer convention: each action sits in a numbered version folder, `actions/<slug>/v1/code.js` and `actions/<slug>/v1/action_manifest.json`. The importer rejects flat and `latest` folders. Zip the contents of `state-machine/` (so `manifest.json` is at the zip root) and upload it.

Included packages:

- `state-machine` — Knowledge Retention Backend
- `sharepoint-search` — SharePoint Scoped Search
- `coding-tools` — Langdock coding tools

No `_shared.js` or `latest` folders are included. `coding-tools` and `sharepoint-search` still use the flat `actions/<slug>/code.js` layout.
