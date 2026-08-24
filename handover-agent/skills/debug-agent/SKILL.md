---
name: debug-agent
version: "1.0.0"
description: >-
  Diagnose errors and unexpected behavior reported for the BASF Knowledge
  Retention agent. Use whenever an administrator reports a failed interview,
  tool call, integration error, unexpected nextAction, or incorrect agent
  behavior. Classify prompt/skill versus backend-action failures, require the
  action and verbatim error for tool failures, inspect live action code through
  Get Integration, trace the exact failing paths and API calls, and propose a
  fix or operational remedy without guessing.
---

# Debug Agent

Use this skill for diagnosis only. Do not silently edit prompts, skills, or
integration code, and do not execute the failing action. If a code change is
appropriate, propose it and follow `knowledge-retention-contributing` only
after the administrator explicitly asks to apply it and confirms the change.

Keep three things separate throughout the investigation:

1. **Verified** — directly stated by the administrator, returned by an API, or
   read from a live artifact.
2. **Inferred** — a conclusion supported by the verified evidence.
3. **Unknown** — information still needed before choosing between causes.

Never fill an unknown with a guessed action, API endpoint, status code, field,
environment, or source version.

## Step 1: classify the report

First understand what failed and classify it:

| Class | Typical signs | First path |
|---|---|---|
| Prompt-related | The agent ignored an instruction, used the wrong wording, or took the wrong conversational turn while tools and backend state were correct | Read the live interview system prompt and suggest a precise prompt update |
| Skill-related | The agent used the wrong interview, discovery, reporting, or document-generation method | Read the relevant live KR skill and prompt context; suggest a precise skill or prompt update |
| Tool/backend-related | An action failed, an API returned an error, a tool produced an unexpected state, or an action returned the wrong result | Follow the mandatory tool-error intake below |
| Unclear or mixed | The report does not establish whether the model, skill, or action caused it | Ask targeted questions; do not inspect or edit code yet |

An incorrect `nextAction` or `instruction` can be caused by either the
backend state machine or the prompt. Treat it as unclear until the returned
state and the relevant live source have been read.

For prompt- or skill-related reports:

1. Restate the observed behavior and the expected behavior.
2. Read the current live prompt and/or KR skill before recommending wording.
3. Identify whether the correction belongs in the prompt, the skill, or both,
   then identify the exact rule, omission, or ambiguity that could produce the
   behavior.
4. Suggest the smallest prompt update, skill update, or both.
5. Explain what each update would change and what it would not change.

Do not describe a prompt or skill issue as an integration-code bug without
evidence from the runtime result.

## Step 2: mandatory intake for tool errors

If the error came from a tool call or integration action, **always explicitly
ask for both of these before investigating the code**:

1. **Which action generated the error?** Ask for the exact action name or slug,
   not merely “the backend” or “the integration”.
2. **What is the exact error message text?** Ask the administrator to paste it
   verbatim, including the HTTP status, response body, `failureMessage`, or
   stack trace when shown.

Use this request for every tool-error intake. If the administrator already
included both items, repeat them back and ask them to confirm that the action
identifier and error text are exact; a paraphrase is not a substitute for the
verbatim message.

> Please provide the exact action name or slug that generated the error and
> paste the complete error message verbatim. If available, also include the
> redacted action inputs, environment (Dev or Staging), timestamp, and run
> ID. Do not include credentials, access tokens, or other secrets.

Do not invoke Get Integration, infer an action from the wording of the error,
or recommend a code fix until the action and verbatim error are supplied and
confirmed. Additional context is useful, but it does not replace either
mandatory item.

## Step 3: read the live source

After the mandatory intake is complete:

1. Confirm that the reported system is the BASF Knowledge Retention use case.
2. Confirm whether the report concerns Dev or Staging. Never request, read, or
   infer a Prod integration ID. If the failure is from Prod, explain that the
   agent cannot inspect Prod and ask the human owner for a redacted live
   action source and logs, or ask them to reproduce it in Dev/Staging.
3. Invoke the separate standard Langdock **Get Integration** action for the
   Knowledge Retention Backend. Use the reported action slug/name to identify
   the exact action and request its complete stored code, not a summary.
4. Read the complete returned action code carefully. Also read its manifest
   input definition and any coupled `get_runtime_state` code or sibling action
   that the returned logic directly relies on.
5. Record which live artifact was read and keep its code as the source of
   truth for this diagnosis.

The package's custom `Coding Tools` integration intentionally contains only
the five development actions and does not contain generic `get_integration`.
Use the standard Langdock Get Integration action available to the admin agent.
If no live Get Integration capability is available, stop and state that the
exact code path cannot be verified; do not reconstruct it from memory or an
old local copy.

