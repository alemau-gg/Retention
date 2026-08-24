// Retention Agent Admin — SE-3215 item 7: FetchXML vs 3-GET loadChildren parity.
// Gate PASS → wired into KnowledgeRetentionUtils.loadChildren. Keep for regressions
// after schema / loader changes. Dataverse app-only auth on this integration only.
// Not on the employee interview path.

const SCHEMA = {
  topic: {
    id: 'ckr_interviewtopicid',
    name: 'ckr_name',
    order: 'ckr_order',
    status: 'ckr_topicstatus',
    summary: 'ckr_summarytext',
    summaryStatus: 'ckr_summarystatus',
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
  answer: {
    id: 'ckr_answerid',
    text: 'ckr_confirmedanswer',
    rawUserMessages: 'ckr_rawusermessages',
    sequence: 'ckr_answersequence',
    isLatest: 'ckr_islatest',
    questionLookupValue: '_ckr_question_value',
    interviewLookupValue: '_ckr_interview_value',
  },
};

const STATUS = {
  topic: { summarized: 30 },
  question: { answered: 40 },
};

const TOPIC_FIELDS = Object.values(SCHEMA.topic);
const QUESTION_FIELDS = Object.values(SCHEMA.question);
const ANSWER_FIELDS = Object.values(SCHEMA.answer);

function failureMessage(status, detail) {
  const code = status === null || status === undefined || status === '' ? 'not reported' : String(status);
  const message = detail === null || detail === undefined ? '' : String(detail);
  if (status === 429 || Number(status) === 429) {
    return `The save or request was not completed due to temporary rate limiting. Please retry shortly. When you contact your administrator, please pass on these details: the action that returned the error is "admin_spike_joined_read", the error code is ${code}, and the error returned by the API is: ${message}`;
  }
  return `An error occurred while connecting to the knowledge retention system. Please contact your administrator. When you contact them, please pass on these details: the action that returned the error is "admin_spike_joined_read", the error code is ${code}, and the error returned by the API is: ${message}`;
}

function escapeOData(value) {
  return String(value).replace(/'/g, "''");
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

async function dv(data, token, { method = 'GET', path }) {
  return ld.request({
    url: `${data.auth.dataverseUrl}/api/data/v9.2${path}`,
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    },
  });
}

async function resolveInterviewId(data, token) {
  const interviewId = data.input.interviewId;
  if (interviewId) return interviewId;
  const employeeEmail = data.input.employeeEmail;
  if (!employeeEmail) throw new Error('Provide interviewId or employeeEmail');
  const filter = encodeURIComponent(
    `ckr_employeeemail eq '${escapeOData(employeeEmail)}' and ckr_interviewstatus lt 60`,
  );
  const res = await dv(data, token, {
    path: `/ckr_interviews?$filter=${filter}&$orderby=createdon desc&$top=1&$select=ckr_interviewid`,
  });
  if (res.status !== 200 || !res.json || !res.json.value || !res.json.value.length) {
    const detail = (res.json && res.json.error && res.json.error.message) || res.text || '';
    throw new Error(failureMessage(res.status, detail || `No open interview for ${employeeEmail}`));
  }
  return res.json.value[0].ckr_interviewid;
}

function pick(row, fields) {
  const out = {};
  for (const field of fields) out[field] = row ? row[field] : undefined;
  return out;
}

async function baselineLoadChildren(data, token, interviewId) {
  const t0 = Date.now();
  const topicSelect = TOPIC_FIELDS.join(',');
  const questionSelect = QUESTION_FIELDS.join(',');
  const answerSelect = ANSWER_FIELDS.join(',');
  const topics = await dv(data, token, {
    path: `/ckr_interviewtopics?$filter=${encodeURIComponent(`_ckr_interview_value eq ${interviewId}`)}&$orderby=ckr_order asc&$select=${topicSelect}`,
  });
  const questions = await dv(data, token, {
    path: `/ckr_questions?$filter=${encodeURIComponent(`_ckr_interview_value eq ${interviewId}`)}&$orderby=ckr_order asc&$select=${questionSelect}`,
  });
  const answers = await dv(data, token, {
    path: `/ckr_answers?$filter=${encodeURIComponent(`_ckr_interview_value eq ${interviewId}`)}&$select=${answerSelect}`,
  });
  if (topics.status !== 200 || questions.status !== 200 || answers.status !== 200) {
    throw new Error(
      failureMessage(
        topics.status !== 200 ? topics.status : questions.status !== 200 ? questions.status : answers.status,
        'Baseline loadChildren failed',
      ),
    );
  }
  return {
    ms: Date.now() - t0,
    httpCalls: 3,
    topics: (topics.json && topics.json.value) || [],
    questions: (questions.json && questions.json.value) || [],
    answers: (answers.json && answers.json.value) || [],
  };
}

function uniqueBy(rows, idField) {
  const map = new Map();
  for (const row of rows) {
    const id = row[idField];
    if (id && !map.has(id)) map.set(id, row);
  }
  return Array.from(map.values());
}

function alias(row, prefix, field) {
  if (!row) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, `${prefix}.${field}`)) {
    return row[`${prefix}.${field}`];
  }
  if (prefix === 'topic' && field === 'ckr_interviewtopicid' && row.ckr_interviewtopicid) {
    return row.ckr_interviewtopicid;
  }
  return undefined;
}

