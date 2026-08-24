// Admin spike (SE-3215 item 8): create throwaway topics + questions via one
// Dataverse $batch changeset, optionally clean them up. Uses the same
// Dataverse connection auth as every other Knowledge Retention Backend action.
// Not part of the employee interview path. Use a disposable interview only.

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
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      hex[i] = '-';
    } else if (i === 14) {
      hex[i] = '4';
    } else if (i === 19) {
      hex[i] = ((Math.random() * 4) | 8).toString(16);
    } else {
      hex[i] = ((Math.random() * 16) | 0).toString(16);
    }
  }
  return hex.join('');
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
      ckr_topicstatus: 10,
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
  headers: {
    'Content-Type': `multipart/mixed;boundary=${batchBoundary}`,
  },
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

const topicFilter = encodeURIComponent(
  topics.map((t) => `ckr_interviewtopicid eq ${t.id}`).join(' or '),
);
const confirmTopics = await dv(data, token, {
  path: `/ckr_interviewtopics?$filter=${topicFilter}&$select=ckr_interviewtopicid,ckr_name,ckr_order`,
});
const confirmOneQuestion = await dv(data, token, {
  path: `/ckr_questions?$filter=${encodeURIComponent(`_ckr_topic_value eq ${topics[0].id}`)}&$select=ckr_questionid,ckr_questiontext,ckr_order,_ckr_topic_value`,
});

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
  confirm: {
    topics: {
      status: confirmTopics.status,
      count: confirmTopics.json && confirmTopics.json.value ? confirmTopics.json.value.length : null,
      rows: confirmTopics.json && confirmTopics.json.value,
    },
    questionsTopic1: {
      status: confirmOneQuestion.status,
      count:
        confirmOneQuestion.json && confirmOneQuestion.json.value
          ? confirmOneQuestion.json.value.length
          : null,
      rows: confirmOneQuestion.json && confirmOneQuestion.json.value,
    },
  },
  cleanupLog: cleanup ? cleanupLog : null,
  passCriteria: [
    'batchHttpStatus === 200',
    'allPartsOk === true',
    `confirmed topic count === ${topicCount}`,
    `questions per topic === ${questionsPerTopic}`,
    cleanup ? 'cleanup deleted rows' : 'cleanup skipped (rows left in place)',
  ],
};