## Step 4: trace the failure precisely

Study the code, do not search only for the error text. Build a path from the
action input to the returned error:

1. Identify the exact input values and relevant auth/configuration fields,
   keeping secrets redacted.
2. List every reachable branch, guard, early return, throw, parse, and
   response-shaping step.
3. For every reachable outbound `ld.request`, record:
   - HTTP method
   - exact path or path-building expression
   - query parameters and request body
   - condition that makes the call reachable
   - expected status code(s)
   - retry, timeout, or `Retry-After` behavior
   - how its response becomes the observed error
4. Follow helper calls and inline helper definitions completely. Do not assume
   a helper behaves correctly because its name sounds appropriate.
5. Compare the verbatim error with the exact status/body checks and error
   formatting in the live code.
6. Identify whether one call is the clear source or whether multiple calls can
   produce the same message. If ambiguous, say so and name the missing
   discriminator.

The diagnosis must name the exact candidate API call or code path when the
evidence permits it. For example, distinguish “the action failed” from “the
Dataverse query in `loadInterviewRow` reached the `$orderby` branch and
received HTTP 429”. Do not claim certainty when the same error can come from
several calls.

## Step 5: explain the result

Always explain findings in this order:

### Plain-language explanation

Use simple language first:

- what the agent attempted;
- where it stopped;
- what the system response means;
- whether the issue is likely transient, input-related, permission-related,
  provider-related, or a code-path defect.

Avoid endpoint names and implementation jargon in the first explanation unless
they are needed to distinguish two causes.

### Technical explanation

Then provide the evidence-backed trace:

- live action and source version/read time;
- exact branch or function;
- exact API method and path;
- relevant status code and response body;
- why that path can produce the observed error;
- competing causes that remain possible;
- confidence and unknowns.

Separate a provider's reported error from an error generated by the action
itself. A message such as “Failed to get integration (429)” is not proof that
the API endpoint is wrong; it may be the action's wrapper around a rate limit.

## Step 6: propose the right remedy

Choose the smallest remedy supported by the trace. Do not make a code change
the default when the evidence points to an operational condition.

| Evidence | First recommendation |
|---|---|
| Prompt or skill rule caused the behavior | Suggest an exact prompt or skill update. Do not edit without explicit confirmation. |
| Invalid or missing input, malformed ID, or contract mismatch | Explain the required input or provider contract and recommend correcting the caller/input first. |
| `401` / `403` | Check the connection, API key, permission, scope, or environment assignment. Do not weaken authorization checks as a first response. |
| `404` | Verify the resource ID, path, tenant, and Dev/Staging environment. Do not assume the resource should exist. |
| `409` or state/concurrency conflict | Re-read current state and follow the state machine's conflict path; do not blindly retry a write. |
| `429` / rate limit | Treat it as a transient capacity limit first. Explain the retry timing or `Retry-After` value if present and recommend trying again later or reducing request frequency. Only propose code changes if the existing retry behavior is demonstrably incorrect. |
| `5xx`, timeout, or provider/network failure | Treat it as an external or transient failure first. Recommend a controlled retry and escalation if it persists, with a code change only when the trace shows a local defect. |
| Clear local code defect | Propose a minimal Dev-only patch, its dependencies, regression risks, verification, and reversal path. Then wait for explicit confirmation before any write. |
| Evidence is insufficient | State exactly what is missing and request it. Do not offer a speculative patch as the likely fix. |

For a proposed integration-code fix, hand off to
`knowledge-retention-contributing` and follow its live-read, confirmation,
Dev-only, helper-sync, verification, and human-testing gates. The Debug Agent
does not bypass those rules.

After diagnosis, give the human a concrete test handoff. Name the action,
inputs, expected result, and relevant edge cases they should test. Do not claim
that the fix works until the human supplies the action-test result.

## Required response format

Use this structure for a completed diagnosis:

```markdown
## Diagnosis
Classification: [prompt | skill | tool/backend | mixed | unknown]
Observed: [one-sentence description]

## Plain-language explanation
[What happened and what it means.]

## Technical trace
- Live source read: [artifact/action and environment]
- Failing path: [function/branch]
- API call(s): [method and exact path, or state that none was reached]
- Evidence: [status/body/return path]

## Root causes
1. [Most likely cause and why]
2. [Other supported cause, or “none identified”]

## Recommended next step
[Operational remedy, prompt/skill suggestion, or proposed code fix.]

## Human test handoff
[Exact action, inputs, expected result, and edge cases.]

## Confidence and unknowns
[What is verified, inferred, and still unknown.]
```

If the mandatory action name or verbatim error is missing, do not use the
completed-diagnosis format. Ask for the missing intake information and stop.
