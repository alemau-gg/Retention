// MicrosoftTeamsUtils is inlined because custom integration import does not prepend _shared.js.

const MicrosoftTeamsUtils = {
  markdownToHtml(text) {
    if (!text) return text;

    let html = text
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|\s)\*([^*\s][^*]*[^*\s])\*($|\s)/g, '$1<em>$2</em>$3')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/\n/g, '<br/>');

    return html;
  },

  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  async requestWithRateLimitRetry(options, errorLabel) {
    const MAX_RATE_LIMIT_RETRIES = 3;
    const DEFAULT_RETRY_AFTER_SECONDS = 2;
    const MAX_WAIT_MS = 30000;
    let rateLimitRetries = 0;
    while (true) {
      const response = await ld.request(options);
      if (response.status !== 429) {
        return response;
      }
      if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
        throw new Error(`Failed to ${errorLabel} (429): rate limited after ${MAX_RATE_LIMIT_RETRIES} retries${response.json?.error?.message ? ': ' + response.json.error.message : ''}`);
      }
      rateLimitRetries++;
      const retryAfterHeader = response.headers?.['Retry-After'] ?? response.headers?.['retry-after'];
      let retryAfterSeconds = DEFAULT_RETRY_AFTER_SECONDS;
      if (typeof retryAfterHeader === 'number' && Number.isFinite(retryAfterHeader) && retryAfterHeader >= 0) {
        retryAfterSeconds = retryAfterHeader;
      } else if (typeof retryAfterHeader === 'string') {
        const trimmedRetryAfter = retryAfterHeader.trim();
        if (/^\d+$/.test(trimmedRetryAfter)) {
          retryAfterSeconds = Number(trimmedRetryAfter);
        }
      }
      await ld.wait(Math.min(retryAfterSeconds * 1000, MAX_WAIT_MS));
    }
  },

  async fetchChannelMembers(teamId, channelId) {
    const response = await ld.request({
      method: 'GET',
      url: `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/members`,
      headers: { 'Authorization': 'Bearer ' + data.auth.access_token },
    });
    return response.json.value || [];
  },

  async fetchTeamChannels(teamId) {
    const response = await ld.request({
      method: 'GET',
      url: `https://graph.microsoft.com/v1.0/teams/${teamId}/channels`,
      headers: { 'Authorization': 'Bearer ' + data.auth.access_token },
    });
    return response.json?.value || [];
  },

  // Graph ships card payloads (Adaptive Card, announcement banner, …) as a JSON string on
  // attachment.content. Parse it so consumers get the card structure, but keep the raw string
  // when it is not JSON so nothing is dropped.
  parseAttachmentContent(content) {
    if (content === null || content === undefined || content === '') {
      return undefined;
    }
    if (typeof content !== 'string') {
      return content;
    }
    try {
      // Card payloads are objects. A bare scalar means the string was not a card, so keep it
      // verbatim rather than retyping it (`"12345"` → number) or emitting a null content key.
      const parsed = JSON.parse(content);
      return parsed !== null && typeof parsed === 'object' ? parsed : content;
    } catch {
      return content;
    }
  },

  attachmentMetadata(attachments) {
    return attachments.map(attachment => {
      const metadata = {
        id: attachment.id,
        name: attachment.name,
        contentType: attachment.contentType,
        contentUrl: attachment.contentUrl,
      };

      const content = MicrosoftTeamsUtils.parseAttachmentContent(attachment.content);
      if (content !== undefined) {
        metadata.content = content;
      }

      return metadata;
    });
  },

  // Split a message's attachments into downloaded files and metadata-only attachments, so an
  // attachment is reported either as a file or under `attachments`, never as both.
  // `downloadReference` receives a file reference and returns the entry to report under `files`,
  // or null to fall back to reporting that attachment as metadata.
  async partitionAttachments(attachments, includeAttachments, downloadReference) {
    const files = [];
    const remainingAttachments = [];

    for (const attachment of attachments) {
      const isFileReference = includeAttachments && attachment.contentUrl && attachment.contentType === 'reference';

      if (!isFileReference) {
        remainingAttachments.push(attachment);
        continue;
      }

      const file = await downloadReference(attachment);
      if (file) {
        files.push(file);
      } else {
        remainingAttachments.push(attachment);
      }
    }

    return { files, remainingAttachments };
  },

  assertValidAdaptiveCard(card) {
    if (typeof card !== 'object' || card === null || Array.isArray(card)) {
      throw new Error('card must be an Adaptive Card object with a body and/or actions');
    }
    if (card.type !== 'AdaptiveCard') {
      throw new Error('card must be an Adaptive Card object with a body and/or actions');
    }
    const hasBody = Array.isArray(card.body) && card.body.length > 0;
    const hasActions = Array.isArray(card.actions) && card.actions.length > 0;
    if (!hasBody && !hasActions) {
      throw new Error('card must be an Adaptive Card object with a body and/or actions');
    }
  },

  // Validates card / cardPosition before any irreversible work (e.g. file uploads).
  assertCardInputs(card, position) {
    if (card == null) {
      if (position != null) {
        throw new Error('cardPosition requires card');
      }
      return;
    }
    MicrosoftTeamsUtils.assertValidAdaptiveCard(card);
    const cardPosition = position ?? 'top';
    if (cardPosition !== 'top' && cardPosition !== 'bottom') {
      throw new Error(`cardPosition must be "top" or "bottom"; got ${JSON.stringify(cardPosition)}`);
    }
  },

  // Attaches an Adaptive Card when card is set: validates the payload, pushes
  // the Graph attachment, and returns HTML with the matching <attachment>
  // reference above or below the text (top by default).
  applyCardAttachment(card, htmlContent, attachments, position) {
    MicrosoftTeamsUtils.assertCardInputs(card, position);
    if (card == null) {
      return htmlContent;
    }
    const cardPosition = position ?? 'top';
    const id = ld.randomUUID().replace(/-/g, '');
    attachments.push({
      id,
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: JSON.stringify(card),
      name: null,
      thumbnailUrl: null,
    });
    const attachmentTag = `<attachment id="${id}"></attachment>`;
    return cardPosition === 'bottom' ? htmlContent + attachmentTag : attachmentTag + htmlContent;
  },

  // Transform channel message to lightweight format, downloading SharePoint reference attachments
  async transformChannelMessage(message, teamId, channelId, includeAttachments) {
    const content = ld.stripHtml(message.body?.content || '');
    const mentions = (message.mentions || []).map(mention => mention.mentioned?.user?.displayName || mention.mentionText).filter(Boolean);

    const result = {
      id: message.id,
      isReply: !!message.replyToId,
      replyToId: message.replyToId || null,
      createdDateTime: message.createdDateTime,
      lastModifiedDateTime: message.lastModifiedDateTime,
      from: message.from?.user?.displayName || message.from?.application?.displayName || null,
      subject: message.subject || null,
      content: content,
      mentions: mentions.length > 0 ? mentions : undefined,
    };

    const attachments = message.attachments || [];

    if (attachments.length > 0) {
      // A failed channel download is still reported under `files`, carrying the reason.
      const failedFile = (attachment, reason) => ({
        fileName: attachment.name,
        mimeType: 'application/octet-stream',
        buffer: null,
        url: attachment.contentUrl,
        error: reason,
      });

      const { files, remainingAttachments } = await MicrosoftTeamsUtils.partitionAttachments(
        attachments,
        includeAttachments,
        async attachment => {
          try {
            const file = await MicrosoftTeamsUtils.downloadSharePointReference(attachment, teamId, channelId);
            if (file) return file;
            // Missing name / not downloadable → metadata fallback (documented null contract).
            if (!attachment.name) return null;
            return failedFile(attachment, 'Download returned null');
          } catch (error) {
            return failedFile(attachment, error.message || String(error));
          }
        },
      );

      if (files.length > 0) {
        result.files = files;
      }
      if (remainingAttachments.length > 0) {
        result.attachments = MicrosoftTeamsUtils.attachmentMetadata(remainingAttachments);
      }
    }

    return result;
  },

  async downloadSharePointReference(attachment, teamId, channelId) {
    if (!attachment.contentUrl || attachment.contentType !== 'reference' || !attachment.name) {
      return null;
    }

    const folderResponse = await ld.request({
      method: 'GET',
      url: `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/filesFolder`,
      headers: { 'Authorization': 'Bearer ' + data.auth.access_token },
    });

    if (folderResponse.status !== 200) {
      throw new Error(`Cannot access channel files folder: ${folderResponse.status}`);
    }

    const driveId = folderResponse.json.parentReference?.driveId;
    const folderId = folderResponse.json.id;

    if (!driveId || !folderId) {
      throw new Error('No driveId or folderId from filesFolder');
    }

    const fileName = attachment.name;
    const itemPath = `/drives/${driveId}/items/${folderId}:/${encodeURIComponent(fileName)}`;

    const itemResponse = await ld.request({
      method: 'GET',
      url: `https://graph.microsoft.com/v1.0${itemPath}`,
      headers: {
        'Authorization': 'Bearer ' + data.auth.access_token,
        'Accept': 'application/json',
      },
    });

    if (itemResponse.status !== 200) {
      throw new Error(`Cannot get file metadata: ${itemResponse.status}`);
    }

    const downloadUrl = itemResponse.json['@microsoft.graph.downloadUrl'];
    if (!downloadUrl) {
      throw new Error('No download URL');
    }

    const contentResponse = await ld.request({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream',
    });

    if (contentResponse.status !== 200) {
      throw new Error(`Download failed: ${contentResponse.status}`);
    }

    if (!contentResponse.buffer) {
      throw new Error('No buffer received');
    }

    return {
      fileName: attachment.name,
      mimeType: itemResponse.json.file?.mimeType || 'application/octet-stream',
      size: itemResponse.json.size,
      buffer: contentResponse.buffer,
      lastModified: itemResponse.json.lastModifiedDateTime,
    };
  },

  transcriptInnerErrorCode(response) {
    return response?.json?.error?.innerError?.code || null;
  },

  graphTranscriptAccessDisabledError() {
    const error = new Error(
      "Microsoft Graph access to meeting transcripts is disabled for this tenant. A Teams admin must enable it in Teams admin center (Meetings > Meeting settings > Transcript API access) or via Set-CsTeamsMeetingConfiguration -EnableGraphTranscriptAccess $true.",
    );
    error.code = 'GraphAccessToTranscriptsDisabled';
    return error;
  },

  assertTranscriptGraphAccess(response) {
    if (response?.status === 403 && MicrosoftTeamsUtils.transcriptInnerErrorCode(response) === 'GraphAccessToTranscriptsDisabled') {
      throw MicrosoftTeamsUtils.graphTranscriptAccessDisabledError();
    }
  },

  // Prefer attributed VTT; fall back to unattributed text when the tenant disables speaker attribution.
  // https://learn.microsoft.com/en-us/graph/api/calltranscript-get
  async fetchTranscriptContent(onlineMeetingId, transcriptId) {
    const authHeader = { 'Authorization': 'Bearer ' + data.auth.access_token };
    const contentUrl = `https://graph.microsoft.com/v1.0/me/onlineMeetings/${onlineMeetingId}/transcripts/${transcriptId}/content`;

    const attributedResponse = await ld.request({
      method: 'GET',
      url: `${contentUrl}?$format=text/vtt`,
      headers: { ...authHeader, 'Accept': 'text/vtt' },
    });

    if (attributedResponse.status === 200) {
      return {
        content: attributedResponse.text || attributedResponse.body || '',
        mimeType: 'text/vtt',
        fileExtension: 'vtt',
        attributed: true,
      };
    }

    if (MicrosoftTeamsUtils.isTransientGraphStatus(attributedResponse.status)) {
      throw MicrosoftTeamsUtils.retryPollError(
        `Failed to fetch transcript (${attributedResponse.status}): ${attributedResponse.json?.error?.message || 'Unknown error'}`,
        attributedResponse.status,
      );
    }

    MicrosoftTeamsUtils.assertTranscriptGraphAccess(attributedResponse);

    const attributedInnerCode = MicrosoftTeamsUtils.transcriptInnerErrorCode(attributedResponse);
    if (attributedResponse.status !== 403 || attributedInnerCode !== 'SpeakerAttributionNotAllowed') {
      return null;
    }

    // Unattributed format is Accept-header only; $format is not supported for it.
    const unattributedResponse = await ld.request({
      method: 'GET',
      url: contentUrl,
      headers: {
        ...authHeader,
        'Accept': 'application/vnd.microsoft.graph.transcript+text',
      },
    });

    if (unattributedResponse.status === 200) {
      return {
        content: unattributedResponse.text || unattributedResponse.body || '',
        mimeType: 'application/vnd.microsoft.graph.transcript+text',
        fileExtension: 'txt',
        attributed: false,
      };
    }

    if (MicrosoftTeamsUtils.isTransientGraphStatus(unattributedResponse.status)) {
      throw MicrosoftTeamsUtils.retryPollError(
        `Failed to fetch transcript (${unattributedResponse.status}): ${unattributedResponse.json?.error?.message || 'Unknown error'}`,
        unattributedResponse.status,
      );
    }

    MicrosoftTeamsUtils.assertTranscriptGraphAccess(unattributedResponse);
    return null;
  },

  // Poll window start: max(workflow activation, now - lookbackMinutes).
  // Falls back to now - lookback when __langdockPollingSince is absent (preview / mock).
  pollingWindowStart(input, lookbackMinutes) {
    const minutes = Number.isFinite(lookbackMinutes) ? lookbackMinutes : 30;
    const floorMs = Date.now() - minutes * 60 * 1000;
    const sinceMs = Date.parse((input && input.__langdockPollingSince) || '');
    return new Date(Number.isFinite(sinceMs) ? Math.max(sinceMs, floorMs) : floorMs);
  },

  // Newest activity among a channel root and its replies. Graph lists roots by
  // reply-chain activity, but each message's own lastModifiedDateTime only
  // reflects changes to that message (a reply reaction may leave the root stamp unchanged).
  messageChainNewestMs(message, replies) {
    let newestMs = Date.parse(message.lastModifiedDateTime || message.createdDateTime || '');
    for (const reply of replies || []) {
      const replyMs = Date.parse(reply.lastModifiedDateTime || reply.createdDateTime || '');
      if (Number.isFinite(replyMs) && (!Number.isFinite(newestMs) || replyMs > newestMs)) {
        newestMs = replyMs;
      }
    }
    return newestMs;
  },

  // Channel roots whose reply chain was active after `since`. Uses $expand=replies
  // and pages replies@odata.nextLink so thread reactions are included. Reactions
  // bump lastModified without changing createdDateTime, so this is lastModified-based.
  async fetchChannelMessagesModifiedSince(teamId, channelId, since, options) {
    const opts = options || {};
    const maxPages = Number.isFinite(opts.maxPages) ? opts.maxPages : 40;
    const sinceMs = since.getTime();

    const messages = [];
    let nextUrl = `https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages?$top=50&$expand=replies`;

    for (let page = 0; page < maxPages && nextUrl; page++) {
      const response = await ld.request({
        method: 'GET',
        url: nextUrl,
        headers: {
          'Authorization': 'Bearer ' + data.auth.access_token,
          'Accept': 'application/json',
        },
      });

      if (response.status !== 200) {
        throw new Error(`Failed to list channel messages (${response.status}): ${response.json?.error?.message || 'Unknown error'}`);
      }

      const batch = response.json?.value || [];
      if (batch.length === 0) break;

      let pageReachesWindow = false;
      for (const message of batch) {
        const replies = await MicrosoftTeamsUtils.fetchChannelMessageReplies(
          message.replies || [],
          message['replies@odata.nextLink'] || null,
        );
        const chainMs = MicrosoftTeamsUtils.messageChainNewestMs(message, replies);
        if (Number.isFinite(chainMs) && chainMs > sinceMs) {
          pageReachesWindow = true;
          messages.push({ ...message, replies });
        }
      }

      if (!pageReachesWindow) break;
      nextUrl = response.json['@odata.nextLink'] || null;
    }

    return messages;
  },

  // Follow replies@odata.nextLink after an $expand=replies page.
  async fetchChannelMessageReplies(initialReplies, nextLink) {
    const replies = Array.isArray(initialReplies) ? [...initialReplies] : [];
    let url = nextLink || null;
    const maxReplyPages = 40;

    for (let page = 0; page < maxReplyPages && url; page++) {
      const response = await ld.request({
        method: 'GET',
        url: url,
        headers: {
          'Authorization': 'Bearer ' + data.auth.access_token,
          'Accept': 'application/json',
        },
      });

      if (response.status !== 200) {
        throw new Error(`Failed to list channel message replies (${response.status}): ${response.json?.error?.message || 'Unknown error'}`);
      }

      const batch = response.json?.value || [];
      for (const reply of batch) {
        replies.push(reply);
      }
      url = response.json['@odata.nextLink'] || null;
    }

    return replies;
  },

  // Chat messages with lastModifiedDateTime after `since` (server $filter + $orderby).
  async fetchChatMessagesModifiedSince(chatId, since, options) {
    const opts = options || {};
    const maxPages = Number.isFinite(opts.maxPages) ? opts.maxPages : 40;

    const messages = [];
    let nextUrl = `https://graph.microsoft.com/v1.0/chats/${encodeURIComponent(chatId)}/messages?$top=50&$orderby=${encodeURIComponent('lastModifiedDateTime desc')}&$filter=${encodeURIComponent(`lastModifiedDateTime gt ${since.toISOString()}`)}`;

    for (let page = 0; page < maxPages && nextUrl; page++) {
      const response = await ld.request({
        method: 'GET',
        url: nextUrl,
        headers: {
          'Authorization': 'Bearer ' + data.auth.access_token,
          'Accept': 'application/json',
        },
      });

      if (response.status !== 200) {
        throw new Error(`Failed to list chat messages (${response.status}): ${response.json?.error?.message || 'Unknown error'}`);
      }

      const batch = response.json?.value || [];
      for (const message of batch) {
        messages.push(message);
      }

      nextUrl = response.json['@odata.nextLink'] || null;
    }

    return messages;
  },

  parseAttachmentContent(content) {
    if (content === null || content === undefined || content === '') {
      return undefined;
    }
    if (typeof content !== 'string') {
      return content;
    }
    try {
      const parsed = JSON.parse(content);
      return parsed !== null && typeof parsed === 'object' ? parsed : content;
    } catch {
      return content;
    }
  },

  formatMessageAttachments(attachments) {
    return (attachments || []).map((attachment) => {
      const formatted = {
        id: attachment.id || null,
        name: attachment.name || null,
        contentType: attachment.contentType || null,
        contentUrl: attachment.contentUrl || null,
      };
      const content = MicrosoftTeamsUtils.parseAttachmentContent(attachment.content);
      if (content !== undefined) {
        formatted.content = content;
      }
      return formatted;
    });
  },

  extractAdaptiveCards(attachments) {
    return MicrosoftTeamsUtils.formatMessageAttachments(attachments).filter((attachment) => {
      const type = String(attachment.contentType || '').toLowerCase();
      return type.includes('adaptive');
    });
  },

  // Match a reaction filter against whatever Graph returned — no fixed emoji list.
  // Accepts the stored unicode reactionType (❤️ / 👍 / …) or the displayName (Like, Heart).
  // Variation selector U+FE0F is ignored so ❤️ and ❤ compare equal.
  reactionMatchesFilter(reaction, reactionFilter) {
    const filter = String(reactionFilter || '').trim();
    if (!filter) {
      return true;
    }

    const normalizeEmoji = (value) => String(value || '').replace(/\uFE0F/g, '');
    const type = String(reaction.reactionType || '');
    const name = String(reaction.displayName || '');
    const wanted = filter.toLowerCase();

    if (type === filter || normalizeEmoji(type) === normalizeEmoji(filter)) {
      return true;
    }
    if (type.toLowerCase() === wanted) {
      return true;
    }
    if (name && name.toLowerCase() === wanted) {
      return true;
    }

    return false;
  },

  reactionReactorUser(reaction) {
    return reaction.user?.user || reaction.user || null;
  },

  reactionEventId(messageId, reaction) {
    const userId = MicrosoftTeamsUtils.reactionReactorUser(reaction)?.id || 'unknown';
    const reactionType = reaction.reactionType || 'unknown';
    const reactedAt = reaction.createdDateTime || 'unknown';
    return `${messageId}_${userId}_${reactionType}_${reactedAt}`;
  },

  // Build polling events from message.reactions. Merges `context` into each event's data
  // (chatId / teamId / channelId / isReply / rootMessageId).
  collectReactionEvents(message, options) {
    const opts = options || {};
    const sinceMs = opts.sinceMs;
    const reactionFilter = opts.reactionFilter || '';
    const context = opts.context || {};
    const attachments = MicrosoftTeamsUtils.formatMessageAttachments(message.attachments);
    const adaptiveCards = MicrosoftTeamsUtils.extractAdaptiveCards(message.attachments);
    const reactions = Array.isArray(message.reactions) ? message.reactions : [];
    const events = [];

    for (const reaction of reactions) {
      if (!MicrosoftTeamsUtils.reactionMatchesFilter(reaction, reactionFilter)) {
        continue;
      }

      const reactedAt = reaction.createdDateTime || null;
      const reactedMs = Date.parse(reactedAt || '');
      // Skip reactions older than the lookback window. If Graph omits createdDateTime,
      // keep the reaction when the parent message is already in-window.
      if (Number.isFinite(reactedMs) && Number.isFinite(sinceMs) && reactedMs <= sinceMs) {
        continue;
      }

      events.push({
        id: MicrosoftTeamsUtils.reactionEventId(message.id, reaction),
        timestamp: reactedAt || message.lastModifiedDateTime || message.createdDateTime,
        data: {
          reactionType: reaction.reactionType || 'unknown',
          displayName: reaction.displayName || null,
          reactionContentUrl: reaction.reactionContentUrl || null,
          reactedAt,
          reactor: MicrosoftTeamsUtils.reactionReactorUser(reaction),
          messageId: message.id,
          messageContent: message.body?.content || '',
          messageContentType: message.body?.contentType || '',
          messageFrom: message.from?.user || null,
          attachments,
          adaptiveCards,
          ...context,
        },
      });
    }

    return events;
  },

  graphJsonHeaders() {
    return {
      'Authorization': 'Bearer ' + data.auth.access_token,
      'Accept': 'application/json',
    };
  },

  escapeODataLiteral(value) {
    return String(value).replace(/'/g, "''");
  },

  parseOccurrenceDate(raw) {
    if (!raw) return null;
    const trimmed = String(raw).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new Error('occurrenceDate must be a valid calendar date in YYYY-MM-DD format.');
    }
    const year = Number(trimmed.slice(0, 4));
    const month = Number(trimmed.slice(5, 7));
    const day = Number(trimmed.slice(8, 10));
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year
      || parsed.getUTCMonth() !== month - 1
      || parsed.getUTCDate() !== day
    ) {
      throw new Error('occurrenceDate must be a valid calendar date in YYYY-MM-DD format.');
    }
    return trimmed;
  },

  selectOccurrencePool(sorted, occurrenceDate) {
    const matching = (sorted || []).filter(item => String(item.createdDateTime || '').startsWith(occurrenceDate));
    if (matching.length > 0) {
      return { pool: matching, matched: true };
    }
    if (!sorted || sorted.length === 0) {
      return { pool: [], matched: false };
    }
    const closest = sorted.reduce((previous, current) => {
      const previousDiff = Math.abs(new Date(previous.createdDateTime).getTime() - new Date(occurrenceDate).getTime());
      const currentDiff = Math.abs(new Date(current.createdDateTime).getTime() - new Date(occurrenceDate).getTime());
      return currentDiff < previousDiff ? current : previous;
    });
    return { pool: [closest], matched: false };
  },

  isTransientGraphStatus(status) {
    return status === 429 || (status >= 500 && status <= 599);
  },

  retryPollError(message, status) {
    const error = new Error(message);
    error.retryPoll = true;
    error.status = status;
    return error;
  },

  async findMeetingsByJoinUrl(joinUrl) {
    const escaped = MicrosoftTeamsUtils.escapeODataLiteral(joinUrl);
    const response = await ld.request({
      method: 'GET',
      url: `https://graph.microsoft.com/v1.0/me/onlineMeetings?$filter=${encodeURIComponent(`JoinWebUrl eq '${escaped}'`)}`,
      headers: MicrosoftTeamsUtils.graphJsonHeaders(),
    });
    if (MicrosoftTeamsUtils.isTransientGraphStatus(response.status)) {
      throw MicrosoftTeamsUtils.retryPollError(
        `Failed to find meeting by join URL (${response.status}): ${response.json?.error?.message || 'Unknown error'}`,
        response.status,
      );
    }
    return response.status === 200 ? (response.json?.value || []) : [];
  },

  async findMeetingByPredicate(predicate) {
    const MAX_ONLINE_MEETING_PAGES = 20;
    let pages = 0;
    let url = 'https://graph.microsoft.com/v1.0/me/onlineMeetings?$top=100&$orderby=createdDateTime desc';
    while (url && pages < MAX_ONLINE_MEETING_PAGES) {
      pages += 1;
      const response = await ld.request({
        method: 'GET',
        url,
        headers: MicrosoftTeamsUtils.graphJsonHeaders(),
      });
      if (MicrosoftTeamsUtils.isTransientGraphStatus(response.status)) {
        throw MicrosoftTeamsUtils.retryPollError(
          `Failed to list online meetings (${response.status}): ${response.json?.error?.message || 'Unknown error'}`,
          response.status,
        );
      }
      if (response.status !== 200) return [];
      const found = (response.json?.value || []).find(predicate);
      if (found) return [found];
      url = response.json?.['@odata.nextLink'] || null;
    }
    if (url) {
      throw MicrosoftTeamsUtils.retryPollError(
        'Online meeting listing was truncated before a match was found. Retry the request.',
        200,
      );
    }
    return [];
  },

  async listOrganizerOnlineMeetings(options) {
    const opts = options || {};
    const maxPages = Number.isFinite(opts.maxPages) ? opts.maxPages : Number.POSITIVE_INFINITY;
    const createdAfterMs = Number.isFinite(opts.createdAfterMs) ? opts.createdAfterMs : null;
    const onPage = typeof opts.onPage === 'function' ? opts.onPage : null;
    let pages = 0;
    let url = 'https://graph.microsoft.com/v1.0/me/onlineMeetings?$top=100&$orderby=createdDateTime desc';
    const meetings = [];
    while (url && pages < maxPages) {
      pages += 1;
      const response = await ld.request({
        method: 'GET',
        url,
        headers: MicrosoftTeamsUtils.graphJsonHeaders(),
      });
      if (MicrosoftTeamsUtils.isTransientGraphStatus(response.status)) {
        throw MicrosoftTeamsUtils.retryPollError(
          `Failed to list online meetings (${response.status}): ${response.json?.error?.message || 'Unknown error'}`,
          response.status,
        );
      }
      if (response.status !== 200) {
        const message = response.json?.error?.message || 'Unknown error';
        const error = new Error(`Failed to list online meetings (${response.status}): ${message}`);
        error.status = response.status;
        // Delegated Graph cannot list /me/onlineMeetings without JoinWebUrl or joinMeetingId.
        if (response.status === 400) {
          error.code = 'OnlineMeetingsListRequiresLookup';
        }
        throw error;
      }
      let pageMeetings = response.json?.value || [];
      url = response.json?.['@odata.nextLink'] || null;
      if (createdAfterMs != null) {
        const oldest = pageMeetings[pageMeetings.length - 1];
        const oldestMs = Date.parse((oldest && oldest.createdDateTime) || '');
        pageMeetings = pageMeetings.filter((meeting) => {
          const createdMs = Date.parse(meeting.createdDateTime || '');
          return !Number.isFinite(createdMs) || createdMs >= createdAfterMs;
        });
        // Newest-first: once a page falls entirely before the window, stop paging.
        if (Number.isFinite(oldestMs) && oldestMs < createdAfterMs) {
          url = null;
        }
      }
      if (onPage) {
        const result = await onPage(pageMeetings, { hasMore: Boolean(url) });
        if (result && result.stop) {
          return { meetings, truncated: true };
        }
      } else {
        meetings.push(...pageMeetings);
      }
    }
    return { meetings, truncated: Boolean(url) };
  },

  async listCalendarViewEvents(startDateTime, endDateTime, options) {
    const opts = options || {};
    const maxPages = Number.isFinite(opts.maxPages) ? opts.maxPages : Number.POSITIVE_INFINITY;
    const match = typeof opts.match === 'function' ? opts.match : null;
    const selectParam = opts.select || 'id,subject,start,end,onlineMeeting,isOnlineMeeting,body';
    let extra = '';
    if (opts.filter) extra += `&$filter=${encodeURIComponent(opts.filter)}`;
    if (opts.orderby) extra += `&$orderby=${opts.orderby}`;
    let url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(startDateTime)}&endDateTime=${encodeURIComponent(endDateTime)}&$top=100&$select=${selectParam}${extra}`;
    const events = [];
    let pages = 0;
    const headers = { ...MicrosoftTeamsUtils.graphJsonHeaders(), 'Prefer': 'outlook.timezone="UTC"' };
    while (url && pages < maxPages) {
      pages += 1;
      const response = await ld.request({ method: 'GET', url, headers });
      if (MicrosoftTeamsUtils.isTransientGraphStatus(response.status)) {
        throw MicrosoftTeamsUtils.retryPollError(
          `Failed to fetch calendar events (${response.status}): ${response.json?.error?.message || 'Unknown error'}`,
          response.status,
        );
      }
      if (response.status !== 200) {
        return { status: response.status, events: [], error: response.json?.error?.message };
      }
      const pageEvents = response.json?.value || [];
      events.push(...pageEvents);
      if (match) {
        const found = pageEvents.find(match);
        if (found) {
          return { status: 200, events, matched: found, truncated: false };
        }
      }
      url = response.json?.['@odata.nextLink'] || null;
    }
    if (url) {
      throw MicrosoftTeamsUtils.retryPollError(
        'Calendar listing was truncated before all events were read. Retry the request.',
        200,
      );
    }
    return { status: 200, events, matched: null };
  },

  recordingScopeError() {
    const error = new Error(
      'Missing permission to read meeting recordings. Reconnect Microsoft Teams after OnlineMeetingRecording.Read.All is enabled.',
    );
    error.code = 'OnlineMeetingRecordingScopeMissing';
    error.status = 403;
    return error;
  },

  meetingChatScopeError() {
    const error = new Error(
      'Missing permission to list meeting chats used to find recordings. Reconnect Microsoft Teams after Chat.ReadBasic is enabled.',
    );
    error.code = 'MeetingChatScopeMissing';
    error.status = 403;
    return error;
  },

  recordingLookupDeniedError(message) {
    const error = new Error(message || 'You do not have access to recordings for this meeting. You must be the organizer.');
    error.code = 'OnlineMeetingRecordingLookupDenied';
    error.status = 403;
    return error;
  },

  isOrganizerRecordingDenied(response) {
    const graphError = response && response.json && response.json.error;
    const innerErrorCode = String(graphError && graphError.innerError && graphError.innerError.code || '');
    if (innerErrorCode === '3003') return true;
    const graphCode = String(graphError && graphError.code || '');
    if (graphCode === '3003') return true;
    const message = String(graphError && graphError.message || '');
    if (!innerErrorCode && /^3003:/i.test(message)) return true;
    return /does not have access to lookup meeting|may not be the meeting organizer|participants don't have permission|not the meeting organizer/i
      .test(message);
  },

  recordingOrganizerUserId(recording) {
    const organizer = recording && recording.meetingOrganizer;
    if (!organizer) return null;
    if (organizer.user && organizer.user.id) return organizer.user.id;
    if (organizer.id) return organizer.id;
    return null;
  },

  // Graph can list invitee-visible recordings; MP4 download is organizer-only.
  // Unknown identity or missing organizer metadata is treated as not owned.
  isVerifiedOrganizerRecording(recording, currentUserId) {
    const organizerId = MicrosoftTeamsUtils.recordingOrganizerUserId(recording);
    return Boolean(currentUserId && organizerId && organizerId === currentUserId);
  },

  async currentUserId() {
    if (MicrosoftTeamsUtils._cachedUserId) return MicrosoftTeamsUtils._cachedUserId;
    let meResponse;
    try {
      meResponse = await ld.request({
        method: 'GET',
        url: 'https://graph.microsoft.com/v1.0/me?$select=id',
        headers: MicrosoftTeamsUtils.graphJsonHeaders(),
      });
    } catch (error) {
      if (error.retryPoll || MicrosoftTeamsUtils.isTransientGraphStatus(error.status)) throw error;
      return null;
    }
    if (MicrosoftTeamsUtils.isTransientGraphStatus(meResponse.status)) {
      throw MicrosoftTeamsUtils.retryPollError(
        `Failed to identify the signed-in user (${meResponse.status}): ${meResponse.json?.error?.message || 'Unknown error'}`,
        meResponse.status,
      );
    }
    if (meResponse.status === 200 && meResponse.json && meResponse.json.id) {
      MicrosoftTeamsUtils._cachedUserId = meResponse.json.id;
      return MicrosoftTeamsUtils._cachedUserId;
    }
    return null;
  },

  async listOnlineMeetingRecordings(onlineMeetingId) {
    let url = `https://graph.microsoft.com/v1.0/me/onlineMeetings/${encodeURIComponent(onlineMeetingId)}/recordings`;
    const recordings = [];
    while (url) {
      const response = await ld.request({
        method: 'GET',
        url,
        headers: MicrosoftTeamsUtils.graphJsonHeaders(),
      });
      if (response.status === 403) {
        if (MicrosoftTeamsUtils.isOrganizerRecordingDenied(response)) {
          throw MicrosoftTeamsUtils.recordingLookupDeniedError(response.json?.error?.message);
        }
        throw MicrosoftTeamsUtils.recordingScopeError();
      }
      if (MicrosoftTeamsUtils.isTransientGraphStatus(response.status)) {
        throw MicrosoftTeamsUtils.retryPollError(
          `Failed to get recordings (${response.status}): ${response.json?.error?.message || 'Unknown error'}`,
          response.status,
        );
      }
      if (response.status !== 200) {
        throw new Error(
          `Failed to get recordings (${response.status}): ${response.json?.error?.message || 'Unknown error'}`,
        );
      }
      recordings.push(...(response.json?.value || []));
      url = response.json?.['@odata.nextLink'] || null;
    }
    return recordings;
  },

  recordingContentUrl(onlineMeetingId, recording) {
    if (recording && recording.recordingContentUrl) return recording.recordingContentUrl;
    return `https://graph.microsoft.com/v1.0/me/onlineMeetings/${encodeURIComponent(onlineMeetingId)}/recordings/${encodeURIComponent(recording.id)}/content`;
  },

  recordingFileName(subject, createdDateTime) {
    const usableSubject = subject && subject !== '(No subject)' ? subject : 'meeting';
    const sanitizedSubject = String(usableSubject).replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'meeting';
    const createdStamp = String(createdDateTime || '')
      .replace(/[:.]/g, '-')
      .substring(0, 19) || 'recording';
    return `${sanitizedSubject}_${createdStamp}.mp4`;
  },

  // Downloads one organizer MP4. Caps at 100MB. Retries while Graph is still encoding.
  async downloadOnlineMeetingRecordingFile(onlineMeetingId, recording, options) {
    const MAX_RECORDING_BYTES = 100 * 1024 * 1024;
    const ENCODING_BACKOFF_MS = [2000, 4000, 8000, 16000];
    const opts = options || {};
    const remainingBytes = Number.isFinite(opts.remainingBytes) ? opts.remainingBytes : MAX_RECORDING_BYTES;
    const subject = opts.subject || recording.subject || '(No subject)';

    const bufferByteLength = (buffer) => {
      if (!buffer) return 0;
      if (typeof buffer.byteLength === 'number') return buffer.byteLength;
      if (typeof buffer.length === 'number') return buffer.length;
      return 0;
    };
    const contentLengthFromHeaders = (headers) => {
      if (!headers) return null;
      const raw = headers['content-length'] || headers['Content-Length'] || headers['Content-length'];
      const parsed = parseInt(raw, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };
    const contentLengthFromContentRange = (headers) => {
      if (!headers) return null;
      const raw = headers['content-range'] || headers['Content-Range'] || headers['Content-range'];
      const match = String(raw || '').match(/\/(\d+)\s*$/);
      const parsed = match ? parseInt(match[1], 10) : NaN;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };
    const assertRecordingSize = (headerLength, buffer) => {
      if (headerLength && headerLength > remainingBytes) {
        throw new Error(
          `Recording is too large to download (${headerLength} bytes). Remaining budget is ${remainingBytes} bytes (~100MB total).`,
        );
      }
      const bytes = bufferByteLength(buffer);
      if (bytes > remainingBytes) {
        throw new Error(
          `Recording is too large to download (${bytes} bytes). Remaining budget is ${remainingBytes} bytes (~100MB total).`,
        );
      }
    };
    const isRecordingNotReady = (response) => {
      if (!response) return false;
      if (response.status === 404) return true;
      const code = String(response.json?.error?.code || '');
      const inner = String(response.json?.error?.innerError?.code || '');
      const message = String(response.json?.error?.message || '').toLowerCase();
      return /notready|not.?ready|encoding|notyetavailable|stillbeingprocessed/i.test(code + inner)
        || /not yet available|still being processed|encoding|not ready/.test(message);
    };

    const authHeader = { 'Authorization': 'Bearer ' + data.auth.access_token };
    const probeRecording = async (url) => {
      try {
        const headResponse = await ld.request({ method: 'HEAD', url, headers: authHeader });
        const headLength = contentLengthFromHeaders(headResponse.headers);
        if (headLength) {
          assertRecordingSize(headLength, null);
          return {};
        }
      } catch (error) {
        if (/too large to download/.test(error.message)) throw error;
      }
      try {
        const rangeResponse = await ld.request({
          method: 'GET',
          url,
          headers: { ...authHeader, 'Range': 'bytes=0-0' },
        });
        if (rangeResponse.status === 206) {
          const rangeLength = contentLengthFromContentRange(rangeResponse.headers)
            || contentLengthFromHeaders(rangeResponse.headers);
          if (rangeLength) assertRecordingSize(rangeLength, null);
          return {};
        }
        if (rangeResponse.status === 200 && rangeResponse.buffer) {
          assertRecordingSize(contentLengthFromHeaders(rangeResponse.headers), rangeResponse.buffer);
          return { response: rangeResponse };
        }
      } catch (error) {
        if (/too large to download/.test(error.message)) throw error;
      }
      return {};
    };

    const downloadRecordingContent = async (url) => {
      if (remainingBytes <= 0) {
        throw new Error(
          `Recording is too large to download (0 remaining). Remaining budget is ${remainingBytes} bytes (~100MB total).`,
        );
      }
      const probed = await probeRecording(url);
      if (probed.response) return probed.response;
      return ld.request({
        method: 'GET',
        url,
        headers: authHeader,
        responseType: 'stream',
      });
    };

    const canonicalUrl = `https://graph.microsoft.com/v1.0/me/onlineMeetings/${encodeURIComponent(onlineMeetingId)}/recordings/${encodeURIComponent(recording.id)}/content`;
    const fallbackUrl = recording.recordingContentUrl && recording.recordingContentUrl !== canonicalUrl
      ? recording.recordingContentUrl
      : null;
    const urls = fallbackUrl ? [canonicalUrl, fallbackUrl] : [canonicalUrl];

    let lastResponse = null;
    for (let attempt = 0; attempt <= ENCODING_BACKOFF_MS.length; attempt++) {
      for (const url of urls) {
        lastResponse = await downloadRecordingContent(url);
        if (lastResponse.status === 403) {
          if (MicrosoftTeamsUtils.isOrganizerRecordingDenied(lastResponse)) {
            throw MicrosoftTeamsUtils.recordingLookupDeniedError(lastResponse.json?.error?.message);
          }
          throw MicrosoftTeamsUtils.recordingScopeError();
        }
        if (lastResponse.status === 200 && lastResponse.buffer) {
          assertRecordingSize(contentLengthFromHeaders(lastResponse.headers), lastResponse.buffer);
          return {
            fileName: MicrosoftTeamsUtils.recordingFileName(subject, recording.createdDateTime),
            mimeType: 'video/mp4',
            buffer: lastResponse.buffer,
            lastModified: recording.createdDateTime,
          };
        }
        if (lastResponse.status === 200 && !lastResponse.buffer) {
          throw new Error('Recording download succeeded but no file buffer was received.');
        }
        if (MicrosoftTeamsUtils.isTransientGraphStatus(lastResponse.status)) {
          throw MicrosoftTeamsUtils.retryPollError(
            `Failed to download recording (${lastResponse.status}): ${lastResponse.json?.error?.message || 'Unknown error'}`,
            lastResponse.status,
          );
        }
        if (!isRecordingNotReady(lastResponse) && lastResponse.status !== 404) {
          throw new Error(
            `Failed to download recording (${lastResponse.status}): ${lastResponse.json?.error?.message || 'Unknown error'}`,
          );
        }
      }
      if (attempt >= ENCODING_BACKOFF_MS.length) break;
      await ld.wait(ENCODING_BACKOFF_MS[attempt]);
    }

    throw new Error(
      `Recording is still encoding (${lastResponse?.status || 'unknown'}). Try again in a few minutes.`,
    );
  },

  async listOrganizerMeetingsFromMeetingChats(options) {
    const opts = options || {};
    const maxPages = Number.isFinite(opts.maxPages) ? opts.maxPages : Number.POSITIVE_INFINITY;
    const createdAfterMs = Number.isFinite(opts.createdAfterMs) ? opts.createdAfterMs : null;
    const onPage = typeof opts.onPage === 'function' ? opts.onPage : null;
    const filterParam = '&$filter=' + encodeURIComponent("chatType eq 'meeting'");
    const expandOrder = '&$expand=lastMessagePreview&$orderby='
      + encodeURIComponent('lastMessagePreview/createdDateTime desc');
    const meetings = [];
    const seenJoinUrls = new Set();
    let pages = 0;
    let ordered = true;
    let url = 'https://graph.microsoft.com/v1.0/me/chats?$top=50' + filterParam + expandOrder;
    let currentUserId = null;
    try {
      const meResponse = await ld.request({
        method: 'GET',
        url: 'https://graph.microsoft.com/v1.0/me?$select=id',
        headers: MicrosoftTeamsUtils.graphJsonHeaders(),
      });
      if (meResponse.status === 200 && meResponse.json && meResponse.json.id) {
        currentUserId = meResponse.json.id;
        MicrosoftTeamsUtils._cachedUserId = currentUserId;
      }
    } catch (_error) {
      currentUserId = null;
    }

    const chatActivityMs = (chat) => Date.parse(
      (chat.lastMessagePreview && chat.lastMessagePreview.createdDateTime)
        || chat.lastUpdatedDateTime
        || chat.createdDateTime
        || '',
    );

    while (url && pages < maxPages) {
      pages += 1;
      const response = await ld.request({
        method: 'GET',
        url,
        headers: MicrosoftTeamsUtils.graphJsonHeaders(),
      });
      if (MicrosoftTeamsUtils.isTransientGraphStatus(response.status)) {
        throw MicrosoftTeamsUtils.retryPollError(
          `Failed to list meeting chats (${response.status}): ${response.json?.error?.message || 'Unknown error'}`,
          response.status,
        );
      }
      if ((response.status === 400 || response.status === 403) && ordered && pages === 1) {
        // $filter+$orderby+$expand can 400 together even when each works alone.
        // lastMessagePreview can also 403 on Chat.ReadBasic; retry without it.
        ordered = false;
        pages = 0;
        url = 'https://graph.microsoft.com/v1.0/me/chats?$top=50' + filterParam;
        continue;
      }
      if (response.status === 403) {
        throw MicrosoftTeamsUtils.meetingChatScopeError();
      }
      if (response.status !== 200) {
        throw new Error(
          `Failed to list meeting chats (${response.status}): ${response.json?.error?.message || 'Unknown error'}`,
        );
      }

      const pageChats = response.json?.value || [];
      const pageMeetings = [];
      let inWindowOnPage = 0;
      for (const chat of pageChats) {
        const activityMs = chatActivityMs(chat);
        if (createdAfterMs != null && Number.isFinite(activityMs) && activityMs < createdAfterMs) {
          continue;
        }
        inWindowOnPage += 1;
        if (chat.chatType !== 'meeting') continue;
        const chatOrganizerId = chat.onlineMeetingInfo
          && chat.onlineMeetingInfo.organizer
          && chat.onlineMeetingInfo.organizer.id;
        // Recordings are organizer-only; skip other people's meeting chats.
        if (currentUserId && chatOrganizerId && chatOrganizerId !== currentUserId) continue;
        const joinUrl = chat.onlineMeetingInfo && chat.onlineMeetingInfo.joinWebUrl;
        if (!joinUrl || seenJoinUrls.has(joinUrl)) continue;
        seenJoinUrls.add(joinUrl);

        let found = [];
        try {
          found = await MicrosoftTeamsUtils.findMeetingsByJoinUrl(joinUrl);
        } catch (error) {
          if (error.retryPoll) throw error;
          continue;
        }
        if (!found[0] || !found[0].id) continue;
        pageMeetings.push({
          id: found[0].id,
          subject: found[0].subject || chat.topic,
          joinWebUrl: found[0].joinWebUrl || joinUrl,
          createdDateTime: found[0].createdDateTime || chat.createdDateTime,
        });
      }

      // Only stop early when Graph honored newest-first lastMessagePreview order.
      url = (ordered && createdAfterMs != null && pageChats.length > 0 && inWindowOnPage === 0)
        ? null
        : (response.json?.['@odata.nextLink'] || null);

      if (onPage) {
        const result = await onPage(pageMeetings, { hasMore: Boolean(url) });
        if (result && result.stop) {
          return { meetings, truncated: true };
        }
      } else {
        meetings.push(...pageMeetings);
      }
    }

    return { meetings, truncated: Boolean(url) };
  },

  // Recordings whose createdDateTime is at or after sinceMs, for organizer-owned
  // online meetings, with calendar metadata when Graph can provide it.
  // Delegated Graph cannot list /me/onlineMeetings without a lookup filter, so
  // this falls back to meeting chats (joinUrl) when that list returns 400.
  // Calendar is enrichment only (joinUrl/eventId/start/end): a missing mailbox
  // or other calendar failure does not abort. Connection-wide recording-scope
  // 403 and transient 429/5xx throw; any other per-meeting recording-list
  // failure skips that meeting.
  //
  // When sinceMs > 0 (polling), discovery stays inside that window: calendar
  // join URLs for recently ended meetings, plus newest-first meeting lists
  // stopped at createdAfterMs. Unfiltered list (sinceMs = 0) still pages until
  // recordingLimit is filled or the provider is exhausted, and truncated is
  // true only when more provider pages or unprocessed meetings remain.
  async listRecentOrganizerRecordings(sinceMs, options) {
    const opts = options || {};
    const maxPages = Number.isFinite(opts.maxPages) ? opts.maxPages : Number.POSITIVE_INFINITY;
    const recordingLimit = Number.isFinite(opts.recordingLimit) ? opts.recordingLimit : null;
    const bufferMs = Number.isFinite(opts.meetingCreatedBufferMs)
      ? opts.meetingCreatedBufferMs
      : 6 * 60 * 60 * 1000;
    const createdAfterMs = sinceMs - bufferMs;
    const windowed = sinceMs > 0;

    const eventsByJoinUrl = new Map();
    // Windowed polls use calendar join URLs for discovery. Unfiltered list
    // (sinceMs=0) finds recordings from meeting lists and does not wait on a
    // year of calendar pages first.
    if (windowed) {
      try {
        const calendarStartMs = Math.max(
          createdAfterMs,
          Date.now() - (365 * 24 * 60 * 60 * 1000),
        );
        const calendar = await MicrosoftTeamsUtils.listCalendarViewEvents(
          new Date(calendarStartMs).toISOString(),
          new Date().toISOString(),
          {
            select: 'id,subject,start,end,onlineMeeting,isOnlineMeeting',
            orderby: 'end/dateTime desc',
            maxPages: Number.POSITIVE_INFINITY,
          },
        );
        if (calendar.status === 200) {
          for (const event of calendar.events) {
            const joinUrl = event.onlineMeeting && event.onlineMeeting.joinUrl;
            if (!event.isOnlineMeeting || !joinUrl || eventsByJoinUrl.has(joinUrl)) continue;
            eventsByJoinUrl.set(joinUrl, event);
          }
        }
      } catch (error) {
        if (error.retryPoll || MicrosoftTeamsUtils.isTransientGraphStatus(error.status)) throw error;
        // Permanent calendar failures stay optional (no mailbox, etc.).
      }
    }

    const items = [];
    const seenMeetingIds = new Set();
    let attempted = 0;
    let scopeDenied = 0;
    let truncated = false;
    const currentUserId = await MicrosoftTeamsUtils.currentUserId();

    const recordingQualifies = (recording) => {
      if (!recording.id) return false;
      const createdMs = Date.parse(recording.createdDateTime || '');
      if (Number.isFinite(createdMs) && createdMs < sinceMs) return false;
      return MicrosoftTeamsUtils.isVerifiedOrganizerRecording(recording, currentUserId);
    };

    async function addRecordingsFromMeeting(meeting) {
      if (!meeting || !meeting.id || seenMeetingIds.has(meeting.id)) {
        return { filled: false, moreOnMeeting: false };
      }
      seenMeetingIds.add(meeting.id);

      let recordings;
      attempted += 1;
      try {
        recordings = await MicrosoftTeamsUtils.listOnlineMeetingRecordings(meeting.id);
      } catch (error) {
        if (error.retryPoll || MicrosoftTeamsUtils.isTransientGraphStatus(error.status)) throw error;
        if (error.code === 'OnlineMeetingRecordingScopeMissing') {
          scopeDenied += 1;
        }
        return { filled: false, moreOnMeeting: false };
      }

      const joinUrl = meeting.joinWebUrl || null;
      const event = joinUrl ? eventsByJoinUrl.get(joinUrl) : null;
      const subject = (event && event.subject) || meeting.subject || '(No subject)';

      for (let index = 0; index < recordings.length; index++) {
        const recording = recordings[index];
        if (!recordingQualifies(recording)) continue;

        const item = {
          onlineMeetingId: meeting.id,
          subject,
          joinUrl,
          recording,
        };
        if (event) {
          if (event.id) item.eventId = event.id;
          if (event.start && event.start.dateTime) item.meetingStart = event.start.dateTime;
          if (event.end && event.end.dateTime) item.meetingEnd = event.end.dateTime;
        }
        items.push(item);
        if (recordingLimit != null && items.length >= recordingLimit) {
          let moreOnMeeting = false;
          for (let rest = index + 1; rest < recordings.length; rest++) {
            if (recordingQualifies(recordings[rest])) {
              moreOnMeeting = true;
              break;
            }
          }
          return { filled: true, moreOnMeeting };
        }
      }
      return { filled: false, moreOnMeeting: false };
    }

    async function consumeMeetings(pageMeetings, meta) {
      for (let index = 0; index < pageMeetings.length; index++) {
        const result = await addRecordingsFromMeeting(pageMeetings[index]);
        if (result.filled) {
          const moreOnPage = pageMeetings.slice(index + 1).some((meeting) => (
            meeting && meeting.id && !seenMeetingIds.has(meeting.id)
          ));
          truncated = result.moreOnMeeting || moreOnPage || Boolean(meta && meta.hasMore);
          return { stop: true };
        }
      }
      truncated = Boolean(meta && meta.hasMore);
      return { stop: false };
    }

    // Scheduled meetings can be created months before they record. Windowed
    // polls resolve calendar join URLs in the lookback first so those are not
    // dropped when meeting-list paging stops at createdAfterMs.
    if (windowed && eventsByJoinUrl.size > 0) {
      const calendarMeetings = [];
      for (const [joinUrl] of eventsByJoinUrl) {
        let found = [];
        try {
          found = await MicrosoftTeamsUtils.findMeetingsByJoinUrl(joinUrl);
        } catch (error) {
          if (error.retryPoll) throw error;
          continue;
        }
        if (!found[0] || !found[0].id) continue;
        calendarMeetings.push(found[0]);
      }
      if (calendarMeetings.length > 0) {
        const consumed = await consumeMeetings(calendarMeetings, { hasMore: true });
        if (consumed.stop) {
          if (attempted > 0 && scopeDenied === attempted) {
            throw MicrosoftTeamsUtils.recordingScopeError();
          }
          return { items, truncated };
        }
      }
    }

    const listOpts = {
      maxPages,
      createdAfterMs: windowed ? createdAfterMs : null,
      onPage: consumeMeetings,
    };
    try {
      await MicrosoftTeamsUtils.listOrganizerOnlineMeetings(listOpts);
    } catch (error) {
      if (error.code !== 'OnlineMeetingsListRequiresLookup') throw error;
      await MicrosoftTeamsUtils.listOrganizerMeetingsFromMeetingChats(listOpts);
    }

    if (attempted > 0 && scopeDenied === attempted) {
      throw MicrosoftTeamsUtils.recordingScopeError();
    }

    return { items, truncated };
  },

  // Resolve a Graph meeting ID, join URL, meetingRecap URL, or conference ID.
  // Actions throw; polling triggers pass throwOnNotFound: false and treat null as no match.
  async resolveOnlineMeeting(identifier, options) {
    const opts = options || {};
    const throwOnNotFound = opts.throwOnNotFound !== false;
    const resourceName = opts.resourceName || 'transcripts';
    const resourceSingular = opts.resourceSingular || 'transcript';
    const fail = (message) => {
      if (throwOnNotFound) throw new Error(message);
      return null;
    };

    const trimmed = String(identifier || '').trim();
    if (!trimmed) {
      return fail('Could not resolve the meeting identifier. Provide a Teams join URL, meetingRecap URL, conference ID, or meeting ID.');
    }

    const PAST_DAYS = 365;
    const FUTURE_DAYS = 90;
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const jsonHeaders = MicrosoftTeamsUtils.graphJsonHeaders();
    const isUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://');

    const toResult = (meeting, subject, joinUrl) => ({
      onlineMeetingId: meeting.id,
      meetingSubject: subject || meeting.subject || '(No subject)',
      joinUrl: joinUrl || meeting.joinWebUrl || null,
    });

    const safeDecode = (value) => {
      try {
        return decodeURIComponent(value);
      } catch (_error) {
        return null;
      }
    };

    if (isUrl && /\/meetingrecap/i.test(trimmed)) {
      const iCalUidMatch = trimmed.match(/[?&]iCalUid=([^&]+)/i);
      const iCalUid = iCalUidMatch ? safeDecode(iCalUidMatch[1]) : null;

      if (!iCalUid) {
        return fail('Could not extract iCalUid from meetingRecap URL. Please provide a valid meetingRecap URL or use the meeting join URL instead.');
      }

      const now = new Date();
      const startDateTime = new Date(now.getTime() - PAST_DAYS * MS_PER_DAY).toISOString();
      const endDateTime = new Date(now.getTime() + FUTURE_DAYS * MS_PER_DAY).toISOString();
      const escapedICalUid = MicrosoftTeamsUtils.escapeODataLiteral(iCalUid);
      const calendar = await MicrosoftTeamsUtils.listCalendarViewEvents(
        startDateTime,
        endDateTime,
        {
          select: 'id,subject,onlineMeeting,isOnlineMeeting',
          filter: `iCalUId eq '${escapedICalUid}'`,
        },
      );

      if (calendar.status !== 200) {
        return fail(`Failed to find calendar event (${calendar.status}): ${calendar.error || 'Unknown error'}`);
      }

      if (calendar.events.length === 0) {
        return fail('Meeting not found using meetingRecap URL. The calendar event may have been deleted or you may not have access.');
      }

      const calendarEvent = calendar.events[0];
      if (!calendarEvent.isOnlineMeeting || !calendarEvent.onlineMeeting?.joinUrl) {
        return fail('The calendar event is not a Teams meeting or does not have a join URL.');
      }

      const joinUrl = calendarEvent.onlineMeeting.joinUrl;
      const threadIdMatch = trimmed.match(/[?&]threadId=([^&]+)/i);
      const decodedThreadId = threadIdMatch ? safeDecode(threadIdMatch[1]) : null;

      let meetings = [];
      try {
        meetings = await MicrosoftTeamsUtils.findMeetingsByJoinUrl(joinUrl);
      } catch (error) {
        if (!error.retryPoll || !decodedThreadId) throw error;
      }

      if (meetings.length === 0 && decodedThreadId) {
        meetings = await MicrosoftTeamsUtils.findMeetingByPredicate(
          meeting => meeting.chatInfo?.threadId === decodedThreadId,
        );
      }

      if (meetings.length === 0) {
        return fail(`Meeting found in calendar but could not retrieve ${resourceSingular} access. You must be the organizer to access meeting ${resourceName}.`);
      }

      return toResult(meetings[0], calendarEvent.subject, joinUrl);
    }

    if (isUrl) {
      const meetings = await MicrosoftTeamsUtils.findMeetingsByJoinUrl(trimmed);
      if (meetings.length === 0) {
        return fail(`Meeting not found using join URL. You must be the organizer to access meeting ${resourceName}.`);
      }
      return toResult(meetings[0], meetings[0].subject, trimmed);
    }

    if (/^MS/i.test(trimmed)) {
      const response = await ld.request({
        method: 'GET',
        url: `https://graph.microsoft.com/v1.0/me/onlineMeetings/${encodeURIComponent(trimmed)}`,
        headers: jsonHeaders,
      });
      if (MicrosoftTeamsUtils.isTransientGraphStatus(response.status)) {
        throw MicrosoftTeamsUtils.retryPollError(
          `Failed to get online meeting (${response.status}): ${response.json?.error?.message || 'Unknown error'}`,
          response.status,
        );
      }
      if (response.status === 200 && response.json?.id) {
        return toResult(response.json, response.json.subject, response.json.joinWebUrl);
      }
      return fail(`Meeting not found using meeting ID. You must be the organizer to access meeting ${resourceName}.`);
    }

    const normalizedConferenceId = trimmed.replace(/\s+/g, '');
    if (!/^\d+$/.test(normalizedConferenceId)) {
      return fail('Invalid conference ID format. Please provide digits only (spaces are allowed).');
    }

    const escapedConferenceId = MicrosoftTeamsUtils.escapeODataLiteral(normalizedConferenceId);
    const directResponse = await ld.request({
      method: 'GET',
      url: `https://graph.microsoft.com/v1.0/me/onlineMeetings?$filter=${encodeURIComponent(`joinMeetingIdSettings/joinMeetingId eq '${escapedConferenceId}'`)}`,
      headers: jsonHeaders,
    });

    if (MicrosoftTeamsUtils.isTransientGraphStatus(directResponse.status)) {
      throw MicrosoftTeamsUtils.retryPollError(
        `Failed to find meeting by conference ID (${directResponse.status}): ${directResponse.json?.error?.message || 'Unknown error'}`,
        directResponse.status,
      );
    }

    if (directResponse.status === 200 && directResponse.json?.value?.length > 0) {
      const meeting = directResponse.json.value[0];
      return toResult(meeting, meeting.subject, meeting.joinWebUrl);
    }

    const now = new Date();
    const startDateTime = new Date(now.getTime() - PAST_DAYS * MS_PER_DAY).toISOString();
    const endDateTime = new Date(now.getTime() + FUTURE_DAYS * MS_PER_DAY).toISOString();
    const calendar = await MicrosoftTeamsUtils.listCalendarViewEvents(
      startDateTime,
      endDateTime,
      {
        select: 'id,subject,createdDateTime,start,end,onlineMeeting,organizer,isOnlineMeeting,body',
        orderby: 'start/dateTime desc',
      },
    );

    if (calendar.status !== 200) {
      return fail(`Failed to fetch calendar events (${calendar.status}): ${calendar.error || 'Unknown error'}`);
    }

    const teamsMeetings = calendar.events.filter(
      event => event.isOnlineMeeting === true && event.onlineMeeting?.joinUrl,
    );

    let matchedMeeting = null;
    for (const meeting of teamsMeetings) {
      const conferenceMatch = (meeting.body?.content || '').match(/(\d{3}\s\d{3}\s\d{3}\s\d{3}\s\d{2})/);
      if (conferenceMatch && conferenceMatch[1].replace(/\s/g, '') === normalizedConferenceId) {
        matchedMeeting = meeting;
        break;
      }
    }

    if (!matchedMeeting) {
      return fail(`Meeting not found with conference ID ${trimmed}. Make sure you're the organizer and the meeting exists within the past year.`);
    }

    const joinUrl = matchedMeeting.onlineMeeting?.joinUrl;
    let meetings = await MicrosoftTeamsUtils.findMeetingsByJoinUrl(joinUrl);

    if (meetings.length === 0) {
      meetings = await MicrosoftTeamsUtils.findMeetingByPredicate(
        meeting => {
          const meetingConfId = meeting.joinMeetingIdSettings?.joinMeetingId?.replace(/\s/g, '');
          return meetingConfId === normalizedConferenceId;
        },
      );
    }

    if (meetings.length === 0) {
      return fail(`Meeting found in calendar but could not retrieve ${resourceSingular} access. You must be the organizer of the Teams meeting.`);
    }

    return toResult(meetings[0], matchedMeeting.subject || meetings[0].subject, joinUrl);
  },
};

