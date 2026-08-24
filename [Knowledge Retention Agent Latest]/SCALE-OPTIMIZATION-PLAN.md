# Knowledge Retention Backend — Scale Optimization Plan

Plan for making the Dataverse/SharePoint state machine viable for large-scale rollout while preserving the existing protocol: backend-authored `nextAction` / `instruction`, optimistic concurrency, resume-from-Dataverse, and app-only auth.

**Scope:** Knowledge Retention Backend (State Machine) only. Interview/reporting skills and system prompt change only where call patterns must shrink (e.g. avoid redundant `get_runtime_state`).

**Non-goals:** Moving off Dataverse; changing the employee-facing interview UX; rewriting status codes; making chat history authoritative.

---

## 1. Current cost model (baseline)

Auth is one Entra app → one Dataverse **application user**. All interviews share that identity’s:

- **Service protection** (short window): ~6,000 requests / 5 min / web server, ~1,200 s execution time, ~52 concurrent.
- **Entitlement** (24 h): non-licensed **tenant pool** (Dynamics: typically 500,000 base + 5,000 per USL, cap 10M), shared with every other app/non-interactive caller on the tenant.

Almost every action does `loadInterviewRow` (1 GET) + `loadChildren` (3 sequential GETs: topics, questions, answers), then individual writes. There is **no `$batch`**. Denormalized Power BI counters are patched on every answer.

| Scenario | Questions | Approx. Dataverse requests / completed interview |
|---|---|---|
| Light (4×3) | 12 | ~250–300 |
| Typical (5×4–5) | 20–25 | ~400–500 |
| Heavy (6×6) | 36 | ~550–650 |

Dominant cost: **`save_answer` ≈ 11–12 DV calls per question**. Second: **`save_topics_and_questions`** (1 POST per topic + 1 POST per question). Third: full-tree reloads on every mutation and on topic summary / final doc reads.

At ~450 calls/interview, **~1,000 completions/day ≈ 450k DV requests** — already near a 500k base non-licensed pool before admin queries or other integrations.

---

## 2. Target outcomes

| Metric | Baseline (typical) | Target after full plan |
|---|---|---|
| DV requests / completed interview | ~400–500 | **~100–180** |
| DV calls per `save_answer` | ~11–12 | **≤ 3** (ideally 2) |
| HTTP requests for topic+question create (5×5) | ~30+ | **1–2 batches** |
| App-user sharding | 1 identity | **N identities** (by region / BU / hash) |
| 429 handling | Retry ×3, no jitter / agent notice | Jitter + capped wait + agent-visible backoff |
| Observability | Failure strings only | Per-action DV call count, 429s, latency |

Capacity planning (post-optimization, ~150 calls/interview):

| Completions / day | Approx. DV / day | Notes |
|---|---|---|
| 100 | ~15k | Noise |
| 500 | ~75k | Fine on Dynamics pool |
| 2,000 | ~300k | Monitor; may need capacity add-on |
| 5,000 | ~750k | Needs accrued pool and/or add-ons + sharding |

---

## 3. Optimizations (complete list)

### O1 — Collapse `save_answer` (highest impact)

**Problem:** Per answer: load interview + 3 child GETs → POST answer → PATCH question → optional PATCH topic status → reload 3 children → PATCH interview counters → PATCH topic counters.

**Changes:**

1. Keep the initial `loadInterviewRow` + `loadChildren` (needed for concurrency checks).
2. Apply writes in **one `$batch` changeset** (or SDK `ExecuteMultiple`):
   - POST `ckr_answers`
   - PATCH question → answered
   - PATCH topic → `readyForSummary` when last question
   - Optional: counter PATCHes only if O3 has not removed them from the hot path
3. **Do not** call `loadChildren` again after success. Mutate the in-memory `children` (mark question answered, bump topic status) and run `computeState` on that snapshot.
4. On `conflict: true`, keep today’s behavior: no write, return fresh computed state from the load already done (no extra reload).

**Acceptance:** Happy-path `save_answer` ≤ 1 load cycle (4 GETs) + 1 batch (or ≤ 3 discrete writes if batch unavailable in sandbox). End-to-end DV calls per answer ≤ 3 HTTP round trips to Dataverse after O3 removes counter PATCHes from the batch.

