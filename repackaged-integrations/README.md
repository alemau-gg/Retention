# Upload-ready integration packages

These folders mirror the per-action custom-integration bundle layout while the original centralized integrations remain unchanged.

Each integration contains metadata-only `manifest.json`, optional `authTest.js`/OAuth files, and per-action `code.js` plus `action_manifest.json`. Both layouts below carry identical files; only the action version folder differs.

| Folder | Action layout | Use for |
| --- | --- | --- |
| `v1/` | `actions/<slug>/v1/` | Instances on `bundles-v4.4.11` and older, whose importer accepts only `vN` folders |
| `latest/` | `actions/<slug>/latest/` | The current `langdock-bundles` repo and instances whose importer accepts `vN` or `latest` |

`v1/` imports on both old and new instances; `latest/` imports only on new ones. To upload, zip the contents of one integration folder (for example `v1/state-machine/`) so `manifest.json` sits at the zip root.

Included packages:

- `state-machine` — Knowledge Retention Backend
- `sharepoint-search` — SharePoint Scoped Search
- `coding-tools` — Langdock coding tools

`manifest.json` must not contain top-level `actions` or `triggers` arrays; the importer rejects them. No `_shared.js` is included.
