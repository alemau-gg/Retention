// Admin spike (SE-3215 item 8): $batch create + post-create shape parity.
// Gate PASS → $batch creates are wired into save_topics_and_questions.
// Keep this probe for regressions. Same Dataverse
// auth as every other Knowledge Retention Backend action. Disposable
// interviews only.

const SCHEMA = {
  topic: {
    id: 'ckr_interviewtopicid',
    name: 'ckr_name',
    order: 'ckr_order',
    status: 'ckr_topicstatus',
    interviewLookupValue: '_ckr_interview_value',
  },
  question: {
    id: 'ckr_questionid',
    text: 'ckr_questiontext',
    order: 'ckr_order',
    status: 'ckr_status',
    isAnswered: 'ckr_isanswered',
    interviewLookupValue: '_ckr_interview_value',
    topicLookupValue: '_ckr_topic_value',
  },
};

const STATUS = {
  topic: { pending: 10 },
  question: { pending: 10 },
};

const TOPIC_FIELDS = Object.values(SCHEMA.topic);
const QUESTION_FIELDS = Object.values(SCHEMA.question);

function failureMessage(status, detail) {
  const code = status === null || status === undefined || status === '' ? 'not reported' : String(status);
  const message = detail === null || detail === undefined ? '' : String(detail);
  if (status === 429 || Number(status) === 429) {
    return `The save or request was not completed due to temporary rate limiting. Please retry shortly. When you contact your administrator, please pass on these details: the action that returned the error is "admin_spike_batch_create", the error code is ${code}, and the error returned by the API is: ${message}`;
  }
  return `An error occurred while connecting to the knowledge retention system. Please contact your administrator. When you contact them, please pass on these details: the action that returned the error is "admin_spike_batch_create", the error code is ${code}, and the error returned by the API is: ${message}`;
}

function guid() {
  const hex = [];
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) hex[i] = '-';
    else if (i === 14) hex[i] = '4';
    else if (i === 19) hex[i] = ((Math.random() * 4) | 8).toString(16);
    else hex[i] = ((Math.random() * 16) | 0).toString(16);
  }
  return hex.join('');
}

function norm(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  const s = String(value);
  return s === '' ? null : s;
}

async function getToken(data, resource) {
  const response = await ld.request({
    url: `https://login.microsoftonline.com/${data.auth.tenantId}/oauth2/v2.0/token`,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: {
      client_id: data.auth.clientId,
      client_secret: data.auth.clientSecret,
      grant_type: 'client_credentials',
      scope: `${resource}/.default`,
    },
  });
  if (response.status !== 200 || !response.json || !response.json.access_token) {
    const detail =
      (response.json && (response.json.error_description || response.json.error)) || response.text || '';
    throw new Error(failureMessage(response.status, detail));
  }
  return response.json.access_token;
}

async function dv(data, token, { method = 'GET', path, headers = {}, body, rawBody = false }) {
  const request = {
    url: `${data.auth.dataverseUrl}/api/data/v9.2${path}`,
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      ...headers,
    },
  };
  if (body !== undefined) {
    request.body = rawBody ? body : typeof body === 'string' ? body : JSON.stringify(body);
  }
  return ld.request(request);
}

function buildBatch({ topics, questions, interviewId, questionsPerTopic }) {
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
      ckr_topicstatus: STATUS.topic.pending,
      ckr_totalquestions: questionsPerTopic,
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
      ckr_status: STATUS.question.pending,
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

  const changeset = parts.join('') + `--${changesetBoundary}--\r\n`;
  const body =
    `--${batchBoundary}\r\n` +
    `Content-Type: multipart/mixed;boundary=${changesetBoundary}\r\n\r\n` +
    changeset +
    `--${batchBoundary}--\r\n`;

  return { batchBoundary, body, operationCount: topics.length + questions.length };
}

function parseBatchStatusLines(text) {
  const statuses = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^HTTP\/1\.1\s+(\d+)/);
    if (m) statuses.push(Number(m[1]));
  }
  return statuses;
}