**Risk:** In-memory state must mirror what Dataverse would return (especially `isAnswered` / latest answer). Cover with action tests: last question of topic, mid-topic, conflict on wrong `expectedTopicOrder`.

---

### O2 — Batch `save_topics_and_questions`

**Problem:** Sequential POST per topic and per question; cleanup is sequential DELETE per leftover row.

**Changes:**

1. Validate orders first (already done) — keep that before any delete.
2. Cleanup: one `$batch` of DELETEs (questions then topics), or a single filtered delete strategy if safe in-env.
3. Creates: one `$batch` changeset for all topic POSTs + all question POSTs (respect any batch size limits; split into chunks of e.g. 50–100 if needed).
4. Final interview PATCH (status → `generated`, totals) can ride in the last batch or stay a single PATCH after batches succeed.
5. Final reload: one `loadInterviewRow` + one `loadChildren` (or skip reload and build children from the payload + returned IDs if Prefer `return=representation` is usable in batch).

**Acceptance:** 6×6 generation uses ≤ 3 Dataverse HTTP requests for writes (plus ≤ 1 load cycle). Partial failure leaves interview re-generatable (`status < generated`), same as today.

**Risk:** Batch atomicity / error surfacing. Map batch item errors into `failureMessage` with action slug. Do not flip status to `generated` until all creates succeed.

---

### O3 — Remove or defer denormalized counters from the hot path

**Problem:** Every `save_answer` PATCHes interview and topic counter/cursor columns for Power BI. That is 2 extra writes and forces post-write consistency work.

**Changes (pick one; prefer A then B):**

- **A (preferred):** Stop writing `ckr_answeredquestions`, `ckr_openquestioncount`, `ckr_progress`, `ckr_currenttopicorder`, `ckr_currentquestionorder`, topic `ckr_answeredquestions` on the interview hot path. Recompute in Power BI from child tables (`ckr_questions` / `ckr_answers`), or via a scheduled Dataverse / Fabric refresh job.
- **B:** Write counters only on topic boundary (last question → `readyForSummary`) and on finalize — not every answer.
- **C (if BI cannot change):** Keep counters but only inside the O1 batch (still saves HTTP round trips, not entitlement CRUD count as much).

**Acceptance:** Document which columns remain live vs derived. Confirm with BASF BI owners before A. Agent-facing `progressLabel` continues to come from `computeState`, not from stored counters.

**Risk:** Existing dashboards break if A ships without a report change. Gate A behind an explicit BI sign-off.

---

### O4 — Slim and partition reads

**Problem:** Every state load pulls the full topic/question/answer trees.

**Changes:**

1. **Parallelize** the three `loadChildren` GETs with `Promise.all` (latency only; same entitlement count).
2. Add **`$select`** for columns `computeState` and writers actually need.
3. **Partitioned loaders:**
   - `loadChildrenActive(topicId)` — questions + answers for active topic only (Ask / save_answer path).
   - `loadChildrenFull()` — keep for summary, `get_answers`, finalize, revise, admin-adjacent reads.
4. Evaluate **`$expand`** from interview if relationships allow a single GET; adopt only if payload size and limits stay healthy.
5. **Lighter resume action** (optional new action or flag on `get_runtime_state`): return cursor + `nextQuestionText` without full `topicQnA` unless `nextAction` is summary/final.

**Acceptance:** `save_answer` / Ask path does not download other topics’ answers. Full tree still available where summaries/final docs need it.

**Risk:** Partition bugs → wrong active question. Concurrency tokens must still be validated against the loaded active topic.

---

### O5 — Shard application users (identity scale-out)

**Problem:** One application user = one service-protection bucket and one consumer of the shared non-licensed daily pool.

**Changes:**

1. Provision **N** app registrations + Dataverse application users with the same security roles.
2. Extend integration auth to hold a small set of credential slots (or a secrets map), not a single clientId/secret.
3. **Routing:** `hash(employeeEmail) % N`, or sticky by business unit / region if BASF prefers operational clarity.
4. Put **admin_*** and heavy reporting on a **dedicated** principal so BI cannot starve interviews.
5. Document rotation and break-glass (failed shard → retry other shard only if data is not user-scoped by identity — usually **do not** hop shards per user; email affinity must be stable).

