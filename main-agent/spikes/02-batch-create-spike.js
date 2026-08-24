#!/usr/bin/env node
/**
 * Spike 02 — Dataverse $batch create for save_topics_and_questions (plan item 8)
 *
 * Creates throwaway topics (client-generated GUIDs) + questions in ONE multipart
 * changeset, then optionally deletes them.
 *
 * Env: DATAVERSE_URL, TENANT_ID, CLIENT_ID, CLIENT_SECRET, INTERVIEW_ID
 * Optional: CLEANUP=1 (default) | 0, TOPIC_COUNT=2, QUESTIONS_PER_TOPIC=2
 *
 * Usage: node spikes/02-batch-create-spike.js
 *
 * Pass criteria:
 *   - batch POST returns 200
 *   - each changeset part succeeds (204/201)
 *   - GET confirms created rows
 *   - cleanup deletes them when CLEANUP=1
 */

'use strict';

const crypto = require('crypto');

const DATAVERSE_URL = (process.env.DATAVERSE_URL || '').replace(/\/+$/, '');
const TENANT_ID = process.env.TENANT_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const INTERVIEW_ID = process.env.INTERVIEW_ID || '';
const CLEANUP = (process.env.CLEANUP || '1') !== '0';
const TOPIC_COUNT = Number(process.env.TOPIC_COUNT || 2);
const QUESTIONS_PER_TOPIC = Number(process.env.QUESTIONS_PER_TOPIC || 2);

const API = '/api/data/v9.2';

function requireEnv() {
  const missing = ['DATAVERSE_URL', 'TENANT_ID', 'CLIENT_ID', 'CLIENT_SECRET', 'INTERVIEW_ID'].filter(
    (k) => !process.env[k],
  );
  if (missing.length) {
    console.error('Missing env:', missing.join(', '));
    console.error('INTERVIEW_ID must be a disposable open interview you own for this spike.');
    process.exit(1);
  }
}

