# Tenant spikes (items 7 + 8)

Run these against the BASF non-prod Dataverse environment before wiring joined reads / `$batch` into `main-agent/integrations/state-machine`.

## Prerequisites

```bash
export DATAVERSE_URL="https://YOURORG.crm.dynamics.com"   # no trailing slash
export TENANT_ID="..."
export CLIENT_ID="..."
export CLIENT_SECRET="..."
# Optional: pin an interview GUID for the joined-read spike
export INTERVIEW_ID="..."          # else the script picks one open interview
export EMPLOYEE_EMAIL="..."        # used if INTERVIEW_ID is unset
```

Node 18+ (built-in `fetch`).

```bash
node "main-agent/spikes/01-joined-read-spike.js"
node "main-agent/spikes/02-batch-create-spike.js"
```

`02-batch-create-spike.js` creates **throwaway** topic/question rows on a disposable interview and deletes them afterward when `CLEANUP=1` (default). Set `CLEANUP=0` to leave them for inspection.

## Pass criteria

### 01 — Joined read
- At least one of FetchXML / `$expand` returns topics + questions for the interview in **one HTTP request**
- Optional answers link either works or fails clearly (report which)
- Row counts match the baseline 3-GET loader for the same interview

### 02 — `$batch`
- One multipart POST creates N topics (client-generated GUIDs) and M questions bound to those GUIDs
- Response is 200 with per-part success
- Cleanup deletes the created rows (or you inspect them)

## Deferred
- Email index on `ckr_employeeemail` (item 9)
- Wiring either spike into production actions until pass criteria are met