**Acceptance:** Peak concurrent interviews distribute across shards. Runbook lists N, routing rule, and how to add a shard.

**Sizing starting point:** Choose N so that `(peak concurrent sessions × ~2–3 DV HTTP req/s)` stays well under 6,000/5 min **per shard**. Human-paced traffic often allows dozens of sessions per shard; resume storms and batch creates need headroom.

**Risk:** Mis-routed credentials → wrong environment. Keep `dataverseUrl` / site IDs global; only client credentials shard.

---

### O6 — Agent / prompt call-pattern hygiene

**Problem:** Extra tool calls multiply the backend cost even after O1–O4.

**Changes:**

1. Keep: `get_runtime_state` **once per conversation open**; mutating actions return authoritative state — do not re-fetch mid-turn after a successful save.
2. Topic summary: prefer `topicQnA` already on state; call `get_answers` only when `topicQnA` is missing or revise path needs `sequence`.
3. Final doc: one `get_discovery` + one `get_answers` (or a single new read action that returns both) — avoid repeated full pulls while drafting chapters.
4. Supporting uploads: unchanged sequencing; do not add polling loops.

**Acceptance:** System prompt / reporting skill updated in the same change set as backend read partitions. Handover doc (`HOW-THE-AGENT-WORKS.md`) updated.

---

### O7 — Production hardening (429, idempotency, SharePoint)

**Already present:** 429 retry up to 3 with `Retry-After`, cap wait 30s.

**Changes:**

1. Add **jitter** to retry waits; distinguish service-protection 429 vs transient gateway errors if headers allow.
2. On exhausted retries, return a structured soft failure / clear instruction (“wait N seconds, then `get_runtime_state`”) instead of only throwing — so the agent does not tight-loop.
3. Strengthen **idempotency**: duplicate `save_answer` after success already conflicts via order tokens; ensure batch retries do not create duplicate answer rows (unique constraint or “if question already answered, return state no-op”).
4. SharePoint: keep invite failures non-fatal; avoid retry storms on Graph that delay DV completion; circuit-break repeated invite failures within one interview.
5. Token: reuse access token within a single action invocation across all `dv` / `graph` calls (already one token per resource per action — keep it; avoid re-auth inside loops).

**Acceptance:** Chaos test: forced 429 with Retry-After → action succeeds or agent receives wait instruction; no duplicate answers.

---

### O8 — Observability and capacity governance

**Changes:**

1. Per action result (admin-visible or logged): `dvHttpCalls`, `dvBatchCalls`, `graphCalls`, `durationMs`, `rateLimited: bool`, `shardId`.
2. Dashboard (Power Platform admin + custom): non-licensed pool consumption, 429 rate by shard, p95 action latency.
3. Alert: 429 rate > threshold for 15 min; daily pool > 70% of entitlement.
4. Before rollout waves: estimate `interviews/day × calls/interview` vs pool; purchase **Power Platform Request capacity add-ons** if needed.
5. Load test in a non-prod environment: N synthetic interviews (scripted action sequences, not full LLM) to validate O1–O5.

**Acceptance:** BASF ops can answer “how close are we to the pool / protection limits?” without reading code.

---

### O9 — Optional later (only if still hot)

Not required for first scale wave if O1–O8 land:

1. **Dedicated “save_answer_lite”** stored as a Custom API / plugin in Dataverse (one external call → many internal ops). Highest efficiency; needs Dataverse ALM in BASF env.
2. **Change tracking / row version** on interview for cheaper conflict detection.
3. **Archive path** for cancelled interviews’ children to keep filters fast as tables grow.
4. **Read replicas / export to Lakehouse** for admin_query and BI so interactive path never shares load with analytics (analytics already should use separate identity per O5).

---

## 4. Implementation phases

### Phase 0 — Baseline (1–2 days)

- Instrument call counts in a branch (even temporary logging) on `save_answer`, `save_topics_and_questions`, `get_runtime_state`.
- Measure one golden-path interview in non-prod.
- Confirm BI dependency on denormalized counters (blocks O3A).
- Confirm whether Langdock action sandbox allows Dataverse `$batch` (ChangeSet). If not, fall back to Custom API (O9) or minimize sequential writes + skip reload (still large win).