function rowShapeIssues(kind, fields, row, expected) {
  const missingFields = [];
  const differingFields = [];
  for (const field of fields) {
    if (row[field] === undefined || row[field] === null) {
      // Allow null summary-like absences only when not in expected
      if (expected[field] !== undefined && expected[field] !== null) missingFields.push(field);
      else if (expected[field] === undefined) {
        // required SCHEMA fields must be present even if value is false/0
        if (row[field] === undefined) missingFields.push(field);
      }
      continue;
    }
    if (expected[field] !== undefined && norm(row[field]) !== norm(expected[field])) {
      differingFields.push({ field, expected: expected[field], actual: row[field] });
    }
  }
  return { missingFields, differingFields };
}

const interviewId = data.input.interviewId;
if (!interviewId) {
  throw new Error('interviewId is required (use a disposable open interview)');
}

const topicCount = Number(data.input.topicCount != null ? data.input.topicCount : 2);
const questionsPerTopic = Number(
  data.input.questionsPerTopic != null ? data.input.questionsPerTopic : 2,
);
const cleanup = data.input.cleanup === false || data.input.cleanup === 'false' ? false : true;

const dataverseUrl = (data.auth.dataverseUrl || '').replace(/\/+$/, '');
const token = await getToken(data, dataverseUrl);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const topics = [];
const questions = [];
for (let t = 1; t <= topicCount; t++) {
  const id = guid();
  topics.push({
    id,
    name: `SLIM-SPIKE ${stamp} T${t}`,
    description: 'Dataverse Slim batch spike — safe to delete',
    order: 9000 + t,
  });
  for (let q = 1; q <= questionsPerTopic; q++) {
    questions.push({
      topicId: id,
      order: q,
      text: `Spike question T${t}Q${q} (${stamp})`,
    });
  }
}

const { batchBoundary, body, operationCount } = buildBatch({
  topics,
  questions,
  interviewId,
  questionsPerTopic,
});

const t0 = Date.now();
const batchRes = await dv(data, token, {
  method: 'POST',
  path: '/$batch',
  headers: { 'Content-Type': `multipart/mixed;boundary=${batchBoundary}` },
  body,
  rawBody: true,
});
const partStatuses = parseBatchStatusLines(batchRes.text);
const batchResult = {
  batchHttpStatus: batchRes.status,
  ms: Date.now() - t0,
  operationCount,
  partStatuses,
  allPartsOk: partStatuses.length > 0 && partStatuses.every((s) => s >= 200 && s < 300),
  bodyPreview: String(batchRes.text || '').slice(0, 1500),
};

const topicSelect = TOPIC_FIELDS.join(',');
const questionSelect = QUESTION_FIELDS.join(',');
const topicFilter = encodeURIComponent(
  topics.map((t) => `ckr_interviewtopicid eq ${t.id}`).join(' or '),
);
const confirmTopics = await dv(data, token, {
  path: `/ckr_interviewtopics?$filter=${topicFilter}&$select=${topicSelect}&$orderby=ckr_order asc`,
});

const topicRows = (confirmTopics.json && confirmTopics.json.value) || [];
const questionRowsByTopic = {};
for (const topic of topics) {
  const qs = await dv(data, token, {
    path: `/ckr_questions?$filter=${encodeURIComponent(`_ckr_topic_value eq ${topic.id}`)}&$select=${questionSelect}&$orderby=ckr_order asc`,
  });
  questionRowsByTopic[topic.id] = {
    status: qs.status,
    rows: (qs.json && qs.json.value) || [],
  };
}

const topicIssues = [];
for (const planned of topics) {
  const row = topicRows.find((r) => String(r[SCHEMA.topic.id]) === String(planned.id));
  if (!row) {
    topicIssues.push({ id: planned.id, error: 'missing after batch' });
    continue;
  }
  const expected = {
    [SCHEMA.topic.id]: planned.id,
    [SCHEMA.topic.name]: planned.name,
    [SCHEMA.topic.order]: planned.order,
    [SCHEMA.topic.status]: STATUS.topic.pending,
    [SCHEMA.topic.interviewLookupValue]: interviewId,
  };
  const issues = rowShapeIssues('topic', TOPIC_FIELDS, row, expected);
  if (issues.missingFields.length || issues.differingFields.length) {
    topicIssues.push({ id: planned.id, ...issues, row });
  }
}