const MAX_RECORDING_BYTES = 100 * 1024 * 1024;
const MAX_RECORDINGS_PER_CALL = 3;

function bufferByteLength(buffer) {
    if (!buffer) return 0;
    if (typeof buffer.byteLength === 'number') return buffer.byteLength;
    if (typeof buffer.length === 'number') return buffer.length;
    return 0;
}

const identifier = String(data.input.meetingIdentifier).trim();
const requestedLimit = data.input.limit ? parseInt(data.input.limit) : 1;
const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, MAX_RECORDINGS_PER_CALL)
    : 1;
const requestedOffset = data.input.offset ? parseInt(data.input.offset) : 0;
const offset = Number.isFinite(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;
const occurrenceDate = MicrosoftTeamsUtils.parseOccurrenceDate(data.input.occurrenceDate);

const resolved = await MicrosoftTeamsUtils.resolveOnlineMeeting(identifier, {
    resourceName: 'recordings',
    resourceSingular: 'recording',
});
const onlineMeetingId = resolved.onlineMeetingId;
const meetingSubject = resolved.meetingSubject || '(No subject)';

const recordings = await MicrosoftTeamsUtils.listOnlineMeetingRecordings(onlineMeetingId);
const currentUserId = await MicrosoftTeamsUtils.currentUserId();
if (!currentUserId) {
    return {
        subject: meetingSubject,
        onlineMeetingId,
        count: 0,
        total: 0,
        hasMore: false,
        _notices: [
            'Could not verify the signed-in user, so recordings were not returned. Retry the request.',
        ],
        files: [],
    };
}
const organizerOwned = recordings.filter((recording) => (
    MicrosoftTeamsUtils.isVerifiedOrganizerRecording(recording, currentUserId)
));
if (recordings.length > 0 && organizerOwned.length === 0) {
    throw MicrosoftTeamsUtils.recordingLookupDeniedError(
        'Only the meeting organizer can download this recording. Sign in with the organizer account.',
    );
}

if (organizerOwned.length === 0) {
    return {
        subject: meetingSubject,
        onlineMeetingId,
        count: 0,
        total: 0,
        hasMore: false,
        _notices: [
            'No recordings available. Recordings can take several minutes to finish encoding after the meeting ends, and Graph only lets the organizer download them.',
        ],
        files: [],
    };
}

const sorted = organizerOwned.slice().sort((previous, next) => (
    new Date(next.createdDateTime) - new Date(previous.createdDateTime)
));

const notices = [];
if (requestedLimit > MAX_RECORDINGS_PER_CALL) {
    notices.push(`Limit is capped at ${MAX_RECORDINGS_PER_CALL} recordings per call.`);
}
let selected = [];
let selectionTotal = sorted.length;

if (occurrenceDate) {
    const selectedOccurrence = MicrosoftTeamsUtils.selectOccurrencePool(sorted, occurrenceDate);
    if (!selectedOccurrence.matched && selectedOccurrence.pool.length > 0) {
        notices.push(
            `No recording found for ${occurrenceDate}. Returning closest recording from ${String(selectedOccurrence.pool[0].createdDateTime).substring(0, 10)}.`,
        );
        selected = selectedOccurrence.pool;
        selectionTotal = selectedOccurrence.pool.length;
    } else {
        selectionTotal = selectedOccurrence.pool.length;
        selected = selectedOccurrence.pool.slice(offset, offset + limit);
        if (selected.length === 0) {
            notices.push(
                `Offset ${offset} is beyond the ${selectedOccurrence.pool.length} recording(s) for ${occurrenceDate}.`,
            );
        }
    }
} else {
    selected = sorted.slice(offset, offset + limit);
    if (selected.length === 0) {
        notices.push(
            `Offset ${offset} is beyond the ${sorted.length} recording(s) for this meeting.`,
        );
    }
}

if (selected.length === 0) {
    return {
        subject: meetingSubject,
        onlineMeetingId,
        count: 0,
        total: selectionTotal,
        hasMore: false,
        _notices: notices,
        files: [],
    };
}

const files = [];
const downloadedRecordings = [];
let totalBytes = 0;
for (const recording of selected) {
    const remainingBytes = MAX_RECORDING_BYTES - totalBytes;
    if (remainingBytes <= 0) {
        notices.push(
            'Stopped before exceeding the 100MB total download limit. Use Offset to fetch remaining recordings one at a time.',
        );
        break;
    }
    try {
        const file = await MicrosoftTeamsUtils.downloadOnlineMeetingRecordingFile(
            onlineMeetingId,
            recording,
            { remainingBytes, subject: meetingSubject },
        );
        const bytes = bufferByteLength(file.buffer);
        if (bytes > remainingBytes) {
            notices.push(
                'Stopped before exceeding the 100MB total download limit. Use Offset to fetch remaining recordings one at a time.',
            );
            break;
        }
        totalBytes += bytes;
        downloadedRecordings.push(recording);
        files.push(file);
    } catch (error) {
        if (error.code === 'OnlineMeetingRecordingScopeMissing') throw error;
        if (error.code === 'OnlineMeetingRecordingLookupDenied') throw error;
        if (error.retryPoll || MicrosoftTeamsUtils.isTransientGraphStatus(error.status)) throw error;
        notices.push(`Could not download recording ${recording.id}: ${error.message}`);
    }
}

if (files.length === 0) {
    return {
        subject: meetingSubject,
        onlineMeetingId,
        count: 0,
        total: selectionTotal,
        hasMore: false,
        _notices: notices,
        files: [],
    };
}

const primary = downloadedRecordings[0];
const selectionPoolSize = occurrenceDate
    ? sorted.filter(recording => String(recording.createdDateTime || '').startsWith(occurrenceDate)).length
    : sorted.length;

return {
    subject: meetingSubject,
    onlineMeetingId,
    count: files.length,
    total: sorted.length,
    id: primary.id,
    createdDateTime: primary.createdDateTime,
    recordingContentUrl: MicrosoftTeamsUtils.recordingContentUrl(onlineMeetingId, primary),
    meetingOrganizer: primary.meetingOrganizer,
    hasMore: selectionPoolSize > (offset + selected.length),
    _notices: notices.length > 0 ? notices : undefined,
    files,
};