### Phase 1 — Hot-path cut (O1 + O3B/C + O4.1–2) (priority)

- Implement in-memory `computeState` after `save_answer`.
- Batch or collapse writes.
- `$select` + parallel `loadChildren`.
- Re-verify concurrency conflicts and last-question → summary transition.
- Update `HOW-THE-AGENT-WORKS.md` only if behavior/instructions change.

**Exit:** ≥50% reduction in DV calls per typical interview in measurement.

### Phase 2 — Generation + reads (O2 + O4.3–5 + O6)

- Batch topic/question create/cleanup.
- Partitioned loaders; prompt/skill hygiene.
- Optional combined discovery+answers read for final doc.

**Exit:** Generation burst ≤ 3 write HTTP calls; summary/final path does not full-scan unless needed.

### Phase 3 — Scale-out identity + hardening (O5 + O7 + O8)

- Provision shards; routing; admin principal split.
- Jittered 429 + agent backoff instruction.
- Metrics, alerts, capacity add-on decision.
- Load test at projected wave-1 concurrency.

**Exit:** Sign-off for wave-1 rollout with documented N and pool headroom.

### Phase 4 — If needed (O9)

- Custom API / plugin consolidation.
- Analytics offload / archive.

---

## 5. Testing contract

For each phase, before claiming done:

| Check | How |
|---|---|
| Happy path interview | Seed backend → scripted action sequence through finalize + feedback |
| Concurrency | Wrong `expectedQuestionOrder` / `expectedTopicOrder` → `conflict: true`, no write |
| Last question in topic | Topic → `readyForSummary`; folder gate then summary |
| Idempotent generate | Second `save_topics_and_questions` → `alreadyGenerated`, no duplicate rows |
| Resume | New session mid-Q and post-finalize (status 60 vs 70) |
| Revise | `needsReview` cascade on confirmed summary |
| Batch failure | Mid-batch error does not set status `generated` |
| 429 | Mock/forced Retry-After honored |
| Shard affinity | Same email always hits same credentials |
| Call count | Logged `dvHttpCalls` within target bands |

Prefer `pnpm`-style / Langdock action tests against the customer non-prod environment; do not rely on mock connections for throttle behavior.

---

## 6. Rollout waves (product)

1. **Canary:** one BU / limited users; single shard; Phase 1–2 code; watch 429 and pool.
2. **Wave 1:** enable O5 sharding before expanding headcount.
3. **Wave 2+:** add shards and capacity add-ons from O8 dashboards, not guesswork.

Do not open org-wide on one application user with the current ~450 calls/interview cost.

---

## 7. Doc / artifact updates (same change sets)

| Artifact | When |
|---|---|
| `HOW-THE-AGENT-WORKS.md` | O4/O6 behavior, any new read action, shard note under Auth |
| System prompt | O6 call hygiene |
| Reporting / interviewing skills | Only if tool call guidance changes |
| `SOURCE-MAP.md` / contributing skill | Helper changes, batch utilities |
| This plan | Mark phase exit criteria as done with measured numbers |

---

## 8. Decision log (to resolve in Phase 0)

| Decision | Options | Owner |
|---|---|---|
| `$batch` available in Langdock actions? | Yes / No → Custom API | Eng + Langdock |
| Hot-path counters | O3A remove / O3B boundary / O3C batch-only | BASF BI + Eng |
| Shard key | Email hash / BU / region | BASF ops |
| Initial N | e.g. 4 / 8 / 16 | Eng from load test |
| Capacity add-ons | Buy now vs after canary | BASF Platform |

---

## 9. Summary priority order

1. **O1** — Collapse `save_answer` (in-memory state + batched writes)  
2. **O3** — Stop per-answer counter PATCHes (BI-agreed)  
3. **O2** — Batch topic/question creation  
4. **O4** — Slim / partition reads (+ parallelize)  
5. **O6** — Prompt/skill call hygiene  
6. **O5** — Shard application users  
7. **O7** — 429 / idempotency hardening  
8. **O8** — Metrics, alerts, capacity  
9. **O9** — Custom API / analytics offload only if still needed  

This preserves the state machine’s correctness model while turning scale into a solved quota-and-identity problem instead of a per-answer API amplification problem.
