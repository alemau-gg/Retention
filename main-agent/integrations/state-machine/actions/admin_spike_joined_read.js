// Admin spike (SE-3215 item 7): compare today's multi-GET child loader against
// FetchXML / $expand joined reads for one interview. Uses the same Dataverse
// connection auth as every other Knowledge Retention Backend action.
// Not part of the employee interview path.

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
  const response = await ld.request({
    url: `${data.auth.dataverseUrl}/api/data/v9.2${path}`,
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    },
  });
  return response;
}

async function resolveInterviewId(data, token) {
  const interviewId = data.input.interviewId;
  if (interviewId) return interviewId;

  const employeeEmail = data.input.employeeEmail;
  if (!employeeEmail) {
    throw new Error('Provide interviewId or employeeEmail');
  }

  const filter = encodeURIComponent(
    `ckr_employeeemail eq '${escapeOData(employeeEmail)}' and ckr_interviewstatus lt 60`,
  );
  const res = await dv(data, token, {
    path: `/ckr_interviews?$filter=${filter}&$orderby=createdon desc&$top=1&$select=ckr_interviewid,ckr_interviewnumber,ckr_interviewstatus,ckr_employeeemail`,
  });
  if (res.status !== 200 || !res.json || !res.json.value || !res.json.value.length) {
    const detail = (res.json && res.json.error && res.json.error.message) || res.text || '';
    throw new Error(failureMessage(res.status, detail || `No open interview for ${employeeEmail}`));
  }
  return res.json.value[0].ckr_interviewid;
}

async function baselineLoader(data, token, interviewId) {
  const t0 = Date.now();
  const interview = await dv(data, token, { path: `/ckr_interviews(${interviewId})` });
  const topics = await dv(data, token, {
    path: `/ckr_interviewtopics?$filter=${encodeURIComponent(`_ckr_interview_value eq ${interviewId}`)}`,
  });
  const questions = await dv(data, token, {
    path: `/ckr_questions?$filter=${encodeURIComponent(`_ckr_interview_value eq ${interviewId}`)}`,
  });
  const answers = await dv(data, token, {
    path: `/ckr_answers?$filter=${encodeURIComponent(`_ckr_interview_value eq ${interviewId}`)}`,
  });
  return {
    httpCalls: 4,
    ms: Date.now() - t0,
    interviewOk: interview.status === 200,
    topics: topics.json && topics.json.value ? topics.json.value.length : null,
    questions: questions.json && questions.json.value ? questions.json.value.length : null,
    answers: answers.json && answers.json.value ? answers.json.value.length : null,
    statuses: {
      interview: interview.status,
      topics: topics.status,
      questions: questions.status,
      answers: answers.status,
    },
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

async function fetchXmlJoined(data, token, interviewId, withAnswers) {
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
  const res = await dv(data, token, {
    path: `/ckr_interviews?fetchXml=${encodeURIComponent(fetchXml)}`,
  });
  const rows = (res.json && res.json.value) || [];
  const topics = uniqueBy(
    rows
      .map((r) => ({
        ckr_interviewtopicid: r['topic.ckr_interviewtopicid'] || r.ckr_interviewtopicid,
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
    ms: Date.now() - t0,
    error: res.status !== 200 ? String(res.text || '').slice(0, 800) : null,
    rowCount: rows.length,
    topics: topics.length,
    questions: questions.length,
    answers: answers ? answers.length : 'n/a',
    sampleAliases: rows[0]
      ? Object.keys(rows[0])
          .filter((k) => k.indexOf('.') >= 0)
          .slice(0, 20)
      : [],
  };
}

async function expandAttempt(data, token, interviewId, expandExpr) {
  const t0 = Date.now();
  const res = await dv(data, token, {
    path: `/ckr_interviews(${interviewId})?$expand=${encodeURIComponent(expandExpr)}`,
  });
  return {
    label: `$expand ${expandExpr}`,
    status: res.status,
    httpCalls: 1,
    ms: Date.now() - t0,
    error:
      res.status !== 200
        ? String((res.json && res.json.error && res.json.error.message) || res.text || '').slice(0, 800)
        : null,
    keys:
      res.status === 200 && res.json
        ? Object.keys(res.json).filter((k) => k.charAt(0) !== '@')
        : [],
  };
}

const dataverseUrl = (data.auth.dataverseUrl || '').replace(/\/+$/, '');
const token = await getToken(data, dataverseUrl);
const interviewId = await resolveInterviewId(data, token);

const expandCandidates = [
  'ckr_interviewtopics',
  'ckr_InterviewTopics',
  'ckr_ckr_interview_ckr_interviewtopic',
  'ckr_interview_ckr_interviewtopic',
];

const expandResults = [];
for (const expr of expandCandidates) {
  expandResults.push(await expandAttempt(data, token, interviewId, expr));
}

return {
  interviewId,
  dataverseUrl,
  baseline: await baselineLoader(data, token, interviewId),
  fetchXmlTopicsQuestions: await fetchXmlJoined(data, token, interviewId, false),
  fetchXmlWithAnswers: await fetchXmlJoined(data, token, interviewId, true),
  expandProbes: expandResults,
  passCriteria: [
    'FetchXML topics+questions status 200 and topic/question counts match baseline',
    'FetchXML + answers either matches answers count OR fails with a clear relationship error',
    'Note which $expand candidate (if any) works for wiring into get_runtime_state later',
  ],
};
