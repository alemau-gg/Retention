#!/usr/bin/env node
/**
 * Spike 01 — Joined read for get_runtime_state (plan item 7)
 *
 * Compares today's 4-call loader (interview GET + 3 child GETs) against:
 *   A) Copilot-style FetchXML (interview → topics → questions)
 *   B) FetchXML + answers link-entity
 *   C) OData $expand (best-effort; nav property names may differ per env)
 *
 * Env: DATAVERSE_URL, TENANT_ID, CLIENT_ID, CLIENT_SECRET
 * Optional: INTERVIEW_ID, EMPLOYEE_EMAIL
 *
 * Usage: node spikes/01-joined-read-spike.js
 */

'use strict';

const DATAVERSE_URL = (process.env.DATAVERSE_URL || '').replace(/\/+$/, '');
const TENANT_ID = process.env.TENANT_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const INTERVIEW_ID = process.env.INTERVIEW_ID || '';
const EMPLOYEE_EMAIL = process.env.EMPLOYEE_EMAIL || '';

const API = '/api/data/v9.2';

function requireEnv() {
  const missing = ['DATAVERSE_URL', 'TENANT_ID', 'CLIENT_ID', 'CLIENT_SECRET'].filter(
    (k) => !process.env[k],
  );
  if (missing.length) {
    console.error('Missing env:', missing.join(', '));
    process.exit(1);
  }
}

async function token() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: `${DATAVERSE_URL}/.default`,
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`token ${res.status}: ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

async function dv(accessToken, { method = 'GET', path, headers = {}, body }) {
  const res = await fetch(`${DATAVERSE_URL}${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      ...headers,
    },
    body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  return { status: res.status, json, text, headers: Object.fromEntries(res.headers.entries()) };
}