function guid() {
  // Dataverse accepts client-supplied primary keys on create when valid GUIDs.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
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

async function dv(accessToken, { method = 'GET', path, headers = {}, body, rawBody = false }) {
  const res = await fetch(`${DATAVERSE_URL}${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      ...headers,
    },
    body: rawBody ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* multipart responses are not JSON */
  }
  return { status: res.status, json, text, headers: Object.fromEntries(res.headers.entries()) };
}

function buildBatch({ topics, questions, interviewId }) {
  const batchBoundary = `batch_${guid()}`;
  const changesetBoundary = `changeset_${guid()}`;
  const interviewRef = `ckr_interviews(${interviewId})`;
  const parts = [];

  let contentId = 1;
  for (const topic of topics) {
    const payload = {
      ckr_interviewtopicid: topic.id,
      ckr_name: topic.name,
      ckr_description: topic.description,
      ckr_order: topic.order,
      ckr_topicstatus: 10,
      ckr_totalquestions: QUESTIONS_PER_TOPIC,
      ckr_answeredquestions: 0,
      'ckr_Interview@odata.bind': `/${interviewRef}`,
    };
    parts.push(
      `--${changesetBoundary}\r\n` +
        `Content-Type: application/http\r\n` +
        `Content-Transfer-Encoding: binary\r\n` +
        `Content-ID: ${contentId}\r\n\r\n` +
        `POST /api/data/v9.2/ckr_interviewtopics HTTP/1.1\r\n` +
        `Content-Type: application/json;type=entry\r\n\r\n` +
        `${JSON.stringify(payload)}\r\n`,
    );
    contentId += 1;
  }

  for (const question of questions) {
    const payload = {
      ckr_name: String(question.text).slice(0, 100),
      ckr_questiontext: question.text,
      ckr_order: question.order,
      ckr_status: 10,
      ckr_isanswered: false,
      ckr_ismandatory: true,
      'ckr_Interview@odata.bind': `/${interviewRef}`,
      'ckr_Topic@odata.bind': `/ckr_interviewtopics(${question.topicId})`,
    };
    parts.push(
      `--${changesetBoundary}\r\n` +
        `Content-Type: application/http\r\n` +
        `Content-Transfer-Encoding: binary\r\n` +
        `Content-ID: ${contentId}\r\n\r\n` +
        `POST /api/data/v9.2/ckr_questions HTTP/1.1\r\n` +
        `Content-Type: application/json;type=entry\r\n\r\n` +
        `${JSON.stringify(payload)}\r\n`,
    );
    contentId += 1;
  }

  const changeset =
    parts.join('') + `--${changesetBoundary}--\r\n`;

  const body =
    `--${batchBoundary}\r\n` +
    `Content-Type: multipart/mixed;boundary=${changesetBoundary}\r\n\r\n` +
    changeset +
    `--${batchBoundary}--\r\n`;

  return { batchBoundary, body, operationCount: topics.length + questions.length };
}

function parseBatchStatusLines(text) {
  const statuses = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^HTTP\/1\.1\s+(\d+)/);
    if (m) statuses.push(Number(m[1]));
  }
  return statuses;
}

async function main() {
  requireEnv();
  const accessToken = await token();

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const topics = [];
  const questions = [];
  for (let t = 1; t <= TOPIC_COUNT; t++) {
    const id = guid();
    topics.push({
      id,
      name: `SLIM-SPIKE ${stamp} T${t}`,
      description: 'Dataverse Slim batch spike — safe to delete',
      order: 9000 + t,
    });
    for (let q = 1; q <= QUESTIONS_PER_TOPIC; q++) {
      questions.push({
        topicId: id,
        order: q,
        text: `Spike question T${t}Q${q} (${stamp})`,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        interviewId: INTERVIEW_ID,
        topics: topics.map((t) => ({ id: t.id, name: t.name, order: t.order })),
        questionCount: questions.length,
        cleanup: CLEANUP,
      },
      null,
      2,
    ),
  );

  const { batchBoundary, body, operationCount } = buildBatch({
    topics,
    questions,
    interviewId: INTERVIEW_ID,
  });

  console.log(`\nPosting $batch with ${operationCount} operations...`);
  const t0 = Date.now();
  const batchRes = await dv(accessToken, {
    method: 'POST',
    path: '/$batch',
    headers: {
      'Content-Type': `multipart/mixed;boundary=${batchBoundary}`,
    },
    body,
    rawBody: true,
  });
  const ms = Date.now() - t0;
  const partStatuses = parseBatchStatusLines(batchRes.text);
  console.log(
    JSON.stringify(
      {
        batchHttpStatus: batchRes.status,
        ms,
        partStatuses,
        allPartsOk: partStatuses.length > 0 && partStatuses.every((s) => s >= 200 && s < 300),
        bodyPreview: batchRes.text.slice(0, 1500),
      },
      null,
      2,
    ),
  );

  // Confirm via normal GETs
  const topicFilter = encodeURIComponent(
    topics.map((t) => `ckr_interviewtopicid eq ${t.id}`).join(' or '),
  );
  const confirmTopics = await dv(accessToken, {
    path: `/ckr_interviewtopics?$filter=${topicFilter}&$select=ckr_interviewtopicid,ckr_name,ckr_order`,
  });
  console.log('\n=== CONFIRM TOPICS ===');
  console.log(
    JSON.stringify(
      { status: confirmTopics.status, count: confirmTopics.json?.value?.length, rows: confirmTopics.json?.value },
      null,
      2,
    ),
  );

  const confirmOneQuestion = await dv(accessToken, {
    path: `/ckr_questions?$filter=${encodeURIComponent(`_ckr_topic_value eq ${topics[0].id}`)}&$select=ckr_questionid,ckr_questiontext,ckr_order,_ckr_topic_value`,
  });
  console.log('\n=== CONFIRM QUESTIONS (topic 1) ===');
  console.log(
    JSON.stringify(
      {
        status: confirmOneQuestion.status,
        count: confirmOneQuestion.json?.value?.length,
        rows: confirmOneQuestion.json?.value,
      },
      null,
      2,
    ),
  );

  if (CLEANUP) {
    console.log('\n=== CLEANUP ===');
    // Delete questions first, then topics (FK order). Sequential is fine for a spike.
    for (const topic of topics) {
      const qs = await dv(accessToken, {
        path: `/ckr_questions?$filter=${encodeURIComponent(`_ckr_topic_value eq ${topic.id}`)}&$select=ckr_questionid`,
      });
      for (const row of qs.json?.value || []) {
        const del = await dv(accessToken, {
          method: 'DELETE',
          path: `/ckr_questions(${row.ckr_questionid})`,
        });
        console.log(`DELETE question ${row.ckr_questionid} → ${del.status}`);
      }
      const delT = await dv(accessToken, {
        method: 'DELETE',
        path: `/ckr_interviewtopics(${topic.id})`,
      });
      console.log(`DELETE topic ${topic.id} → ${delT.status}`);
    }
  } else {
    console.log('\nCLEANUP=0 — left spike rows in place. Delete manually if needed.');
  }

  console.log(`
Pass criteria checklist:
  [ ] batchHttpStatus === 200
  [ ] allPartsOk === true
  [ ] confirmed topic count === ${TOPIC_COUNT}
  [ ] questions per topic === ${QUESTIONS_PER_TOPIC}
  [ ] cleanup deleted rows (if CLEANUP=1)
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