// FetchXML omits attributes whose value is null; OData $select returns null.
// Coerce missing aliases to null so shape parity matches the 3-GET loader.
function aliasOrNull(row, prefix, field) {
  const value = alias(row, prefix, field);
  return value === undefined ? null : value;
}

async function fetchXmlLoadChildren(data, token, interviewId) {
  const fetchXml = `
<fetch>
  <entity name="ckr_interview">
    <attribute name="ckr_interviewid" />
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
        <attribute name="ckr_order" />
        <attribute name="ckr_status" />
        <attribute name="ckr_isanswered" />
        <link-entity name="ckr_answer" from="ckr_question" to="ckr_questionid" link-type="outer" alias="answer">
          <attribute name="ckr_answerid" />
          <attribute name="ckr_confirmedanswer" />
          <attribute name="ckr_rawusermessages" />
          <attribute name="ckr_answersequence" />
          <attribute name="ckr_islatest" />
        </link-entity>
      </link-entity>
    </link-entity>
  </entity>
</fetch>`.trim();

  const t0 = Date.now();
  const res = await dv(data, token, {
    path: `/ckr_interviews?fetchXml=${encodeURIComponent(fetchXml)}`,
  });
  if (res.status !== 200) {
    return {
      ms: Date.now() - t0,
      httpCalls: 1,
      status: res.status,
      error: String(res.text || '').slice(0, 800),
      topics: [],
      questions: [],
      answers: [],
    };
  }

  const rows = (res.json && res.json.value) || [];
  const topics = uniqueBy(
    rows
      .map((r) => {
        const id = alias(r, 'topic', 'ckr_interviewtopicid');
        if (!id) return null;
        return {
          ckr_interviewtopicid: id,
          ckr_name: aliasOrNull(r, 'topic', 'ckr_name'),
          ckr_order: aliasOrNull(r, 'topic', 'ckr_order'),
          ckr_topicstatus: aliasOrNull(r, 'topic', 'ckr_topicstatus'),
          ckr_summarytext: aliasOrNull(r, 'topic', 'ckr_summarytext'),
          ckr_summarystatus: aliasOrNull(r, 'topic', 'ckr_summarystatus'),
          _ckr_interview_value: interviewId,
        };
      })
      .filter(Boolean),
    'ckr_interviewtopicid',
  );

  const questions = uniqueBy(
    rows
      .map((r) => {
        const questionId = alias(r, 'question', 'ckr_questionid');
        const topicId = alias(r, 'topic', 'ckr_interviewtopicid');
        if (!questionId) return null;
        return {
          ckr_questionid: questionId,
          ckr_questiontext: aliasOrNull(r, 'question', 'ckr_questiontext'),
          ckr_order: aliasOrNull(r, 'question', 'ckr_order'),
          ckr_status: aliasOrNull(r, 'question', 'ckr_status'),
          ckr_isanswered: aliasOrNull(r, 'question', 'ckr_isanswered'),
          _ckr_interview_value: interviewId,
          _ckr_topic_value: topicId || null,
        };
      })
      .filter(Boolean),
    'ckr_questionid',
  );

  const answers = uniqueBy(
    rows
      .map((r) => {
        const id = alias(r, 'answer', 'ckr_answerid');
        const questionId = alias(r, 'question', 'ckr_questionid');
        if (!id) return null;
        return {
          ckr_answerid: id,
          ckr_confirmedanswer: aliasOrNull(r, 'answer', 'ckr_confirmedanswer'),
          ckr_rawusermessages: aliasOrNull(r, 'answer', 'ckr_rawusermessages'),
          ckr_answersequence: aliasOrNull(r, 'answer', 'ckr_answersequence'),
          ckr_islatest: aliasOrNull(r, 'answer', 'ckr_islatest'),
          _ckr_interview_value: interviewId,
          _ckr_question_value: questionId || null,
        };
      })
      .filter(Boolean),
    'ckr_answerid',
  );

  return {
    ms: Date.now() - t0,
    httpCalls: 1,
    status: 200,
    error: null,
    topics,
    questions,
    answers,
  };
}

