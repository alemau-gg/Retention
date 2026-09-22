// Self-contained Langdock custom-integration action.
// All required helpers are inlined in this file; it has no runtime dependencies.
const KnowledgeRetentionUtils = {
  // ===========================================================================
  // SCHEMA — every environment-coupled identifier lives here.
  // Reconciled against the source Copilot Studio export (the Power Automate flow
  // JSON in "Retention Agent 2/workflows/"), which is the authoritative schema.
  // Remaining true-unknown to confirm in BASF's environment: the Choice option
  // VALUES for ckr_topicstatus (interview lt 60 and question < 40 are used
  // verbatim by the original flows; consent values are confirmed below).
  // ===========================================================================
  SCHEMA: {
    apiPath: '/api/data/v9.2',
    entitySets: {
      interviews: 'ckr_interviews',
      topics: 'ckr_interviewtopics',
      questions: 'ckr_questions',
      answers: 'ckr_answers',
    },
    interview: {
      id: 'ckr_interviewid',
      number: 'ckr_interviewnumber',
      name: 'ckr_name',
      displayName: 'ckr_employeedisplayname',
      // Schema assumption: no live Dataverse metadata is available locally.
      // cr32c_aisuiteid is the proposed logical name for the Langdock
      // stable-user-ID column and must remain a text field until confirmed.
      userId: 'cr32c_aisuiteid',
      email: 'ckr_employeeemail',
      language: 'ckr_language',
      status: 'ckr_interviewstatus',
      consentStatus: 'ckr_knowledgeprefillconsent',
      folderUrl: 'ckr_sharepointfolderurl',
      completedOn: 'ckr_completedon',
      lastCheckpointOn: 'ckr_lastcheckpointon',
      role: 'ckr_roletitle',
      businessUnit: 'ckr_businessunit',
      responsibilities: 'ckr_responsibilities',
      tools: 'ckr_toolsandapplications',
      focusTopics: 'ckr_focustopics',
      kpisAndConstraints: 'ckr_keykpisandconstraints',
      questionsGenerated: 'ckr_questionsgenerated',
      totalQuestions: 'ckr_totalquestions',
      answeredQuestions: 'ckr_answeredquestions',
      openQuestionCount: 'ckr_openquestioncount',
      progress: 'ckr_progress',
      currentTopicOrder: 'ckr_currenttopicorder',
      currentQuestionOrder: 'ckr_currentquestionorder',
      feedbackHelpfulness: 'ckr_userfeedback',
      feedbackIntuitiveness: 'ckr_userfeedbackq2',
      feedbackImprovement: 'ckr_userfeedbackq3',
    },
    topic: {
      id: 'ckr_interviewtopicid',
      name: 'ckr_name',
      description: 'ckr_description',
      order: 'ckr_order',
      status: 'ckr_topicstatus',
      summary: 'ckr_summarytext',
      summaryStatus: 'ckr_summarystatus',
      summaryConfirmedOn: 'ckr_summaryconfirmedon',
      isCompleted: 'ckr_iscompleted',
      totalQuestions: 'ckr_totalquestions',
      answeredQuestions: 'ckr_answeredquestions',
      lastQuestionOrder: 'ckr_lastquestionorder',
      interviewLookupValue: '_ckr_interview_value',
      // Single-valued navigation property used for @odata.bind on create.
      interviewBind: 'ckr_Interview',
    },
    question: {
      id: 'ckr_questionid',
      name: 'ckr_name',
      text: 'ckr_questiontext',
      order: 'ckr_order',
      status: 'ckr_status',
      isAnswered: 'ckr_isanswered',
      isMandatory: 'ckr_ismandatory',
      interviewLookupValue: '_ckr_interview_value',
      topicLookupValue: '_ckr_topic_value',
      // Single-valued nav properties for @odata.bind on create. Confirmed in the
      // generate flow: each question binds BOTH ckr_Interview and ckr_Topic, so
      // questions carry a direct interview lookup and are queryable by interview
      // GUID (ownership chains down).
      interviewBind: 'ckr_Interview',
      topicBind: 'ckr_Topic',
    },
    // Answers are versioned, never overwritten: each save/revise appends a row
    // with answersequence++ and islatest=true, flipping prior rows to false.
    answer: {
      id: 'ckr_answerid',
      name: 'ckr_name',
      // text = the confirmed/cleaned answer we present and summarize from.
      text: 'ckr_confirmedanswer',
      confirmedAnswer: 'ckr_confirmedanswer',
      answerText: 'ckr_answertext',
      rawUserMessages: 'ckr_rawusermessages',
      answeredOn: 'ckr_answeredon',
      sequence: 'ckr_answersequence',
      isLatest: 'ckr_islatest',
      questionBind: 'ckr_Question',
      interviewBind: 'ckr_Interview',
      questionLookupValue: '_ckr_question_value',
      interviewLookupValue: '_ckr_interview_value',
    },
  },

  // Status enums mirror the original Copilot Studio state machine exactly.
  STATUS: {
    // Mirrors the ckr_interviewstatus picklist. 40 (In Progress) and 50 (Awaiting
    // Confirmation) exist in Dataverse but this integration never writes them:
    // question-level state already covers that granularity. 70 IS used — it marks
    // the final handover document as filed, which is how a resumed session knows.
    interview: { created: 10, discovery: 20, generated: 30, finalized: 60, documentGenerated: 70, cancelled: 80 },
    topic: { pending: 10, readyForSummary: 20, summarized: 30 },
    question: { pending: 10, active: 20, answered: 40 },
    // Confirmed from KR_V2_SaveKnowledgePrefillConsent: @if(boolean, 20, 30) —
    // an explicit YES writes 20 (accepted), NO writes 30 (declined). notAsked=10
    // is the unset default (the only consent value not directly in the flow).
    consent: { notAsked: 10, accepted: 20, declined: 30 },
    // ckr_summarystatus is a SEPARATE choice from ckr_topicstatus (confirmed in
    // the export): a topic summary is Draft until approved (1=Confirmed), and
    // revise_answer flips a confirmed summary back to 2=NeedsReview.
    summary: { draft: 0, confirmed: 1, needsReview: 2 },
  },

  // Verbatim user-facing content ported from the original topic dialogs. The
  // assistant renders these in the interview language with meaning preserved.
  MESSAGES: {
    languageSelection:
      "Which language would you like to use for this interview?",
    languageChoices: ['English', 'German', 'Chinese', 'French', 'Spanish', 'Portuguese'],
    existingInterview:
      'I found an existing interview. You need to complete the open interview before you can start a new one.',
    consentOffer:
      'I can search your SharePoint documents, Teams conversations, and emails to help pre-fill answers during the interview. This can help reduce manual input and allow you to review or enhance existing information instead.',
    consentQuestion:
      'Would you like to enable this functionality for the current interview? Please explicitly confirm or decline.',
    postGeneration:
      'Great, I have prepared the topics and questions for your knowledge retention interview. You do not need to finish in one session: each answer you confirm is saved, so you can pause and resume in a later session and pick up where you left off. Just be sure to confirm the answer you are working on before you stop. I will now begin with the first topic.',
    discoveryIntro:
      "you'll first answer a few questions about your work so relevant topics can be prepared",
    interviewOverview:
      "This interview captures the knowledge a successor will need. It has four stages: choose the language, complete a short discovery about the role, answer focused questions topic by topic, and review the summaries before the final handover. Questions are asked one at a time, and only confirmed information is retained.",
    discoverySaveNotice:
      "The discovery phase is short. The profile is saved together after the phase is complete and you confirm it. I will tell you when discovery is complete; after that, confirmed answers are saved as you go and you can resume in a later session.",
    feedbackQuestions: [
      'How helpful was the Knowledge Retention Agent in documenting your knowledge? (Please rate on a scale of 1 to 5)',
      'How intuitive was the agent to use? (Please rate on a scale of 1 to 5)',
      'What would you like to improve? Which functionality did you miss?',
    ],
    genericError:
      'I am sorry, an error has occurred. Please try again, or resume the interview in a moment.',
    credentialError:
      'I am sorry, an error has occurred while connecting to the knowledge retention system. Please contact your administrator.',
  },

  // The slug this copy is deployed as. Baked in per file so a failure can name the
  // action that produced it; this is the only helper line that differs by copy.
  ACTION_SLUG: 'generate_topic_document',

  // User-facing text for an API failure. Keeps the "contact your administrator"
  // guidance but also hands over the two things an administrator needs to act:
  // which action failed, and what the API actually returned.
  failureMessage(status, detail) {
    const code = status === null || status === undefined || status === '' ? 'not reported' : String(status);
    const message = detail === null || detail === undefined ? '' : String(detail);
    if (status === 429 || Number(status) === 429) {
      return `The save or request was not completed due to temporary rate limiting. Please retry shortly. When you contact your administrator, please pass on these details: the action that returned the error is "${KnowledgeRetentionUtils.ACTION_SLUG}", the error code is ${code}, and the error returned by the API is: ${message}`;
    }
    // Pass the API body through unchanged. Do not rephrase, wrap, or invent a message —
    // the administrator needs exactly what Dataverse / Graph / Azure AD returned.
    return `${KnowledgeRetentionUtils.MESSAGES.credentialError} When you contact them, please pass on these details: the action that returned the error is "${KnowledgeRetentionUtils.ACTION_SLUG}", the error code is ${code}, and the error returned by the API is: ${message}`;
  },

  // ===========================================================================
  // Identity — derived exclusively from the Langdock session. The stable
  // Langdock user ID is authoritative for interview ownership. Email/UPN is
  // retained only as a display/Graph snapshot and for legacy rows.
  // alternativeEmail is deliberately never consulted.
  // ===========================================================================
  resolveIdentity(data, { requireStableId = false } = {}) {
    const user = data.user || {};
    const userId =
      (typeof user.id === 'string' && user.id.trim()) ||
      null;
    const email =
      (typeof user.userPrincipalName === 'string' && user.userPrincipalName.trim()) ||
      (typeof user.email === 'string' && user.email.trim()) ||
      null;
    if (!userId && !email) {
      throw new Error('Unable to determine your identity from the session. Please contact your administrator.');
    }
    if (requireStableId && !userId) {
      throw new Error('Unable to determine the stable user ID from the session. Please contact your administrator.');
    }
    // Do NOT lowercase: the original flows filter ckr_employeeemail on the raw
    // asserted value, and OData `eq` on a string column is case-sensitive in
    // practice. Lowercasing would miss mixed-case stored emails on resume.
    return { userId, email };
  },

  // Escape single quotes for safe interpolation into an OData $filter literal.
  escapeODataLiteral(value) {
    return String(value).replace(/'/g, "''");
  },

  // Map a stored language code to its English name for use in instruction prose.
  languageName(code) {
    const names = { en: 'English', de: 'German', zh: 'Chinese', fr: 'French', es: 'Spanish', pt: 'Portuguese' };
    return names[code] || code || 'the selected language';
  },

  // ===========================================================================
  // Tokens — app-only client-credentials grant, one per resource.
  // ===========================================================================
  async getToken(data, resource) {
    const tenantId = data.auth.tenantId;
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const response = await ld.request({
      url: tokenUrl,
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
      // 400/401 here almost always means an expired or wrong client secret.
      const detail =
        (response.json && (response.json.error_description || response.json.error)) || response.text || '';
      throw new Error(KnowledgeRetentionUtils.failureMessage(response.status, detail));
    }
    return response.json.access_token;
  },

  dataverseToken(data) {
    return KnowledgeRetentionUtils.getToken(data, data.auth.dataverseUrl);
  },

  graphToken(data) {
    return KnowledgeRetentionUtils.getToken(data, 'https://graph.microsoft.com');
  },

  // ===========================================================================
  // Dataverse Web API helper.
  // ===========================================================================
  async dv(data, token, { method, path, body, prefer }) {
    const MAX_RATE_LIMIT_RETRIES = 3;
    const RETRY_FALLBACK_SECONDS = 2;
    const MAX_WAIT_MS = 30000;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      'Content-Type': 'application/json; charset=utf-8',
    };
    if (prefer) {
      headers.Prefer = prefer;
    }
    const expected = {
      GET: [200],
      POST: [200, 201, 204],
      PATCH: [200, 204],
      DELETE: [200, 204],
    }[method];

    let rateLimitRetries = 0;
    while (true) {
      const response = await ld.request({
        url: `${data.auth.dataverseUrl}${KnowledgeRetentionUtils.SCHEMA.apiPath}${path}`,
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      // Dataverse service-protection throttling: honor Retry-After and retry.
      if (response.status === 429) {
        if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
          const detail =
            (response.json && response.json.error && response.json.error.message) ||
            response.text ||
            '';
          throw new Error(KnowledgeRetentionUtils.failureMessage(429, detail));
        }
        rateLimitRetries++;
        const retryAfter = parseInt(
          (response.headers && (response.headers['Retry-After'] || response.headers['retry-after'])) || '',
          10,
        );
        await ld.wait(Math.min((retryAfter && retryAfter > 0 ? retryAfter : RETRY_FALLBACK_SECONDS) * 1000, MAX_WAIT_MS));
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        const detail =
          (response.json && response.json.error && response.json.error.message) ||
          response.text ||
          '';
        throw new Error(KnowledgeRetentionUtils.failureMessage(response.status, detail));
      }
      if (!expected.includes(response.status)) {
        const detail =
          (response.json && response.json.error && response.json.error.message) ||
          response.text ||
          '';
        throw new Error(KnowledgeRetentionUtils.failureMessage(response.status, detail));
      }
      return response.json;
    }
  },

  // Blank, null, or omitted cr32c_aisuiteid means the column was never written.
  // Dataverse omits nulls from GET payloads, so absence and '' are the same case.
  storedUserId(row) {
    const value = row && row[KnowledgeRetentionUtils.SCHEMA.interview.userId];
    if (value === null || value === undefined) return '';
    return String(value).trim();
  },

  // 'stable' — row already has this caller's Langdock id.
  // 'legacy' — ckr_employeeemail is this caller's email and the id was never written.
  // null — a different non-empty id is already stored; never claim that row.
  claimKind(row, identity) {
    const stored = KnowledgeRetentionUtils.storedUserId(row);
    if (identity.userId && stored === identity.userId) return 'stable';
    if (stored) return null;
    const email = row && row[KnowledgeRetentionUtils.SCHEMA.interview.email];
    if (identity.email && typeof email === 'string' && email === identity.email) return 'legacy';
    return null;
  },

  // Email fallback is only a bridge. Once a legacy row is claimed, persist the
  // stable id so the next lookup matches on cr32c_aisuiteid.
  async backfillStableId(data, token, row, identity) {
    if (!identity.userId || KnowledgeRetentionUtils.storedUserId(row)) return row;
    const S = KnowledgeRetentionUtils.SCHEMA;
    await KnowledgeRetentionUtils.dv(data, token, {
      method: 'PATCH',
      path: `/${S.entitySets.interviews}(${row[S.interview.id]})`,
      body: { [S.interview.userId]: identity.userId },
    });
    row[S.interview.userId] = identity.userId;
    return row;
  },

  // Stable id first. Email is consulted only for this caller's own
  // ckr_employeeemail, and only to bridge rows whose id column is still empty.
  // `userId eq null` is intentionally not in the email filter: that predicate
  // misses never-written text columns, which is how in-progress interviews
  // disappeared after the id switch. Rows that already have a different id are
  // skipped in claimKind.
  async findOwnedInterview(data, token, identity, statusFilter) {
    const S = KnowledgeRetentionUtils.SCHEMA;
    const query = async (filter, top) => {
      const result = await KnowledgeRetentionUtils.dv(data, token, {
        method: 'GET',
        path: `/${S.entitySets.interviews}?$filter=${encodeURIComponent(filter)}&$orderby=createdon desc&$top=${top}`,
      });
      return result && result.value ? result.value : [];
    };
    const withStatus = (filter) => (statusFilter ? `${filter} and ${statusFilter}` : filter);

    if (identity.userId) {
      const safeUserId = KnowledgeRetentionUtils.escapeODataLiteral(identity.userId);
      const current = await query(withStatus(`${S.interview.userId} eq '${safeUserId}'`), 1);
      if (current.length > 0) return current[0];
    }
    if (identity.email) {
      const safeEmail = KnowledgeRetentionUtils.escapeODataLiteral(identity.email);
      const candidates = await query(withStatus(`${S.interview.email} eq '${safeEmail}'`), 25);
      for (const row of candidates) {
        const kind = KnowledgeRetentionUtils.claimKind(row, identity);
        if (kind === 'stable') return row;
        if (kind === 'legacy') return KnowledgeRetentionUtils.backfillStableId(data, token, row, identity);
      }
    }
    return null;
  },

  // ===========================================================================
  // State loading — the user's open interview, or the most recent completed one.
  // ===========================================================================
  async loadInterviewRow(data, token, identity, { completed } = {}) {
    const S = KnowledgeRetentionUtils.SCHEMA;
    const ST = KnowledgeRetentionUtils.STATUS;
    // "completed" spans finalized (60) and documentGenerated (70): once the final
    // document is filed the interview is still the row post-finalize actions need.
    // An `eq 60` filter would make a document-generated interview invisible.
    const statusFilter = completed
      ? `${S.interview.status} ge ${ST.interview.finalized} and ${S.interview.status} lt ${ST.interview.cancelled}`
      : `${S.interview.status} lt ${ST.interview.finalized}`;
    return KnowledgeRetentionUtils.findOwnedInterview(data, token, identity, statusFilter);
  },

  // Same ownership rule as loadInterviewRow, without a status gate.
  // Used by get_runtime_state's latest-cancelled guard.
  async loadLatestInterviewRow(data, token, identity) {
    return KnowledgeRetentionUtils.findOwnedInterview(data, token, identity, '');
  },

  // One FetchXML join (SE-3215) instead of three child GETs. FetchXML omits
  // attributes whose value is null; OData returns null — coerce missing aliases
  // to null so computeState / topicQnA see the same shape as the 3-GET loader.
  // Gate: admin_spike_joined_read → parity.readyToReplaceLoadChildren.
  async loadChildren(data, token, interviewId) {
    const S = KnowledgeRetentionUtils.SCHEMA;
    const alias = (row, prefix, field) => {
      if (!row) return undefined;
      const key = `${prefix}.${field}`;
      if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
      // Root entity id may arrive unprefixed on some FetchXML responses.
      if (prefix === 'topic' && field === S.topic.id && row[S.topic.id]) return row[S.topic.id];
      return undefined;
    };
    const aliasOrNull = (row, prefix, field) => {
      const value = alias(row, prefix, field);
      return value === undefined ? null : value;
    };
    const uniqueBy = (rows, idField) => {
      const map = new Map();
      for (const row of rows) {
        const id = row[idField];
        if (id && !map.has(id)) map.set(id, row);
      }
      return Array.from(map.values());
    };

    const fetchXml = `
<fetch>
  <entity name="ckr_interview">
    <attribute name="${S.interview.id}" />
    <filter type="and">
      <condition attribute="${S.interview.id}" operator="eq" value="${interviewId}" />
    </filter>
    <link-entity name="ckr_interviewtopic" from="ckr_interview" to="${S.interview.id}" link-type="outer" alias="topic">
      <attribute name="${S.topic.id}" />
      <attribute name="${S.topic.name}" />
      <attribute name="${S.topic.order}" />
      <attribute name="${S.topic.status}" />
      <attribute name="${S.topic.summary}" />
      <attribute name="${S.topic.summaryStatus}" />
      <link-entity name="ckr_question" from="ckr_topic" to="${S.topic.id}" link-type="outer" alias="question">
        <attribute name="${S.question.id}" />
        <attribute name="${S.question.text}" />
        <attribute name="${S.question.order}" />
        <attribute name="${S.question.status}" />
        <attribute name="${S.question.isAnswered}" />
        <link-entity name="ckr_answer" from="ckr_question" to="${S.question.id}" link-type="outer" alias="answer">
          <attribute name="${S.answer.id}" />
          <attribute name="${S.answer.confirmedAnswer}" />
          <attribute name="${S.answer.rawUserMessages}" />
          <attribute name="${S.answer.sequence}" />
          <attribute name="${S.answer.isLatest}" />
        </link-entity>
      </link-entity>
    </link-entity>
  </entity>
</fetch>`.trim();

    const result = await KnowledgeRetentionUtils.dv(data, token, {
      method: 'GET',
      path: `/${S.entitySets.interviews}?fetchXml=${encodeURIComponent(fetchXml)}`,
    });
    const rows = (result && result.value) || [];

    const topics = uniqueBy(
      rows
        .map((r) => {
          const id = alias(r, 'topic', S.topic.id);
          if (!id) return null;
          return {
            [S.topic.id]: id,
            [S.topic.name]: aliasOrNull(r, 'topic', S.topic.name),
            [S.topic.order]: aliasOrNull(r, 'topic', S.topic.order),
            [S.topic.status]: aliasOrNull(r, 'topic', S.topic.status),
            [S.topic.summary]: aliasOrNull(r, 'topic', S.topic.summary),
            [S.topic.summaryStatus]: aliasOrNull(r, 'topic', S.topic.summaryStatus),
            [S.topic.interviewLookupValue]: interviewId,
          };
        })
        .filter(Boolean),
      S.topic.id,
    ).sort((a, b) => Number(a[S.topic.order]) - Number(b[S.topic.order]));

    const questions = uniqueBy(
      rows
        .map((r) => {
          const questionId = alias(r, 'question', S.question.id);
          const topicId = alias(r, 'topic', S.topic.id);
          if (!questionId) return null;
          return {
            [S.question.id]: questionId,
            [S.question.text]: aliasOrNull(r, 'question', S.question.text),
            [S.question.order]: aliasOrNull(r, 'question', S.question.order),
            [S.question.status]: aliasOrNull(r, 'question', S.question.status),
            [S.question.isAnswered]: aliasOrNull(r, 'question', S.question.isAnswered),
            [S.question.interviewLookupValue]: interviewId,
            [S.question.topicLookupValue]: topicId || null,
          };
        })
        .filter(Boolean),
      S.question.id,
    ).sort((a, b) => Number(a[S.question.order]) - Number(b[S.question.order]));

    const answers = uniqueBy(
      rows
        .map((r) => {
          const id = alias(r, 'answer', S.answer.id);
          const questionId = alias(r, 'question', S.question.id);
          if (!id) return null;
          return {
            [S.answer.id]: id,
            [S.answer.confirmedAnswer]: aliasOrNull(r, 'answer', S.answer.confirmedAnswer),
            [S.answer.rawUserMessages]: aliasOrNull(r, 'answer', S.answer.rawUserMessages),
            [S.answer.sequence]: aliasOrNull(r, 'answer', S.answer.sequence),
            [S.answer.isLatest]: aliasOrNull(r, 'answer', S.answer.isLatest),
            [S.answer.interviewLookupValue]: interviewId,
            [S.answer.questionLookupValue]: questionId || null,
          };
        })
        .filter(Boolean),
      S.answer.id,
    );

    return { topics, questions, answers };
  },

  needsChildren(interview) {
    const S = KnowledgeRetentionUtils.SCHEMA;
    const ST = KnowledgeRetentionUtils.STATUS;
    if (!interview) return false;
    return Number(interview[S.interview.status]) === ST.interview.generated;
  },

  // ===========================================================================
  // The active topic / question are resolved from status columns, never from
  // an LLM-supplied id. Order is guaranteed by the data, not model memory.
  // ===========================================================================
  activeTopic(topics) {
    const ST = KnowledgeRetentionUtils.STATUS;
    const S = KnowledgeRetentionUtils.SCHEMA;
    const pending = topics
      .filter((topic) => Number(topic[S.topic.status]) < ST.topic.summarized)
      .sort((a, b) => Number(a[S.topic.order]) - Number(b[S.topic.order]));
    return pending.length > 0 ? pending[0] : null;
  },

  questionsForTopic(questions, topicId) {
    const S = KnowledgeRetentionUtils.SCHEMA;
    return questions
      .filter((question) => question[S.question.topicLookupValue] === topicId)
      .sort((a, b) => Number(a[S.question.order]) - Number(b[S.question.order]));
  },

  isAnswered(question, answers) {
    const S = KnowledgeRetentionUtils.SCHEMA;
    const ST = KnowledgeRetentionUtils.STATUS;
    if (Number(question[S.question.status]) === ST.question.answered) {
      return true;
    }
    return answers.some((answer) => answer[S.answer.questionLookupValue] === question[S.question.id]);
  },

  activeQuestion(questions, answers, topicId) {
    const topicQuestions = KnowledgeRetentionUtils.questionsForTopic(questions, topicId);
    return topicQuestions.find((question) => !KnowledgeRetentionUtils.isAnswered(question, answers)) || null;
  },

  // Answers are versioned — a question can have several answer rows. The current
  // answer is the one flagged ckr_islatest=true; we fall back to the highest
  // sequence so a missing flag (legacy rows) still resolves deterministically.
  latestAnswer(answers, questionId) {
    const S = KnowledgeRetentionUtils.SCHEMA;
    const rows = answers.filter((row) => row[S.answer.questionLookupValue] === questionId);
    if (rows.length === 0) {
      return null;
    }
    const bySequenceDesc = (a, b) => Number(b[S.answer.sequence] || 0) - Number(a[S.answer.sequence] || 0);
    const flagged = rows.filter((row) => row[S.answer.isLatest] === true);
    return (flagged.length > 0 ? flagged : rows).sort(bySequenceDesc)[0];
  },

  // Distinct answered questions across the interview (not answer rows, which the
  // versioning would overcount). Used for the completion count shown to the user.
  answeredQuestionCount(questions, answers) {
    return questions.filter((question) => KnowledgeRetentionUtils.isAnswered(question, answers)).length;
  },

  // Ordered Q/A pairs for the active topic — lets a fresh conversation resume
  // a summary without prior chat context. Uses the latest answer version.
  topicQnA(questions, answers, topicId) {
    const S = KnowledgeRetentionUtils.SCHEMA;
    return KnowledgeRetentionUtils.questionsForTopic(questions, topicId).map((question) => {
      const answer = KnowledgeRetentionUtils.latestAnswer(answers, question[S.question.id]);
      return {
        order: Number(question[S.question.order]),
        question: question[S.question.text],
        answer: answer ? answer[S.answer.text] : null,
        rawUserMessages: answer ? answer[S.answer.rawUserMessages] || null : null,
      };
    });
  },

  // ===========================================================================
  // computeState — the heart of the protocol. Returns the full flat state plus
  // a backend-authored instruction telling the assistant exactly what to do
  // next. Callers return its fields as explicit top-level keys (no spread).
  // ===========================================================================
  computeState(data, interview, children) {
    const S = KnowledgeRetentionUtils.SCHEMA;
    const ST = KnowledgeRetentionUtils.STATUS;
    const M = KnowledgeRetentionUtils.MESSAGES;
    const prefillEnabled = String(data.auth.prefillEnabled).toLowerCase() === 'true';
    const supportingFileInstruction =
      ' Every file the user attaches is read and then proposed as a supporting document, except a topic-summary draft, a topic document, or the final handover. Require explicit confirmation before upload_document. Only after the interview folder exists (sharePointFolderUrl is present), call upload_document with docType "supporting" and a unique filename. If the folder does not exist yet, explain that documents can be filed after folder setup and keep the attachment available for later. Never generate or upload a supporting file automatically. After a confirmed supporting file is available, treat its contents as interview source material: when mid-question, include relevant facts in finalAnswer only; never put supporting-file facts in rawUserMessages, which must contain only the interviewee messages verbatim. Include relevant facts in every later topic summary and the final handover, naming the source file. Then resume the current step.';

    const base = {
      nextAction: null,
      instruction: null,
      language: null,
      progressLabel: null,
      questionsRemaining: null,
      nextQuestionText: null,
      expectedQuestionOrder: null,
      expectedTopicOrder: null,
      sharePointFolderUrl: null,
      topicQnA: null,
    };

    if (!interview) {
      return Object.assign(base, {
        nextAction: 'CollectProfile',
        instruction: `No interview exists for this user. Before asking anything, give the user a concise overview of the interview: "${M.interviewOverview}" Then always use ask_user_question for exactly one language question, verbatim: "${M.languageSelection}", with the choices ${M.languageChoices.join(', ')}. Do not recommend a language or add another question. After the user picks one, call create_interview with that language. Then explain that ${M.discoveryIntro} and say: "${M.discoverySaveNotice}".${supportingFileInstruction}`,
      });
    }

    const languageCode = interview[S.interview.language] || null;
    const language = KnowledgeRetentionUtils.languageName(languageCode);
    const status = Number(interview[S.interview.status]);
    const folderUrl = interview[S.interview.folderUrl] || null;
    base.language = language;
    base.sharePointFolderUrl = folderUrl;

    if (status === ST.interview.created) {
      return Object.assign(base, {
        nextAction: 'RunPreInterviewDiscovery',
        instruction: `Run pre-interview discovery in ${language}. Collect role, organizational unit, responsibilities, tools, focus topics, and optionally KPIs/constraints. Explain that discovery is complete only after the profile is read back, explicitly confirmed, and saved together. Do not claim the profile is saved before save_discovery succeeds. Ask conversationally; do not invent answers.${supportingFileInstruction}`,
      });
    }

    if (status === ST.interview.discovery) {
      return Object.assign(base, {
        nextAction: 'GenerateTopicsAndQuestions',
        instruction: `The discovery profile is complete and saved. Tell the user clearly that discovery is complete and that the confirmed profile is retained for future sessions. Then load the knowledge-retention-interviewing skill. Using the discovery profile and the CKR Company Context folder, generate 4-6 topics with 3-6 questions each in ${language}. Every highlighted discovery focus topic must have at least one dedicated interview topic whose title names that focus; do not fold a named focus into a catch-all role-overview topic. Then call save_topics_and_questions. Do not ask any interview question yet.${supportingFileInstruction}`,
      });
    }

    const children_ = children || { topics: [], questions: [], answers: [] };
    base.questionsRemaining = children_.questions.filter(
      (question) => !KnowledgeRetentionUtils.isAnswered(question, children_.answers),
    ).length;

    if (status === ST.interview.generated) {
      const consentStatus = Number(interview[S.interview.consentStatus] || ST.consent.notAsked);

      // Consent step — skipped server-side while prefill is disabled.
      if (prefillEnabled && consentStatus === ST.consent.notAsked) {
        return Object.assign(base, {
          nextAction: 'OfferKnowledgePrefillConsent',
          instruction: `In ${language}, first present the topics-and-questions overview if not already shown, then offer prefill verbatim: "${M.consentOffer}" followed by the consent question verbatim: "${M.consentQuestion}". Only call save_consent with consentGranted true on an explicit yes, false on an explicit no. Never infer.${supportingFileInstruction}`,
        });
      }

      const topic = KnowledgeRetentionUtils.activeTopic(children_.topics);

      if (topic) {
        const topicOrder = Number(topic[S.topic.order]);
        const topicStatus = Number(topic[S.topic.status]);
        const question = KnowledgeRetentionUtils.activeQuestion(
          children_.questions,
          children_.answers,
          topic[S.topic.id],
        );

        if (question && topicStatus < ST.topic.readyForSummary) {
          const topicQuestions = KnowledgeRetentionUtils.questionsForTopic(children_.questions, topic[S.topic.id]);
          const answeredCount = topicQuestions.filter((q) =>
            KnowledgeRetentionUtils.isAnswered(q, children_.answers),
          ).length;
          return Object.assign(base, {
            nextAction: 'AskActiveQuestion',
            nextQuestionText: question[S.question.text],
            expectedQuestionOrder: Number(question[S.question.order]),
            expectedTopicOrder: topicOrder,
            progressLabel: `Topic ${topicOrder} of ${children_.topics.length} · question ${answeredCount + 1} of ${topicQuestions.length}`,
            instruction: `Ask the current question for topic "${topic[S.topic.name]}" in ${language}. Present the progressLabel and topic name in bold on its own line, then the question text exactly as provided in nextQuestionText — do not paraphrase or translate the wording you save. At most 3 clarifying follow-ups. Within that cap, follow up much more often than not; each follow-up asks one thing they have not said (assumptions, exceptions, failure cases, who else depends on this, numbers, sequence, what would break if they left); do not repeat them; skip only when the answer already covers those gaps. Then you must confirm and call save_answer. Never a 4th follow-up. Before saving, show a slightly fuller recap of finalAnswer (a short paragraph or a few bullets, not a slogan). Tell them this is only a checkpoint for this question: if it feels tight or restrictive, that is expected; a more detailed summary is written after all questions in this topic. Then get explicit confirmation. Call save_answer with the confirmed answer as finalAnswer, the full chronological transcript of the interviewee's own messages for this question (initial answer plus every follow-up, verbatim, not condensed) as rawUserMessages, expectedQuestionOrder ${Number(question[S.question.order])}, and expectedTopicOrder ${topicOrder}. Do not save on a soft or implicit reply.${supportingFileInstruction}`,
          });
        }

        // All questions answered for this topic → generate/review its summary.
        if (!folderUrl) {
          return Object.assign(base, {
            nextAction: 'SetupInterviewFolder',
            expectedTopicOrder: topicOrder,
            instruction: `All questions for topic "${topic[S.topic.name]}" are answered. Before saving its summary, call set_up_interview_folder once to create the SharePoint folder.${supportingFileInstruction}`,
          });
        }
        const needsReview = Number(topic[S.topic.summaryStatus]) === ST.summary.needsReview;
        const summaryLead = needsReview
          ? `The answers for "${topic[S.topic.name]}" changed, so its previously approved summary must be regenerated.`
          : `All questions for "${topic[S.topic.name]}" are answered and a summary will now be generated for their review.`;
        const topicFileName = KnowledgeRetentionUtils.topicDocumentFileName(topicOrder, topic[S.topic.name]);
        return Object.assign(base, {
          nextAction: 'GenerateOrReviewTopicSummary',
          expectedTopicOrder: topicOrder,
          topicQnA: KnowledgeRetentionUtils.topicQnA(children_.questions, children_.answers, topic[S.topic.id]),
          progressLabel: `Topic ${topicOrder} of ${children_.topics.length} · summary`,
          instruction: `Tell the user in ${language} that ${summaryLead} Load the knowledge-retention-reporting skill and use its default topic-summary workflow. Open references/summary-format.md only; do not open final-document.md, the final-document supporting references, or assets/template.docx. Build a faithful summary from topicQnA (prefer rawUserMessages when present, else the confirmed answer) and from any confirmed supporting files: read those attachments and include every relevant concrete fact, naming the source file. The summary must be exhaustive: one mini-header per answered question. Prefer a short paragraph, then bullets when there are several facts, then a translated For-example from the interviewee (never invented), with line breaks between blocks; leave that shape if a quote, table, or one tight paragraph fits better. Then a short how-this-fits-together paragraph. First draft already this dense and scannable; do not wait for the user to ask for more examples. At least as long as the combined rawUserMessages (or confirmed answers if raw is empty) plus supporting-file facts, no upper word cap. If shorter or missing examples, expand before presenting. Translate every section heading into ${language}. Invent nothing, and use only the sections allowed by summary-format.md. Whenever the Markdown draft is presented, before save, tell them in the interview language that you handle conversion and formatting into Word, and ask them to focus on the contents and adjust those where needed. After the user approves, call save_topic_summary with expectedTopicOrder ${topicOrder} and the exact approved summaryFile, then follow the instruction it returns. Do not write, format, or upload the topic document yourself: generate_topic_document builds "${topicFileName}" from the saved summary server-side, files it in the interview folder, and returns it. Never hand it summary text, a file name, or a folder path.${supportingFileInstruction}`,
        });
      }

      // No pending topic → ready to finalize.
      return Object.assign(base, {
        nextAction: 'FinalizeInterview',
        instruction: `All topics are summarized. Confirm with the user, then call finalize_interview (it requires confirmation).${supportingFileInstruction}`,
      });
    }

    if (status >= ST.interview.finalized && status < ST.interview.cancelled) {
      const feedbackMissing = [
        S.interview.feedbackHelpfulness,
        S.interview.feedbackIntuitiveness,
        S.interview.feedbackImprovement,
      ].every((column) => {
        const value = interview[column];
        return value === null || value === undefined || String(value).trim() === '';
      });

      const feedbackStep = `ask the three feedback questions one at a time in ${language} and call save_feedback, then close with the completed question count and the folder link, reminding them they can share that folder from SharePoint with their manager or anyone else they consider relevant`;
      const closingStep = `restate the closing message with the completed question count and the folder link, remind them they can share that folder from SharePoint with their manager or anyone else they consider relevant, and end`;

      // The interview row records whether the final document was filed:
      // finalize_interview writes finalized (60). generate_final_document, and a
      // legacy upload_document with docType final, advance that interview to
      // documentGenerated (70) once the handover file lands. A resumed session
      // therefore knows the answer instead of asking the user to go and look.
      if (status < ST.interview.documentGenerated) {
        return Object.assign(base, {
          nextAction: 'BuildFinalDocument',
          instruction: `This interview is finalized but its final handover document has not been filed yet. Load the knowledge-retention-reporting skill and open references/final-document.md. Draft the handover as Markdown from get_discovery and get_answers (start from rawUserMessages; if raw is empty or shorter than the confirmed answer, use the longer of the two) and confirmed supporting-file contents. Topic summaries are only a theme checklist and must not shrink the source. The handover must exceed the detail of the topic documents, not shorten them into an executive recap. Each chapter must keep every concrete fact from the longer of rawUserMessages and the confirmed answer, plus relevant supporting-file facts, and must add cross-topic dependencies and successor steps that no single topic summary contains. The executive summary is additional front matter and must not replace or compress the chapters. If a chapter is thinner than the source answers or the topic summaries it covers, expand it before asking for approval. Confirm chapter titles as a map; write chapters scannable like topic summaries (bullets and breaks when useful; leave the shape if it does not fit); show full chapter text before asking approval; after each draft, reread the source answers and add any missing concrete fact or mark it as an open gap. Whenever the Markdown draft is presented, tell the user in ${language} that conversion and formatting into Word is handled after approval, and ask them to focus on the contents. After explicit approval of the full text, call save_final_document with that exact file, then generate_final_document with no arguments. The resulting file is InterviewFinalSummary_${interview[S.interview.number]}.docx. Do not build, format, or upload a Word file. Do not use the BASF document template skill. Do not call upload_document for the handover. After generate_final_document succeeds, ${feedbackMissing ? feedbackStep : closingStep}.${supportingFileInstruction}`,
        });
      }

      return Object.assign(base, {
        nextAction: 'InterviewComplete',
        instruction: feedbackMissing
          ? `This interview is complete and its final handover document is filed; only feedback is missing. Now ${feedbackStep}.${supportingFileInstruction}`
          : `This interview is already complete: the final handover document is filed and feedback is recorded. Just ${closingStep}.${supportingFileInstruction}`,
      });
    }

    return Object.assign(base, {
      nextAction: 'Unknown',
      instruction: `${M.genericError}${supportingFileInstruction}`,
    });
  },

  // ===========================================================================
  // Microsoft Graph helper (app-only). Returns the raw response so callers can
  // treat 404 as a soft signal (folder absent, no manager) rather than an error.
  // Retries 429 with the same budget as Dataverse; 401/403 use failureMessage.
  // ===========================================================================
  topicDocumentFileNameLegacy(order, topicName) {
    const cleaned = String(topicName || '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    const n = Number(order);
    return cleaned ? `Topic-${n} ${cleaned}.docx` : `Topic-${n}.docx`;
  },

  topicDocumentFileName(order, topicName) {
    const slug = String(topicName || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
    const n = Number(order);
    return slug ? `Topic-${n}-${slug}.docx` : `Topic-${n}.docx`;
  },

  interviewFolderPath(interview) {
    const number = interview[KnowledgeRetentionUtils.SCHEMA.interview.number];
    return `Interviews/${number}`;
  },

  async graph(data, token, { method, path, body, headers, isBinary }) {
    const MAX_RATE_LIMIT_RETRIES = 3;
    const RETRY_FALLBACK_SECONDS = 2;
    const MAX_WAIT_MS = 30000;
    const requestHeaders = Object.assign(
      { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      headers || {},
    );
    if (!isBinary && body !== undefined) {
      requestHeaders['Content-Type'] = 'application/json';
    }

    let rateLimitRetries = 0;
    while (true) {
      const response = await ld.request({
        url: `https://graph.microsoft.com/v1.0${path}`,
        method,
        headers: requestHeaders,
        body: isBinary ? body : body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (response.status === 429) {
        if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
          const detail =
            (response.json && response.json.error && response.json.error.message) ||
            response.text ||
            '';
          throw new Error(KnowledgeRetentionUtils.failureMessage(429, detail));
        }
        rateLimitRetries++;
        const retryAfter = parseInt(
          (response.headers && (response.headers['Retry-After'] || response.headers['retry-after'])) || '',
          10,
        );
        await ld.wait(Math.min((retryAfter && retryAfter > 0 ? retryAfter : RETRY_FALLBACK_SECONDS) * 1000, MAX_WAIT_MS));
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        const detail =
          (response.json && response.json.error && response.json.error.message) ||
          response.text ||
          '';
        throw new Error(KnowledgeRetentionUtils.failureMessage(response.status, detail));
      }
      return response;
    }
  },

};

// ===========================================================================
// DOCX generation — self-contained. The Langdock sandbox has no zip, no XML,
// and no Buffer.toString('base64'), so every layer is written by hand:
// UTF-8 encoding, CRC-32, a stored (uncompressed) ZIP, and WordprocessingML.
// ===========================================================================
const DOCX = {
  // A4 with 2 cm margins. Fixed so every topic document looks the same.
  PAGE: { width: 11906, height: 16838, margin: 1134 },
  ACCENT: '004A96',
  MUTED: '5A6672',
  RULE: 'C7D0D9',
  HEADER_FILL: 'E8EEF5',

  contentWidth() {
    return DOCX.PAGE.width - 2 * DOCX.PAGE.margin;
  },

  // XML 1.0 forbids most C0 control characters outright; they cannot be
  // escaped, only removed, or Word reports the file as corrupt.
  esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  },

  utf8Bytes(text) {
    const source = String(text);
    const out = [];
    for (let i = 0; i < source.length; i++) {
      const code = source.charCodeAt(i);
      if (code < 0x80) {
        out.push(code);
      } else if (code < 0x800) {
        out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code >= 0xd800 && code <= 0xdbff) {
        const low = source.charCodeAt(i + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          const point = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
          out.push(
            0xf0 | (point >> 18),
            0x80 | ((point >> 12) & 0x3f),
            0x80 | ((point >> 6) & 0x3f),
            0x80 | (point & 0x3f),
          );
          i++;
        } else {
          out.push(0xef, 0xbf, 0xbd);
        }
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        out.push(0xef, 0xbf, 0xbd);
      } else {
        out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }
    return out;
  },

  crcTable: null,

  crc32(bytes) {
    if (!DOCX.crcTable) {
      const table = [];
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
      }
      DOCX.crcTable = table;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ DOCX.crcTable[(crc ^ bytes[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  },

  // Stored (method 0) ZIP with a fixed 1980-01-01 DOS timestamp on every
  // entry, so the same input always produces byte-identical output.
  zip(entries) {
    const DOS_TIME = 0;
    const DOS_DATE = 0x0021;
    const out = [];
    const u16 = (target, value) => {
      target.push(value & 0xff, (value >>> 8) & 0xff);
    };
    const u32 = (target, value) => {
      target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
    };
    const central = [];
    for (const entry of entries) {
      const nameBytes = DOCX.utf8Bytes(entry.name);
      const dataBytes = entry.bytes;
      const crc = DOCX.crc32(dataBytes);
      const offset = out.length;

      u32(out, 0x04034b50);
      u16(out, 20);
      u16(out, 0);
      u16(out, 0);
      u16(out, DOS_TIME);
      u16(out, DOS_DATE);
      u32(out, crc);
      u32(out, dataBytes.length);
      u32(out, dataBytes.length);
      u16(out, nameBytes.length);
      u16(out, 0);
      for (let i = 0; i < nameBytes.length; i++) out.push(nameBytes[i]);
      for (let i = 0; i < dataBytes.length; i++) out.push(dataBytes[i]);

      u32(central, 0x02014b50);
      u16(central, 20);
      u16(central, 20);
      u16(central, 0);
      u16(central, 0);
      u16(central, DOS_TIME);
      u16(central, DOS_DATE);
      u32(central, crc);
      u32(central, dataBytes.length);
      u32(central, dataBytes.length);
      u16(central, nameBytes.length);
      u16(central, 0);
      u16(central, 0);
      u16(central, 0);
      u16(central, 0);
      u32(central, 0);
      u32(central, offset);
      for (let i = 0; i < nameBytes.length; i++) central.push(nameBytes[i]);
    }

    const centralOffset = out.length;
    for (let i = 0; i < central.length; i++) out.push(central[i]);
    u32(out, 0x06054b50);
    u16(out, 0);
    u16(out, 0);
    u16(out, entries.length);
    u16(out, entries.length);
    u32(out, central.length);
    u32(out, centralOffset);
    u16(out, 0);
    return out;
  },

  // btoa needs a binary string; chunk it so a large document cannot blow the
  // argument limit of String.fromCharCode.apply.
  base64(bytes) {
    const CHUNK = 0x2000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.slice(i, i + CHUNK));
    }
    return btoa(binary);
  },

  // =========================================================================
  // Markdown → block model. Anything not recognized stays as paragraph text
  // rather than being dropped: a summary must never lose a sentence here.
  // =========================================================================
  splitTableRow(line) {
    let text = line.trim();
    if (text.startsWith('|')) text = text.slice(1);
    if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
    const cells = [];
    let current = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\\' && text[i + 1] === '|') {
        current += '|';
        i++;
        continue;
      }
      if (ch === '|') {
        cells.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  },

  isTableSeparator(line) {
    if (!line || line.indexOf('-') < 0 || line.indexOf('|') < 0) return false;
    return DOCX.splitTableRow(line).every((cell) => /^:?-{1,}:?$/.test(cell.trim()));
  },

  cellAlignment(cell) {
    const text = cell.trim();
    const left = text.startsWith(':');
    const right = text.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  },

  parseBlocks(markdown) {
    const lines = String(markdown === null || markdown === undefined ? '' : markdown)
      .replace(/\r\n?/g, '\n')
      .replace(/\t/g, '    ')
      .split('\n');
    const blocks = [];
    let paragraph = null;
    let list = null;

    const closeParagraph = () => {
      if (paragraph && paragraph.text.trim()) blocks.push({ type: 'paragraph', text: paragraph.text });
      paragraph = null;
    };
    const closeList = () => {
      if (list && list.items.length) blocks.push(list);
      list = null;
    };
    const closeAll = () => {
      closeParagraph();
      closeList();
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      const fence = trimmed.match(/^(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)\s*$/);
      if (fence) {
        closeAll();
        const closing = fence[1][0] === '~' ? /^\s*~{3,}\s*$/ : /^\s*`{3,}\s*$/;
        const language = (fence[2] || '').toLowerCase();
        const body = [];
        i++;
        while (i < lines.length && !closing.test(lines[i])) {
          body.push(lines[i]);
          i++;
        }
        // Mermaid stays out of the Word file (Word cannot render it and the raw
        // source is noise there); the Markdown transcript keeps it verbatim.
        if (language === 'mermaid') {
          blocks.push({ type: 'mermaid', lines: body });
        } else {
          blocks.push({ type: 'code', lines: body });
        }
        continue;
      }

      if (!trimmed) {
        closeAll();
        continue;
      }

      const heading = trimmed.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (heading) {
        closeAll();
        blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed.replace(/\s+/g, ''))) {
        closeAll();
        blocks.push({ type: 'rule' });
        continue;
      }

      if (trimmed.indexOf('|') > -1 && DOCX.isTableSeparator(lines[i + 1])) {
        closeAll();
        const alignments = DOCX.splitTableRow(lines[i + 1]).map(DOCX.cellAlignment);
        const rows = [DOCX.splitTableRow(line)];
        i += 2;
        while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') > -1) {
          rows.push(DOCX.splitTableRow(lines[i]));
          i++;
        }
        i--;
        blocks.push({ type: 'table', rows, alignments });
        continue;
      }

      const quote = line.match(/^\s*>\s?(.*)$/);
      if (quote) {
        closeAll();
        const quoted = [quote[1]];
        while (i + 1 < lines.length && /^\s*>\s?/.test(lines[i + 1])) {
          quoted.push(lines[i + 1].replace(/^\s*>\s?/, ''));
          i++;
        }
        blocks.push({ type: 'quote', text: quoted.join(' ').trim() });
        continue;
      }

      const item = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (item) {
        closeParagraph();
        const ordered = !/^[-*+]$/.test(item[2]);
        const level = Math.min(Math.floor(item[1].length / 2), 2);
        if (!list || list.ordered !== ordered) {
          closeList();
          list = { type: 'list', ordered, items: [] };
        }
        list.items.push({ level, text: item[3] });
        continue;
      }

      if (list) {
        // Lazy continuation of the previous list item.
        list.items[list.items.length - 1].text += ` ${trimmed}`;
        continue;
      }

      if (paragraph) {
        paragraph.text += ` ${trimmed}`;
      } else {
        paragraph = { text: trimmed };
      }
    }

    closeAll();
    return blocks;
  },

  // =========================================================================
  // Inline markdown → runs. Emphasis opens only when a matching closing
  // delimiter exists and both ends satisfy CommonMark-style flanking rules,
  // so "5 * 3", "snake_case_word", and a lone "_" survive as literal text
  // instead of being eaten as formatting.
  // =========================================================================
  parseInline(text, depth) {
    const source = String(text === null || text === undefined ? '' : text);
    const runs = [];
    let buffer = '';
    let bold = false;
    let italic = false;
    let boldClose = -1;
    let italicClose = -1;
    const flush = () => {
      if (buffer) {
        runs.push({ text: buffer, bold, italic, code: false });
        buffer = '';
      }
    };

    const alphanumeric = (ch) => Boolean(ch) && /[A-Za-z0-9]/.test(ch);
    const canOpen = (index, length, ch) => {
      const after = source[index + length];
      if (!after || /\s/.test(after)) return false;
      return !(ch === '_' && alphanumeric(source[index - 1]));
    };
    const canClose = (index, length, ch) => {
      const before = source[index - 1];
      if (!before || /\s/.test(before)) return false;
      return !(ch === '_' && alphanumeric(source[index + length]));
    };
    const findClose = (from, length, ch) => {
      const marker = length === 2 ? ch + ch : ch;
      let cursor = from;
      while (cursor < source.length) {
        const at = source.indexOf(marker, cursor);
        if (at < 0) return -1;
        if (canClose(at, length, ch)) return at;
        cursor = at + length;
      }
      return -1;
    };

    let i = 0;
    while (i < source.length) {
      const ch = source[i];
      const next = source[i + 1];

      if (ch === '\\' && next && '\\`*_[]()#+-.!|>{}~'.indexOf(next) > -1) {
        buffer += next;
        i += 2;
        continue;
      }

      if (ch === '`') {
        const end = source.indexOf('`', i + 1);
        if (end > i + 1) {
          flush();
          runs.push({ text: source.slice(i + 1, end), bold, italic, code: true });
          i = end + 1;
          continue;
        }
      }

      if (ch === '*' || ch === '_') {
        const double = next === ch;
        if (double && bold && i === boldClose) {
          flush();
          bold = false;
          boldClose = -1;
          i += 2;
          continue;
        }
        if (!double && italic && i === italicClose) {
          flush();
          italic = false;
          italicClose = -1;
          i += 1;
          continue;
        }
        if (double && !bold && canOpen(i, 2, ch)) {
          const close = findClose(i + 2, 2, ch);
          if (close > -1) {
            flush();
            bold = true;
            boldClose = close;
            i += 2;
            continue;
          }
        }
        if (!double && !italic && canOpen(i, 1, ch)) {
          const close = findClose(i + 1, 1, ch);
          if (close > -1) {
            flush();
            italic = true;
            italicClose = close;
            i += 1;
            continue;
          }
        }
      }

      if (ch === '[' && (depth || 0) < 3) {
        const close = source.indexOf('](', i);
        if (close > i) {
          const end = source.indexOf(')', close + 2);
          if (end > close) {
            const label = source.slice(i + 1, close);
            const url = source.slice(close + 2, end).trim();
            flush();
            for (const run of DOCX.parseInline(label, (depth || 0) + 1)) {
              runs.push({ text: run.text, bold: run.bold || bold, italic: run.italic || italic, code: run.code });
            }
            if (url && url !== label) {
              runs.push({ text: ` (${url})`, bold, italic, code: false });
            }
            i = end + 1;
            continue;
          }
        }
      }

      buffer += ch;
      i += 1;
    }
    flush();
    return runs;
  },

  // =========================================================================
  // WordprocessingML fragments.
  // =========================================================================
  // Child order inside w:rPr is fixed by the OOXML schema (rFonts, b, i,
  // color, sz); Word repairs or rejects a file that emits them out of order.
  runXml(run, options) {
    const settings = options || {};
    const properties = [];
    if (run.code) properties.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>');
    if (run.bold || settings.forceBold) properties.push('<w:b/>');
    if (run.italic) properties.push('<w:i/>');
    if (settings.color) properties.push(`<w:color w:val="${settings.color}"/>`);
    if (settings.size) properties.push(`<w:sz w:val="${settings.size}"/><w:szCs w:val="${settings.size}"/>`);
    const rPr = properties.length ? `<w:rPr>${properties.join('')}</w:rPr>` : '';
    return `<w:r>${rPr}<w:t xml:space="preserve">${DOCX.esc(run.text)}</w:t></w:r>`;
  },

  runsXml(text, options) {
    return DOCX.parseInline(text, 0)
      .map((run) => DOCX.runXml(run, options))
      .join('');
  },

  paragraphXml(text, options) {
    const settings = options || {};
    const properties = [];
    if (settings.style) properties.push(`<w:pStyle w:val="${settings.style}"/>`);
    if (settings.numId) {
      properties.push(
        `<w:numPr><w:ilvl w:val="${settings.level || 0}"/><w:numId w:val="${settings.numId}"/></w:numPr>`,
      );
    }
    if (settings.border) {
      properties.push(
        `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="${DOCX.RULE}"/></w:pBdr>`,
      );
    }
    if (settings.spacing) properties.push(`<w:spacing ${settings.spacing}/>`);
    if (settings.indent) properties.push(`<w:ind w:left="${settings.indent}"/>`);
    if (settings.alignment && settings.alignment !== 'left') {
      properties.push(`<w:jc w:val="${settings.alignment === 'right' ? 'right' : 'center'}"/>`);
    }
    const pPr = properties.length ? `<w:pPr>${properties.join('')}</w:pPr>` : '';
    // `literal` skips inline markdown parsing — used for values the backend
    // controls (topic name, file names) so a "*" in them is never eaten.
    const runs =
      settings.raw !== undefined
        ? settings.raw
        : settings.literal
          ? DOCX.runXml({ text }, settings)
          : DOCX.runsXml(text, settings);
    return `<w:p>${pPr}${runs}</w:p>`;
  },

  tableXml(rows, alignments, options) {
    const tableOptions = options || {};
    const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 1);
    const total = DOCX.contentWidth();
    const ratios =
      tableOptions.ratios && tableOptions.ratios.length === columnCount ? tableOptions.ratios : null;
    const widths = [];
    let assigned = 0;
    for (let i = 0; i < columnCount - 1; i++) {
      const width = ratios ? Math.floor(total * ratios[i]) : Math.floor(total / columnCount);
      widths.push(width);
      assigned += width;
    }
    widths.push(total - assigned);
    const border = (side) =>
      `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="${DOCX.RULE}"/>`;
    const borders = `<w:tblBorders>${border('top')}${border('left')}${border('bottom')}${border('right')}${border('insideH')}${border('insideV')}</w:tblBorders>`;
    const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('');

    const body = rows
      .map((row, rowIndex) => {
        const isHeader = rowIndex === 0 && !tableOptions.noHeader;
        const cells = [];
        for (let column = 0; column < columnCount; column++) {
          const alignment = (alignments && alignments[column]) || 'left';
          const shading = isHeader ? `<w:shd w:val="clear" w:color="auto" w:fill="${DOCX.HEADER_FILL}"/>` : '';
          const content = DOCX.paragraphXml(row[column] === undefined ? '' : row[column], {
            style: 'TableCell',
            alignment,
            forceBold: isHeader || (tableOptions.boldFirstColumn && column === 0),
            literal: tableOptions.literal,
          });
          cells.push(
            `<w:tc><w:tcPr><w:tcW w:w="${widths[column]}" w:type="dxa"/>${shading}<w:vAlign w:val="center"/></w:tcPr>${content}</w:tc>`,
          );
        }
        const rowProperties = isHeader ? '<w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' : '';
        return `<w:tr>${rowProperties}${cells.join('')}</w:tr>`;
      })
      .join('');

    return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${borders}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>${DOCX.paragraphXml('', { spacing: 'w:after="0" w:line="120" w:lineRule="auto"' })}`;
  },

  // Renders the block model. `context.orderedNums` accumulates one numbering
  // id per ordered list so each list restarts at 1.
  renderBlocks(blocks, context) {
    const parts = [];
    for (const block of blocks) {
      if (block.type === 'heading') {
        const style = block.level <= 1 ? 'Heading1' : block.level === 2 ? 'Heading2' : 'Heading3';
        parts.push(DOCX.paragraphXml(block.text, { style }));
        continue;
      }
      if (block.type === 'paragraph') {
        parts.push(DOCX.paragraphXml(block.text, {}));
        continue;
      }
      if (block.type === 'quote') {
        parts.push(DOCX.paragraphXml(block.text, { style: 'Quote' }));
        continue;
      }
      if (block.type === 'rule') {
        parts.push(
          DOCX.paragraphXml('', { border: true, spacing: 'w:before="80" w:after="160"', raw: '' }),
        );
        continue;
      }
      if (block.type === 'code') {
        for (const line of block.lines) {
          parts.push(
            DOCX.paragraphXml('', {
              style: 'CodeLine',
              raw: `<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/></w:rPr><w:t xml:space="preserve">${DOCX.esc(line)}</w:t></w:r>`,
            }),
          );
        }
        continue;
      }
      if (block.type === 'mermaid') {
        context.mermaidCount = (context.mermaidCount || 0) + 1;
        parts.push(
          DOCX.paragraphXml('', {
            style: 'Quote',
            raw: `<w:r><w:rPr><w:i/><w:color w:val="${DOCX.MUTED}"/></w:rPr><w:t xml:space="preserve">[Diagram ${context.mermaidCount}: Mermaid source kept in the Markdown transcript under Source transcripts/.]</w:t></w:r>`,
          }),
        );
        continue;
      }
      if (block.type === 'list') {
        let numId = 1;
        if (block.ordered) {
          numId = 2 + context.orderedNums.length;
          context.orderedNums.push(numId);
        }
        for (const item of block.items) {
          parts.push(DOCX.paragraphXml(item.text, { style: 'ListParagraph', numId, level: item.level }));
        }
        continue;
      }
      if (block.type === 'table') {
        parts.push(DOCX.tableXml(block.rows, block.alignments));
        continue;
      }
    }
    return parts.join('');
  },

  numberingXml(orderedNums) {
    const bulletChars = ['\uF0B7', 'o', '\uF0A7'];
    const bulletFonts = ['Symbol', 'Courier New', 'Wingdings'];
    const bulletLevels = [0, 1, 2]
      .map(
        (level) =>
          `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${DOCX.esc(bulletChars[level])}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${360 * (level + 1)}" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="${bulletFonts[level]}" w:hAnsi="${bulletFonts[level]}" w:hint="default"/></w:rPr></w:lvl>`,
      )
      .join('');
    const decimalFormats = ['decimal', 'lowerLetter', 'lowerRoman'];
    const decimalLevels = [0, 1, 2]
      .map(
        (level) =>
          `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="${decimalFormats[level]}"/><w:lvlText w:val="%${level + 1}."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${360 * (level + 1)}" w:hanging="360"/></w:pPr></w:lvl>`,
      )
      .join('');

    const nums = [`<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`];
    for (const numId of orderedNums) {
      nums.push(
        `<w:num w:numId="${numId}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride><w:lvlOverride w:ilvl="1"><w:startOverride w:val="1"/></w:lvlOverride><w:lvlOverride w:ilvl="2"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`,
      );
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${bulletLevels}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${decimalLevels}</w:abstractNum>${nums.join('')}</w:numbering>`;
  },

  stylesXml() {
    const style = (id, name, basedOn, pPr, rPr, extra) =>
      `<w:style w:type="paragraph" w:styleId="${id}"${extra || ''}><w:name w:val="${name}"/><w:basedOn w:val="${basedOn}"/><w:qFormat/>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}</w:style>`;

    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      style(
        'DocTitle',
        'Title',
        'Normal',
        '<w:spacing w:before="0" w:after="80"/>',
        `<w:b/><w:color w:val="${DOCX.ACCENT}"/><w:sz w:val="40"/><w:szCs w:val="40"/>`,
      ) +
      style(
        'DocSubtitle',
        'Subtitle',
        'Normal',
        `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="6" w:color="${DOCX.RULE}"/></w:pBdr><w:spacing w:before="0" w:after="240"/>`,
        `<w:color w:val="${DOCX.MUTED}"/><w:sz w:val="20"/><w:szCs w:val="20"/>`,
      ) +
      style(
        'Heading1',
        'heading 1',
        'Normal',
        '<w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/>',
        `<w:b/><w:color w:val="${DOCX.ACCENT}"/><w:sz w:val="32"/><w:szCs w:val="32"/>`,
      ) +
      style(
        'Heading2',
        'heading 2',
        'Normal',
        '<w:keepNext/><w:spacing w:before="260" w:after="100"/><w:outlineLvl w:val="1"/>',
        `<w:b/><w:color w:val="${DOCX.ACCENT}"/><w:sz w:val="26"/><w:szCs w:val="26"/>`,
      ) +
      style(
        'Heading3',
        'heading 3',
        'Normal',
        '<w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="2"/>',
        '<w:b/><w:color w:val="333F48"/><w:sz w:val="24"/><w:szCs w:val="24"/>',
      ) +
      style('ListParagraph', 'List Paragraph', 'Normal', '<w:spacing w:after="60"/><w:contextualSpacing/>', '') +
      style(
        'Quote',
        'Quote',
        'Normal',
        `<w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="${DOCX.RULE}"/></w:pBdr><w:spacing w:before="120" w:after="120"/><w:ind w:left="360"/>`,
        `<w:i/><w:color w:val="${DOCX.MUTED}"/>`,
      ) +
      style(
        'CodeLine',
        'Code',
        'Normal',
        '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="360"/>',
        '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/><w:szCs w:val="20"/>',
      ) +
      style('TableCell', 'Table Cell', 'Normal', '<w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/>', '<w:sz w:val="20"/><w:szCs w:val="20"/>') +
      '</w:styles>'
    );
  },

  documentXml(bodyXml) {
    const page = DOCX.PAGE;
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<w:body>${bodyXml}` +
      `<w:sectPr><w:pgSz w:w="${page.width}" w:h="${page.height}"/>` +
      `<w:pgMar w:top="${page.margin}" w:right="${page.margin}" w:bottom="${page.margin}" w:left="${page.margin}" w:header="709" w:footer="709" w:gutter="0"/>` +
      '<w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr></w:body></w:document>'
    );
  },

  // Assembles the OPC package. Part order is fixed so the ZIP is reproducible.
  build(bodyXml, orderedNums, meta) {
    const contentTypes =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>';

    const rootRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>';

    const documentRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
      '</Relationships>';

    const settings =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:zoom w:percent="100"/><w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/>' +
      '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>' +
      '</w:settings>';

    const core =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${DOCX.esc(meta.title)}</dc:title>` +
      `<dc:subject>${DOCX.esc(meta.subject)}</dc:subject>` +
      '<dc:creator>Knowledge Retention Backend</dc:creator>' +
      '<cp:lastModifiedBy>Knowledge Retention Backend</cp:lastModifiedBy>' +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${DOCX.esc(meta.generatedOn)}</dcterms:created>` +
      `<dcterms:modified xsi:type="dcterms:W3CDTF">${DOCX.esc(meta.generatedOn)}</dcterms:modified>` +
      '</cp:coreProperties>';

    const app =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
      'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      '<Application>Knowledge Retention Backend</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>' +
      '<SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>1.0000</AppVersion>' +
      '</Properties>';

    const parts = [
      { name: '[Content_Types].xml', text: contentTypes },
      { name: '_rels/.rels', text: rootRels },
      { name: 'docProps/core.xml', text: core },
      { name: 'docProps/app.xml', text: app },
      { name: 'word/_rels/document.xml.rels', text: documentRels },
      { name: 'word/document.xml', text: DOCX.documentXml(bodyXml) },
      { name: 'word/numbering.xml', text: DOCX.numberingXml(orderedNums) },
      { name: 'word/settings.xml', text: settings },
      { name: 'word/styles.xml', text: DOCX.stylesXml() },
    ];
    return DOCX.zip(parts.map((part) => ({ name: part.name, bytes: DOCX.utf8Bytes(part.text) })));
  },
};

// Generates the standardized topic document from the summary already stored in
// Dataverse, files it plus a Markdown source transcript in SharePoint, and
// returns only the .docx to chat. Nothing about the file comes from the model:
// identity, interview, topic, summary text, file names, and folder paths are
// all resolved server-side from the session and the topic order token.
const identity = KnowledgeRetentionUtils.resolveIdentity(data);
const email = identity.email;
const dvToken = await KnowledgeRetentionUtils.dataverseToken(data);
const S = KnowledgeRetentionUtils.SCHEMA;
const ST = KnowledgeRetentionUtils.STATUS;

const SOURCE_FOLDER = 'Source transcripts';
const SUPPORTING_FOLDER = 'Supporting documents';
const NO_SUPPORTING = 'No supporting documents were provided.';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Completed fallback so a topic document can still be regenerated during the
// finalize recovery path, exactly like upload_document's lookup.
const interview =
  (await KnowledgeRetentionUtils.loadInterviewRow(data, dvToken, identity)) ||
  (await KnowledgeRetentionUtils.loadInterviewRow(data, dvToken, identity, { completed: true }));
if (!interview) {
  throw new Error('No interview found. Start an interview first.');
}
const interviewId = interview[S.interview.id];
const children = await KnowledgeRetentionUtils.loadChildren(data, dvToken, interviewId);
const requestedOrder = Number(data.input.topicOrder);
const topic = children.topics.find((row) => Number(row[S.topic.order]) === requestedOrder) || null;

// Soft refusals: nothing is written, and the caller gets fresh state so it can
// see where the interview actually stands.
const refuse = (note) => {
  const state = KnowledgeRetentionUtils.computeState(data, interview, children);
  return {
    generated: false,
    conflict: true,
    topicOrder: requestedOrder,
    nextAction: state.nextAction,
    instruction: `${note} ${state.instruction}`,
    language: state.language,
    progressLabel: state.progressLabel,
    questionsRemaining: state.questionsRemaining,
    nextQuestionText: state.nextQuestionText,
    expectedQuestionOrder: state.expectedQuestionOrder,
    expectedTopicOrder: state.expectedTopicOrder,
    sharePointFolderUrl: state.sharePointFolderUrl,
    topicQnA: state.topicQnA,
  };
};

if (!Number.isFinite(requestedOrder) || !topic) {
  const known = children.topics
    .map((row) => Number(row[S.topic.order]))
    .sort((a, b) => a - b)
    .join(', ');
  return refuse(
    `No topic with order ${data.input.topicOrder} exists in this interview. Known topic orders: ${known || 'none'}. No document was generated.`,
  );
}
const summaryText = topic[S.topic.summary] === null || topic[S.topic.summary] === undefined ? '' : String(topic[S.topic.summary]);
if (Number(topic[S.topic.status]) !== ST.topic.summarized || !summaryText.trim()) {
  return refuse(
    `Topic ${requestedOrder} has no approved summary stored yet, so its document cannot be generated. Get the summary approved and call save_topic_summary first, then call generate_topic_document again.`,
  );
}
if (!interview[S.interview.folderUrl]) {
  return refuse(
    'The interview folder does not exist yet, so the topic document cannot be filed. Call set_up_interview_folder once, then call generate_topic_document again.',
  );
}

const topicName = topic[S.topic.name] === null || topic[S.topic.name] === undefined ? '' : String(topic[S.topic.name]);
const docxFileName = KnowledgeRetentionUtils.topicDocumentFileName(requestedOrder, topicName);
const fallbackDocxFileName = docxFileName.replace(/\.docx$/i, '-FINAL.docx');
const markdownFileName = docxFileName.replace(/\.docx$/i, '.md');
const generatedOn = new Date().toISOString();

// ===========================================================================
// Markdown source transcript. Latest rawUserMessages per question, falling
// back to the confirmed answer, plus the approved summary in its original
// Markdown so diagram source survives outside the .docx.
// ===========================================================================
const topicQnA = KnowledgeRetentionUtils.topicQnA(children.questions, children.answers, topic[S.topic.id]);
const markdownLines = [
  `# Topic ${requestedOrder}: ${topicName}`,
  '',
  `- Interview: ${interview[S.interview.number]}`,
  `- Employee: ${interview[S.interview.displayName] || email || 'unknown'}`,
  `- Role: ${interview[S.interview.role] || 'not recorded'}`,
  `- Business unit: ${interview[S.interview.businessUnit] || 'not recorded'}`,
  `- Interview language: ${KnowledgeRetentionUtils.languageName(interview[S.interview.language])}`,
  '',
  '## Approved topic summary (source Markdown)',
  '',
  summaryText,
  '',
  '## Source transcript',
  '',
];
for (const entry of topicQnA) {
  markdownLines.push(`### Question ${entry.order}`, '', entry.question || '_Question text unavailable._', '');
  const raw = entry.rawUserMessages === null || entry.rawUserMessages === undefined ? '' : String(entry.rawUserMessages).trim();
  const confirmed = entry.answer === null || entry.answer === undefined ? '' : String(entry.answer).trim();
  if (raw) {
    markdownLines.push('#### Interviewee messages (verbatim)', '', raw, '');
  } else if (confirmed) {
    markdownLines.push('#### Confirmed answer (no verbatim transcript stored)', '', confirmed, '');
  } else {
    markdownLines.push('_No answer recorded for this question._', '');
  }
}
const markdownText = markdownLines.join('\n');

// ===========================================================================
// SharePoint: fixed subfolders, then the actual Supporting documents listing.
// ===========================================================================
const siteId = data.auth.sharepointSiteId;
const graphToken = await KnowledgeRetentionUtils.graphToken(data);
const graphPrefix = 'https://graph.microsoft.com/v1.0';
const encodePath = (path) =>
  path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
const encodedFolder = encodePath(KnowledgeRetentionUtils.interviewFolderPath(interview));

// Same create-or-accept-existing shape as set_up_interview_folder, so a rerun
// never fails on a subfolder that is already there.
async function ensureSubfolder(name) {
  const lookupPath = `/sites/${siteId}/drive/root:/${encodedFolder}/${encodeURIComponent(name)}`;
  const existing = await KnowledgeRetentionUtils.graph(data, graphToken, { method: 'GET', path: lookupPath });
  if (existing.status === 200) {
    return existing.json;
  }
  const created = await KnowledgeRetentionUtils.graph(data, graphToken, {
    method: 'POST',
    path: `/sites/${siteId}/drive/root:/${encodedFolder}:/children`,
    body: { name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' },
  });
  if (created.status === 200 || created.status === 201) {
    return created.json;
  }
  if (created.status === 409) {
    const retry = await KnowledgeRetentionUtils.graph(data, graphToken, { method: 'GET', path: lookupPath });
    if (retry.status === 200) {
      return retry.json;
    }
  }
  const detail = (created.json && created.json.error && created.json.error.message) || created.text || '';
  throw new Error(KnowledgeRetentionUtils.failureMessage(created.status, detail));
}

await ensureSubfolder(SOURCE_FOLDER);
await ensureSubfolder(SUPPORTING_FOLDER);

// The names come from Graph, never from the model. Sorted with a plain
// comparison so the section is reproducible across runs and locales.
const supportingNames = [];
let listPath = `/sites/${siteId}/drive/root:/${encodedFolder}/${encodeURIComponent(SUPPORTING_FOLDER)}:/children?$select=name&$top=200`;
while (listPath) {
  const listResponse = await KnowledgeRetentionUtils.graph(data, graphToken, { method: 'GET', path: listPath });
  if (listResponse.status === 404) {
    break;
  }
  if (listResponse.status !== 200) {
    const detail =
      (listResponse.json && listResponse.json.error && listResponse.json.error.message) || listResponse.text || '';
    throw new Error(KnowledgeRetentionUtils.failureMessage(listResponse.status, detail));
  }
  for (const item of (listResponse.json && listResponse.json.value) || []) {
    if (item && item.name) {
      supportingNames.push(String(item.name));
    }
  }
  const nextLink = listResponse.json && listResponse.json['@odata.nextLink'];
  const nextLinkText = nextLink ? String(nextLink) : '';
  listPath = nextLinkText
    ? nextLinkText.indexOf(graphPrefix) === 0
      ? nextLinkText.slice(graphPrefix.length)
      : nextLinkText
    : null;
}
supportingNames.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

// ===========================================================================
// Assemble the document.
// ===========================================================================
const documentTitle = `Topic ${requestedOrder}: ${topicName}`;
const subtitleParts = [`Knowledge retention interview ${interview[S.interview.number]}`];
const employeeName = interview[S.interview.displayName] || email || '';
if (employeeName) subtitleParts.push(employeeName);
const roleLine = [interview[S.interview.role], interview[S.interview.businessUnit]].filter(Boolean).join(', ');
if (roleLine) subtitleParts.push(roleLine);

const renderContext = { orderedNums: [], mermaidCount: 0 };
const bodyParts = [];
bodyParts.push(DOCX.paragraphXml(documentTitle, { style: 'DocTitle', literal: true }));
bodyParts.push(DOCX.paragraphXml(subtitleParts.join(' \u00b7 '), { style: 'DocSubtitle', literal: true }));

bodyParts.push(DOCX.renderBlocks(DOCX.parseBlocks(summaryText), renderContext));

bodyParts.push(DOCX.paragraphXml('Supporting documents', { style: 'Heading1', literal: true }));
if (supportingNames.length > 0) {
  for (const name of supportingNames) {
    bodyParts.push(DOCX.paragraphXml(name, { style: 'ListParagraph', numId: 1, level: 0, literal: true }));
  }
} else {
  bodyParts.push(DOCX.paragraphXml(NO_SUPPORTING, { literal: true }));
}

const docxBytes = DOCX.build(bodyParts.join(''), renderContext.orderedNums, {
  title: documentTitle,
  subject: subtitleParts.join(' \u00b7 '),
  generatedOn,
});

// ===========================================================================
// Upload. The transcript is best-effort (the .docx is the deliverable); the
// .docx upload is a hard failure. Neither touches interview or topic state, so
// a failed run leaves the topic exactly as it was and can simply be retried.
// The DOCX uses a plain PUT, which replaces the previous generated file in
// place. Cleanup of an older fallback file is best-effort and never blocks the
// newly generated canonical document.
// ===========================================================================
const notices = [];
let transcriptFileName = null;
let transcriptWebUrl = null;
const outputDocxFileName = docxFileName;

try {
  const transcriptResponse = await KnowledgeRetentionUtils.graph(data, graphToken, {
    method: 'PUT',
    path: `/sites/${siteId}/drive/root:/${encodedFolder}/${encodeURIComponent(SOURCE_FOLDER)}/${encodeURIComponent(markdownFileName)}:/content`,
    isBinary: true,
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    body: Buffer.from(DOCX.utf8Bytes(markdownText)),
  });
  if (transcriptResponse.status === 200 || transcriptResponse.status === 201) {
    transcriptFileName = markdownFileName;
    transcriptWebUrl = (transcriptResponse.json && transcriptResponse.json.webUrl) || null;
  } else {
    const detail =
      (transcriptResponse.json && transcriptResponse.json.error && transcriptResponse.json.error.message) ||
      transcriptResponse.text ||
      `HTTP ${transcriptResponse.status}`;
    notices.push(
      `The Markdown source transcript "${markdownFileName}" could not be filed under ${SOURCE_FOLDER}/ (${detail}). The topic document itself is unaffected; call generate_topic_document again later to retry the transcript.`,
    );
  }
} catch (error) {
  notices.push(
    `The Markdown source transcript "${markdownFileName}" could not be filed under ${SOURCE_FOLDER}/ (${error.message || String(error)}). The topic document itself is unaffected; call generate_topic_document again later to retry the transcript.`,
  );
}

const uploadResponse = await KnowledgeRetentionUtils.graph(data, graphToken, {
  method: 'PUT',
  path: `/sites/${siteId}/drive/root:/${encodedFolder}/${encodeURIComponent(outputDocxFileName)}:/content`,
  isBinary: true,
  headers: { 'Content-Type': DOCX_MIME },
  body: Buffer.from(docxBytes),
});
if (uploadResponse.status !== 200 && uploadResponse.status !== 201) {
  const detail =
    (uploadResponse.json && uploadResponse.json.error && uploadResponse.json.error.message) || uploadResponse.text || '';
  throw new Error(KnowledgeRetentionUtils.failureMessage(uploadResponse.status, detail));
}

const fallbackDocxPath = `/sites/${siteId}/drive/root:/${encodedFolder}/${encodeURIComponent(fallbackDocxFileName)}`;
try {
  const cleanupResponse = await KnowledgeRetentionUtils.graph(data, graphToken, {
    method: 'DELETE',
    path: fallbackDocxPath,
  });
  if (cleanupResponse.status !== 200 && cleanupResponse.status !== 204 && cleanupResponse.status !== 404) {
    const detail =
      (cleanupResponse.json && cleanupResponse.json.error && cleanupResponse.json.error.message) ||
      cleanupResponse.text ||
      `HTTP ${cleanupResponse.status}`;
    notices.push(
      `An older fallback document "${fallbackDocxFileName}" could not be removed (${detail}); the new canonical document is current.`,
    );
  }
} catch (error) {
  notices.push(
    `An older fallback document "${fallbackDocxFileName}" could not be removed (${error.message || String(error)}); the new canonical document is current.`,
  );
}

const state = KnowledgeRetentionUtils.computeState(data, interview, children);
const generatedNote = `"${outputDocxFileName}" was generated from the stored summary for topic ${requestedOrder} and filed in the interview folder, and the same file is attached to this result. Show the user that attachment and the folder link; do not rebuild, reformat, re-upload, or re-attach it, and do not call upload_document for it.${
  transcriptFileName ? ` Its Markdown source transcript was filed under ${SOURCE_FOLDER}/ and is deliberately not returned to chat; do not mention it as a deliverable.` : ''
}`;

const result = {
  generated: true,
  conflict: false,
  topicOrder: requestedOrder,
  fileName: outputDocxFileName,
  fileWebUrl: (uploadResponse.json && uploadResponse.json.webUrl) || null,
  sourceTranscriptFileName: transcriptFileName,
  sourceTranscriptWebUrl: transcriptWebUrl,
  supportingDocumentCount: supportingNames.length,
  nextAction: state.nextAction,
  instruction: `${generatedNote} ${state.instruction}`,
  language: state.language,
  progressLabel: state.progressLabel,
  questionsRemaining: state.questionsRemaining,
  nextQuestionText: state.nextQuestionText,
  expectedQuestionOrder: state.expectedQuestionOrder,
  expectedTopicOrder: state.expectedTopicOrder,
  sharePointFolderUrl: state.sharePointFolderUrl,
  topicQnA: state.topicQnA,
  // Langdock file output: a single object under `files` is what surfaces the
  // .docx as a chat attachment. The Markdown transcript is deliberately absent.
  files: {
    fileName: outputDocxFileName,
    mimeType: DOCX_MIME,
    base64: DOCX.base64(docxBytes),
    lastModified: generatedOn,
  },
};
if (notices.length > 0) {
  result._notices = notices;
}
return result;