function escapeOData(value) {
  return String(value).replace(/'/g, "''");
}

async function resolveInterviewId(accessToken) {
  if (INTERVIEW_ID) return INTERVIEW_ID;
  if (!EMPLOYEE_EMAIL) {
    throw new Error('Set INTERVIEW_ID or EMPLOYEE_EMAIL');
  }
  const filter = encodeURIComponent(
    `ckr_employeeemail eq '${escapeOData(EMPLOYEE_EMAIL)}' and ckr_interviewstatus lt 60`,
  );
  const res = await dv(accessToken, {
    path: `/ckr_interviews?$filter=${filter}&$orderby=createdon desc&$top=1&$select=ckr_interviewid,ckr_interviewnumber,ckr_interviewstatus,ckr_employeeemail`,
  });
  if (res.status !== 200 || !res.json?.value?.length) {
    throw new Error(`No open interview for ${EMPLOYEE_EMAIL}: ${res.status} ${res.text}`);
  }
  return res.json.value[0].ckr_interviewid;
}

async function baselineLoader(accessToken, interviewId) {
  const t0 = Date.now();
  const interview = await dv(accessToken, {
    path: `/ckr_interviews(${interviewId})`,
  });
  const topics = await dv(accessToken, {
    path: `/ckr_interviewtopics?$filter=${encodeURIComponent(`_ckr_interview_value eq ${interviewId}`)}`,
  });
  const questions = await dv(accessToken, {
    path: `/ckr_questions?$filter=${encodeURIComponent(`_ckr_interview_value eq ${interviewId}`)}`,
  });
  const answers = await dv(accessToken, {
    path: `/ckr_answers?$filter=${encodeURIComponent(`_ckr_interview_value eq ${interviewId}`)}`,
  });
  const ms = Date.now() - t0;
  const counts = {
    httpCalls: 4,
    ms,
    interviewOk: interview.status === 200,
    topics: topics.json?.value?.length ?? null,
    questions: questions.json?.value?.length ?? null,
    answers: answers.json?.value?.length ?? null,
    statuses: {
      interview: interview.status,
      topics: topics.status,
      questions: questions.status,
      answers: answers.status,
    },
  };
  return { counts, interview: interview.json, topics: topics.json?.value || [], questions: questions.json?.value || [], answers: answers.json?.value || [] };
}

function uniqueBy(rows, idField) {
  const map = new Map();
  for (const row of rows) {
    const id = row[idField];
    if (id && !map.has(id)) map.set(id, row);
  }
  return [...map.values()];
}

async function fetchXmlJoined(accessToken, interviewId, { withAnswers }) {
  // Copilot KR_GetRuntimeState shape, pinned to a known interview GUID.
  // Answers link is optional — may fail if relationship name differs.
  const answersLink = withAnswers
    ? `
      <link-entity name="ckr_answer" from="ckr_question" to="ckr_questionid" link-type="outer" alias="answer">
        <attribute name="ckr_answerid" />
        <attribute name="ckr_confirmedanswer" />
        <attribute name="ckr_rawusermessages" />
        <attribute name="ckr_answersequence" />
        <attribute name="ckr_islatest" />
      </link-entity>`
    : '';

  const fetchXml = `
<fetch>
  <entity name="ckr_interview">
    <attribute name="ckr_interviewid" />
    <attribute name="ckr_interviewnumber" />
    <attribute name="ckr_interviewstatus" />
    <attribute name="ckr_employeeemail" />
    <attribute name="ckr_language" />
    <attribute name="ckr_sharepointfolderurl" />
    <attribute name="ckr_knowledgeprefillconsent" />
    <filter type="and">
      <condition attribute="ckr_interviewid" operator="eq" value="${interviewId}" />
    </filter>
    <link-entity name="ckr_interviewtopic" from="ckr_interview" to="ckr_interviewid" link-type="outer" alias="topic">
      <attribute name="ckr_interviewtopicid" />
      <attribute name="ckr_name" />
      <attribute name="ckr_order" />
      <attribute name="ckr_topicstatus" />
      <attribute name="ckr_summarytext" />
      <attribute name="ckr_summarystatus" />
      <link-entity name="ckr_question" from="ckr_topic" to="ckr_interviewtopicid" link-type="outer" alias="question">
        <attribute name="ckr_questionid" />
        <attribute name="ckr_questiontext" />
        <attribute name="ckr_status" />
        <attribute name="ckr_order" />
        <attribute name="ckr_isanswered" />
        ${answersLink}
      </link-entity>
    </link-entity>
  </entity>
</fetch>`.trim();

  const t0 = Date.now();
  const res = await dv(accessToken, {
    path: `/ckr_interviews?fetchXml=${encodeURIComponent(fetchXml)}`,
  });
  const ms = Date.now() - t0;
  const rows = res.json?.value || [];

  // Flattened join rows → unique topics / questions / answers
  const topics = uniqueBy(
    rows
      .map((r) => ({
        ckr_interviewtopicid: r['topic.ckr_interviewtopicid'] ?? r.ckr_interviewtopicid,
        ckr_name: r['topic.ckr_name'],
        ckr_order: r['topic.ckr_order'],
        ckr_topicstatus: r['topic.ckr_topicstatus'],
      }))
      .filter((t) => t.ckr_interviewtopicid),
    'ckr_interviewtopicid',
  );
  const questions = uniqueBy(
    rows
      .map((r) => ({
        ckr_questionid: r['question.ckr_questionid'],
        ckr_questiontext: r['question.ckr_questiontext'],
        ckr_status: r['question.ckr_status'],
        ckr_order: r['question.ckr_order'],
        ckr_isanswered: r['question.ckr_isanswered'],
      }))
      .filter((q) => q.ckr_questionid),
    'ckr_questionid',
  );
  const answers = withAnswers
    ? uniqueBy(
        rows
          .map((r) => ({
            ckr_answerid: r['answer.ckr_answerid'],
            ckr_confirmedanswer: r['answer.ckr_confirmedanswer'],
            ckr_rawusermessages: r['answer.ckr_rawusermessages'],
            ckr_answersequence: r['answer.ckr_answersequence'],
            ckr_islatest: r['answer.ckr_islatest'],
          }))
          .filter((a) => a.ckr_answerid),
        'ckr_answerid',
      )
    : null;

  return {
    label: withAnswers ? 'FetchXML + answers' : 'FetchXML topics+questions (Copilot-style)',
    status: res.status,
    httpCalls: 1,
    ms,
    error: res.status !== 200 ? res.text.slice(0, 800) : null,
    rowCount: rows.length,
    topics: topics.length,
    questions: questions.length,
    answers: answers ? answers.length : 'n/a',
    sampleAliases: rows[0] ? Object.keys(rows[0]).filter((k) => k.includes('.')).slice(0, 20) : [],
  };
}

async function expandAttempt(accessToken, interviewId, expandExpr) {
  const t0 = Date.now();
  const res = await dv(accessToken, {
    path: `/ckr_interviews(${interviewId})?$expand=${encodeURIComponent(expandExpr)}`,
  });
  const ms = Date.now() - t0;
  return {
    label: `$expand ${expandExpr}`,
    status: res.status,
    httpCalls: 1,
    ms,
    error: res.status !== 200 ? (res.json?.error?.message || res.text).slice(0, 800) : null,
    keys: res.status === 200 && res.json ? Object.keys(res.json).filter((k) => !k.startsWith('@')) : [],
  };
}

async function main() {
  requireEnv();
  const accessToken = await token();
  const interviewId = await resolveInterviewId(accessToken);
  console.log(JSON.stringify({ interviewId, dataverseUrl: DATAVERSE_URL }, null, 2));

  const baseline = await baselineLoader(accessToken, interviewId);
  console.log('\n=== BASELINE (4 HTTP calls) ===');
  console.log(JSON.stringify(baseline.counts, null, 2));

  console.log('\n=== FETCHXML A (topics+questions) ===');
  console.log(JSON.stringify(await fetchXmlJoined(accessToken, interviewId, { withAnswers: false }), null, 2));

  console.log('\n=== FETCHXML B (+ answers) ===');
  console.log(JSON.stringify(await fetchXmlJoined(accessToken, interviewId, { withAnswers: true }), null, 2));

  // Common naming guesses for collection-valued nav properties. Report which work.
  const expandCandidates = [
    'ckr_interviewtopics',
    'ckr_InterviewTopics',
    'ckr_ckr_interview_ckr_interviewtopic',
    'ckr_interview_ckr_interviewtopic',
  ];

  console.log('\n=== $EXPAND PROBES ===');
  for (const expr of expandCandidates) {
    console.log(JSON.stringify(await expandAttempt(accessToken, interviewId, expr), null, 2));
  }

  console.log(`
Pass criteria:
  - FetchXML A status 200 and topics/questions counts match baseline
  - FetchXML B either matches answers count OR fails with a clear relationship error (then keep answers as a separate GET, still a win)
  - Note which $expand candidate (if any) works for wiring later
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