function compareCollections(kind, fields, idField, baselineRows, candidateRows) {
  const baseMap = new Map(baselineRows.map((r) => [String(r[idField]), r]));
  const candMap = new Map(candidateRows.map((r) => [String(r[idField]), r]));
  const missingInCandidate = [];
  const missingInBaseline = [];
  const fieldDiffs = [];

  for (const id of baseMap.keys()) {
    if (!candMap.has(id)) missingInCandidate.push(id);
  }
  for (const id of candMap.keys()) {
    if (!baseMap.has(id)) missingInBaseline.push(id);
  }

  for (const [id, baseRow] of baseMap.entries()) {
    const candRow = candMap.get(id);
    if (!candRow) continue;
    const differingFields = [];
    for (const field of fields) {
      // FetchXML may omit nulls; treat missing as null for parity with OData.
      const candValue = candRow[field] === undefined ? null : candRow[field];
      const baseValue = baseRow[field] === undefined ? null : baseRow[field];
      if (norm(baseValue) !== norm(candValue)) {
        differingFields.push({
          field,
          baseline: baseRow[field],
          fetchXml: candRow[field],
        });
      }
    }
    if (differingFields.length) {
      fieldDiffs.push({
        id,
        differingFields: differingFields.slice(0, 12),
      });
    }
  }

  return {
    kind,
    baselineCount: baselineRows.length,
    fetchXmlCount: candidateRows.length,
    countsMatch: baselineRows.length === candidateRows.length,
    missingInCandidate: missingInCandidate.slice(0, 20),
    missingInBaseline: missingInBaseline.slice(0, 20),
    mismatchedRows: fieldDiffs.slice(0, 20),
    shapeMatch:
      missingInCandidate.length === 0 &&
      missingInBaseline.length === 0 &&
      fieldDiffs.length === 0,
  };
}

function isAnswered(question, answers) {
  if (Number(question[SCHEMA.question.status]) === STATUS.question.answered) return true;
  return answers.some(
    (answer) => answer[SCHEMA.answer.questionLookupValue] === question[SCHEMA.question.id],
  );
}

function latestAnswer(answers, questionId) {
  const rows = answers.filter((row) => row[SCHEMA.answer.questionLookupValue] === questionId);
  if (!rows.length) return null;
  const bySequenceDesc = (a, b) =>
    Number(b[SCHEMA.answer.sequence] || 0) - Number(a[SCHEMA.answer.sequence] || 0);
  const flagged = rows.filter((row) => row[SCHEMA.answer.isLatest] === true);
  return (flagged.length ? flagged : rows).sort(bySequenceDesc)[0];
}

function questionsForTopic(questions, topicId) {
  return questions
    .filter((q) => q[SCHEMA.question.topicLookupValue] === topicId)
    .sort((a, b) => Number(a[SCHEMA.question.order]) - Number(b[SCHEMA.question.order]));
}

function activeTopic(topics) {
  const pending = topics
    .filter((topic) => Number(topic[SCHEMA.topic.status]) < STATUS.topic.summarized)
    .sort((a, b) => Number(a[SCHEMA.topic.order]) - Number(b[SCHEMA.topic.order]));
  return pending[0] || null;
}