const questionIssues = [];
let questionCountOk = true;
for (const planned of topics) {
  const pack = questionRowsByTopic[planned.id] || { rows: [] };
  if (pack.rows.length !== questionsPerTopic) questionCountOk = false;
  const plannedQs = questions.filter((q) => q.topicId === planned.id);
  for (const pq of plannedQs) {
    const row = pack.rows.find((r) => Number(r[SCHEMA.question.order]) === pq.order);
    if (!row) {
      questionIssues.push({ topicId: planned.id, order: pq.order, error: 'missing after batch' });
      continue;
    }
    const expected = {
      [SCHEMA.question.text]: pq.text,
      [SCHEMA.question.order]: pq.order,
      [SCHEMA.question.status]: STATUS.question.pending,
      [SCHEMA.question.isAnswered]: false,
      [SCHEMA.question.interviewLookupValue]: interviewId,
      [SCHEMA.question.topicLookupValue]: planned.id,
    };
    // id must exist but is server/client assigned — require presence only
    const fieldsForDiff = QUESTION_FIELDS.filter((f) => f !== SCHEMA.question.id);
    const issues = rowShapeIssues('question', fieldsForDiff, row, expected);
    if (row[SCHEMA.question.id] === undefined || row[SCHEMA.question.id] === null) {
      issues.missingFields.push(SCHEMA.question.id);
    }
    if (issues.missingFields.length || issues.differingFields.length) {
      questionIssues.push({
        topicId: planned.id,
        questionId: row[SCHEMA.question.id],
        order: pq.order,
        ...issues,
      });
    }
  }
}

const shapeMatch =
  batchResult.allPartsOk &&
  topicRows.length === topicCount &&
  questionCountOk &&
  topicIssues.length === 0 &&
  questionIssues.length === 0;

const fingerprint = {
  topicCount: topicRows.length,
  expectedTopicCount: topicCount,
  questionsPerTopic,
  topics: topicRows.map((t) => ({
    id: t[SCHEMA.topic.id],
    order: Number(t[SCHEMA.topic.order]),
    status: Number(t[SCHEMA.topic.status]),
    interviewLookup: t[SCHEMA.topic.interviewLookupValue],
    questionCount: (questionRowsByTopic[t[SCHEMA.topic.id]] || { rows: [] }).rows.length,
    questionLookups: ((questionRowsByTopic[t[SCHEMA.topic.id]] || { rows: [] }).rows || []).map(
      (q) => ({
        id: q[SCHEMA.question.id],
        order: Number(q[SCHEMA.question.order]),
        status: Number(q[SCHEMA.question.status]),
        topicLookup: q[SCHEMA.question.topicLookupValue],
        interviewLookup: q[SCHEMA.question.interviewLookupValue],
      }),
    ),
  })),
};

const cleanupLog = [];
if (cleanup) {
  for (const topic of topics) {
    const qs = await dv(data, token, {
      path: `/ckr_questions?$filter=${encodeURIComponent(`_ckr_topic_value eq ${topic.id}`)}&$select=ckr_questionid`,
    });
    for (const row of (qs.json && qs.json.value) || []) {
      const del = await dv(data, token, {
        method: 'DELETE',
        path: `/ckr_questions(${row.ckr_questionid})`,
      });
      cleanupLog.push({ type: 'question', id: row.ckr_questionid, status: del.status });
    }
    const delT = await dv(data, token, {
      method: 'DELETE',
      path: `/ckr_interviewtopics(${topic.id})`,
    });
    cleanupLog.push({ type: 'topic', id: topic.id, status: delT.status });
  }
}

return {
  interviewId,
  dataverseUrl,
  planned: {
    topics: topics.map((t) => ({ id: t.id, name: t.name, order: t.order })),
    questionCount: questions.length,
    cleanup,
  },
  batch: batchResult,
  parity: {
    shapeMatch,
    readyToReplaceGenerationCreates: shapeMatch,
    topicIssues: topicIssues.slice(0, 20),
    questionIssues: questionIssues.slice(0, 20),
  },
  fingerprint,
  cleanupLog: cleanup ? cleanupLog : null,
  gate: shapeMatch
    ? 'PASS — $batch rows have the SCHEMA fields / lookups / statuses generation needs; safe to wire into save_topics_and_questions after a Dev smoke test.'
    : 'FAIL — do not replace sequential creates yet; inspect parity.topicIssues / questionIssues.',
};
