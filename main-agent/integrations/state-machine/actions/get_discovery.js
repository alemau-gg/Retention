// Knowledge Retention custom integration: helper utilities used by this action.
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
      'Great, I have prepared the topics and questions for your knowledge retention interview. You do not need to finish in one session: each answer you confirm is saved, so you can pause and resume in a later session and pick up where you left off. Just be sure to confirm the answer you are working on before you stop. Let me know when you are ready to start with the first topic.',
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
  ACTION_SLUG: 'get_discovery',

  // User-facing text for an API failure. Keeps the "contact your administrator"
  // guidance but also hands over the two things an administrator needs to act:
  // which action failed, and what the API actually returned.
  failureMessage(status, detail) {
    // Pass the API body through unchanged. Do not rephrase, wrap, or invent a message —
    // the administrator needs exactly what Dataverse / Graph / Azure AD returned.
    const code = status === null || status === undefined || status === '' ? 'not reported' : String(status);
    const message = detail === null || detail === undefined ? '' : String(detail);
    return `${KnowledgeRetentionUtils.MESSAGES.credentialError} When you contact them, please pass on these details: the action that returned the error is "${KnowledgeRetentionUtils.ACTION_SLUG}", the error code is ${code}, and the error returned by the API is: ${message}`;
  },

  // ===========================================================================
  // Identity — derived exclusively from the Langdock session. Fail closed.
  // alternativeEmail is deliberately never consulted.
  // ===========================================================================
  resolveIdentity(data) {
    const upn =
      (data.user && typeof data.user.userPrincipalName === 'string' && data.user.userPrincipalName.trim()) ||
      (data.user && typeof data.user.email === 'string' && data.user.email.trim()) ||
      null;
    if (!upn) {
      throw new Error('Unable to determine your identity from the session. Please contact your administrator.');
    }
    // Do NOT lowercase: the original flows filter ckr_employeeemail on the raw
    // asserted value, and OData `eq` on a string column is case-sensitive in
    // practice. Lowercasing would miss mixed-case stored emails on resume.
    return upn;
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

  // ===========================================================================
  // State loading — the user's open interview, or the most recent completed one.
  // ===========================================================================
  async loadInterviewRow(data, token, email, { completed } = {}) {
    const S = KnowledgeRetentionUtils.SCHEMA;
    const ST = KnowledgeRetentionUtils.STATUS;
    const safeEmail = KnowledgeRetentionUtils.escapeODataLiteral(email);
    // "completed" spans finalized (60) and documentGenerated (70): once the final
    // document is filed the interview is still the row post-finalize actions need.
    // An `eq 60` filter would make a document-generated interview invisible.
    const statusFilter = completed
      ? `${S.interview.status} ge ${ST.interview.finalized} and ${S.interview.status} lt ${ST.interview.cancelled}`
      : `${S.interview.status} lt ${ST.interview.finalized}`;
    const filter = `${S.interview.email} eq '${safeEmail}' and ${statusFilter}`;
    const result = await KnowledgeRetentionUtils.dv(data, token, {
      method: 'GET',
      path: `/${S.entitySets.interviews}?$filter=${encodeURIComponent(filter)}&$orderby=createdon desc&$top=1`,
    });
    return result && result.value && result.value.length > 0 ? result.value[0] : null;
  },

  async loadChildren(data, token, interviewId) {
    const S = KnowledgeRetentionUtils.SCHEMA;
    const topicFilter = `${S.topic.interviewLookupValue} eq ${interviewId}`;
    const questionFilter = `${S.question.interviewLookupValue} eq ${interviewId}`;
    const answerJoinFilter = `${S.answer.interviewLookupValue} eq ${interviewId}`;

    const topicsResult = await KnowledgeRetentionUtils.dv(data, token, {
      method: 'GET',
      path: `/${S.entitySets.topics}?$filter=${encodeURIComponent(topicFilter)}&$orderby=${S.topic.order} asc`,
    });
    const questionsResult = await KnowledgeRetentionUtils.dv(data, token, {
      method: 'GET',
      path: `/${S.entitySets.questions}?$filter=${encodeURIComponent(questionFilter)}&$orderby=${S.question.order} asc`,
    });
    const answersResult = await KnowledgeRetentionUtils.dv(data, token, {
      method: 'GET',
      path: `/${S.entitySets.answers}?$filter=${encodeURIComponent(answerJoinFilter)}`,
    });

    return {
      topics: (topicsResult && topicsResult.value) || [],
      questions: (questionsResult && questionsResult.value) || [],
      answers: (answersResult && answersResult.value) || [],
    };
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
      ' If the user attaches a file that appears useful for this interview, explain why and ask for explicit confirmation. Only after the interview folder exists (sharePointFolderUrl is present), call upload_document with docType "supporting" and a unique filename. If the folder does not exist yet, explain that documents can be filed after folder setup and keep the attachment available for later. Never generate or upload a supporting file automatically. After a confirmed supporting file is available, read it and treat its contents as interview source material: include relevant facts in the current answer (rawUserMessages and finalAnswer) when mid-question, and in every later topic summary and the final handover, naming the source file. Then resume the current step.';

    const base = {
      nextAction: null,
      instruction: null,
      language: null,
      progressLabel: null,
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
            instruction: `Ask the current question for topic "${topic[S.topic.name]}" in ${language}. Present the progressLabel and topic name in bold on its own line, then the question text exactly as provided in nextQuestionText — do not paraphrase or translate the wording you save. At most 3 clarifying follow-ups if the answer is thin, then you must confirm and call save_answer. Never a 4th follow-up. Before saving, show a slightly fuller recap of finalAnswer (a short paragraph or a few bullets, not a slogan). Tell them this is only a checkpoint for this question: if it feels tight or restrictive, that is expected; a more detailed summary is written after all questions in this topic. Then get explicit confirmation. Call save_answer with the confirmed answer as finalAnswer, the full chronological transcript of the interviewee's own messages for this question (initial answer plus every follow-up, verbatim, not condensed) as rawUserMessages, expectedQuestionOrder ${Number(question[S.question.order])}, and expectedTopicOrder ${topicOrder}. Do not save on a soft or implicit reply.${supportingFileInstruction}`,
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
          instruction: `Tell the user in ${language} that ${summaryLead} Load the knowledge-retention-reporting skill and use its default topic-summary workflow. Open references/summary-format.md only; do not open final-document.md, the final-document supporting references, or assets/template.docx. Build a faithful summary from topicQnA (prefer rawUserMessages when present, else the confirmed answer) and from any confirmed supporting files: read those attachments and include every relevant concrete fact, naming the source file. The summary must be exhaustive: one mini-header per answered question. Prefer a short paragraph, then bullets when there are several facts, then a translated For-example from the interviewee (never invented), with line breaks between blocks; leave that shape if a quote, table, or one tight paragraph fits better. Then a short how-this-fits-together paragraph. First draft already this dense and scannable; do not wait for the user to ask for more examples. At least as long as the combined rawUserMessages (or confirmed answers if raw is empty) plus supporting-file facts, no upper word cap. If shorter or missing examples, expand before presenting. Translate every section heading into ${language}. Invent nothing, and use only the sections allowed by summary-format.md. After the user approves, call save_topic_summary with expectedTopicOrder ${topicOrder}, create a new blank document named exactly "${topicFileName}" containing only the approved summary, run the skill's pre-upload checks, upload it via upload_document with fileName exactly "${topicFileName}", and confirm with the folder link.${supportingFileInstruction}`,
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
      // finalize_interview writes finalized (60) and upload_document advances to
      // documentGenerated (70) once the handover file lands. A resumed session
      // therefore knows the answer instead of asking the user to go and look.
      if (status < ST.interview.documentGenerated) {
        return Object.assign(base, {
          nextAction: 'BuildFinalDocument',
          instruction: `This interview is finalized but its final handover document has not been filed yet. Load the knowledge-retention-reporting skill, open references/final-document.md, and follow that workflow to build InterviewFinalSummary_${interview[S.interview.number]}.docx from get_discovery, get_answers (start from rawUserMessages; if raw is empty or shorter than the confirmed answer, use the longer of the two), and any confirmed supporting-file contents; walk stored topic summaries as a theme checklist only so they cannot shrink the source. Confirm chapter titles as a map; write chapters scannable like topic summaries (bullets and breaks when useful; leave the shape if it does not fit); show full chapter text before asking approval; after each draft, reread the source answers and add any missing concrete fact or mark it as an open gap, then upload it with upload_document using docType "final" — that upload is what marks the document as generated. After the upload succeeds, ${feedbackMissing ? feedbackStep : closingStep}.${supportingFileInstruction}`,
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

// Reads back the pre-interview discovery profile (role, business unit,
// responsibilities, tools, focus topics, KPIs/constraints) saved by save_discovery.
// Read-only. Falls back to the most recently completed interview, since
// finalize_interview flips status to finalized before the document is built.
const email = KnowledgeRetentionUtils.resolveIdentity(data);
const token = await KnowledgeRetentionUtils.dataverseToken(data);
const S = KnowledgeRetentionUtils.SCHEMA;

const interview =
  (await KnowledgeRetentionUtils.loadInterviewRow(data, token, email)) ||
  (await KnowledgeRetentionUtils.loadInterviewRow(data, token, email, { completed: true }));
if (!interview) {
  throw new Error('No interview found.');
}

const discovery = {
  role: interview[S.interview.role] || null,
  businessUnit: interview[S.interview.businessUnit] || null,
  responsibilities: interview[S.interview.responsibilities] || null,
  tools: interview[S.interview.tools] || null,
  focusTopics: interview[S.interview.focusTopics] || null,
  kpisAndConstraints: interview[S.interview.kpisAndConstraints] || null,
};

const collected = Object.values(discovery).some((value) => value !== null);

return {
  discovery,
  collected,
  instruction: collected
    ? 'Use these discovery answers as background context (e.g. for the final document intro), verbatim in meaning — do not invent or embellish beyond what is here.'
    : 'No discovery profile has been saved yet for this interview. Ask the user to complete discovery, then call save_discovery, before relying on this.',
};