function activeQuestion(questions, answers, topicId) {
  return (
    questionsForTopic(questions, topicId).find((q) => !isAnswered(q, answers)) || null
  );
}

function topicQnA(questions, answers, topicId) {
  return questionsForTopic(questions, topicId).map((question) => {
    const answer = latestAnswer(answers, question[SCHEMA.question.id]);
    return {
      order: Number(question[SCHEMA.question.order]),
      question: question[SCHEMA.question.text],
      answer: answer ? answer[SCHEMA.answer.text] : null,
      rawUserMessages: answer ? answer[SCHEMA.answer.rawUserMessages] || null : null,
    };
  });
}

function stateFingerprint(children) {
  const topic = activeTopic(children.topics);
  const question = topic
    ? activeQuestion(children.questions, children.answers, topic[SCHEMA.topic.id])
    : null;
  return {
    topicCount: children.topics.length,
    questionCount: children.questions.length,
    answerCount: children.answers.length,
    answeredQuestionCount: children.questions.filter((q) =>
      isAnswered(q, children.answers),
    ).length,
    activeTopic: topic
      ? {
          id: topic[SCHEMA.topic.id],
          order: Number(topic[SCHEMA.topic.order]),
          status: Number(topic[SCHEMA.topic.status]),
          name: topic[SCHEMA.topic.name],
          summaryStatus: topic[SCHEMA.topic.summaryStatus],
        }
      : null,
    activeQuestion: question
      ? {
          id: question[SCHEMA.question.id],
          order: Number(question[SCHEMA.question.order]),
          text: question[SCHEMA.question.text],
          status: Number(question[SCHEMA.question.status]),
          topicId: question[SCHEMA.question.topicLookupValue],
        }
      : null,
    topicQnA: topic ? topicQnA(children.questions, children.answers, topic[SCHEMA.topic.id]) : null,
  };
}

function fingerprintsMatch(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const dataverseUrl = (data.auth.dataverseUrl || '').replace(/\/+$/, '');
const token = await getToken(data, dataverseUrl);
const interviewId = await resolveInterviewId(data, token);

const baseline = await baselineLoadChildren(data, token, interviewId);
const fetchXml = await fetchXmlLoadChildren(data, token, interviewId);

const topicCompare = compareCollections(
  'topics',
  TOPIC_FIELDS,
  SCHEMA.topic.id,
  baseline.topics,
  fetchXml.topics,
);
const questionCompare = compareCollections(
  'questions',
  QUESTION_FIELDS,
  SCHEMA.question.id,
  baseline.questions,
  fetchXml.questions,
);
const answerCompare = compareCollections(
  'answers',
  ANSWER_FIELDS,
  SCHEMA.answer.id,
  baseline.answers,
  fetchXml.answers,
);

const baselineFp = stateFingerprint(baseline);
const fetchXmlFp = stateFingerprint(fetchXml);
const shapeMatch =
  fetchXml.status === 200 &&
  topicCompare.shapeMatch &&
  questionCompare.shapeMatch &&
  answerCompare.shapeMatch;
const fingerprintMatch = fingerprintsMatch(baselineFp, fetchXmlFp);

return {
  interviewId,
  dataverseUrl,
  timing: {
    baselineMs: baseline.ms,
    baselineHttpCalls: baseline.httpCalls,
    fetchXmlMs: fetchXml.ms,
    fetchXmlHttpCalls: fetchXml.httpCalls,
    fetchXmlStatus: fetchXml.status,
    fetchXmlError: fetchXml.error,
  },
  parity: {
    shapeMatch,
    fingerprintMatch,
    readyToReplaceLoadChildren: shapeMatch && fingerprintMatch,
    topics: topicCompare,
    questions: questionCompare,
    answers: answerCompare,
  },
  fingerprints: {
    baseline: baselineFp,
    fetchXml: fetchXmlFp,
  },
  gate: shapeMatch && fingerprintMatch
    ? 'PASS — FetchXML adapter matches baseline loadChildren shape and state fingerprint; safe to wire into loadChildren after sync_helpers.'
    : 'FAIL — do not replace loadChildren yet; inspect parity.*.mismatchedRows / missingFields and fingerprint deltas.',
};
